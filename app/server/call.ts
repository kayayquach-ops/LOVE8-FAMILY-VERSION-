// Cuộc gọi hằng tuần ngay trong app: Mây của Sweet Home hỏi, người nghe kể bằng giọng nói.
// Claude soạn câu hỏi riêng cho từng người; không có khoá thì dùng bộ câu soạn sẵn từ members.intro.
// Gọi xong: rút ngày tháng quan trọng vào lịch, ảnh xưa vào kho, rồi ghép podcast.
import express from 'express';
import type multer from 'multer';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CALL_ROLES, EVENT_HINTS, TOPICS, callLines, isTopic, type CallQuestion, type CallScript, type Topic } from '../src/shared.ts';
import { errorBody, langOf, LANGS, reqLang, tReq, tServer, tVi, type Lang } from './i18n.ts';
import { askJSON, askQuick } from './ai.ts';
import { pool } from './db.ts';
import { weekKey } from './recap.ts';
import { buildPodcastsForCall } from './podcast.ts';
import { cachedSpeech, gate, hasVoice, initTtsBudget, speech, transcribe, ttsStatus, TTS_MAX } from './voice.ts';
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
  // Bộ đếm ngân sách TTS sống qua lần deploy (bảng app_settings, key 'tts_budget').
  await p.query('create table if not exists app_settings (key text primary key, value text not null)');
  await initTtsBudget({
    async load() {
      const { rows } = await p.query(`select value from app_settings where key = 'tts_budget'`);
      return rows[0] ? JSON.parse(rows[0].value) : null;
    },
    async save(v) {
      await p.query(`insert into app_settings (key, value) values ('tts_budget', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify(v)]);
    },
  });
  // Nạp sẵn giọng cho các câu cố định còn thiếu trong kho, rải rác chậm, không dồn lúc khởi động.
  setTimeout(() => void warmFixedVoices(), 15_000);
}

/** Các câu cố định cần có giọng sẵn: mỗi (vai, ngôn ngữ) 7 câu. Câu "ack" không nạp (chỉ dùng nếu tình cờ đã có trong kho). */
export function fixedLines() {
  const out = new Set<string>();
  for (const lang of ['vi', 'en'] as const) {
    for (const role of CALL_ROLES) {
      const L = callLines(role, (k, v) => tServer(lang, k, v));
      for (const text of [L.slow, L.busy, L.skip, L.photo, ...L.short, ...L.long]) out.add(text);
    }
  }
  return [...out];
}

/** Tạo (một lần, rồi nằm trong kho) âm thanh Gemini cho câu cố định chưa có. Tối đa 6 yêu cầu mỗi phút; còn dưới 30% ngân sách ngày thì dừng. */
export async function warmFixedVoices(gapMs = 10_000) {
  if (!hasVoice()) return;
  let n = 0;
  for (const text of fixedLines()) {
    if (cachedSpeech(text)) continue;
    if (gate.blocked(true)) { console.log('[call] dừng nạp sẵn giọng: ngân sách ngày còn ít hoặc đang bị chặn'); break; }
    const p = speech(text, 'warm', { prio: 1, optional: true });
    if (!p || !(await p)) break;
    n++;
    await new Promise((r) => setTimeout(r, gapMs));
  }
  if (n) console.log(`[call] đã nạp sẵn ${n} câu cố định`);
}

// Từ 9 giờ sáng thứ Bảy đến hết Chủ nhật (giờ Việt Nam), ai chưa gọi tuần này thì app đổ chuông.
const CALL_FROM = { weekday: 5, hour: 9 }; // 0 = thứ Hai

function callTime() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  const day = (vn.getUTCDay() + 6) % 7;
  return day > CALL_FROM.weekday || (day === CALL_FROM.weekday && vn.getUTCHours() >= CALL_FROM.hour);
}

// Tên ngày tự thêm vào lịch theo loại (khoá callEvent.<loại>).
const KIND_TITLE = (kind: string, lang: Lang) => (['wedding', 'anniversary', 'birthday', 'memory', 'other'].includes(kind) ? tServer(lang, `callEvent.${kind}`) : undefined);

/** Đáp án onboarding lưu bằng mã (bản mới) hoặc nguyên chữ (bản cũ): đổi mã về chữ tiếng Việt để câu hỏi soạn sẵn và AI đọc như cũ. */
const INTRO_IDS: Record<string, string[]> = { kid: ['son', 'daughter', 'both'], seen: ['week', 'months', 'year', 'together'], love: ['often', 'sometimes', 'never'] };
function introLabels(intro: Record<string, string>) {
  const out = { ...intro };
  for (const [k, ids] of Object.entries(INTRO_IDS)) if (ids.includes(out[k])) out[k] = tVi(`onboarding.${k}.opt.${out[k]}`);
  return out;
}

type Ctx = {
  /** Ngôn ngữ của người nghe (members.lang hoặc x-lang của máy). */
  lang: Lang;
  member: { id: string; name: string; role: string; intro: Record<string, string> };
  family: Array<{ name: string; role: string }>;
  events: Array<{ kind: string; title: string; day: number; month: number; year: number | null }>;
  asked: string[];
  /** Câu trả lời đã chép thật của chính người này. */
  stories: Array<{ question: string; answer: string }>;
  /** Ngày các cuộc gọi đã hoàn tất của người này. */
  doneCalls: string[];
  /** Số ảnh người này đã lưu thật (tin ảnh + kho), và chú thích thật nếu có. */
  photoCount: number;
  captions: string[];
};

async function context(memberId: string, fid: string): Promise<Ctx> {
  const [m, fam, ev, asked, stories, caps, done, ph, vt] = await Promise.all([
    pool.query('select id, name, role, intro from members where id = $1', [memberId]),
    pool.query('select name, role from members where family_id = $1 order by created_at', [fid]),
    pool.query('select kind, title, day, month, year from events where family_id = $1', [fid]),
    pool.query('select question from call_answers where member_id = $1 order by created_at desc limit 40', [memberId]),
    pool.query(
      `select question, transcript from call_answers where member_id = $1 and coalesce(transcript, '') <> '' order by created_at desc limit 8`, [memberId]),
    pool.query(`select caption from posts where author_id = $1 and kind = 'photo' and coalesce(caption, '') <> '' order by created_at desc limit 8`, [memberId]),
    pool.query(`select to_char(done_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') d from calls where member_id = $1 and status = 'done' order by done_at desc limit 10`, [memberId]),
    pool.query(`select count(*)::int n from posts where author_id = $1 and kind = 'photo'`, [memberId]),
    pool.query(`select count(*)::int n from vault where member_id = $1`, [memberId]),
  ]);
  let intro: Record<string, string> = {};
  try { intro = introLabels(JSON.parse(m.rows[0]?.intro || '{}')); } catch {}
  return {
    lang: reqLang(),
    member: { id: memberId, name: m.rows[0]?.name ?? tReq('callScript.defaultName'), role: m.rows[0]?.role ?? 'con', intro },
    family: fam.rows, events: ev.rows, asked: asked.rows.map((r) => r.question),
    stories: stories.rows.map((r) => ({ question: r.question, answer: String(r.transcript).slice(0, 600) })),
    doneCalls: done.rows.map((r) => r.d),
    photoCount: (ph.rows[0]?.n ?? 0) + (vt.rows[0]?.n ?? 0),
    captions: caps.rows.map((r) => r.caption),
  };
}

// ---------- Bộ câu hỏi soạn sẵn ----------

const lastWord = (name: string) => name.trim().split(/\s+/).pop() || name;

/** Cuộc gọi đầu tiên: chào ngắn rồi đúng 3 câu rất dễ trả lời. Soạn sẵn, không gọi AI, không cần dữ liệu cũ. */
function firstScript(c: Ctx): CallScript {
  const { name, role } = c.member;
  const parent = role === 'bo' || role === 'me';
  const T = (k: string, v?: Record<string, string | number>) => tServer(c.lang, k, v);
  const self = role === 'bo' ? T('call.self.bo') : role === 'me' ? T('call.self.me') : '';
  const Self = self ? self[0].toUpperCase() + self.slice(1) : '';
  const nick = lastWord(name);
  const S = (k: string) => T(`callScript.first.${parent ? 'parent' : 'child'}.${k}`, { self, Self, nick });
  const q = (text: string, topic: Topic): CallQuestion => ({ text, topic, photo: false, event: 'none' });
  return {
    greeting: S('greeting'),
    questions: [q(S('q1'), 'cuoc-song'), q(S('q2'), 'mon-an'), q(S('q3'), 'cuoc-song')],
    goodbye: S('goodbye'),
    source: 'first',
    lang: c.lang,
  };
}

function templateScript(c: Ctx, week: string): CallScript {
  const { name, role, intro } = c.member;
  const parent = role === 'bo' || role === 'me';
  const T = (k: string, v?: Record<string, string | number>) => tServer(c.lang, k, v);
  const self = role === 'bo' ? T('call.self.bo') : role === 'me' ? T('call.self.me') : T('onboarding.self.con');
  const call = parent ? self[0].toUpperCase() + self.slice(1) : name;
  const other = T(role === 'bo' ? 'call.self.me' : 'call.self.bo');
  const food = (intro.food || '').trim();
  // Chỉ hỏi ngày cưới khi trong nhà có đủ cả bố lẫn mẹ.
  const hasPair = c.family.some((m) => m.role === 'bo') && c.family.some((m) => m.role === 'me');
  const hasWedding = c.events.some((e) => e.kind === 'wedding');
  const q = (text: string, topic: Topic, photo = false, event: CallQuestion['event'] = 'none'): CallQuestion => ({ text, topic, photo, event });

  const S = (k: string) => T(`callScript.template.${parent ? 'parent' : 'child'}.${k}`, { self, call, other, food, name });
  const pool: CallQuestion[] = parent ? [
    ...(!hasWedding && hasPair ? [q(S('wedding'), 'ngay-cuoi', true, 'wedding')] : []),
    q(S('play'), 'tuoi-tho'),
    ...(food ? [q(S('food'), 'mon-an')] : []),
    q(S('house'), 'ky-niem', true),
    q(S('week'), 'cuoc-song'),
    q(S('taste'), 'mon-an'),
    q(S('dream'), 'tuoi-tho'),
    q(S('advice'), 'loi-nhan'),
  ] : [
    q(S('week'), 'cuoc-song'),
    ...(food ? [q(S('food'), 'mon-an')] : []),
    q(S('memory'), 'tuoi-tho'),
    q(S('photo'), 'ky-niem', true),
    q(S('meal'), 'mon-an'),
    q(S('miss'), 'cuoc-song'),
    q(S('home'), 'ky-niem'),
    q(S('message'), 'loi-nhan'),
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
    greeting: S('greeting'),
    questions,
    goodbye: S('goodbye'),
    source: 'template',
    lang: c.lang,
  };
}

// i18n-ok-begin: kiểm câu AI viết (từ tiếng Việt), prompt và dữ liệu gửi AI. Đợt 3 mới làm theo ngôn ngữ.
// ---------- Chống bịa ----------

const NAME_OK = new Set(['bố', 'mẹ', 'con', 'bà', 'ông', 'cô', 'chú', 'dì', 'anh', 'chị', 'em', 'mây', 'sweet', 'home', 'tết']);
const fold = (s: string) => s.toLowerCase().normalize('NFC');

type Allow = { prevCall: boolean; ownStory: boolean; photos: boolean };

/** Lý do câu này có dấu hiệu bịa (nhắc điều không có trong dữ liệu), hoặc null nếu ổn. haystack là toàn bộ dữ liệu thật đã đưa vào. */
export function suspect(text: string, haystack: string, allow: Allow): string | null {
  const t = fold(text);
  if (/hôm (trước|qua|kia|nọ)|lúc nãy|vừa nãy|mới đây|hồi sáng nay/.test(t)) return 'mốc thời gian không có trong dữ liệu';
  if (/tin nhắn\s+(của\s+)?(bạn|bố|mẹ|con)|(bạn|bố|mẹ)\s+(đã\s+)?nhắn\s+(cho|với)/.test(t)) return 'nhắc tin nhắn không có trong dữ liệu';
  if (!allow.prevCall && /(lần|buổi|tuần|cuộc gọi|lượt)\s+trước|lần\s+(gọi\s+)?(vừa\s+)?rồi|cuộc gọi\s+(vừa\s+)?rồi/.test(t)) return 'nhắc cuộc gọi trước không có';
  if (!allow.ownStory && /(đã|từng|có lần|hay|vừa)\s+(kể|nói|chia sẻ|nhắc)(\s|$|[,.?!])|như\s+(bạn|bố|mẹ)\s+(đã\s+)?(kể|nói)/.test(t)) return 'nhắc điều đã kể mà chưa có';
  if (!allow.photos && /ảnh[^.?!]{0,25}\s(bạn|bố|mẹ)\s+(đã\s+|vừa\s+)?(gửi|chụp|đăng|chia sẻ)|(đã|vừa|từng)\s+(gửi|đăng|chụp)[^.?!]{0,25}ảnh|như\s+\S+\s+đã\s+gửi/.test(t)) return 'nhắc ảnh đã gửi mà chưa có';
  const hay = fold(haystack);
  for (const n of text.match(/\d+/g) ?? []) if (!hay.includes(n)) return `con số ${n} không có trong dữ liệu`;
  for (const sentence of text.match(/[^.!?…]+[.!?…]*/g) ?? []) {
    const toks = sentence.trim().split(/\s+/);
    for (let k = 0; k < toks.length; k++) {
      const w = toks[k].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (!w || !/^\p{Lu}/u.test(w)) continue;
      // Đầu câu chỉ kiểm khi đó là tên gọi ("Lan ơi, ...").
      if (k === 0 && fold(toks[1] ?? '').replace(/[^\p{L}]/gu, '') !== 'ơi') continue;
      if (NAME_OK.has(fold(w)) || hay.includes(fold(w))) continue;
      return `tên "${w}" không có trong dữ liệu`;
    }
  }
  return null;
}

// ---------- AI soạn câu hỏi ----------

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
          topic: { type: 'string', enum: [...TOPICS] },
          photo: { type: 'boolean' },
          event: { type: 'string', enum: [...EVENT_HINTS] },
        },
      },
    },
  },
};

// TODO(i18n đợt 3): viết prompt bằng tiếng Anh một lần, thêm dòng "trả lời bằng {ngôn ngữ}" theo members.lang. Đợt này giữ nguyên.
const SCRIPT_SYSTEM = `You write the script for a short voice call inside Sweet Home, a family app for Vietnamese families whose child lives far away. The caller is Mây, the app's little mascot. The phone reads every line aloud, and the person answers by speaking.

LANGUAGE AND TONE. Vietnamese, the way a warm, unhurried person really talks on the phone. Short sentences. No em dash or long dash, no emoji, no lists, no quotation marks.
When talking to a parent (role bo or me), Mây calls itself "con" and addresses them as Bố or Mẹ. When talking to a child (role con), Mây calls itself "mình" and uses their name.
The lines are read aloud, so never write the English app name; if a name is needed, Mây calls itself Mây.

WHAT YOU MAY USE. Only the facts in the JSON input. Every field is real data from the database. A field that says it is empty (for example "chưa có cuộc gọi trước", "chưa có ảnh nào", "chưa có sự kiện nào") means there is nothing, so you know nothing about it.

HARD RULES, never break them:
1. Never mention a photo, message, call, earlier session, memory or detail that is not in the input. Never write "lần trước", "hôm trước", "hôm qua", "lúc nãy", "như bạn đã gửi", "tấm ảnh bạn gửi", "bạn từng kể" or anything similar unless that exact thing is in the input.
2. Never guess a name, date, place, number, age or relationship. Use only names and facts that appear in the input.
3. Ask only open, safe questions that assume nothing. Every question must be answerable without any outside data, by a person who just picked up the phone.
4. Exactly 3 questions, plus at most one last gentle question that invites a message for the rest of the family (topic loi-nhan). Each question is one short sentence, at most two.
5. Never repeat a question in already_asked.
6. Only follow up on an earlier answer if it is listed in own_earlier_answers, and quote nothing that is not there.
7. A photo question (photo true) is a neutral invitation, for example "Bạn có tấm ảnh nào muốn kể cho mình nghe không?". It must never imply that a photo was already received. Use photo true in at most one question, and only when it fits.
8. If wedding_question_allowed is true, one question asks when they got married and to tell about that day, with photo true and event wedding. Otherwise never ask about a wedding.
9. Set event to the kind of date the answer will likely contain (wedding, anniversary, birthday, memory), otherwise none.
10. Earlier answers come from past calls. Refer to them as "lần trước" and never with "hôm nay", "bây giờ" or any present-tense time. Never invent relatives (cháu, em, anh, chị, con của ai) unless listed in family_members.
11. The intro field "unsaid" is private: it may guide your tone, but never quote it or hint at its content.

The greeting is one or two short sentences. The goodbye is one short sentence of thanks. Neither mentions anything outside the input.`;

async function aiScript(c: Ctx, week: string): Promise<CallScript | null> {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const parent = c.member.role === 'bo' || c.member.role === 'me';
  const hasPair = c.family.some((m) => m.role === 'bo') && c.family.some((m) => m.role === 'me');
  const intro = Object.fromEntries(Object.entries(c.member.intro).filter(([, v]) => String(v ?? '').trim()));
  const facts = {
    today,
    person: { name: c.member.name, role: c.member.role, intro: Object.keys(intro).length ? intro : 'chưa có thông tin nào' },
    family_members: c.family,
    calendar: c.events.length ? c.events : 'chưa có sự kiện nào',
    previous_calls: c.doneCalls.length ? { count: c.doneCalls.length, last: c.doneCalls[0] } : 'chưa có cuộc gọi trước',
    own_earlier_answers: c.stories.length ? c.stories : 'chưa có câu trả lời nào được chép',
    saved_photos: c.photoCount ? { count: c.photoCount, captions: c.captions.length ? c.captions : 'không có chú thích' } : 'chưa có ảnh nào',
    already_asked: c.asked.length ? c.asked : 'chưa hỏi câu nào',
    wedding_question_allowed: parent && hasPair && !c.events.some((e) => e.kind === 'wedding'),
  };
  const hay = JSON.stringify(facts);
  const allow: Allow = { prevCall: c.doneCalls.length > 0, ownStory: c.stories.length > 0, photos: c.photoCount > 0 };
  const r = await askJSON<Omit<CallScript, 'source'>>(SCRIPT_SYSTEM, JSON.stringify(facts, null, 1), SCRIPT_SCHEMA);
  if (!r || !Array.isArray(r.questions) || !r.questions.length) return null;
  const clean = (s: string) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').trim();
  const tpl = templateScript(c, week);

  const questions: CallQuestion[] = [];
  let photos = 0;
  for (const raw of r.questions.slice(0, 5)) {
    if (!raw || !raw.text || !isTopic(raw.topic)) continue;
    const text = clean(raw.text);
    const why = suspect(text, hay, allow);
    if (why) { console.warn(`[call] bỏ câu "${text}": ${why}`); continue; }
    if (c.asked.includes(text) || questions.some((q) => q.text === text)) continue;
    const event = EVENT_HINTS.includes(raw.event) ? raw.event : 'none';
    if (event === 'wedding' && !facts.wedding_question_allowed) continue;
    // Chỉ một câu xin ảnh.
    const photo = !!raw.photo && ++photos === 1;
    questions.push({ text, topic: raw.topic, photo, event });
    if (questions.length >= 4) break;
  }
  // Thiếu thì bù bằng câu mẫu an toàn, tối thiểu 3 câu.
  for (const t of tpl.questions) {
    if (questions.length >= 3) break;
    if (t.topic === 'loi-nhan' || t.event === 'wedding' || questions.some((q) => q.text === t.text)) continue;
    if (t.photo && photos > 0) continue;
    if (t.photo) photos++;
    questions.push({ ...t });
  }
  if (!questions.length) return null;
  const g = clean(r.greeting), b = clean(r.goodbye);
  return {
    greeting: g && !suspect(g, hay, allow) ? g : tpl.greeting,
    questions,
    goodbye: b && !suspect(b, hay, allow) ? b : tpl.goodbye,
    source: 'ai',
    lang: 'vi',
  };
}

// TODO(i18n đợt 3): câu đáp theo ngôn ngữ của người nghe (members.lang). Đợt này giữ nguyên.
const REPLY_SYSTEM = `You are Mây, the mascot of the family app Sweet Home, on a warm voice call with a Vietnamese family member. They just answered a question out loud (speech recognition text, may have errors).
Reply with ONE short spoken Vietnamese reaction, at most 12 words, like a caring person on the phone.
React warmly to what is written in "answer": when the answer has a concrete detail (an object, food, place, person or feeling the person actually said), your reply must echo that exact detail, for example answer "mua được con cá chép to" gives "Con cá chép to thế ạ, nghe vui quá.". Never add any fact, name, number, place, photo, memory or event that is not in "answer". Never say "lần trước", "hôm trước", "hôm qua" or refer to anything earlier.
Do not ask a new question. Only if the answer is empty or truly unintelligible, reply with a generic warm line like "Dạ, mình nghe rồi." (role con) or "Dạ, con nghe rồi ạ." (role bo or me).
Never say the English app name. No em dash, no emoji, no quotation marks.
If role is bo or me, call yourself con and address them as Bố or Mẹ, end politely with ạ when natural. If role is con, call yourself mình and use their name sparingly.`;

async function quickReply(who: { name: string; role: string } | undefined, question: string, said: string, memberId: string) {
  // TODO(i18n đợt 3): câu đáp theo nội dung bằng en, ko. Đợt này chỉ tiếng Việt; thứ tiếng khác để máy khách dùng câu đáp mẫu.
  if (reqLang() !== 'vi') return null;
  // Lời chép quá ngắn thì không đủ để đáp theo ý: để máy khách dùng câu đáp mẫu.
  if (said.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).length < 3) return null;
  const text = await askQuick(REPLY_SYSTEM, JSON.stringify({ person: { name: who?.name ?? '', role: who?.role ?? 'con' }, question, answer: said.slice(0, 1500) }), 1800);
  const clean = text?.replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').split('\n')[0].trim().slice(0, 140) || null;
  if (!clean) return null;
  // Chỉ nhận câu đáp không có tên, số hay mốc thời gian lạ so với điều người ấy vừa nói.
  const why = suspect(clean, `${said} ${who?.name ?? ''}`, { prevCall: false, ownStory: false, photos: false });
  if (why) { console.warn(`[call] bỏ câu đáp "${clean}": ${why}`); return null; }
  // Đọc sẵn câu đáp ngay (chỉ khi còn dư ngân sách): lúc máy khách xin giọng sẽ nhận chung kết quả, đỡ một lượt mạng.
  void speech(clean, memberId, { optional: true });
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

// TODO(i18n đợt 3): tên ngày rút ra theo ngôn ngữ của nhà. Đợt này giữ nguyên.
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
    out.push({ kind: a.event, title: KIND_TITLE(a.event, 'vi') ?? tVi('callEvent.memory'), day, month, year, note: '' });
  }
  return out;
}

// i18n-ok-end
async function saveDates(callId: string) {
  const { rows: [call] } = await pool.query('select * from calls where id = $1', [callId]);
  if (!call) return;
  const script: CallScript = JSON.parse(call.script);
  const { rows: answers } = await pool.query('select idx, question, transcript from call_answers where call_id = $1 order by idx', [callId]);
  const said = answers.filter((a) => (a.transcript ?? '').trim());
  if (!said.length) return;
  const { rows: existing } = await pool.query('select kind, title, day, month, year from events where family_id = $1', [call.family_id]);
  const { rows: [who] } = await pool.query('select name, role, lang from members where id = $1', [call.member_id]);
  // TODO(i18n đợt 3): rút ngày tháng từ lời kể bằng en, ko (prompt, regex "ngày .. tháng .."). Đợt này chỉ tiếng Việt, thứ tiếng khác thì không tự thêm vào lịch.
  if (langOf(who?.lang) !== 'vi') return;

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
    const title = String(e.title || KIND_TITLE(e.kind, 'vi') || tVi('callEvent.memory')).replace(/\s*[—–]\s*/g, ', ').slice(0, 80);
    await pool.query(
      `insert into events (id, family_id, member_id, kind, title, day, month, year, lunar, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
      [randomUUID(), call.family_id, call.member_id, ['birthday', 'wedding', 'anniversary', 'memory', 'other'].includes(e.kind) ? e.kind : 'other',
        title, day, month, year, e.note ? String(e.note).slice(0, 500) : tVi('callEvent.note', { name: who?.name ?? '' }).trim(), call.member_id],
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
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

export function callRouter(upload: multer.Multer) {
  const r = express.Router();
  const media = (f?: Express.Multer.File) => (f ? `/media/${f.filename}` : null);

  // Thành viên mới (dưới 24 giờ) không bị nhắc gì. Sau đó: cuộc gọi đầu tiên được mời ngay, các tuần sau chỉ trong khung cuối tuần.
  r.get('/call/due', h(async (req, res) => {
    const { rows } = await pool.query(`select 1 from calls where member_id = $1 and week = $2 and status = 'done' limit 1`, [req.member.id, weekKey()]);
    const { rows: [m] } = await pool.query(`select extract(epoch from now() - created_at) / 3600 as hours, exists(select 1 from calls where member_id = $1 and status = 'done') as had from members where id = $1`, [req.member.id]);
    const grown = Number(m?.hours ?? 0) >= 24;
    res.json({ due: grown && !rows.length && (callTime() || !m?.had), done: !!rows.length });
  }));

  // Nhấc máy: lấy bộ câu hỏi của tuần (soạn một lần, gọi lại thì dùng tiếp).
  r.post('/call/start', h(async (req, res) => {
    const { id: mid, family_id: fid } = req.member;
    const week = weekKey();
    const c = await context(mid, fid);
    const first = c.doneCalls.length === 0;
    const { rows } = await pool.query(`select id, script from calls where member_id = $1 and week = $2 and status = 'ready' order by created_at desc limit 1`, [mid, week]);
    const old: CallScript | null = rows[0] ? JSON.parse(rows[0].script) : null;
    // Chưa từng có cuộc gọi nào thì chỉ dùng bộ câu chào hỏi đơn giản, kể cả khi đã lỡ soạn một bộ khác.
    // Bộ câu soạn bằng thứ tiếng khác với ngôn ngữ hiện tại (đổi ngôn ngữ giữa tuần) thì soạn lại.
    if (old && (old.lang ?? 'vi') === c.lang && (!first || old.source === 'first')) return res.json({ id: rows[0].id, script: old });
    // TODO(i18n đợt 3): AI soạn câu hỏi cho en, ko. Đợt này chỉ tiếng Việt dùng AI; thứ tiếng khác dùng bộ câu mẫu.
    const script = first ? firstScript(c) : (c.lang === 'vi' ? await aiScript(c, week) : null) ?? templateScript(c, week);
    const id = randomUUID();
    await pool.query('insert into calls (id, family_id, member_id, week, script) values ($1,$2,$3,$4,$5)', [id, fid, mid, week, JSON.stringify(script)]);
    res.json({ id, script });
    // Giọng đọc do máy khách xin khi cần (lời chào + câu đầu một lần, mỗi câu sau xin trước một câu), máy chủ không tự đọc trước.
  }));

  r.post('/call/:id/answer', upload.single('file'), h(async (req, res) => {
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    if (!call) return res.status(404).json(errorBody('call_not_found'));
    const script: CallScript = JSON.parse(call.script);
    const idx = Number(req.body.idx);
    const q = script.questions[idx];
    if (!q) return res.status(400).json(errorBody('question_not_found'));
    const aid = randomUUID();
    let transcript = String(req.body.transcript || '').trim().slice(0, 4000) || null;
    await pool.query('delete from call_answers where call_id = $1 and idx = $2', [call.id, idx]);
    await pool.query(
      'insert into call_answers (id, call_id, family_id, member_id, idx, question, topic, media, transcript, seconds) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [aid, call.id, call.family_id, call.member_id, idx, q.text, q.topic, media(req.file), transcript, Number(req.body.seconds) || null],
    );
    // Máy không chép được lời (iPhone hay bị): nhờ Gemini chép, quá 8 giây thì thôi. Chép được thì đáp luôn một câu.
    let reply: string | null = null;
    // TODO(i18n đợt 3): chép lời bằng Gemini cho en, ko. Đợt này chỉ tiếng Việt.
    if (!transcript && req.file && reqLang() === 'vi') {
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
    if (!call) return res.status(404).json(errorBody('call_not_found'));
    const q = (JSON.parse(call.script) as CallScript).questions[Number(req.body.idx)];
    res.json({ text: await quickReply(call, q?.text ?? '', said, req.member.id) });
  }));

  // Nhấc máy là hỏi trước một lần: cả cuộc gọi dùng giọng Gemini hay giọng máy. Con số dùng/hạn mức chỉ trả cho thành viên (đã qua auth).
  r.get('/call/tts-status', h(async (req, res) => {
    const s = ttsStatus();
    res.json({ ok: s.ok, reason: s.reason, ...(req.member ? { used: s.used, limit: s.limit } : {}) });
  }));

  // Giọng đọc của Mây: trả về đường dẫn file âm thanh. url null thì kèm reason (budget, cooldown, nokey, skip, fail) để máy hiện chữ.
  // kind 'fixed': chỉ lấy từ kho, không bao giờ gọi Gemini. kind 'reply': câu đáp theo nội dung, chỉ đọc khi còn dư ngân sách.
  r.post('/call/tts', h(async (req, res) => {
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > TTS_MAX) return res.json({ url: null, reason: 'fail' });
    const kind = req.body.kind === 'fixed' || req.body.kind === 'reply' ? req.body.kind : undefined;
    const hit = cachedSpeech(text);
    if (hit) return res.json({ url: hit });
    if (kind === 'fixed') return res.json({ url: null, reason: 'skip' });
    if (!hasVoice()) return res.json({ url: null, off: true, reason: 'nokey' });
    const why = gate.blocked(kind === 'reply');
    if (why) return res.json({ url: null, reason: kind === 'reply' && why === 'budget' && !gate.blocked() ? 'skip' : why });
    const p = speech(text, req.member.id, { optional: kind === 'reply' });
    const url = p ? await p : null;
    res.json(url ? { url } : { url: null, reason: gate.blocked() ?? 'fail' });
  }));

  r.post('/call/:id/photo', upload.single('file'), h(async (req, res) => {
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    if (!call || !req.file) return res.status(400).json(errorBody('photo_missing'));
    const script: CallScript = JSON.parse(call.script);
    const q = script.questions[Number(req.body.idx)];
    await pool.query('insert into vault (id, family_id, member_id, media, caption, call_id) values ($1,$2,$3,$4,$5,$6)',
      [randomUUID(), call.family_id, call.member_id, media(req.file), q ? tReq(`topic.${q.topic}`) : null, call.id]);
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
