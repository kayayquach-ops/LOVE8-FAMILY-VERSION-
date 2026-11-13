// Podcast nhà mình: chỉ còn giọng người kể (không giọng Mây, không giọng máy đọc lời dẫn). Mỗi đoạn giọng được làm sạch
// (voiceedit.ts), ghép với nhạc nền dịu, chuẩn âm lượng. Câu hỏi nằm trong mục lục (chapters) và thành thẻ chữ trong video.
// Mỗi cuộc gọi thành một tập theo người, kèm video dọc có ảnh và phụ đề (callvideo.ts); mỗi chủ đề có một tập chỉ tiếng
// gom câu trả lời của cả nhà. Ghép tiếng và dựng video là hai hàng riêng, mỗi hàng một việc một lúc; tập đang dựng dở
// khi máy chủ khởi động lại thì được dựng lại (tối đa 3 lần).
import express from 'express';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { isTopic, type Chapter, type Podcast, type Topic } from '../src/shared.ts';
import { errorBody, langOf, LANGS, runWithLang, tReq, tServer, type Lang } from './i18n.ts';
import { mascotName, pool } from './db.ts';
import { fontsReady, renderCallVideo, type VideoText, type VSeg } from './callvideo.ts';
import { cleanClip, migrateVoiceEdit, mixEpisode, type Clip, type Placed } from './voiceedit.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const MAX_TOPIC_CLIPS = 8;
const MAX_TRIES = 3;

export async function migratePodcast(p: pg.Pool) {
  await p.query(`
    create table if not exists podcasts (
      id text primary key, family_id text not null references families(id), key text not null,
      kind text not null, member_id text, topic text not null, title text not null,
      media text, duration real not null default 0, chapters text not null default '[]', cover text,
      status text not null default 'rendering', created_at timestamptz not null default now(),
      unique (family_id, key)
    );
    alter table podcasts add column if not exists video text;
    alter table podcasts add column if not exists poster text;
    alter table podcasts add column if not exists video_status text not null default 'none';
    alter table podcasts add column if not exists tries int not null default 0;
  `);
  await migrateVoiceEdit();
  // Tập đang dựng dở lúc máy chủ tắt: chờ máy chủ chạy ổn rồi dựng lại.
  setTimeout(() => { resume().catch((e) => console.error('[podcast] dựng lại tập dở:', e)); }, 20_000).unref();
}

// Tiêu đề tập theo chủ đề và tên chủ đề nằm trong bảng chữ máy chủ (podcastGen.titleOf.<chủ đề>, topic.<chủ đề>).
const titleOf = (t: string) => tReq(isTopic(t) ? `podcastGen.titleOf.${t}` : 'podcastGen.titleOf.fallback');
const topicLabel = (t: string) => tReq(isTopic(t) ? `topic.${t}` : 'topic.fallback');
const mediaFile = (m: string) => path.join(MEDIA_DIR, path.basename(m.split('?')[0]));
const PHOTO = /\.(jpe?g|png|webp)$/i;

type Piece = { key: string | null; file: string; who: string; question: string; topic: string; transcript: string | null; photo: string | null };
type Mode = 'call' | 'topic' | 'first';
type Job = {
  fid: string; key: string; kind: 'person' | 'topic'; memberId: string | null; topic: string; title: string; cover: string | null;
  lang: Lang; mode: Mode; pieces: Piece[]; video: VideoText | null;
};
type Laid = { total: number; placed: Placed[]; segs: VSeg[]; chapters: Chapter[] };

/** Thời gian đọc thẻ câu hỏi trong video (nhạc dâng lên trong lúc đó). */
function readTime(q: string, lang: Lang) {
  const words = q.trim().split(/\s+/).length, chars = [...q.trim()].length;
  const t = lang === 'ko' ? 1.6 + chars * 0.075 : 1.6 + words * (lang === 'en' ? 0.26 : 0.2);
  return Math.min(6, Math.max(3, t));
}

/** Xếp mốc: mở đầu, rồi từng câu hỏi (thẻ chữ, nhạc) và giọng kể, cuối cùng lời kết. */
function layout(items: Array<Piece & { clip: Clip }>, mode: Mode, lang: Lang): Laid {
  const placed: Placed[] = [], segs: VSeg[] = [], chapters: Chapter[] = [];
  const intro = mode === 'call' ? 3.4 : mode === 'topic' ? 2.2 : 0.9;
  if (mode === 'call') segs.push({ kind: 'intro', s: 0, e: intro });
  let t = intro;
  items.forEach((it, i) => {
    const card = mode === 'call' ? readTime(it.question, lang) : i ? 1.6 : 0;
    const at = t + card;
    if (mode === 'call') segs.push({ kind: 'card', s: t, e: at, n: i + 1, of: items.length, question: it.question });
    placed.push({ clip: it.clip, at });
    const words = (it.clip.words ?? []).map((w) => ({ w: w.w, s: w.s + at, e: w.e + at }));
    segs.push({ kind: 'voice', s: at, e: at + it.clip.dur, words, photo: it.photo, topic: topicLabel(it.topic) });
    chapters.push({ at: Math.max(0, mode === 'call' ? t : at - 0.4), until: at, say: '', who: it.who, question: it.question, transcript: it.clip.text ?? it.transcript });
    t = at + it.clip.dur + (mode === 'call' ? 0.7 : 0.2);
  });
  const outro = mode === 'call' ? 4.6 : mode === 'topic' ? 3.4 : 2.6;
  if (mode === 'call') segs.push({ kind: 'outro', s: t, e: t + outro });
  return { total: t + outro, placed, segs, chapters };
}

// ---------- Hàng đợi: một việc lỗi không làm chết cả hàng ----------

function lane(name: string) {
  let tail: Promise<unknown> = Promise.resolve();
  return (fn: () => Promise<unknown>) => {
    const p = tail.catch(() => {}).then(fn);
    tail = p.catch((e) => console.error(`[podcast] ${name}:`, e));
    return tail;
  };
}
const audioLane = lane('ghép tiếng'); // i18n-ok: tên hàng trong nhật ký
const videoLane = lane('dựng video'); // i18n-ok
const pending = new Map<string, Job>();
/** Tập đang chờ hoặc đang dựng trong tiến trình này (để lượt dựng lại sau khởi động không làm trùng). */
const live = new Map<string, number>();
const hold = (k: string) => live.set(k, (live.get(k) ?? 0) + 1);
const release = (k: string) => { const n = (live.get(k) ?? 1) - 1; if (n > 0) live.set(k, n); else live.delete(k); };

function enqueue(job: Job) {
  const k = `${job.fid}|${job.key}`;
  const queued = pending.has(k);
  pending.set(k, job); // việc mới hơn cho cùng một tập thay việc cũ chưa chạy
  if (queued) return Promise.resolve();
  hold(k);
  return audioLane(async () => {
    const j = pending.get(k);
    pending.delete(k);
    try { if (j) await runWithLang(j.lang, () => render(j)); } finally { release(k); }
  });
}

function moveInto(src: string, dest: string) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  copyFileSync(src, part);
  renameSync(part, dest);
}
const safeQuery = (sql: string, args: unknown[]) => pool.query(sql, args).catch((e) => { console.error('[podcast] lỗi DB:', (e as Error).message); });

async function render(job: Job) {
  const { rows: [row] } = await pool.query(
    `insert into podcasts (id, family_id, key, kind, member_id, topic, title, cover, status, video_status) values ($1,$2,$3,$4,$5,$6,$7,$8,'rendering',$9)
     on conflict (family_id, key) do update set title = excluded.title, cover = coalesce(excluded.cover, podcasts.cover), status = 'rendering',
       video_status = case when $10 then 'rendering' else podcasts.video_status end
     returning id`, [randomUUID(), job.fid, job.key, job.kind, job.memberId, job.topic, job.title, job.cover, job.video ? 'rendering' : 'none', !!job.video]);
  const work = mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  let handed = false;
  try {
    const items: Array<Piece & { clip: Clip }> = [];
    for (const [i, p] of job.pieces.entries()) {
      try {
        const clip = await cleanClip(p.file, work, `c${i}`, { lang: job.lang, cacheKey: p.key, transcript: p.transcript, whisper: !!job.video });
        if (clip) items.push({ ...p, clip });
      } catch (e) {
        console.error(`[podcast] bỏ qua ${path.basename(p.file)}:`, (e as Error).message.split('\n')[0]);
      }
    }
    if (!items.length) throw new Error('Không có đoạn giọng nào dùng được');
    const lay = layout(items, job.mode, job.lang);
    const audio = path.join(work, 'episode.m4a');
    await mixEpisode(work, lay.placed, lay.total, `${job.fid}:${job.key}`, audio);
    moveInto(audio, path.join(MEDIA_DIR, 'podcasts', `${row.id}.m4a`));
    await pool.query(`update podcasts set status = 'ready', media = $2, duration = $3, chapters = $4, created_at = now(), tries = case when $5 then tries else 0 end where id = $1`,
      [row.id, `/media/podcasts/${row.id}.m4a?v=${Date.now()}`, lay.total, JSON.stringify(lay.chapters), !!job.video]);
    console.log(`[podcast] xong tiếng ${job.title} (${Math.round(lay.total)} giây)`);
    if (job.video) {
      if (!fontsReady()) throw new Error('Thiếu font cho video (server/fonts)');
      // Video chỉ cần tệp tiếng đã ghép: bỏ các tệp wav lớn trong lúc chờ tới lượt dựng.
      for (const f of readdirSync(work)) if (f.endsWith('.wav')) rmSync(path.join(work, f), { force: true });
      handed = true;
      const k = `${job.fid}|${job.key}`;
      hold(k);
      void videoLane(() => runWithLang(job.lang, () => renderVideo(row.id, job, lay, work, audio)).finally(() => release(k)));
    }
  } catch (e) {
    console.error(`[podcast] lỗi ${job.title}:`, (e as Error).message);
    await safeQuery(`update podcasts set status = case when media is not null then 'ready' else 'failed' end,
      video_status = case when video is not null then 'ready' when video_status = 'rendering' then 'failed' else video_status end where id = $1`, [row.id]);
  } finally {
    if (!handed) rmSync(work, { recursive: true, force: true });
  }
}

async function renderVideo(id: string, job: Job, lay: Laid, work: string, audio: string) {
  const t0 = Date.now();
  try {
    await renderCallVideo({ audio, total: lay.total, segs: lay.segs, lang: job.lang, text: job.video! }, work, path.join(work, 'video.mp4'), path.join(work, 'poster.jpg'));
    const stamp = Date.now();
    moveInto(path.join(work, 'video.mp4'), path.join(MEDIA_DIR, 'podcasts', `${id}.mp4`));
    // Ảnh bìa nằm ở thư mục media gốc để dùng được ảnh thu nhỏ (/media/w/360/...); tên có mốc giờ nên trình duyệt không giữ bản cũ.
    const poster = `pod-${id}-${stamp}.jpg`;
    moveInto(path.join(work, 'poster.jpg'), path.join(MEDIA_DIR, poster));
    const { rows: [old] } = await pool.query('select poster from podcasts where id = $1', [id]);
    await pool.query(`update podcasts set video = $2, poster = $3, video_status = 'ready', tries = 0 where id = $1`, [id, `/media/podcasts/${id}.mp4?v=${stamp}`, `/media/${poster}`]);
    if (old?.poster && old.poster !== `/media/${poster}`) { try { unlinkSync(mediaFile(old.poster)); } catch {} }
    console.log(`[podcast] xong video ${job.title} (${Math.round(lay.total)} giây phim, dựng ${Math.round((Date.now() - t0) / 1000)} giây)`);
  } catch (e) {
    console.error(`[podcast] lỗi video ${job.title}:`, (e as Error).message.slice(0, 1500));
    await safeQuery(`update podcasts set video_status = case when video is not null then 'ready' else 'failed' end where id = $1`, [id]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- Dữ liệu cho từng tập ----------

async function coverFor(fid: string, memberId: string | null) {
  const { rows } = await pool.query(
    `select media from (
       select media, created_at, 0 o from vault where family_id = $1 and ($2::text is null or member_id = $2)
       union all
       select media, created_at, 1 o from posts where family_id = $1 and kind = 'photo' and media is not null and ($2::text is null or author_id = $2)
     ) x order by o, created_at desc limit 1`, [fid, memberId]);
  return rows[0]?.media ?? null;
}

/** Ảnh cho từng câu trả lời: ảnh gửi trong chính cuộc gọi về đúng câu hỏi xin ảnh; câu khác lấy ảnh xưa trong kho
 *  rồi ảnh người đó gửi gần đây (mỗi ảnh một lần). Hết ảnh thì câu đó dùng thẻ không ảnh. */
async function photosFor(call: any, answers: any[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const ok = (m: string | null) => !!m && PHOTO.test(m.split('?')[0]) && existsSync(mediaFile(m));
  const { rows: own } = await pool.query('select media, created_at from vault where call_id = $1 order by created_at', [call.id]);
  let photoIdx = -1;
  try { photoIdx = (JSON.parse(call.script).questions as Array<{ photo?: boolean }>).findIndex((q) => q.photo); } catch {}
  for (const ph of own) {
    if (!ok(ph.media)) continue;
    const at = new Date(ph.created_at).getTime();
    const target = (!out.size && answers.find((a) => a.idx === photoIdx && !out.has(a.id)))
      || [...answers].reverse().find((a) => !out.has(a.id) && new Date(a.created_at).getTime() <= at)
      || answers.find((a) => !out.has(a.id));
    if (!target) break;
    out.set(target.id, mediaFile(ph.media));
    used.add(ph.media);
  }
  const { rows: extra } = await pool.query(
    `select media from (
       select media, created_at, 0 o from vault where member_id = $1 and coalesce(call_id, '') <> $2
       union all
       select media, created_at, 1 o from posts where author_id = $1 and kind = 'photo' and media is not null
     ) x order by o, created_at desc limit 12`, [call.member_id, call.id]);
  const pool2 = extra.map((r) => r.media as string).filter((m) => ok(m) && !used.has(m));
  for (const a of answers) {
    if (out.has(a.id) || !pool2.length) continue;
    out.set(a.id, mediaFile(pool2.shift()!));
  }
  return out;
}

const fmtDay = (d: Date, lang: Lang) => new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : lang === 'ko' ? 'ko-KR' : 'en-US',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

export async function buildPodcastsForCall(callId: string, topics = true) {
  const { rows: [call] } = await pool.query(
    'select c.*, m.name, m.lang from calls c join members m on m.id = c.member_id where c.id = $1', [callId]);
  if (!call) return;
  const lang = langOf(call.lang);
  return runWithLang(lang, () => buildFor(call, lang, topics));
}

async function buildFor(call: any, lang: Lang, topics: boolean) {
  const { rows: answers } = await pool.query(
    `select a.*, m.name who from call_answers a join members m on m.id = a.member_id
     where a.call_id = $1 and a.media is not null order by a.idx`, [call.id]);
  const usable = answers.filter((a) => existsSync(mediaFile(a.media)));
  if (!usable.length) return;
  const name = call.name as string;
  const first = usable[0].topic as Topic;
  const photos = await photosFor(call, usable);
  const { rows: [fam] } = await pool.query('select name from families where id = $1', [call.family_id]);
  const mascot = await mascotName(call.family_id);

  await enqueue({
    fid: call.family_id, key: `call:${call.id}`, kind: 'person', memberId: call.member_id, topic: first, lang, mode: 'call',
    title: tReq('podcastGen.person.title', { name, what: titleOf(first) }), cover: await coverFor(call.family_id, call.member_id),
    pieces: usable.map((a) => ({ key: `ans:${a.id}`, file: mediaFile(a.media), who: a.who, question: a.question, topic: a.topic, transcript: a.transcript, photo: photos.get(a.id) ?? null })),
    video: {
      name, tells: tReq('podcastVideo.tells', { name }), what: titleOf(first), date: fmtDay(new Date(call.done_at ?? call.created_at), lang),
      asked: tReq('podcastVideo.asked', { mascot }), questionOf: (n, of) => tReq('podcastVideo.question', { n, of }),
      thanks: tReq('podcastVideo.thanks', { name }), bye: tReq('podcastVideo.bye'), family: fam?.name ?? '',
    },
  });
  if (!topics) return;
  for (const topic of [...new Set(usable.map((a) => a.topic as string))]) await buildTopic(call.family_id, topic, lang);
}

async function buildTopic(fid: string, topic: string, lang: Lang) {
  const { rows } = await pool.query(
    `select * from (
       select a.*, m.name who from call_answers a join members m on m.id = a.member_id
       where a.family_id = $1 and a.topic = $2 and a.media is not null order by a.created_at desc limit ${MAX_TOPIC_CLIPS}
     ) x order by created_at`, [fid, topic]);
  const clips = rows.filter((a) => existsSync(mediaFile(a.media)));
  if (!clips.length) return;
  await runWithLang(lang, async () => enqueue({
    fid, key: `topic:${topic}`, kind: 'topic', memberId: null, topic, title: topicLabel(topic), cover: await coverFor(fid, null), lang, mode: 'topic', video: null,
    pieces: clips.map((a) => ({ key: `ans:${a.id}`, file: mediaFile(a.media), who: a.who, question: a.question, topic: a.topic, transcript: a.transcript, photo: null })),
  }));
}

// Câu trả lời tới muộn (máy khách gửi lại sau khi đã báo xong cuộc gọi): gom lại rồi dựng lại tập của cuộc gọi đó một lần.
const later = new Map<string, ReturnType<typeof setTimeout>>();
export function rebuildCallSoon(callId: string) {
  clearTimeout(later.get(callId));
  later.set(callId, setTimeout(() => {
    later.delete(callId);
    buildPodcastsForCall(callId).catch((e) => console.error('[podcast] dựng lại sau câu trả lời muộn:', e));
  }, 30_000));
}

/** Tập mở đầu trong album của một người: câu "thương" đầu tiên thu lúc mới vào nhà. */
export async function buildFirstVoicePodcast(fid: string, memberId: string, name: string, media: string, lang: Lang = 'vi') {
  const file = mediaFile(media);
  if (!existsSync(file)) return;
  await runWithLang(lang, async () => enqueue({
    fid, key: `first:${memberId}`, kind: 'person', memberId, topic: 'loi-nhan', title: tReq('podcastGen.first.title'), cover: await coverFor(fid, memberId),
    lang, mode: 'first', video: null,
    // Nghe là tới thẳng giọng người nói, nhạc chỉ vào dịu ở đầu và tan ở cuối.
    pieces: [{ key: `post:${path.basename(file)}`, file, who: name, question: tReq('podcastGen.first.title'), topic: 'loi-nhan', transcript: null, photo: null }],
  }));
}

async function firstVoiceMedia(memberId: string, name: string) {
  const caps = LANGS.map((l) => tServer(l, 'post.firstVoice', { name }));
  const { rows: [post] } = await pool.query(
    `select media from posts where author_id = $1 and kind = 'voice' and caption = any($2) and media is not null order by created_at limit 1`, [memberId, caps]);
  return (post?.media as string | undefined) ?? null;
}

/** Tập lời thương đầu tiên làm bản cũ còn lời dẫn bằng giọng máy và khoảng nhạc dài: dựng lại một lần cho đúng kiểu mới (chỉ giọng người nói). */
export async function refreshFirstVoicePodcasts() {
  const { rows } = await pool.query(`select family_id, member_id, chapters from podcasts where key like 'first:%' and status = 'ready'`);
  for (const r of rows) {
    let ch: Array<{ say?: string }> = [];
    try { ch = JSON.parse(r.chapters); } catch { continue; }
    if (!ch.some((c) => c.say)) continue;
    const { rows: [m] } = await pool.query('select name, lang from members where id = $1', [r.member_id]);
    if (!m) continue;
    const media = await firstVoiceMedia(r.member_id, m.name);
    if (media) void buildFirstVoicePodcast(r.family_id, r.member_id, m.name, media, langOf(m.lang)).catch((e) => console.error('[podcast] dựng lại lời đầu tiên:', e));
  }
}

/** Sau khi khởi động: tập còn 'rendering' (tiếng hoặc video) là bị ngắt giữa chừng, dựng lại; quá 3 lần thì thôi. */
async function resume() {
  const { rows } = await pool.query(`select id, family_id, key, member_id, tries, media, video from podcasts where status = 'rendering' or video_status = 'rendering'`);
  for (const r of rows) {
    if (live.has(`${r.family_id}|${r.key}`)) continue;
    if (r.tries >= MAX_TRIES) {
      await safeQuery(`update podcasts set status = case when media is not null then 'ready' else 'failed' end,
        video_status = case when video is not null then 'ready' else 'failed' end where id = $1`, [r.id]);
      console.error(`[podcast] bỏ dựng lại ${r.key} sau ${r.tries} lần`);
      continue;
    }
    await safeQuery('update podcasts set tries = tries + 1 where id = $1', [r.id]);
    const [kind, ref] = String(r.key).split(/:(.*)/s);
    try {
      if (kind === 'call') await buildPodcastsForCall(ref, false);
      else if (kind === 'topic') {
        const { rows: [m] } = await pool.query('select lang from members where family_id = $1 order by created_at limit 1', [r.family_id]);
        await buildTopic(r.family_id, ref, langOf(m?.lang));
      } else if (kind === 'first') {
        const { rows: [m] } = await pool.query('select name, lang from members where id = $1', [ref]);
        const media = m ? await firstVoiceMedia(ref, m.name) : null;
        if (media) await buildFirstVoicePodcast(r.family_id, ref, m.name, media, langOf(m.lang));
      }
    } catch (e) {
      console.error(`[podcast] dựng lại ${r.key}:`, (e as Error).message);
    }
  }
}

function row(r: any): Podcast {
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(r.chapters); } catch {}
  return {
    id: r.id, kind: r.kind, title: r.title, topic: topicLabel(r.topic), memberId: r.member_id, duration: Number(r.duration),
    cover: r.cover, media: r.media, chapters, status: r.status, createdAt: r.created_at,
    video: r.video ?? null, poster: r.poster ?? null, videoStatus: r.video_status ?? 'none',
  };
}

export async function listPodcasts(fid: string, limit = 60) {
  const { rows } = await pool.query(
    `select * from podcasts where family_id = $1 and status <> 'failed' order by created_at desc limit $2`, [fid, limit]);
  return rows.map(row);
}

export const podcastRouter = express.Router();

podcastRouter.get('/podcasts', async (req: any, res) => {
  try { res.json(await listPodcasts(req.member.family_id)); }
  catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});
