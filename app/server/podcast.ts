// Podcast nhà mình: chỉ còn giọng người kể (không giọng Mây, không giọng máy đọc lời dẫn). Mỗi đoạn giọng được làm sạch
// (voiceedit.ts), ghép với nhạc nền dịu, chuẩn âm lượng.
// Từ 14/11 mỗi cuộc gọi thành các tập theo câu chuyện: AI chấm từng câu chuyện (câu chính + các lượt Mây hỏi thêm), chuyện
// nào có thật, có chi tiết, đủ dài thì thành một tập riêng (key story:<callId>:<idx>), các lượt kể ghép liền không có giọng Mây,
// câu trả lời khác hợp chuyện thì nối vào đuôi. Câu chuyện có ảnh (vault.story) thì thêm video dọc chỉ dùng đúng các ảnh đó,
// không có ảnh thì chỉ có tiếng. Câu trả lời lời nhắn (topic 'loi-nhan') và câu hỏi thăm ('hoi-tham') không bao giờ vào podcast.
// Cuộc gọi bộ câu v2 (từ 20/11) chỉ có một chuyện chính: chỉ chuyện đó được chấm, không còn phần đuôi.
// Tập theo chủ đề dựng cùng kiểu đó: chuyện nào trong tập có ảnh thì tập có video, chỉ khi không có ảnh nào mới chỉ có tiếng.
// Tập cũ theo cả cuộc gọi (key call:<id>, có thẻ câu hỏi) và tập lời thương đầu tiên (không có ảnh) vẫn giữ.
// Ghép tiếng và dựng video là hai hàng riêng, mỗi hàng một việc một lúc; tập đang dựng dở khi máy chủ khởi động lại
// thì được dựng lại (tối đa 3 lần).
import express from 'express';
import multer from 'multer';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { isTopic, NO_EPISODE_TOPICS, type CallScript, type Chapter, type Podcast, type Topic } from '../src/shared.ts';
import { askJSON } from './ai.ts';
import { suspect } from './guard.ts';
import { errorBody, langOf, LANGS, runWithLang, tReq, tServer, type Lang } from './i18n.ts';
import { mascotName, pool } from './db.ts';
import { fontsReady, renderCallVideo, renderStoryVideo, type StoryInput, type StoryText, type VideoText, type VSeg } from './callvideo.ts';
import { Limit, limitBy } from './limit.ts';
import { cleanClip, migrateVoiceEdit, mixEpisode, voicedSeconds, type Clip, type Placed } from './voiceedit.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const MAX_TOPIC_STORIES = 8;
const MAX_TRIES = 3;
/** Lời nhắn khó nói: chỉ người nhận nghe qua Mây, không bao giờ vào podcast. */
const PRIVATE_TOPIC = 'loi-nhan';
/** Chủ đề không bao giờ thành tập (lời nhắn, câu hỏi thăm), dạng mảng cho SQL `<> all($n::text[])`. */
const NO_EPISODE: string[] = [...NO_EPISODE_TOPICS];

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
    alter table podcasts add column if not exists shared boolean not null default true;
    alter table call_answers add column if not exists turn int not null default 0;
    alter table vault add column if not exists story int;
    create table if not exists podcast_plans (call_id text primary key, sig text not null, plan text not null, created_at timestamptz not null default now());
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

type Piece = {
  key: string | null; file: string; who: string; question: string; topic: string; transcript: string | null; photo: string | null;
  /** Tập câu chuyện: số câu chuyện của đoạn, và đoạn thuộc phần đuôi. */
  group?: number; tail?: boolean;
};
type Mode = 'call' | 'topic' | 'first' | 'story';
type Job = {
  fid: string; key: string; kind: 'person' | 'topic'; memberId: string | null; topic: string; title: string; cover: string | null;
  lang: Lang; mode: Mode; pieces: Piece[]; video: VideoText | null;
  /** Tập câu chuyện hay tập chủ đề có ảnh: chữ trong video và các tệp ảnh (đúng ảnh của các câu chuyện trong tập). */
  story?: StoryText | null; photos?: string[];
  /** Dựng lại tập đã có (thêm ảnh): tập vẫn nghe được trong lúc dựng, giữ nguyên ngày của tập. */
  keepDate?: boolean;
};
type StoryLay = Pick<StoryInput, 'intro' | 'outro' | 'voices' | 'turns' | 'names'>;
type Laid = { total: number; placed: Placed[]; segs: VSeg[]; chapters: Chapter[]; story?: StoryLay };
type Item = Piece & { clip: Clip };

/** Thời gian đọc thẻ câu hỏi trong video (nhạc dâng lên trong lúc đó). */
function readTime(q: string, lang: Lang) {
  const words = q.trim().split(/\s+/).length, chars = [...q.trim()].length;
  const t = lang === 'ko' ? 1.6 + chars * 0.075 : 1.6 + words * (lang === 'en' ? 0.26 : 0.2);
  return Math.min(6, Math.max(3, t));
}

/** Xếp mốc: mở đầu, rồi từng câu hỏi (thẻ chữ, nhạc) và giọng kể, cuối cùng lời kết. */
function layout(items: Item[], mode: Mode, lang: Lang): Laid {
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

/** Nhịp của tập câu chuyện (giây): nhạc mở đầu (có video thì dài hơn cho tên chuyện), chỗ nối các lượt kể, chỗ chuyển sang phần đuôi, kết. */
export const STORY_GAPS = { leadVideo: 2.4, leadAudio: 1.0, join: 0.25, toTail: 2.6, tailJoin: 0.5, outro: 3.2 };

/** Tập câu chuyện (và tập chủ đề): các lượt kể của một chuyện nối liền (nối mềm, không giọng Mây), chuyện sau cách một khoảng nhạc. */
export function layoutStory(items: Array<Pick<Item, 'clip' | 'who' | 'question' | 'transcript' | 'group' | 'tail'>>, video: boolean): Laid & { story: StoryLay } {
  const G = STORY_GAPS;
  const placed: Placed[] = [], chapters: Chapter[] = [];
  const voices: StoryLay['voices'] = [], turns: StoryLay['turns'] = [];
  const starts: Array<{ s: number; who: string }> = [];
  const lead = video ? G.leadVideo : G.leadAudio;
  let t = lead, prev: number | undefined;
  const text = (it: (typeof items)[number]) => it.clip.text ?? it.transcript ?? '';
  items.forEach((it, i) => {
    if (i && it.group === prev) t += it.tail ? G.tailJoin : G.join;
    else if (i) {
      // Câu chuyện khác (phần đuôi, hay chuyện kế trong tập chủ đề): khoảng nhạc, câu hỏi của đoạn đó hiện viết tay trong video.
      t += G.toTail;
      turns.push({ s: t - G.toTail + 0.3, e: t + 0.8, question: it.question });
    }
    if (!i || it.group !== prev) {
      const same = items.filter((x) => x.group === it.group);
      chapters.push({ at: i ? Math.max(0, t - G.toTail + 0.3) : 0, until: t, say: '', who: it.who, question: it.question, transcript: same.map(text).filter(Boolean).join(' ') || null });
      starts.push({ s: i ? t - G.toTail + 0.3 : 0.5, who: it.who });
    }
    placed.push({ clip: it.clip, at: t, fadeIn: 0.06, fadeOut: 0.12 });
    voices.push({ s: t, e: t + it.clip.dur, words: (it.clip.words ?? []).map((w) => ({ w: w.w, s: w.s + t, e: w.e + t })) });
    t += it.clip.dur;
    prev = it.group;
  });
  const total = t + G.outro;
  // Tên người kể: một khoảng cho mỗi chuyện, chuyện liền nhau cùng người thì gộp.
  const names: StoryLay['names'] = [];
  starts.forEach((g, k) => {
    const e = starts[k + 1]?.s ?? t + 0.7;
    const last = names[names.length - 1];
    if (last && last.name === g.who) last.e = e; else names.push({ s: g.s, e, name: g.who });
  });
  return { total, placed, segs: [], chapters, story: { intro: { s: 0.3, e: lead + 0.9 }, outro: { s: t + 0.3, e: total }, voices, turns, names } };
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
/** Tập câu chuyện và tập chủ đề dựng cùng một kiểu: chuyện nối liền, có ảnh thì video ảnh cổ điển, không ảnh mới chỉ có tiếng. */
const storyLike = (job: Job) => job.mode === 'story' || job.mode === 'topic';
const wantsVideo = (job: Job) => (storyLike(job) ? !!job.story && !!job.photos?.length : !!job.video);

async function render(job: Job) {
  const video = wantsVideo(job), keep = !!job.keepDate;
  const { rows: [row] } = await pool.query(
    `insert into podcasts (id, family_id, key, kind, member_id, topic, title, cover, status, video_status) values ($1,$2,$3,$4,$5,$6,$7,$8,'rendering',$9)
     on conflict (family_id, key) do update set title = excluded.title, cover = coalesce(excluded.cover, podcasts.cover),
       status = case when $11 and podcasts.media is not null then 'ready' else 'rendering' end,
       video_status = case when $10 then 'rendering' else podcasts.video_status end
     returning id`, [randomUUID(), job.fid, job.key, job.kind, job.memberId, job.topic, job.title, job.cover, video ? 'rendering' : 'none', video, keep]);
  const work = mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  let handed = false;
  try {
    const items: Item[] = [];
    for (const [i, p] of job.pieces.entries()) {
      try {
        // Tập câu chuyện luôn nhờ Whisper (cắt ậm ờ, phụ đề đúng lời); mốc từ được giữ lại nên thêm ảnh dựng lại không tốn thêm.
        const clip = await cleanClip(p.file, work, `c${i}`, { lang: job.lang, cacheKey: p.key, transcript: p.transcript, whisper: video || storyLike(job) });
        if (clip) items.push({ ...p, clip });
      } catch (e) {
        console.error(`[podcast] bỏ qua ${path.basename(p.file)}:`, (e as Error).message.split('\n')[0]);
      }
    }
    if (!items.length) throw new Error('Không có đoạn giọng nào dùng được');
    const lay = storyLike(job) ? layoutStory(items, video) : layout(items, job.mode, job.lang);
    const audio = path.join(work, 'episode.m4a');
    await mixEpisode(work, lay.placed, lay.total, `${job.fid}:${job.key}`, audio, storyLike(job) ? { music: 'story', gapLufs: -21 } : {});
    moveInto(audio, path.join(MEDIA_DIR, 'podcasts', `${row.id}.m4a`));
    await pool.query(`update podcasts set status = 'ready', media = $2, duration = $3, chapters = $4, created_at = case when $6 then created_at else now() end,
      tries = case when $5 then tries else 0 end where id = $1`,
      [row.id, `/media/podcasts/${row.id}.m4a?v=${Date.now()}`, lay.total, JSON.stringify(lay.chapters), video, keep]);
    console.log(`[podcast] xong tiếng ${job.title} (${Math.round(lay.total)} giây)`);
    if (video) {
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
    const mp4 = path.join(work, 'video.mp4'), jpg = path.join(work, 'poster.jpg');
    if (storyLike(job)) {
      await renderStoryVideo({ audio, total: lay.total, lang: job.lang, photos: job.photos!, text: job.story!, ...lay.story! }, work, mp4, jpg);
    } else {
      await renderCallVideo({ audio, total: lay.total, segs: lay.segs, lang: job.lang, text: job.video! }, work, mp4, jpg);
    }
    const stamp = Date.now();
    moveInto(mp4, path.join(MEDIA_DIR, 'podcasts', `${id}.mp4`));
    // Ảnh bìa nằm ở thư mục media gốc để dùng được ảnh thu nhỏ (/media/w/360/...); tên có mốc giờ nên trình duyệt không giữ bản cũ.
    const poster = `pod-${id}-${stamp}.jpg`;
    moveInto(jpg, path.join(MEDIA_DIR, poster));
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

// ---------- Chấm câu chuyện ----------

export type StoryAnswer = { id: string; idx: number; turn: number; question: string; topic: string; transcript: string | null; speech: number };
export type Story = { idx: number; topic: string; question: string; turns: StoryAnswer[]; speech: number; text: string };
export type Verdict = { idx: number; good: boolean; title: string; joins: number };
export type PlanEp = { idx: number; title: string | null; tail: number[] };
export type StoryPlan = { by: 'ai' | 'rule'; eps: PlanEp[] };

/** Tổng tiếng nói gợi ý cho một tập (giây); AI khen mà dưới STORY_FLOOR thì vẫn không làm tập. */
export const STORY_MIN_SEC = 25;
const STORY_FLOOR = 15;
const TAIL_MAX = 3, TAIL_MAX_SEC = 90;

/** Gom câu trả lời theo câu chuyện (idx), các lượt theo thứ tự; bỏ hẳn câu lời nhắn và câu hỏi thăm. */
export function groupStories(answers: StoryAnswer[]): Story[] {
  const by = new Map<number, StoryAnswer[]>();
  for (const a of answers) {
    if (NO_EPISODE.includes(a.topic)) continue;
    const list = by.get(a.idx);
    if (list) list.push(a); else by.set(a.idx, [a]);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([idx, turns]) => {
    turns.sort((x, y) => x.turn - y.turn);
    const main = turns.find((t) => t.turn === 0) ?? turns[0];
    return {
      idx, topic: main.topic, question: main.question, turns,
      speech: turns.reduce((s, t) => s + t.speech, 0),
      text: turns.map((t) => t.transcript?.trim()).filter(Boolean).join(' '),
    };
  });
}

/** Số "từ" của lời kể (tiếng Hàn tính theo âm tiết, ba âm tiết một từ). */
const wordsOf = (s: string, lang: Lang) => (lang === 'ko' ? [...s.replace(/\s+/g, '')].length / 3 : s.split(/\s+/).filter(Boolean).length);

/** Luật khi không có AI: đủ tiếng nói và lời chép đủ dài (không có lời chép thì đòi tiếng nói dài hơn). */
export function ruleGood(st: Story, lang: Lang) {
  if (!st.text) return st.speech >= STORY_MIN_SEC + 5;
  return st.speech >= STORY_MIN_SEC && wordsOf(st.text, lang) >= 25;
}
/** Đoạn còn nội dung để nối vào đuôi một tập. */
const tailable = (st: Story) => st.speech >= 4 && (st.text.length >= 8 || st.speech >= 8);

const STORY_SYSTEM = `You help a family app turn a weekly phone call into short podcast episodes.
The speaker answered a few main questions; some stories have follow-up turns (the app's assistant asked one more question).
For every story decide:
- good: true only when it is a real story or memory (something that happened, with at least one specific detail such as a place, a person, a time, an object, or what someone did, said or felt then), not a short opinion, a list, or a yes/no answer, AND the speaker talks enough (speech_seconds totals about 25 seconds or more).
- title: for good stories, a short warm title of at most 6 words (Korean: at most 16 characters) in the speaker's language (code in "language"), plain words, using only names, places and numbers that appear in what was said; no quotes, no emoji, no dashes, no ending period. Empty string for stories that are not good.
- joins: for a story that is not good but still has real content, the idx of the good story it fits best as a short add-on at the end of that episode; -1 when nothing fits or for good stories.
Never invent anything that was not said.`;

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { idx: { type: 'integer' }, good: { type: 'boolean' }, title: { type: 'string' }, joins: { type: 'integer' } },
        required: ['idx', 'good', 'title', 'joins'],
      },
    },
  },
  required: ['stories'],
};

type Ask = typeof askJSON;
/** Một lần gọi AI cho cả cuộc gọi. Lỗi, quá hạn hay không có khoá thì trả null (dùng luật). */
export async function rateStories(stories: Story[], who: { name: string; role?: string | null }, lang: Lang, ask: Ask = askJSON): Promise<Verdict[] | null> {
  if (!stories.length) return [];
  const user = JSON.stringify({
    language: lang, speaker: { name: who.name, role: who.role ?? null },
    stories: stories.map((s) => ({ idx: s.idx, speech_seconds: Math.round(s.speech), turns: s.turns.map((t) => ({ asked: t.question, said: t.transcript ?? '' })) })),
  });
  const r = await ask<{ stories: Verdict[] }>(STORY_SYSTEM, user, STORY_SCHEMA, 1500, 45_000);
  return Array.isArray(r?.stories) ? r.stories : null;
}

/** Tên AI đặt: gọn lại, qua lớp lọc chống bịa; không ổn thì null (dùng tên mặc định). */
export function cleanTitle(title: string | null | undefined, haystack: string, lang: Lang): string | null {
  const t = String(title ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”«»]/g, '').replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim();
  if (!t || [...t].length > 60 || /[\n\r]/.test(t)) return null;
  const why = suspect(t, haystack, { prevCall: false, ownStory: true, photos: false }, lang);
  if (why) { console.warn(`[podcast] bỏ tên tập "${t}": ${why}`); return null; }
  return t;
}

/** Từ điểm chấm (hoặc luật) ra danh sách tập: mỗi chuyện đạt một tập, chuyện còn lại hợp thì nối vào đuôi (mỗi đoạn một tập). */
export function planStories(stories: Story[], verdicts: Verdict[] | null, lang: Lang, haystack: string): StoryPlan {
  const v = new Map((verdicts ?? []).map((x) => [x.idx, x]));
  const good = stories.filter((s) => (verdicts ? !!v.get(s.idx)?.good && s.speech >= STORY_FLOOR : ruleGood(s, lang)));
  const goodIdx = new Set(good.map((s) => s.idx));
  const eps: PlanEp[] = good.map((s) => ({ idx: s.idx, title: verdicts ? cleanTitle(v.get(s.idx)?.title, haystack, lang) : null, tail: [] }));
  const tailSec = new Map<number, number>();
  for (const s of stories) {
    if (goodIdx.has(s.idx) || !tailable(s) || !eps.length) continue;
    let target: number | undefined;
    if (verdicts) {
      const j = v.get(s.idx)?.joins;
      if (j != null && goodIdx.has(j)) target = j;
    } else {
      // Luật: không biết chuyện có hợp không thì chỉ nối vào chuyện cùng chủ đề (gần nhất), khác chủ đề thì thôi.
      target = good.filter((g) => g.topic === s.topic).sort((a, b) => Math.abs(a.idx - s.idx) - Math.abs(b.idx - s.idx) || a.idx - b.idx)[0]?.idx;
    }
    const ep = eps.find((e) => e.idx === target);
    if (!ep || ep.tail.length >= TAIL_MAX || (tailSec.get(ep.idx) ?? 0) + s.speech > TAIL_MAX_SEC) continue;
    ep.tail.push(s.idx);
    tailSec.set(ep.idx, (tailSec.get(ep.idx) ?? 0) + s.speech);
  }
  return { by: verdicts ? 'ai' : 'rule', eps };
}

type AnswerRow = { id: string; idx: number; turn: number; question: string; topic: string; transcript: string | null; media: string; seconds: number | null; who: string; created_at: Date };

/** Câu trả lời dùng được của một cuộc gọi (đủ tệp, không có lời nhắn hay câu hỏi thăm), theo câu chuyện rồi theo lượt. */
async function callAnswers(callId: string): Promise<AnswerRow[]> {
  const { rows } = await pool.query(
    `select a.*, m.name who from call_answers a join members m on m.id = a.member_id
     where a.call_id = $1 and a.media is not null and a.topic <> all($2::text[]) order by a.idx, a.turn, a.created_at`, [callId, NO_EPISODE]);
  return rows.filter((a) => existsSync(mediaFile(a.media)));
}

/** Cuộc gọi v2: chỉ chuyện chính (part 'story') thành tập, trả về số câu của nó. Cuộc gọi cũ: null (mọi câu chuyện, như trước). */
export function episodeIdx(script: Pick<CallScript, 'v' | 'questions'>): number[] | null {
  if (script.v !== 2) return null;
  return script.questions.flatMap((q, i) => (q.part === 'story' ? [i] : []));
}
const episodeIdxOf = (raw: string) => { try { return episodeIdx(JSON.parse(raw)); } catch { return null; } };

/** Kế hoạch tập của một cuộc gọi: chấm một lần rồi giữ lại (dựng lại hay thêm ảnh không gọi AI lại); câu trả lời đổi thì chấm lại.
 *  Cuộc gọi v2 chỉ chấm chuyện chính; cuộc gọi cũ chấm mọi câu chuyện, chuyện chưa đạt có thể nối vào đuôi tập khác. */
async function storyPlan(call: any, all: AnswerRow[], lang: Lang): Promise<StoryPlan> {
  const only = episodeIdxOf(call.script);
  const answers = only ? all.filter((a) => only.includes(a.idx)) : all;
  const sig = createHash('sha1').update(`v1\n${answers.map((a) => `${a.id}|${a.idx}|${a.turn}|${a.media}|${a.transcript ?? ''}`).join('\n')}`).digest('hex');
  const { rows: [saved] } = await pool.query('select sig, plan from podcast_plans where call_id = $1', [call.id]);
  if (saved?.sig === sig) { try { return JSON.parse(saved.plan) as StoryPlan; } catch {} }
  // Đo tiếng nói thật của từng lượt (bỏ lặng), không có thì lấy số giây máy khách báo.
  const work = mkdtempSync(path.join(os.tmpdir(), 'story-'));
  const list: StoryAnswer[] = [];
  try {
    for (const a of answers) {
      const speech = await voicedSeconds(mediaFile(a.media), work).catch(() => Number(a.seconds) || 0);
      list.push({ id: a.id, idx: a.idx, turn: a.turn ?? 0, question: a.question, topic: a.topic, transcript: a.transcript, speech });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const stories = groupStories(list);
  const haystack = [call.name, call.role, ...answers.flatMap((a) => [a.question, a.transcript ?? ''])].join('\n');
  const verdicts = await rateStories(stories, { name: call.name, role: call.role }, lang);
  const plan = planStories(stories, verdicts, lang, haystack);
  await pool.query(`insert into podcast_plans (call_id, sig, plan) values ($1,$2,$3)
    on conflict (call_id) do update set sig = excluded.sig, plan = excluded.plan, created_at = now()`, [call.id, sig, JSON.stringify(plan)]);
  console.log(`[podcast] cuộc gọi ${call.id}: ${plan.eps.length}/${stories.length} chuyện thành tập (${plan.by === 'ai' ? 'AI chấm' : 'theo luật'})`);
  return plan;
}

/** Ảnh thuộc câu chuyện idx: hàng vault có story = idx; ảnh gửi trong cuộc gọi kiểu cũ (chưa có cột story) thuộc câu hỏi xin ảnh. */
export function pickStoryPhotos(rows: Array<{ media: string; story: number | null }>, idx: number, photoIdx: number) {
  return rows.filter((r) => r.story === idx || (r.story == null && idx === photoIdx)).map((r) => r.media);
}

/** Ảnh của các câu chuyện idxs trong một cuộc gọi (gửi trong cuộc gọi hoặc thêm sau ở tab podcast): theo thứ tự chuyện, cũ trước mới sau. */
async function storyPhotos(callId: string, idxs: number[]): Promise<string[]> {
  const { rows } = await pool.query('select media, story from vault where call_id = $1 order by created_at, id', [callId]);
  if (!rows.length) return [];
  let photoIdx = -1;
  try {
    const { rows: [c] } = await pool.query('select script from calls where id = $1', [callId]);
    photoIdx = (JSON.parse(c.script).questions as Array<{ photo?: boolean }>).findIndex((q) => q.photo);
  } catch {}
  const ok = (m: string) => PHOTO.test(m.split('?')[0]) && existsSync(mediaFile(m));
  return [...new Set(idxs.flatMap((i) => pickStoryPhotos(rows, i, photoIdx)).filter(ok))];
}

/** Ngày kể in to ở đầu video (kiểu nhật ký ảnh): 14.11 (vi), 11.14 (ko), Nov 14 (en). */
function stampOf(d: Date, lang: Lang) {
  if (lang === 'en') return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
  const p = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(d);
  const day = p.find((x) => x.type === 'day')!.value.padStart(2, '0'), month = p.find((x) => x.type === 'month')!.value.padStart(2, '0');
  return lang === 'ko' ? `${month}.${day}` : `${day}.${month}`;
}

async function enqueueStory(call: any, lang: Lang, answers: AnswerRow[], ep: PlanEp, keepDate = false) {
  const main = answers.filter((a) => a.idx === ep.idx);
  if (!main.length) return false;
  const name = call.name as string;
  const piece = (a: AnswerRow, tail: boolean): Piece => ({
    key: `ans:${a.id}`, file: mediaFile(a.media), who: a.who, question: a.question, topic: a.topic, transcript: a.transcript, photo: null, group: a.idx, tail,
  });
  const tails = ep.tail.flatMap((i) => answers.filter((a) => a.idx === i).map((a) => piece(a, true)));
  const topic = (main.find((a) => a.turn === 0) ?? main[0]).topic;
  const title = ep.title ?? tReq('podcastGen.person.title', { name, what: titleOf(topic) });
  // Có ảnh là có video: ảnh của chính câu chuyện trước, rồi ảnh của các chuyện ở phần đuôi.
  const photos = await storyPhotos(call.id, [ep.idx, ...ep.tail]);
  const { rows: [fam] } = await pool.query('select name from families where id = $1', [call.family_id]);
  await enqueue({
    fid: call.family_id, key: `story:${call.id}:${ep.idx}`, kind: 'person', memberId: call.member_id, topic, title,
    cover: photos[0] ?? null, lang, mode: 'story', video: null, keepDate,
    pieces: [...main.map((a) => piece(a, false)), ...tails],
    photos: photos.map(mediaFile),
    story: photos.length ? { title, stamp: stampOf(new Date(call.done_at ?? call.created_at), lang), family: fam?.name ?? '', brand: 'sweet home' } : null,
  });
  return true;
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

async function loadCall(callId: string) {
  const { rows: [call] } = await pool.query(
    'select c.*, m.name, m.role, m.lang from calls c join members m on m.id = c.member_id where c.id = $1', [callId]);
  return call ?? null;
}

/** Sau cuộc gọi (call.ts afterCall): các tập câu chuyện của cuộc gọi, rồi tập theo chủ đề. */
export async function buildPodcastsForCall(callId: string, topics = true) {
  const call = await loadCall(callId);
  if (!call) return;
  const lang = langOf(call.lang);
  return runWithLang(lang, () => buildFor(call, lang, topics));
}

async function buildFor(call: any, lang: Lang, topics: boolean) {
  const answers = await callAnswers(call.id);
  if (!answers.length) return;
  const plan = await storyPlan(call, answers, lang);
  for (const ep of plan.eps) await enqueueStory(call, lang, answers, ep);
  if (!topics) return;
  for (const topic of [...new Set(answers.map((a) => a.topic))]) await buildTopic(call.family_id, topic, lang);
}

/** Dựng lại một tập câu chuyện (thêm ảnh, hoặc dựng dở lúc máy chủ tắt) theo kế hoạch đã chấm. */
export async function rebuildStory(callId: string, idx: number, keepDate = true) {
  const call = await loadCall(callId);
  const lang = langOf(call?.lang);
  const ok = call && await runWithLang(lang, async () => {
    const answers = await callAnswers(call.id);
    if (!answers.some((a) => a.idx === idx)) return false;
    const plan = await storyPlan(call, answers, lang);
    // Kế hoạch đổi mà tập này đã có: vẫn dựng lại chính câu chuyện đó (giữ tên cũ), không nối đuôi.
    const ep = plan.eps.find((e) => e.idx === idx) ?? { idx, title: await oldTitle(call.family_id, `story:${callId}:${idx}`), tail: [] };
    return enqueueStory(call, lang, answers, ep, keepDate);
  });
  if (!ok) {
    await safeQuery(`update podcasts set video_status = case when video is not null then 'ready' else 'none' end,
      status = case when media is not null then 'ready' else 'failed' end where key = $1 and (status = 'rendering' or video_status = 'rendering')`, [`story:${callId}:${idx}`]);
  }
}
async function oldTitle(fid: string, key: string) {
  const { rows: [r] } = await pool.query('select title from podcasts where family_id = $1 and key = $2', [fid, key]);
  return (r?.title as string | undefined) ?? null;
}

/** Tập cũ theo cả cuộc gọi (trước 14/11): chỉ còn dùng khi dựng lại tập dở sau khởi động. Không có câu lời nhắn. */
async function buildCallEpisode(callId: string) {
  const call = await loadCall(callId);
  if (!call) return;
  const lang = langOf(call.lang);
  await runWithLang(lang, async () => {
    const usable = await callAnswers(call.id);
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
  });
}

/** Tập theo chủ đề: 8 câu chuyện gần nhất của cả nhà về chủ đề đó, mỗi chuyện đủ các lượt, dựng như tập câu chuyện.
 *  Chuyện nào trong tập có ảnh thì tập có video ảnh cổ điển; không chuyện nào có ảnh mới chỉ có tiếng. Không bao giờ có lời nhắn. */
async function buildTopic(fid: string, topic: string, lang: Lang, keepDate = false) {
  if (NO_EPISODE.includes(topic)) return;
  const { rows } = await pool.query(
    `with s as (
       select call_id, idx, max(created_at) at from call_answers
       where family_id = $1 and topic = $2 and media is not null group by call_id, idx order by at desc limit ${MAX_TOPIC_STORIES}
     )
     select a.*, m.name who, s.at from call_answers a join s on s.call_id = a.call_id and s.idx = a.idx join members m on m.id = a.member_id
     where a.media is not null and a.topic <> all($3::text[]) order by s.at, a.turn, a.created_at`, [fid, topic, NO_EPISODE]);
  const clips = rows.filter((a) => existsSync(mediaFile(a.media)));
  if (!clips.length) return;
  // Mỗi câu chuyện (cuộc gọi, idx) một nhóm, theo thứ tự trong tập.
  const groups = [...new Map(clips.map((a) => [`${a.call_id}:${a.idx}`, { call: a.call_id as string, idx: a.idx as number }])).entries()];
  const gid = new Map(groups.map(([k], i) => [k, i]));
  const photos: string[] = [];
  for (const [, g] of groups) photos.push(...await storyPhotos(g.call, [g.idx]));
  const { rows: [fam] } = await pool.query('select name from families where id = $1', [fid]);
  const latest = new Date(Math.max(...clips.map((a) => new Date(a.at).getTime())));
  await runWithLang(lang, async () => enqueue({
    fid, key: `topic:${topic}`, kind: 'topic', memberId: null, topic, title: topicLabel(topic), cover: photos[0] ?? await coverFor(fid, null), lang, mode: 'topic', video: null, keepDate,
    pieces: clips.map((a) => ({ key: `ans:${a.id}`, file: mediaFile(a.media), who: a.who, question: a.question, topic: a.topic, transcript: a.transcript, photo: null, group: gid.get(`${a.call_id}:${a.idx}`) })),
    photos: photos.map(mediaFile),
    story: photos.length ? { title: topicLabel(topic), stamp: stampOf(latest, lang), family: fam?.name ?? '', brand: 'sweet home' } : null,
  }));
}

/** Thêm ảnh cho một câu chuyện: dựng lại tập chủ đề có câu chuyện đó (giữ ngày của tập). */
async function refreshTopicsOf(callId: string, idx: number) {
  const call = await loadCall(callId);
  if (!call) return;
  const { rows } = await pool.query(
    `select distinct a.topic from call_answers a join podcasts p on p.family_id = a.family_id and p.key = 'topic:' || a.topic
     where a.call_id = $1 and a.idx = $2 and a.topic <> all($3::text[])`, [callId, idx, NO_EPISODE]);
  for (const r of rows) await buildTopic(call.family_id, r.topic, langOf(call.lang), true);
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
    if (r.tries >= MAX_TRIES || r.key === `topic:${PRIVATE_TOPIC}`) {
      await safeQuery(`update podcasts set status = case when media is not null then 'ready' else 'failed' end,
        video_status = case when video is not null then 'ready' else 'failed' end where id = $1`, [r.id]);
      console.error(`[podcast] bỏ dựng lại ${r.key} sau ${r.tries} lần`);
      continue;
    }
    await safeQuery('update podcasts set tries = tries + 1 where id = $1', [r.id]);
    const [kind, ref] = String(r.key).split(/:(.*)/s);
    try {
      if (kind === 'story') {
        const [cid, idx] = ref.split(':');
        await rebuildStory(cid, Number(idx), !!r.media);
      } else if (kind === 'call') await buildCallEpisode(ref);
      else if (kind === 'topic') {
        const { rows: [m] } = await pool.query('select lang from members where family_id = $1 order by created_at limit 1', [r.family_id]);
        await buildTopic(r.family_id, ref, langOf(m?.lang), !!r.media);
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

/** Tập câu chuyện thêm được ảnh (story: true); kiểu Podcast chung không đổi. */
export type PodcastRow = Podcast & { story: boolean };

function row(r: any): PodcastRow {
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(r.chapters); } catch {}
  return {
    id: r.id, kind: r.kind, title: r.title, topic: topicLabel(r.topic), memberId: r.member_id, duration: Number(r.duration),
    cover: r.cover, media: r.media, chapters, status: r.status, createdAt: r.created_at,
    video: r.video ?? null, poster: r.poster ?? null, videoStatus: r.video_status ?? 'none',
    story: String(r.key).startsWith('story:'),
  };
}

export async function listPodcasts(fid: string, limit = 60) {
  const { rows } = await pool.query(
    `select * from podcasts where family_id = $1 and status <> 'failed' and key <> $3 order by created_at desc limit $2`, [fid, limit, `topic:${PRIVATE_TOPIC}`]);
  return rows.map(row);
}

export const podcastRouter = express.Router();

podcastRouter.get('/podcasts', async (req: any, res) => {
  try { res.json(await listPodcasts(req.member.family_id)); }
  catch (e) { console.error(e); res.status(500).json(errorBody('server')); }
});

// ---------- Thêm ảnh cho tập câu chuyện ----------

const MAX_ADD = 12;
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir(), filename: (_req, _f, cb) => cb(null, `sh-photo-${randomUUID()}`) }),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_ADD },
  fileFilter: (_req, f, cb) => cb(null, f.mimetype.startsWith('image/')),
});
const limitPhotos = limitBy({ name: 'podcast-photos', per: new Limit(12, 3600e3), key: (req) => (req as any).member.id });

// Nhiều ảnh một lần: mỗi ảnh xoay đúng chiều, thu về cạnh dài 2048 px, lưu JPEG, thành một hàng vault của câu chuyện; rồi dựng lại video.
podcastRouter.post('/podcasts/:id/photos', limitPhotos, upload.array('files', MAX_ADD), async (req: any, res) => {
  const files: Express.Multer.File[] = req.files ?? [];
  const drop = () => Promise.all(files.map((f) => unlink(f.path).catch(() => {})));
  try {
    const { rows: [ep] } = await pool.query('select id, key, title from podcasts where id = $1 and family_id = $2', [req.params.id, req.member.family_id]);
    const m = ep ? /^story:(.+):(\d+)$/.exec(ep.key) : null;
    const { rows: [call] } = m ? await pool.query('select id from calls where id = $1 and family_id = $2', [m[1], req.member.family_id]) : { rows: [] };
    if (!m || !call) { await drop(); return res.status(404).json(errorBody('podcast_not_found')); }
    if (!files.length) return res.status(400).json(errorBody('photo_missing'));
    const sharp = (await import('sharp')).default;
    const saved: string[] = [];
    for (const f of files) {
      const name = `${randomUUID()}.jpg`;
      try {
        await sharp(f.path, { failOn: 'error' }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(MEDIA_DIR, name));
        saved.push(`/media/${name}`);
      } catch {
        // Không đọc được như ảnh (tệp hỏng, HEIC máy chủ chưa đọc được): bỏ qua tệp này.
        try { unlinkSync(path.join(MEDIA_DIR, name)); } catch {}
      }
    }
    await drop();
    if (!saved.length) return res.status(400).json(errorBody('photo_type'));
    const idx = Number(m[2]);
    for (const media of saved) {
      await pool.query('insert into vault (id, family_id, member_id, media, caption, call_id, story) values ($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), req.member.family_id, req.member.id, media, ep.title, m[1], idx]);
    }
    await pool.query(`update podcasts set video_status = 'rendering' where id = $1`, [ep.id]);
    res.json({ ok: true, added: saved.length });
    void rebuildStory(m[1], idx).then(() => refreshTopicsOf(m[1], idx)).catch((e) => console.error('[podcast] dựng lại sau khi thêm ảnh:', e));
  } catch (e) {
    await drop();
    console.error(e);
    res.status(500).json(errorBody('server'));
  }
});
