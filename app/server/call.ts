// Cuộc gọi hằng tuần ngay trong app: Mây của Sweet Home hỏi, người nghe kể bằng giọng nói.
// Claude soạn câu hỏi riêng cho từng người; không có khoá thì dùng bộ câu soạn sẵn từ members.intro.
// Gọi xong: rút ngày tháng quan trọng vào lịch, ảnh xưa vào kho, rồi ghép podcast.
import express from 'express';
import type multer from 'multer';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CALL_ROLES, EVENT_HINTS, TOPICS, callLines, isTopic, type CallQuestion, type CallScript, type Topic } from '../src/shared.ts';
import { errorBody, langOf, LANGS, reqLang, tReq, tServer, type Lang } from './i18n.ts';
import { askJSON, askQuick } from './ai.ts';
import { parseDate, suspect, type Allow } from './guard.ts';
import { pool } from './db.ts';
import { weekKey } from './recap.ts';
import { buildPodcastsForCall } from './podcast.ts';
import { cachedSpeech, defaultProvider, gateOf, hasVoice, initTtsBudget, pickProvider, providerOn, speech, transcribe, ttsStatus, TTS_MAX, type Provider } from './voice.ts';
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
  // Bộ đếm ngân sách TTS sống qua lần deploy (bảng app_settings: tts_budget, tts_budget_openai, stt_budget_openai).
  await p.query('create table if not exists app_settings (key text primary key, value text not null)');
  await initTtsBudget((key) => ({
    async load() {
      const { rows } = await p.query(`select value from app_settings where key = $1`, [key]);
      return rows[0] ? JSON.parse(rows[0].value) : null;
    },
    async save(v) {
      await p.query(`insert into app_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(v)]);
    },
  }));
  // Nạp sẵn giọng cho các câu cố định còn thiếu trong kho, rải rác chậm, không dồn lúc khởi động.
  setTimeout(() => void warmFixedVoices(), 15_000);
}

/** Các câu cố định cần có giọng sẵn: mỗi (vai, ngôn ngữ) 7 câu. Câu "ack" không nạp (chỉ dùng nếu tình cờ đã có trong kho). */
export function fixedLines() {
  const out = new Set<string>();
  for (const lang of LANGS) {
    for (const role of CALL_ROLES) {
      const L = callLines(role, (k, v) => tServer(lang, k, v));
      for (const text of [L.slow, L.busy, L.skip, L.photo, ...L.short, ...L.long]) out.add(text);
    }
  }
  return [...out];
}

/** Tạo (một lần, rồi nằm trong kho) âm thanh Gemini cho câu cố định chưa có. Tối đa 6 yêu cầu mỗi phút; còn dưới 30% ngân sách ngày thì dừng. */
export async function warmFixedVoices(gapMs?: number) {
  if (!hasVoice()) return;
  const provider = defaultProvider();
  const gap = gapMs ?? (provider === 'openai' ? 1_000 : 10_000);
  const gate = gateOf(provider);
  let n = 0;
  for (const text of fixedLines()) {
    if (cachedSpeech(text, provider)) continue;
    if (gate.blocked(true)) { console.log('[call] dừng nạp sẵn giọng: ngân sách ngày còn ít hoặc đang bị chặn'); break; }
    const p = speech(text, 'warm', { prio: 1, optional: true, provider });
    if (!p || !(await p)) break;
    n++;
    await new Promise((r) => setTimeout(r, gap));
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

/** Đáp án onboarding lưu bằng mã (bản mới) hoặc nguyên chữ (bản cũ): đổi mã về chữ để câu hỏi soạn sẵn và AI đọc.
 * Người nghe tiếng Việt: chữ tiếng Việt như cũ; thứ tiếng khác: nhãn tiếng Anh (trung tính, prompt cũng bằng tiếng Anh). */
const INTRO_IDS: Record<string, string[]> = { kid: ['son', 'daughter', 'both'], seen: ['week', 'months', 'year', 'together'], love: ['often', 'sometimes', 'never'] };
function introLabels(intro: Record<string, string>, lang: Lang = 'vi') {
  const out = { ...intro };
  for (const [k, ids] of Object.entries(INTRO_IDS)) if (ids.includes(out[k])) out[k] = tServer(lang === 'vi' ? 'vi' : 'en', `onboarding.${k}.opt.${out[k]}`);
  return out;
}

export type Ctx = {
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
  const lang = reqLang();
  let intro: Record<string, string> = {};
  try { intro = introLabels(JSON.parse(m.rows[0]?.intro || '{}'), lang); } catch {}
  return {
    lang,
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
export function firstScript(c: Ctx): CallScript {
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

export function templateScript(c: Ctx, week: string): CallScript {
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

// ---------- Chống bịa: suspect() ở guard.ts (dấu hiệu bịa vi, en, ko + tên riêng, con số phải có trong dữ liệu) ----------

/** Tên đầy đủ của ngôn ngữ người nghe, cho dòng "Reply in ..." của prompt. */
const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese', en: 'English', ko: 'Korean' };

// i18n-ok-begin: prompt gửi AI (tiếng Anh, có ví dụ theo từng thứ tiếng), không phải chữ hiện cho người dùng.
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

/** Cách Mây xưng hô và giọng nói theo ngôn ngữ người nghe. */
const ADDRESS: Record<Lang, string> = {
  vi: `Vietnamese, the way a warm, unhurried person really talks on the phone.
When talking to a parent (role bo or me), Mây calls itself "con" and addresses them as Bố or Mẹ. When talking to a child (role con), Mây calls itself "mình" and uses their name.`,
  en: `English, the way a warm, unhurried family member really talks on the phone. Simple everyday words.
Mây says I and me. When talking to a parent, call role me Mom and role bo Dad. When talking to a child (role con), Mây uses their name sparingly.`,
  ko: `Korean in warm, gentle 해요체, the way a caring family member really talks on the phone. Simple everyday words. Every sentence ends in a 요 form (for example 하셨어요, 궁금해요, 들려주세요); never use the formal 합니다 or 입니다 style.
Mây always calls itself 저, and writes its own name only as Mây in Latin letters, never in Hangul. When talking to a parent (role bo or me), use respectful honorific forms (for example 드셨어요, 하셨어요, 계세요); you may address them as 어머님 (role me) or 아버님 (role bo), at most twice in the whole script, never by their first name. When talking to a child (role con), use plain warm 해요체 without honorific verb forms and call them by their name followed by 님, sparingly.`,
};

const EXAMPLES: Record<Lang, { photo: string; forbidden: string }> = {
  vi: { photo: 'Bạn có tấm ảnh nào muốn kể cho mình nghe không?', forbidden: '"lần trước", "hôm trước", "hôm qua", "lúc nãy", "như bạn đã gửi", "tấm ảnh bạn gửi", "bạn từng kể"' },
  en: { photo: 'Is there a photo you would like to tell me about?', forbidden: '"last time", "the other day", "yesterday", "earlier", "as you sent", "the photo you sent", "you told me", "you mentioned", "remember when"' },
  ko: { photo: '이야기해 주고 싶은 사진이 있으세요?', forbidden: '"지난번", "저번에", "어제", "아까", "보내주신", "말씀하신", "전에 말한"' },
};

function scriptSystem(lang: Lang) {
  const ex = EXAMPLES[lang];
  return `You write the script for a short voice call inside Sweet Home, a family app for families whose child lives far from home. The caller is Mây, the app's little mascot. The phone reads every line aloud, and the person answers by speaking.

LANGUAGE AND TONE. ${ADDRESS[lang]}
Short sentences. No em dash or long dash, no emoji, no lists, no quotation marks.
The lines are read aloud, so never write the English app name; if a name is needed, Mây calls itself Mây. Mây is the one who called, so never thank the person for calling. Write every person's name exactly as it appears in the input, never translated or transliterated. The role codes bo, me and con are not names: never write them as words.

WHAT YOU MAY USE. Only the facts in the JSON input. Every field is real data from the database. A field that starts with "none yet" (for example "none yet: no previous call", "none yet: no photos", "none yet: no calendar events") means there is nothing, so you know nothing about it. Field values may be in another language; never copy them word for word unless it is a name or a food the person wrote.

HARD RULES, never break them:
1. Never mention a photo, message, call, earlier session, memory or detail that is not in the input. Never write ${ex.forbidden} or anything similar unless that exact thing is in the input.
2. Never guess a name, date, place, country, number, age or relationship. Use only names and facts that appear in the input. Do not assume where anyone lives or studies.
3. Ask only open, safe questions that assume nothing. Every question must be answerable without any outside data, by a person who just picked up the phone.
4. Exactly 3 questions, plus at most one last gentle question that invites a message for the rest of the family (topic loi-nhan). Each question is one short sentence, at most two.
5. Never repeat a question in already_asked, in any language.
6. Only follow up on an earlier answer if it is listed in own_earlier_answers, and quote nothing that is not there.
7. A photo question (photo true) is a neutral invitation, for example "${ex.photo}". It must never imply that a photo was already received. Use photo true in at most one question, and only when it fits.
8. If wedding_question_allowed is true, one question asks when they got married and to tell about that day, with photo true and event wedding. Otherwise never ask about a wedding.
9. Set event to the kind of date the answer will likely contain (wedding, anniversary, birthday, memory), otherwise none.
10. Earlier answers come from past calls. Refer to them only as being from an earlier call (last time) and never with today, now or any present-tense time. If previous_calls says none yet, never refer to any earlier call at all. Never put a time on an earlier answer (no last week, no 지난주). Never assume whether a child is a son or a daughter unless the intro says so. Never invent relatives (grandchildren, siblings, cousins, anyone's children) unless listed in family_members.
11. The intro field "unsaid" is private: it may guide your tone, but never quote it or hint at its content.

The greeting is one or two short sentences. The goodbye is one short sentence of thanks. Neither mentions anything outside the input.

Reply in ${LANG_NAME[lang]}. Every greeting, question and goodbye must be written in ${LANG_NAME[lang]} only.`;
}

/** Dữ liệu thật đưa cho AI: mục trống ghi rõ "none yet" bằng nhãn tiếng Anh trung tính. */
export function scriptFacts(c: Ctx) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const parent = c.member.role === 'bo' || c.member.role === 'me';
  const hasPair = c.family.some((m) => m.role === 'bo') && c.family.some((m) => m.role === 'me');
  const intro = Object.fromEntries(Object.entries(c.member.intro).filter(([, v]) => String(v ?? '').trim()));
  return {
    today,
    person: { name: c.member.name, role: c.member.role, intro: Object.keys(intro).length ? intro : 'none yet: no intro answers' },
    family_members: c.family,
    calendar: c.events.length ? c.events : 'none yet: no calendar events',
    previous_calls: c.doneCalls.length ? { count: c.doneCalls.length, last: c.doneCalls[0] } : 'none yet: no previous call',
    own_earlier_answers: c.stories.length ? c.stories : 'none yet: no transcribed answers',
    saved_photos: c.photoCount ? { count: c.photoCount, captions: c.captions.length ? c.captions : 'none yet: no captions' } : 'none yet: no photos',
    already_asked: c.asked.length ? c.asked : 'none yet: nothing asked',
    wedding_question_allowed: parent && hasPair && !c.events.some((e) => e.kind === 'wedding'),
  };
}

const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function aiScript(c: Ctx, week: string): Promise<CallScript | null> {
  const facts = scriptFacts(c);
  // Tên tháng tiếng Anh của các ngày có trong lịch cũng tính là dữ liệu thật ("your birthday in March").
  // Mã vai (bo, me, con) không phải tên: bỏ khỏi dữ liệu đối chiếu để câu "Hi Bo" bị chặn.
  const hay = JSON.stringify(facts).replace(/"role":"(bo|me|con)"/g, '') + ' ' + c.events.map((e) => MONTH_EN[e.month - 1] ?? '').join(' ');
  const allow: Allow = { prevCall: c.doneCalls.length > 0, ownStory: c.stories.length > 0, photos: c.photoCount > 0 };
  const r = await askJSON<Omit<CallScript, 'source'>>(scriptSystem(c.lang), JSON.stringify(facts, null, 1), SCRIPT_SCHEMA);
  if (!r || !Array.isArray(r.questions) || !r.questions.length) return null;
  const clean = (s: string) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').trim();
  const tpl = templateScript(c, week);

  const questions: CallQuestion[] = [];
  let photos = 0;
  for (const raw of r.questions.slice(0, 5)) {
    if (!raw || !raw.text || !isTopic(raw.topic)) continue;
    const text = clean(raw.text);
    const why = suspect(text, hay, allow, c.lang);
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
  // Mây là người gọi: lời tạm biệt "thank you for calling" thì dùng câu mẫu.
  const wrongBye = /\bfor (calling|the call)\b/i.test(b);
  return {
    greeting: g && !suspect(g, hay, allow, c.lang) ? g : tpl.greeting,
    questions,
    goodbye: b && !wrongBye && !suspect(b, hay, allow, c.lang) ? b : tpl.goodbye,
    source: 'ai',
    lang: c.lang,
  };
}

// ---------- Câu đáp ngắn theo điều vừa kể ----------

const REPLY_STYLE: Record<Lang, string> = {
  vi: `Reply with ONE short spoken Vietnamese reaction, at most 12 words, like a caring person on the phone.
Example: answer "mua được con cá chép to" gives "Con cá chép to thế ạ, nghe vui quá.".
Only if the answer is empty or truly unintelligible, reply with a generic warm line like "Dạ, mình nghe rồi." (role con) or "Dạ, con nghe rồi ạ." (role bo or me).
If role is bo or me, call yourself con and address them as Bố or Mẹ, end politely with ạ when natural. If role is con, call yourself mình and use their name sparingly.`,
  en: `Reply with ONE short spoken English reaction, at most 12 words, like a caring family member on the phone.
Example: answer "we bought a big carp at the market" gives "A big carp, that sounds like a happy trip.".
Only if the answer is empty or truly unintelligible, reply with a generic warm line like "I hear you." or "Thank you for telling me.".
If role is me you may call them Mom, if role is bo you may call them Dad. If role is con, use their name sparingly.`,
  ko: `Reply with ONE short spoken Korean reaction in warm 해요체, at most 25 Korean syllables, like a caring family member on the phone. Mây calls itself 저.
Example: answer "시장에서 큰 잉어를 샀어요" gives "큰 잉어를 사셨군요, 정말 즐거우셨겠어요.".
Only if the answer is empty or truly unintelligible, reply with a generic warm line like "네, 잘 들었어요.".
If role is bo or me, use respectful honorific forms (사셨군요, 드셨군요). If role is con, use plain warm 해요체 without honorific verb forms (샀군요, 먹었군요) and their name with 님 sparingly. Never use the formal 합니다 style.`,
};

function replySystem(lang: Lang) {
  return `You are Mây, the mascot of the family app Sweet Home, on a warm voice call with a family member. They just answered a question out loud (speech recognition text, may have errors).
React warmly to what is written in "answer": when the answer has a concrete detail (an object, food, place, person or feeling the person actually said), your reply must echo that exact detail in your own words.
Never add any fact, name, number, place, photo, memory or event that is not in "answer". Never refer to anything earlier, and never use phrases like "you said", "you mentioned", "last time" or their equivalents; just echo the detail directly.
Do not ask a new question. Never say the English app name. No em dash, no emoji, no quotation marks.
${REPLY_STYLE[lang]}

Reply in ${LANG_NAME[lang]}.`;
}

// i18n-ok-end
export async function quickReply(who: { name: string; role: string } | undefined, question: string, said: string, memberId: string) {
  const lang = reqLang();
  // Lời chép quá ngắn thì không đủ để đáp theo ý: để máy khách dùng câu đáp mẫu. Tiếng Hàn đếm âm tiết (ít dấu cách hơn).
  const short = lang === 'ko'
    ? said.replace(/[^\p{L}\p{N}]/gu, '').length < 6
    : said.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).length < 3;
  if (short) return null;
  const text = await askQuick(replySystem(lang), JSON.stringify({ person: { name: who?.name ?? '', role: who?.role ?? 'con' }, question, answer: said.slice(0, 1500) }), 1800);
  const clean = text?.replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').split('\n')[0].trim().slice(0, 140) || null;
  if (!clean) return null;
  // Chỉ nhận câu đáp không có tên, số hay mốc thời gian lạ so với điều người ấy vừa nói.
  const why = suspect(clean, `${said} ${who?.name ?? ''}`, { prevCall: false, ownStory: false, photos: false }, lang);
  if (why) { console.warn(`[call] bỏ câu đáp "${clean}": ${why}`); return null; }
  // Đọc sẵn câu đáp ngay (chỉ khi còn dư ngân sách): lúc máy khách xin giọng sẽ nhận chung kết quả, đỡ một lượt mạng.
  void speech(clean, memberId, { optional: true });
  return clean;
}

// i18n-ok-begin: prompt rút ngày tháng (tiếng Anh) và nhãn nội bộ.
// ---------- Rút ngày tháng sau cuộc gọi ----------

type Found = { kind: string; title: string; day: number; month: number; year: number | null; note: string };

export const DATES_SCHEMA = {
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

const TITLE_EXAMPLES: Record<Lang, string> = {
  vi: 'Ngày cưới bố mẹ, Sinh nhật bà nội, Ngày cả nhà chuyển nhà (full Vietnamese diacritics)',
  en: "Mom and Dad's wedding day, Grandma's birthday, The day we moved house",
  ko: '엄마 아빠 결혼식 날, 할머니 생신, 온 가족 이사한 날',
};

/** speak: thứ tiếng người kể nói; home: thứ tiếng của nhà (tên ngày, ghi chú hiện cho cả nhà). */
export function datesSystem(speak: Lang, home: Lang) {
  return `You read the transcript of a family voice call (speech recognition, ${LANG_NAME[speak]}, may contain recognition errors) and pull out important family dates to add to the shared family calendar.
Only include a date when the speaker clearly states both the day and the month (for example "ngày 12 tháng 3", "March 12", "12 March", "3월 12일"). Include the year when stated. Do not guess, do not compute a date from an age or from "last year".
Skip dates already in the calendar. Title is short ${LANG_NAME[home]}, for example: ${TITLE_EXAMPLES[home]}. No em dash. Use only names and relationships the speaker actually said.
The whole family shares this calendar, so write title and note from the family's point of view: name people by the speaker's name or a family word (Mom, Dad, Grandma), never with I, we, my or our (in Korean never 저, 저희, 제, 우리).
Note is one short ${LANG_NAME[home]} sentence about the day from the speaker's words, adding nothing they did not say.
If nothing qualifies, return an empty list.

Reply in ${LANG_NAME[home]} for title and note.`;
}

// i18n-ok-end
/** Không có AI: đọc ngày có cả ngày lẫn tháng (vi, en, ko, xem parseDate) trong câu trả lời có hẹn trước loại ngày. */
export function regexDates(answers: Array<{ transcript: string | null; event: string }>, speak: Lang = 'vi', home: Lang = 'vi'): Found[] {
  const out: Found[] = [];
  for (const a of answers) {
    if (!a.transcript || a.event === 'none') continue;
    const d = parseDate(a.transcript, speak);
    if (!d) continue;
    out.push({ kind: a.event, title: KIND_TITLE(a.event, home) ?? tServer(home, 'callEvent.memory'), ...d, note: '' });
  }
  return out;
}

/** Thứ tiếng của nhà: thứ tiếng nhiều người dùng nhất trong nhà (chưa chọn là tiếng Việt); hoà thì theo người kể. */
async function homeLang(fid: string, speaker: Lang): Promise<Lang> {
  const { rows } = await pool.query('select lang from members where family_id = $1', [fid]);
  const n: Record<Lang, number> = { vi: 0, en: 0, ko: 0 };
  for (const r of rows) n[langOf(r.lang)]++;
  const top = Math.max(...Object.values(n));
  return n[speaker] === top ? speaker : LANGS.find((l) => n[l] === top) ?? speaker;
}

async function saveDates(callId: string) {
  const { rows: [call] } = await pool.query('select * from calls where id = $1', [callId]);
  if (!call) return;
  const script: CallScript = JSON.parse(call.script);
  const { rows: answers } = await pool.query('select idx, question, transcript from call_answers where call_id = $1 order by idx', [callId]);
  const said = answers.filter((a) => (a.transcript ?? '').trim());
  if (!said.length) return;
  const { rows: existing } = await pool.query('select kind, title, day, month, year from events where family_id = $1', [call.family_id]);
  const { rows: [who] } = await pool.query('select name, role, lang from members where id = $1', [call.member_id]);
  // Người kể nói thứ tiếng của bộ câu hỏi; tên ngày và ghi chú theo thứ tiếng của nhà (cả nhà cùng xem lịch).
  const speak = langOf(script.lang ?? who?.lang);
  const home = await homeLang(call.family_id, speak);

  let found: Found[] | null = null;
  const ai = await askJSON<{ events: Found[] }>(datesSystem(speak, home), JSON.stringify({
    speaker: { name: who?.name, role: who?.role }, calendar: existing,
    call: said.map((a) => ({ question: a.question, answer: a.transcript })),
  }, null, 1), DATES_SCHEMA, 2000);
  if (ai?.events) found = ai.events;
  else found = regexDates(said.map((a) => ({ transcript: a.transcript, event: script.questions[a.idx]?.event ?? 'none' })), speak, home);

  for (const e of found) {
    const day = Math.round(e.day), month = Math.round(e.month);
    const year = e.year && e.year >= 1900 && e.year <= new Date().getFullYear() ? Math.round(e.year) : null;
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) continue;
    if (existing.some((x) => x.day === day && x.month === month && (x.kind === e.kind || x.title === e.title))) continue;
    const title = String(e.title || KIND_TITLE(e.kind, home) || tServer(home, 'callEvent.memory')).replace(/\s*[—–]\s*/g, ', ').slice(0, 80);
    await pool.query(
      `insert into events (id, family_id, member_id, kind, title, day, month, year, lunar, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
      [randomUUID(), call.family_id, call.member_id, ['birthday', 'wedding', 'anniversary', 'memory', 'other'].includes(e.kind) ? e.kind : 'other',
        title, day, month, year, e.note ? String(e.note).slice(0, 500) : tServer(home, 'callEvent.note', { name: who?.name ?? '' }).trim(), call.member_id],
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
    const script = first ? firstScript(c) : (await aiScript(c, week)) ?? templateScript(c, week);
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
    // Máy không chép được lời (iPhone hay bị): nhờ Gemini (dự phòng OpenAI) chép theo thứ tiếng của cuộc gọi, quá 8 giây thì thôi. Chép được thì đáp luôn một câu.
    let reply: string | null = null;
    if (!transcript && req.file) {
      transcript = (await transcribe(path.join(MEDIA_DIR, req.file.filename), req.member.id, 8000, langOf(script.lang ?? reqLang())))?.slice(0, 4000) ?? null;
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

  // Nhấc máy là hỏi trước một lần: cả cuộc gọi dùng giọng OpenAI, Gemini hay giọng máy ('device'). Con số dùng/hạn mức chỉ trả cho thành viên (đã qua auth).
  r.get('/call/tts-status', h(async (req, res) => {
    const s = ttsStatus();
    res.json({ ok: s.ok, provider: s.provider, reason: s.reason, ...(req.member ? { used: s.used, limit: s.limit } : {}) });
  }));

  // Giọng đọc của Mây: trả về đường dẫn file âm thanh. url null thì kèm reason (budget, cooldown, nokey, skip, fail) để máy hiện chữ.
  // provider: nhà cung cấp đã chốt lúc nhấc máy, máy chủ dùng đúng nhà đó và không tự đổi giữa chừng.
  // kind 'fixed': chỉ lấy từ kho, không bao giờ gọi nhà cung cấp. kind 'reply': câu đáp theo nội dung, chỉ đọc khi còn dư ngân sách.
  r.post('/call/tts', h(async (req, res) => {
    const text = String(req.body.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > TTS_MAX) return res.json({ url: null, reason: 'fail' });
    const kind = req.body.kind === 'fixed' || req.body.kind === 'reply' ? req.body.kind : undefined;
    const asked = req.body.provider;
    const picked = pickProvider();
    const provider: Provider = asked === 'openai' || asked === 'gemini' ? asked : picked === 'device' ? defaultProvider() : picked;
    const hit = cachedSpeech(text, provider);
    if (hit) return res.json({ url: hit });
    if (kind === 'fixed') return res.json({ url: null, reason: 'skip' });
    if (!providerOn(provider)) return res.json({ url: null, off: true, reason: 'nokey' });
    const gate = gateOf(provider);
    const why = gate.blocked(kind === 'reply');
    if (why) return res.json({ url: null, reason: kind === 'reply' && why === 'budget' && !gate.blocked() ? 'skip' : why });
    const p = speech(text, req.member.id, { optional: kind === 'reply', provider });
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
