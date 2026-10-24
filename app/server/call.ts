// Cuộc gọi hằng tuần ngay trong app: Homeletter hỏi, người nghe kể bằng giọng nói.
// Claude soạn câu hỏi riêng cho từng người; không có khoá thì dùng bộ câu soạn sẵn từ members.intro.
// Gọi xong: rút ngày tháng quan trọng vào lịch, ảnh xưa vào kho, rồi ghép podcast.
import express from 'express';
import type multer from 'multer';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { EVENT_HINTS, TOPICS, type CallQuestion, type CallScript, type Topic } from '../src/shared.ts';
import { askJSON, askQuick } from './ai.ts';
import { pool } from './db.ts';
import { weekKey } from './recap.ts';
import { buildPodcastsForCall } from './podcast.ts';
import { cachedSpeech, hasVoice, speech, transcribe, TTS_MAX } from './voice.ts';
import path from 'node:path';

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');

export async function migrateCall(p: pg.Pool) {
  await p.query(`
    create table if not exists calls (
      id text primary key, family_id text not null references families(id), member_id text not null references members(id),
      week text not null, status text not null default 'ready', script text not null,
      created_at timestamptz not null default now(), done_at timestamptz
    );
    create index if not exists calls_member on calls (member_id, week);
    create table if not exists call_answers (
      id text primary key, call_id text not null references calls(id) on delete cascade, family_id text not null,
      member_id text not null references members(id), idx int not null, question text not null, topic text not null,
      media text, transcript text, seconds real, created_at timestamptz not null default now()
    );
    create index if not exists call_answers_family on call_answers (family_id, topic);
    create table if not exists vault (
      id text primary key, family_id text not null references families(id), member_id text not null references members(id),
      media text not null, caption text, call_id text, created_at timestamptz not null default now()
    );
    create index if not exists vault_family on vault (family_id, created_at desc);
  `);
}

// Từ 9 giờ sáng thứ Bảy đến hết Chủ nhật (giờ Việt Nam), ai chưa gọi tuần này thì app đổ chuông.
const CALL_FROM = { weekday: 5, hour: 9 }; // 0 = thứ Hai

function callTime() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  const day = (vn.getUTCDay() + 6) % 7;
  return day > CALL_FROM.weekday || (day === CALL_FROM.weekday && vn.getUTCHours() >= CALL_FROM.hour);
}

const KIND_TITLE: Record<string, string> = {
  wedding: 'Ngày cưới bố mẹ', anniversary: 'Ngày kỷ niệm', birthday: 'Sinh nhật', memory: 'Ngày đáng nhớ', other: 'Ngày đáng nhớ',
};

type Ctx = {
  member: { id: string; name: string; role: string; intro: Record<string, string> };
  family: Array<{ name: string; role: string }>;
  events: Array<{ kind: string; title: string; day: number; month: number; year: number | null }>;
  asked: string[];
  stories: Array<{ question: string; transcript: string; who: string }>;
  captions: string[];
};

async function context(memberId: string, fid: string): Promise<Ctx> {
  const [m, fam, ev, asked, stories, caps] = await Promise.all([
    pool.query('select id, name, role, intro from members where id = $1', [memberId]),
    pool.query('select name, role from members where family_id = $1 order by created_at', [fid]),
    pool.query('select kind, title, day, month, year from events where family_id = $1', [fid]),
    pool.query('select question from call_answers where member_id = $1 order by created_at desc limit 40', [memberId]),
    pool.query(
      `select a.question, a.transcript, m.name who from call_answers a join members m on m.id = a.member_id
       where a.family_id = $1 and coalesce(a.transcript, '') <> '' order by a.created_at desc limit 12`, [fid]),
    pool.query(`select caption from posts where family_id = $1 and coalesce(caption, '') <> '' order by created_at desc limit 10`, [fid]),
  ]);
  let intro: Record<string, string> = {};
  try { intro = JSON.parse(m.rows[0]?.intro || '{}'); } catch {}
  return {
    member: { id: memberId, name: m.rows[0]?.name ?? 'Bạn', role: m.rows[0]?.role ?? 'con', intro },
    family: fam.rows, events: ev.rows, asked: asked.rows.map((r) => r.question),
    stories: stories.rows, captions: caps.rows.map((r) => r.caption),
  };
}

// ---------- Bộ câu hỏi soạn sẵn ----------

function templateScript(c: Ctx, week: string): CallScript {
  const { name, role, intro } = c.member;
  const parent = role === 'bo' || role === 'me';
  const self = role === 'bo' ? 'bố' : role === 'me' ? 'mẹ' : 'bạn';
  const call = parent ? self[0].toUpperCase() + self.slice(1) : name;
  const food = (intro.food || '').trim();
  const hasWedding = c.events.some((e) => e.kind === 'wedding');
  const q = (text: string, topic: Topic, photo = false, event: CallQuestion['event'] = 'none'): CallQuestion => ({ text, topic, photo, event });

  const pool: CallQuestion[] = parent ? [
    ...(!hasWedding ? [q(`${call} với ${role === 'bo' ? 'mẹ' : 'bố'} cưới nhau ngày nào? ${call} kể lại ngày hôm ấy cho con nghe với.`, 'ngay-cuoi', true, 'wedding')] : []),
    q(`Hồi nhỏ, ${self} hay chơi trò gì nhất? Kể con nghe một buổi chiều ngày ấy.`, 'tuoi-tho'),
    ...(food ? [q(`${call} còn nhớ con thích ${food}. ${call} nấu món ấy thế nào? Kể từng bước cho con nhé.`, 'mon-an')] : []),
    q(`Lần đầu ${self} bế con trên tay, ${self} nghĩ gì?`, 'ky-niem'),
    q(`Ngày xưa nhà mình ở đâu? ${call} tả lại căn nhà ấy giúp con.`, 'ky-niem', true),
    q(`Tuần này ở nhà có chuyện gì vui không ${self}?`, 'cuoc-song'),
    q(`Món nào bà nấu mà đến giờ ${self} vẫn nhớ vị?`, 'mon-an'),
    q(`Hồi trẻ ${self} mơ làm nghề gì?`, 'tuoi-tho'),
    q(`Có điều gì ${self} muốn dặn con tuần này không?`, 'loi-nhan'),
  ] : [
    q(`Tuần này bên đó thế nào? Kể một chuyện nhỏ thôi cũng được.`, 'cuoc-song'),
    ...(food ? [q(`Bạn nhớ ${food} ở nhà. Lần cuối được ăn là khi nào?`, 'mon-an')] : []),
    q(`Hồi nhỏ, kỷ niệm nào với bố mẹ làm bạn nhớ nhất?`, 'tuoi-tho'),
    q(`Có tấm ảnh cũ nào của cả nhà bạn thích không? Kể về ngày chụp tấm ấy nhé.`, 'ky-niem', true),
    q(`Bữa cơm gần nhất bạn ăn ngon là ở đâu, với ai?`, 'mon-an'),
    q(`Điều gì ở bên đó làm bạn nhớ nhà nhất?`, 'cuoc-song'),
    q(`Nếu được về nhà một ngày, bạn muốn làm gì đầu tiên?`, 'ky-niem'),
    q(`Có câu nào bạn muốn nhắn bố mẹ tuần này không?`, 'loi-nhan'),
  ];
  const fresh = pool.filter((x) => !c.asked.includes(x.text));
  const list = fresh.length >= 4 ? fresh : pool;
  // Câu ngày cưới luôn hỏi trước nếu chưa có trong lịch; còn lại xoay vòng theo tuần.
  const head = list.filter((x) => x.event === 'wedding');
  const rest = list.filter((x) => x.event !== 'wedding');
  const shift = Math.floor(Date.parse(week) / (7 * 86400e3)) % Math.max(1, rest.length);
  const rotated = [...rest.slice(shift), ...rest.slice(0, shift)];
  const loi = rotated.filter((x) => x.topic === 'loi-nhan').slice(0, 1);
  const questions = [...head, ...rotated.filter((x) => x.topic !== 'loi-nhan')].slice(0, 3).concat(loi);
  return {
    greeting: parent ? `${call} ơi, con là Homeletter đây. Tuần này mình nói chuyện một lúc nhé.` : `${name} ơi, Homeletter đây. Mình nói chuyện một lúc nhé.`,
    questions,
    goodbye: parent ? `Con cảm ơn ${self}. Con sẽ giữ lại để cả nhà cùng nghe.` : `Cảm ơn ${name}. Mình giữ lại để cả nhà cùng nghe nhé.`,
    source: 'template',
  };
}

// ---------- Claude soạn câu hỏi ----------

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['greeting', 'questions', 'goodbye'],
  properties: {
    greeting: { type: 'string' },
    goodbye: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'topic', 'photo', 'event'],
        properties: {
          text: { type: 'string' },
          topic: { type: 'string', enum: Object.keys(TOPICS) },
          photo: { type: 'boolean' },
          event: { type: 'string', enum: [...EVENT_HINTS] },
        },
      },
    },
  },
};

const SCRIPT_SYSTEM = `You write the script for a short weekly voice call inside Homeletter, a family app for Vietnamese families whose child studies abroad.
The phone reads every line aloud with a Vietnamese text-to-speech voice, and the person answers by speaking.

Write in Vietnamese, the way a warm, unhurried person really talks on the phone. Short sentences. No em dash or long dash, no emoji, no lists, no quotation marks.
When talking to a parent (role bo or me), Homeletter calls itself "con" and addresses them as Bố or Mẹ. When talking to a child (role con), Homeletter calls itself "mình" and uses their name.

Write a greeting (one or two sentences), 4 questions, and a goodbye (one or two sentences).
Each question is one or two sentences, invites a story rather than a yes or no, and is easy to answer out loud.
Make the questions personal: use the intro answers, the family calendar, earlier stories and recent photo captions. Follow up on an earlier story when there is one. Never repeat a question that was already asked.
If the person is a parent and the calendar has no wedding day, one question asks when they got married and to tell about that day, with photo true and event wedding.
Ask for an old photo (photo true) in at most one other question, only where it fits naturally.
Set event to the kind of date the answer will likely contain (wedding, anniversary, birthday, memory), otherwise none.
The last question gently invites a message for the rest of the family (topic loi-nhan).
The intro field "unsaid" is private: it may guide your tone, but never quote it or hint at its content.`;

async function aiScript(c: Ctx): Promise<CallScript | null> {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const user = JSON.stringify({
    today,
    person: { name: c.member.name, role: c.member.role, intro: c.member.intro },
    family: c.family,
    calendar: c.events,
    already_asked: c.asked,
    earlier_stories: c.stories,
    recent_photo_captions: c.captions,
  }, null, 1);
  const r = await askJSON<Omit<CallScript, 'source'>>(SCRIPT_SYSTEM, user, SCRIPT_SCHEMA);
  if (!r || !Array.isArray(r.questions) || !r.questions.length) return null;
  const clean = (s: string) => String(s || '').replace(/\s*[—–]\s*/g, ', ').trim();
  const questions = r.questions.slice(0, 5)
    .filter((q) => q && q.text && q.topic in TOPICS)
    .map((q) => ({ text: clean(q.text), topic: q.topic, photo: !!q.photo, event: EVENT_HINTS.includes(q.event) ? q.event : 'none' }));
  if (!questions.length) return null;
  return { greeting: clean(r.greeting), questions, goodbye: clean(r.goodbye), source: 'ai' };
}

const REPLY_SYSTEM = `You are Homeletter on a warm weekly voice call with a Vietnamese family member. They just answered a question out loud (speech recognition text, may have errors).
Reply with ONE short spoken Vietnamese reaction, at most 12 words, like a caring person on the phone: acknowledge one concrete detail they said. Do not ask a new question. No em dash, no emoji, no quotation marks.
If role is bo or me, call yourself con and address them as Bố or Mẹ, end politely with ạ when natural. If role is con, call yourself mình and use their name sparingly.`;

async function quickReply(who: { name: string; role: string } | undefined, question: string, said: string, memberId: string) {
  const text = await askQuick(REPLY_SYSTEM, JSON.stringify({ person: { name: who?.name ?? '', role: who?.role ?? 'con' }, question, answer: said.slice(0, 1500) }), 1800);
  const clean = text?.replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').split('\n')[0].trim().slice(0, 140) || null;
  // Đọc sẵn câu đáp ngay: lúc máy khách xin giọng sẽ nhận chung kết quả, đỡ một lượt mạng.
  if (clean) void speech(clean, memberId);
  return clean;
}

// ---------- Rút ngày tháng sau cuộc gọi ----------

type Found = { kind: string; title: string; day: number; month: number; year: number | null; note: string };

const DATES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'day', 'month', 'year', 'note'],
        properties: {
          kind: { type: 'string', enum: ['birthday', 'wedding', 'anniversary', 'memory', 'other'] },
          title: { type: 'string' },
          day: { type: 'integer' },
          month: { type: 'integer' },
          year: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          note: { type: 'string' },
        },
      },
    },
  },
};

const DATES_SYSTEM = `You read the transcript of a family voice call (speech recognition, Vietnamese, may contain recognition errors) and pull out important family dates to add to the shared family calendar.
Only include a date when the speaker clearly states both the day and the month. Include the year when stated. Do not guess.
Skip dates already in the calendar. Title is short Vietnamese with full diacritics, for example: Ngày cưới bố mẹ, Sinh nhật bà nội, Ngày cả nhà chuyển nhà. No em dash.
Note is one short Vietnamese sentence (full diacritics) about the day from the speaker's words.
If nothing qualifies, return an empty list.`;

/** Không có Claude: đọc kiểu "ngày 12 tháng 3 năm 1995" hoặc "12/3/1995" trong câu trả lời có hẹn trước loại ngày. */
function regexDates(answers: Array<{ transcript: string | null; event: string }>): Found[] {
  const out: Found[] = [];
  for (const a of answers) {
    if (!a.transcript || a.event === 'none') continue;
    const t = a.transcript.toLowerCase();
    const m = t.match(/ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}))?/) ?? t.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{4}))?\b/);
    if (!m) continue;
    const day = +m[1], month = +m[2], year = m[3] ? +m[3] : null;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    out.push({ kind: a.event, title: KIND_TITLE[a.event] ?? 'Ngày đáng nhớ', day, month, year, note: '' });
  }
  return out;
}

async function saveDates(callId: string) {
  const { rows: [call] } = await pool.query('select * from calls where id = $1', [callId]);
  if (!call) return;
  const script: CallScript = JSON.parse(call.script);
  const { rows: answers } = await pool.query('select idx, question, transcript from call_answers where call_id = $1 order by idx', [callId]);
  const said = answers.filter((a) => (a.transcript ?? '').trim());
  if (!said.length) return;
  const { rows: existing } = await pool.query('select kind, title, day, month, year from events where family_id = $1', [call.family_id]);
  const { rows: [who] } = await pool.query('select name, role from members where id = $1', [call.member_id]);

  let found: Found[] | null = null;
  const ai = await askJSON<{ events: Found[] }>(DATES_SYSTEM, JSON.stringify({
    speaker: who, calendar: existing,
    call: said.map((a) => ({ question: a.question, answer: a.transcript })),
  }, null, 1), DATES_SCHEMA, 2000);
  if (ai?.events) found = ai.events;
  else found = regexDates(said.map((a) => ({ transcript: a.transcript, event: script.questions[a.idx]?.event ?? 'none' })));

  for (const e of found) {
    const day = Math.round(e.day), month = Math.round(e.month);
    const year = e.year && e.year >= 1900 && e.year <= new Date().getFullYear() ? Math.round(e.year) : null;
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) continue;
    if (existing.some((x) => x.day === day && x.month === month && (x.kind === e.kind || x.title === e.title))) continue;
    const title = String(e.title || KIND_TITLE[e.kind] || 'Ngày đáng nhớ').replace(/\s*[—–]\s*/g, ', ').slice(0, 80);
    await pool.query(
      `insert into events (id, family_id, member_id, kind, title, day, month, year, lunar, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
      [randomUUID(), call.family_id, call.member_id, ['birthday', 'wedding', 'anniversary', 'memory', 'other'].includes(e.kind) ? e.kind : 'other',
        title, day, month, year, e.note ? String(e.note).slice(0, 500) : `${who?.name ?? ''} kể trong cuộc gọi`.trim(), call.member_id],
    );
    existing.push({ kind: e.kind, title, day, month, year });
    console.log(`[call] thêm vào lịch: ${title} ${day}/${month}${year ? '/' + year : ''}`);
  }
}

async function afterCall(callId: string) {
  try { await saveDates(callId); } catch (e) { console.error('[call] lỗi rút ngày:', (e as Error).message); }
  try { await buildPodcastsForCall(callId); } catch (e) { console.error('[call] lỗi podcast:', (e as Error).message); }
}

// ---------- Đường dẫn ----------

type Fn = (req: any, res: express.Response) => Promise<unknown>;
const h = (fn: Fn) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi máy chủ' });
  });

export function callRouter(upload: multer.Multer) {
  const r = express.Router();
  const media = (f?: Express.Multer.File) => (f ? `/media/${f.filename}` : null);

  r.get('/call/due', h(async (req, res) => {
    const { rows } = await pool.query(`select 1 from calls where member_id = $1 and week = $2 and status = 'done' limit 1`, [req.member.id, weekKey()]);
    res.json({ due: !rows.length && callTime(), done: !!rows.length });
  }));

  // Nhấc máy: lấy bộ câu hỏi của tuần (soạn một lần, gọi lại thì dùng tiếp).
  r.post('/call/start', h(async (req, res) => {
    const { id: mid, family_id: fid } = req.member;
    const week = weekKey();
    const { rows } = await pool.query(`select id, script from calls where member_id = $1 and week = $2 and status = 'ready' order by created_at desc limit 1`, [mid, week]);
    if (rows[0]) return res.json({ id: rows[0].id, script: JSON.parse(rows[0].script) });
    const c = await context(mid, fid);
    const script = (await aiScript(c)) ?? templateScript(c, week);
    const id = randomUUID();
    await pool.query('insert into calls (id, family_id, member_id, week, script) values ($1,$2,$3,$4,$5)', [id, fid, mid, week, JSON.stringify(script)]);
    res.json({ id, script });
  }));

  r.post('/call/:id/answer', upload.single('file'), h(async (req, res) => {
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    if (!call) return res.status(404).json({ error: 'Không thấy cuộc gọi' });
    const script: CallScript = JSON.parse(call.script);
    const idx = Number(req.body.idx);
    const q = script.questions[idx];
    if (!q) return res.status(400).json({ error: 'Không có câu hỏi này' });
    const aid = randomUUID();
    let transcript = String(req.body.transcript || '').trim().slice(0, 4000) || null;
    await pool.query('delete from call_answers where call_id = $1 and idx = $2', [call.id, idx]);
    await pool.query(
      'insert into call_answers (id, call_id, family_id, member_id, idx, question, topic, media, transcript, seconds) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [aid, call.id, call.family_id, call.member_id, idx, q.text, q.topic, media(req.file), transcript, Number(req.body.seconds) || null],
    );
    // Máy không chép được lời (iPhone hay bị): nhờ Gemini chép, quá 8 giây thì thôi. Chép được thì đáp luôn một câu.
    let reply: string | null = null;
    if (!transcript && req.file) {
      transcript = (await transcribe(path.join(MEDIA_DIR, req.file.filename), req.member.id, 8000))?.slice(0, 4000) ?? null;
      if (transcript) {
        await pool.query('update call_answers set transcript = $2 where id = $1', [aid, transcript]);
        const { rows: [m] } = await pool.query('select name, role from members where id = $1', [call.member_id]);
        reply = await quickReply(m, q.text, transcript, req.member.id);
      }
    }
    res.json({ ok: true, transcript, reply });
  }));

  // Nghe xong một câu: AI đáp một câu ngắn theo điều vừa kể. Không có khoá hay quá 2 giây thì máy khách dùng câu mẫu.
  r.post('/call/:id/reply', h(async (req, res) => {
    const said = String(req.body.transcript || '').trim().slice(0, 1500);
    if (!said) return res.json({ text: null });
    const { rows: [call] } = await pool.query('select c.script, m.name, m.role from calls c join members m on m.id = c.member_id where c.id = $1 and c.member_id = $2', [req.params.id, req.member.id]);
    if (!call) return res.status(404).json({ error: 'Không thấy cuộc gọi' });
    const q = (JSON.parse(call.script) as CallScript).questions[Number(req.body.idx)];
    res.json({ text: await quickReply(call, q?.text ?? '', said, req.member.id) });
  }));

  // Giọng đọc của Homeletter: trả về đường dẫn file âm thanh, chưa có khoá hay quá giới hạn thì url null để máy dùng giọng máy.
  r.post('/call/tts', h(async (req, res) => {
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > TTS_MAX) return res.json({ url: null });
    const hit = cachedSpeech(text);
    if (hit) return res.json({ url: hit });
    if (!hasVoice()) return res.json({ url: null, off: true });
    const p = speech(text, req.member.id);
    res.json({ url: p ? await p : null });
  }));

  r.post('/call/:id/photo', upload.single('file'), h(async (req, res) => {
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    if (!call || !req.file) return res.status(400).json({ error: 'Chưa có ảnh' });
    const script: CallScript = JSON.parse(call.script);
    const q = script.questions[Number(req.body.idx)];
    await pool.query('insert into vault (id, family_id, member_id, media, caption, call_id) values ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), call.family_id, call.member_id, media(req.file), q ? TOPICS[q.topic] : null, call.id]);
    res.json({ ok: true });
  }));

  r.post('/call/:id/finish', h(async (req, res) => {
    const { rowCount } = await pool.query(`update calls set status = 'done', done_at = now() where id = $1 and member_id = $2 and status = 'ready'`, [req.params.id, req.member.id]);
    res.json({ ok: true });
    if (rowCount) void afterCall(req.params.id);
  }));

  r.get('/vault', h(async (req, res) => {
    const { rows } = await pool.query('select * from vault where family_id = $1 order by created_at desc limit 60', [req.member.family_id]);
    res.json(rows.map((v) => ({ id: v.id, memberId: v.member_id, media: v.media, caption: v.caption, createdAt: v.created_at })));
  }));

  return r;
}
