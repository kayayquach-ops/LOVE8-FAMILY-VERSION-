// Podcast nhà mình: ghép giọng thật từ các cuộc gọi với nhạc nền (ffmpeg). Lời dẫn đọc bằng giọng máy ngay lúc nghe,
// file chừa sẵn khoảng nhạc cho lời dẫn và lưu mốc thời gian (chapters). Mỗi cuộc gọi thành một tập theo người,
// mỗi chủ đề có một tập gom câu trả lời của cả nhà.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { isTopic, type Chapter, type Podcast, type Topic } from '../src/shared.ts';
import { errorBody, tVi } from './i18n.ts';
import { pool } from './db.ts';
import { musicExpr, probe, run } from './recap.ts';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_TOPIC_CLIPS = 8;

export async function migratePodcast(p: pg.Pool) {
  await p.query(`
    create table if not exists podcasts (
      id text primary key, family_id text not null references families(id), key text not null,
      kind text not null, member_id text, topic text not null, title text not null,
      media text, duration real not null default 0, chapters text not null default '[]', cover text,
      status text not null default 'rendering', created_at timestamptz not null default now(),
      unique (family_id, key)
    );
  `);
  await p.query(`update podcasts set status = case when media is not null then 'ready' else 'failed' end where status = 'rendering'`);
}

// Tiêu đề tập theo chủ đề và tên chủ đề nằm trong bảng chữ máy chủ (podcastGen.titleOf.<chủ đề>, topic.<chủ đề>).
const titleOf = (t: string) => tVi(isTopic(t) ? `podcastGen.titleOf.${t}` : 'podcastGen.titleOf.fallback');
const topicLabel = (t: string) => tVi(isTopic(t) ? `topic.${t}` : 'topic.fallback');
const mediaFile = (m: string) => path.join(MEDIA_DIR, path.basename(m.split('?')[0]));
/** Giọng máy đọc tiếng Việt chậm: ước chừng thời gian đọc để chừa đủ nhạc. */
const sayTime = (s: string) => 1 + s.trim().split(/\s+/).length * 0.42;

type Clip = { file: string; who: string; question: string; transcript: string | null; say: string };

async function buildAudio(intro: string, clips: Clip[], outro: string, outFile: string) {
  const work = mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  try {
    const base = ['-y', '-hide_banner', '-loglevel', 'error'];
    const voices: Array<{ name: string; dur: number; clip: Clip }> = [];
    let n = 0;
    for (const c of clips) {
      const name = `v${n++}.wav`;
      try {
        await run(FFMPEG, [...base, '-i', c.file, '-vn', '-af', 'highpass=f=70,dynaudnorm=f=250:g=15:p=0.9,aresample=44100',
          '-ac', '2', '-c:a', 'pcm_s16le', name], work, 120_000);
        const { duration } = await probe(name, work);
        if (duration && duration >= 0.8) voices.push({ name, dur: duration, clip: c });
      } catch (e) {
        console.error(`[podcast] bỏ qua ${c.file}:`, (e as Error).message.split('\n')[0]);
      }
    }
    if (!voices.length) throw new Error('Không có đoạn giọng nào dùng được');

    // Xếp mốc: nhạc vào, lời dẫn, giọng thật, nghỉ một nhịp, lời dẫn tiếp...
    const chapters: Chapter[] = [];
    let t = 1.2;
    const sayIntro = sayTime(intro);
    chapters.push({ at: t, until: t + sayIntro, say: intro });
    t += sayIntro + 0.8;
    const starts: number[] = [];
    for (const v of voices) {
      const s = sayTime(v.clip.say);
      chapters.push({ at: t, until: t + s + 0.5, say: v.clip.say, who: v.clip.who, question: v.clip.question, transcript: v.clip.transcript });
      t += s + 0.5;
      starts.push(t);
      t += v.dur + 1.4;
    }
    const sayOut = sayTime(outro);
    chapters.push({ at: t, until: t + sayOut, say: outro });
    const total = t + sayOut + 3.5;

    await run(FFMPEG, [...base, '-f', 'lavfi', '-i', `aevalsrc=exprs='${musicExpr(0.998)}|${musicExpr(1.002)}':s=44100:d=${(total + 1).toFixed(2)}`,
      '-af', 'lowpass=f=2800,aecho=0.8:0.6:180|340:0.22|0.12,volume=1.8', '-c:a', 'pcm_s16le', 'music.wav'], work, 300_000);

    const inputs = ['-i', 'music.wav'];
    const fc = [`[0:a]atrim=0:${total.toFixed(3)},afade=t=in:d=2,afade=t=out:st=${(total - 3).toFixed(3)}:d=3[mus]`];
    voices.forEach((v, i) => {
      inputs.push('-i', v.name);
      const ms = Math.round(starts[i] * 1000);
      fc.push(`[${i + 1}:a]afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, v.dur - 0.3).toFixed(3)}:d=0.3,adelay=delays=${ms}:all=1[vo${i}]`);
    });
    fc.push(`${voices.map((_, i) => `[vo${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},asplit[vc][sc]`);
    fc.push('[mus][sc]sidechaincompress=threshold=0.015:ratio=10:attack=60:release=900[duck]');
    fc.push('[duck][vc]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]');
    const tmp = path.join(work, 'out.m4a');
    await run(FFMPEG, [...base, ...inputs, '-filter_complex', fc.join(';'), '-map', '[a]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-movflags', '+faststart', '-t', total.toFixed(3), tmp], work, 600_000);
    mkdirSync(path.dirname(outFile), { recursive: true });
    try { renameSync(tmp, outFile); } catch { copyFileSync(tmp, outFile); }
    return { duration: total, chapters };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

type Job = { fid: string; key: string; kind: 'person' | 'topic'; memberId: string | null; topic: string; title: string; cover: string | null;
  intro: string; outro: string; clips: Clip[] };

async function render(job: Job) {
  const { rows: [row] } = await pool.query(
    `insert into podcasts (id, family_id, key, kind, member_id, topic, title, cover, status) values ($1,$2,$3,$4,$5,$6,$7,$8,'rendering')
     on conflict (family_id, key) do update set title = excluded.title, cover = coalesce(excluded.cover, podcasts.cover), status = 'rendering'
     returning id`, [randomUUID(), job.fid, job.key, job.kind, job.memberId, job.topic, job.title, job.cover]);
  try {
    const out = path.join(MEDIA_DIR, 'podcasts', `${row.id}.m4a`);
    const r = await buildAudio(job.intro, job.clips, job.outro, out);
    await pool.query(`update podcasts set status = 'ready', media = $2, duration = $3, chapters = $4, created_at = now() where id = $1`,
      [row.id, `/media/podcasts/${row.id}.m4a?v=${Date.now()}`, r.duration, JSON.stringify(r.chapters)]);
    console.log(`[podcast] xong ${job.title}`);
  } catch (e) {
    console.error(`[podcast] lỗi ${job.title}:`, (e as Error).message);
    await pool.query(`update podcasts set status = case when media is not null then 'ready' else 'failed' end where id = $1`, [row.id]);
  }
}

// Mỗi lần ghép một tập để máy chủ không nặng.
let queue: Promise<void> = Promise.resolve();
const enqueue = (job: Job) => { queue = queue.then(() => render(job)); return queue; };

async function coverFor(fid: string, memberId: string | null) {
  const { rows } = await pool.query(
    `select media from (
       select media, created_at, 0 o from vault where family_id = $1 and ($2::text is null or member_id = $2)
       union all
       select media, created_at, 1 o from posts where family_id = $1 and kind = 'photo' and media is not null and ($2::text is null or author_id = $2)
     ) x order by o, created_at desc limit 1`, [fid, memberId]);
  return rows[0]?.media ?? null;
}

export async function buildPodcastsForCall(callId: string) {
  const { rows: [call] } = await pool.query(
    'select c.*, m.name from calls c join members m on m.id = c.member_id where c.id = $1', [callId]);
  if (!call) return;
  const { rows: answers } = await pool.query(
    `select a.*, m.name who from call_answers a join members m on m.id = a.member_id
     where a.call_id = $1 and a.media is not null order by a.idx`, [callId]);
  const usable = answers.filter((a) => existsSync(mediaFile(a.media)));
  if (!usable.length) return;
  const name = call.name as string;
  const first = usable[0].topic as Topic;

  const jobs: Job[] = [{
    fid: call.family_id, key: `call:${callId}`, kind: 'person', memberId: call.member_id, topic: first,
    title: tVi('podcastGen.person.title', { name, what: titleOf(first) }), cover: await coverFor(call.family_id, call.member_id),
    intro: tVi('podcastGen.person.intro', { name }),
    outro: tVi('podcastGen.person.outro', { name }),
    clips: usable.map((a) => ({ file: mediaFile(a.media), who: a.who, question: a.question, transcript: a.transcript, say: a.question })),
  }];

  for (const topic of [...new Set(usable.map((a) => a.topic as string))]) {
    const { rows } = await pool.query(
      `select * from (
         select a.*, m.name who from call_answers a join members m on m.id = a.member_id
         where a.family_id = $1 and a.topic = $2 and a.media is not null order by a.created_at desc limit ${MAX_TOPIC_CLIPS}
       ) x order by created_at`, [call.family_id, topic]);
    const clips = rows.filter((a) => existsSync(mediaFile(a.media)));
    if (!clips.length) continue;
    const label = topicLabel(topic);
    jobs.push({
      fid: call.family_id, key: `topic:${topic}`, kind: 'topic', memberId: null, topic, title: label, cover: await coverFor(call.family_id, null),
      intro: tVi('podcastGen.topic.intro', { label }),
      outro: tVi('podcastGen.topic.outro'),
      clips: clips.map((a) => ({ file: mediaFile(a.media), who: a.who, question: a.question, transcript: a.transcript, say: `${a.who}. ${a.question}` })),
    });
  }
  for (const j of jobs) await enqueue(j);
}

/** Tập mở đầu trong album của một người: câu "thương" đầu tiên thu lúc mới vào nhà. */
export async function buildFirstVoicePodcast(fid: string, memberId: string, name: string, media: string) {
  const file = mediaFile(media);
  if (!existsSync(file)) return;
  await enqueue({
    fid, key: `first:${memberId}`, kind: 'person', memberId, topic: 'loi-nhan', title: tVi('podcastGen.first.title'), cover: await coverFor(fid, memberId),
    intro: tVi('podcastGen.first.intro', { name }),
    outro: tVi('podcastGen.first.outro'),
    clips: [{ file, who: name, question: tVi('podcastGen.first.title'), transcript: null, say: tVi('podcastGen.first.say', { name }) }],
  });
}

function row(r: any): Podcast {
  let chapters: Chapter[] = [];
  try { chapters = JSON.parse(r.chapters); } catch {}
  return {
    id: r.id, kind: r.kind, title: r.title, topic: topicLabel(r.topic), memberId: r.member_id, duration: Number(r.duration),
    cover: r.cover, media: r.media, chapters, status: r.status, createdAt: r.created_at,
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
