// Cuộc gọi hằng tuần ngay trong app: Mây của Sweet Home hỏi, người nghe kể bằng giọng nói.
// Claude soạn câu hỏi riêng cho từng người; không có khoá thì dùng bộ câu soạn sẵn từ members.intro.
// Gọi xong: rút ngày tháng quan trọng vào lịch, ảnh xưa vào kho, sổ nhớ và tín hiệu của Mây (memory.ts), rồi ghép podcast.
import express from 'express';
import type multer from 'multer';
import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CALL_ROLES, DEFAULT_MASCOT_NAME, EVENT_HINTS, MAX_STORY_FOLLOW, NO_EPISODE_TOPICS, STORY_THEMES, THEME_TOPIC, TRIAL_AFTER_MIN, TRIAL_FOLLOW, callLines, isTheme, relayNone, themesFor, type CallQuestion, type CallRelay, type CallScript, type StoryTheme, type TurnAI } from '../src/shared.ts';
import { errorBody, langOf, LANGS, reqLang, tReq, tServer, type Lang } from './i18n.ts';
import { askJSON, askQuick, useGemini } from './ai.ts';
import { pushRelays } from './push.ts';
import { parseDate, suspect, type Allow } from './guard.ts';
import { mascotName, pool } from './db.ts';
import { weekKey } from './recap.ts';
import { buildPodcastsForCall, rebuildCallSoon, shareCall } from './podcast.ts';
import { extractCall, extractSoon } from './memory.ts';
import { loadScriptExtras, type ScriptExtras } from './callfacts.ts';
import { finishLive, liveAnswerRow, liveCheckFor, relayAnswer, storeLiveAnswer } from './calllive.ts';
import { cachedSpeech, defaultProvider, gateOf, hasVoice, initTtsBudget, pickProvider, providerOn, speech, transcribe, ttsStatus, TTS_MAX, type Provider } from './voice.ts';
import path from 'node:path';
import { open, rename, unlink } from 'node:fs/promises';
import { Limit, limitBy } from './limit.ts';

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
    alter table call_answers add column if not exists turn int not null default 0;
    alter table vault add column if not exists story int;
    create table if not exists relays (
      id text primary key, family_id text not null references families(id) on delete cascade, call_id text references calls(id) on delete cascade,
      from_id text not null references members(id) on delete cascade, to_id text not null references members(id) on delete cascade,
      transcript text, media text, said text, push text, created_at timestamptz not null default now(),
      pushed_at timestamptz, delivered_call_id text, delivered_at timestamptz
    );
    create unique index if not exists relays_call_to on relays (call_id, to_id);
    create index if not exists relays_pending on relays (to_id) where delivered_at is null;
    alter table calls add column if not exists shared boolean not null default true;
    alter table calls add column if not exists trial boolean not null default false;
    alter table calls add column if not exists memory_at timestamptz;
    alter table calls add column if not exists memory_tries int not null default 0;
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

/** Các câu cố định cần có giọng sẵn: mỗi (vai, ngôn ngữ) 14 câu. Câu "ack" không nạp (chỉ dùng nếu tình cờ đã có trong kho); câu "relayIntro" chỉ dùng khi có lời nhắn nên đọc lúc cần rồi nằm trong kho.
 *  Câu "skip" (đổi chuyện) không còn nói ở đâu nên không nạp. Nạp sẵn hụt thì /call/tts đọc lúc xin, chỉ với share, shareYes, shareNo, bye (ttsFor). */
export function fixedLines(langs: readonly Lang[] = LANGS) {
  const out = new Set<string>();
  for (const lang of langs) {
    for (const role of CALL_ROLES) {
      const L = callLines(role, (k, v) => tServer(lang, k, v));
      for (const text of [L.slow, L.busy, L.photo, ...L.short, ...L.long, L.relay, L.relayOk, L.share, L.shareYes, L.shareNo, L.bye]) out.add(text);
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
  // Chỉ nạp thứ tiếng nhà nào đó đang dùng: hạn mức giọng Gemini mỗi ngày ít, đừng tiêu cho tiếng Anh, tiếng Hàn khi chưa ai dùng.
  const { rows } = await pool.query(`select distinct coalesce(lang, 'vi') as lang from members`).catch(() => ({ rows: [] as { lang: string }[] }));
  const used = LANGS.filter((l) => l === 'vi' || rows.some((r) => r.lang === l));
  for (const text of fixedLines(used)) {
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

/** Thẻ mời: người chưa gọi xong lần nào (kể cả đã gọi thử) thì được mời gọi thử sau TRIAL_AFTER_MIN phút, mọi ngày;
 *  người đã gọi thì chỉ mời trong khung cuối tuần và chưa có cuộc gọi thật nào xong tuần này (cuộc gọi thử không chiếm lượt tuần). */
export function dueState(p: { minutesSinceJoin: number; hadDone: boolean; doneThisWeek: boolean; callTime: boolean }): { due: boolean; trial: boolean } {
  if (!p.hadDone) return { due: p.minutesSinceJoin >= TRIAL_AFTER_MIN, trial: true };
  return { due: p.callTime && !p.doneThisWeek, trial: false };
}

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
  /** Tên linh vật của nhà (families.mascot_name), chưa đặt thì Mây. */
  mascot?: string;
  /** Dữ liệu lớn dần (server/callfacts.ts): sổ nhớ, dịp, bản đồ chủ đề, nơi ở, giờ, thời tiết. Chỉ nạp khi soạn bộ câu mới (/call/start);
   *  nạp lỗi (hay trong test) thì không có. */
  extras?: ScriptExtras;
};

export async function context(memberId: string, fid: string): Promise<Ctx> {
  const [m, fam, ev, asked, stories, caps, done, ph, vt, mascot] = await Promise.all([
    pool.query('select id, name, role, intro from members where id = $1', [memberId]),
    pool.query('select name, role from members where family_id = $1 order by created_at', [fid]),
    pool.query('select kind, title, day, month, year from events where family_id = $1', [fid]),
    pool.query('select question from call_answers where member_id = $1 and turn = 0 order by created_at desc limit 40', [memberId]),
    // Lời nhắn khó nói là chuyện riêng với người nhận: không đưa vào dữ liệu soạn câu hỏi.
    pool.query(
      `select question, transcript from call_answers where member_id = $1 and topic <> 'loi-nhan' and coalesce(transcript, '') <> '' order by created_at desc limit 8`, [memberId]),
    pool.query(`select caption from posts where author_id = $1 and kind = 'photo' and coalesce(caption, '') <> '' order by created_at desc limit 8`, [memberId]),
    pool.query(`select to_char(done_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') d from calls where member_id = $1 and status = 'done' order by done_at desc limit 10`, [memberId]),
    pool.query(`select count(*)::int n from posts where author_id = $1 and kind = 'photo'`, [memberId]),
    pool.query(`select count(*)::int n from vault where member_id = $1`, [memberId]),
    mascotName(fid),
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
    mascot,
  };
}

// ---------- Bộ câu hỏi soạn sẵn ----------

const lastWord = (name: string) => name.trim().split(/\s+/).pop() || name;

/** Bộ câu v2: câu hỏi thăm (đáp ngắn cũng được, không thành tập) và câu mở chuyện chính. */
export const checkinQ = (text: string): CallQuestion => ({ text, topic: 'hoi-tham', photo: false, event: 'none', part: 'checkin' });
/** Loại ngày đi đôi với chủ đề: chuyện ngày cưới luôn hỏi ngày cưới (để ghi lịch), chủ đề khác không bao giờ mang loại ngày cưới. */
const eventFor = (theme: string, event: CallQuestion['event']): CallQuestion['event'] =>
  theme === 'ngay-cuoi' ? 'wedding' : event === 'wedding' ? 'none' : event;
export const storyQ = (text: string, theme: StoryTheme, photo = false, event: CallQuestion['event'] = 'none'): CallQuestion =>
  ({ text, topic: THEME_TOPIC[theme], photo, event: eventFor(theme, event), part: 'story', theme });
/** Câu tạm biệt cố định theo vai (giọng nằm sẵn trong kho), không hứa "cả nhà cùng nghe" vì chuyện có thể được giữ riêng. */
const byeOf = (c: Ctx) => callLines(c.member.role, (k, v) => tServer(c.lang, k, v)).bye;
/** Chủ đề chuyện chính được hỏi người này (themesFor): ngày cưới chỉ khi nhà có đủ bố lẫn mẹ và lịch chưa có ngày cưới. */
export const themesOf = (c: Ctx) => themesFor(c.member.role,
  c.family.some((m) => m.role === 'bo') && c.family.some((m) => m.role === 'me'),
  c.events.some((e) => e.kind === 'wedding'));

/** Cuộc gọi đầu tiên (cuộc gọi thử): chào, hỏi thăm, một chuyện dễ kể, tối đa 2 câu hỏi thêm, không hỏi lời nhắn. Soạn sẵn, không gọi AI. */
export function firstScript(c: Ctx): CallScript {
  const { name, role } = c.member;
  const parent = role === 'bo' || role === 'me';
  const T = (k: string, v?: Record<string, string | number>) => tServer(c.lang, k, v);
  const self = role === 'bo' ? T('call.self.bo') : role === 'me' ? T('call.self.me') : '';
  const Self = self ? self[0].toUpperCase() + self.slice(1) : '';
  const nick = lastWord(name);
  const S = (k: string) => T(`callScript.first.${parent ? 'parent' : 'child'}.${k}`, { self, Self, nick, mascot: c.mascot ?? DEFAULT_MASCOT_NAME });
  return {
    greeting: S('greeting'),
    questions: [checkinQ(S('q1')), storyQ(S('story'), 'mon-an')],
    goodbye: byeOf(c),
    source: 'first',
    lang: c.lang,
    mascot: c.mascot ?? DEFAULT_MASCOT_NAME,
    v: 2, follow: TRIAL_FOLLOW, trial: true,
  };
}

/** Chủ đề chuyện chính có câu mẫu, theo thứ tự ưu tiên (khoá callScript.template.<vai>.story.<chủ đề>). */
const TEMPLATE_THEMES: Record<'parent' | 'child', StoryTheme[]> = {
  parent: ['ngay-cuoi', 'tuoi-tho', 'que-nha', 'mon-an', 'tet-cac-dip', 'uoc-mo', 'con-chao-doi'],
  child: ['tuoi-tho', 'que-nha', 'mon-an', 'tet-cac-dip', 'ban-be', 'con-di-xa'],
};

export function templateScript(c: Ctx, week: string): CallScript {
  const { name, role } = c.member;
  const parent = role === 'bo' || role === 'me';
  const who = parent ? 'parent' : 'child';
  const T = (k: string, v?: Record<string, string | number>) => tServer(c.lang, k, v);
  const self = role === 'bo' ? T('call.self.bo') : role === 'me' ? T('call.self.me') : T('onboarding.self.con');
  const call = parent ? self[0].toUpperCase() + self.slice(1) : name;
  const other = T(role === 'bo' ? 'call.self.me' : 'call.self.bo');
  const vars = { self, Self: call, call, other, name, mascot: c.mascot ?? DEFAULT_MASCOT_NAME };
  const S = (k: string) => T(`callScript.template.${who}.${k}`, vars);
  // Chỉ hỏi ngày cưới khi trong nhà có đủ cả bố lẫn mẹ và lịch chưa có ngày cưới (themesOf).
  const allowed = themesOf(c);
  const pool = TEMPLATE_THEMES[who].filter((t) => allowed.includes(t)).map((theme) =>
    storyQ(tServer(c.lang, `callScript.template.${who}.story.${theme}`, vars), theme, theme === 'ngay-cuoi'));
  const fresh = pool.filter((x) => !c.asked.includes(x.text));
  const list = fresh.length ? fresh : pool;
  // Chuyện ngày cưới luôn hỏi trước nếu được hỏi; rồi chủ đề chưa kể đầu tiên theo thứ tự ưu tiên (bản đồ chủ đề);
  // kể hết rồi (hay không có bản đồ) thì xoay vòng theo tuần, bỏ chủ đề vừa kể gần nhất nếu còn chủ đề khác.
  const told = c.extras?.told ?? [];
  const untold = c.extras && fresh.find((x) => !told.some((t) => t.theme === x.theme));
  const newest = told.length ? told.reduce((a, b) => (b.last > a.last ? b : a)).theme : null;
  const rota = list.length > 1 ? list.filter((x) => x.theme !== newest) : list;
  const shift = Math.floor(Date.parse(week) / (7 * 86400e3)) % rota.length;
  const story = list.find((x) => x.theme === 'ngay-cuoi') ?? untold ?? rota[shift];
  const relay = relayQuestion(c);
  return {
    greeting: S('greeting'),
    questions: [checkinQ(S('checkin')), story, ...(relay ? [relay] : [])],
    goodbye: byeOf(c),
    source: 'template',
    lang: c.lang,
    mascot: c.mascot ?? DEFAULT_MASCOT_NAME,
    v: 2, follow: MAX_STORY_FOLLOW,
  };
}

/** Mây Live: câu mở mẫu của một chủ đề, dự phòng khi câu mở của model không qua lớp lọc (server/calllive.ts). Cùng câu và cùng biến
 *  với templateScript; vai này không có câu mẫu cho chủ đề ấy thì tên chủ đề. Bộ kiểm câu LiveCheck truyền thẳng làm p được. */
export function templateOpener(p: { lang: Lang; role: string; name: string; mascot: string }, theme: StoryTheme): string {
  const parent = p.role === 'bo' || p.role === 'me';
  const who = parent ? 'parent' : 'child';
  if (!TEMPLATE_THEMES[who].includes(theme)) return tServer(p.lang, `topic.${THEME_TOPIC[theme]}`);
  const self = p.role === 'bo' ? tServer(p.lang, 'call.self.bo') : p.role === 'me' ? tServer(p.lang, 'call.self.me') : tServer(p.lang, 'onboarding.self.con');
  const call = parent ? self[0].toUpperCase() + self.slice(1) : p.name;
  const other = tServer(p.lang, p.role === 'bo' ? 'call.self.me' : 'call.self.bo');
  return tServer(p.lang, `callScript.template.${who}.story.${theme}`, { self, Self: call, call, other, name: p.name, mascot: p.mascot });
}

/** Câu cuối mỗi cuộc gọi (trừ cuộc gọi đầu): có lời nào khó nói muốn nhắn ai trong nhà không. Con thì gợi ý bố mẹ, bố mẹ thì gợi ý con.
 * Câu cố định theo vai (giọng nằm sẵn trong kho). Nhà chỉ có một người thì không hỏi. */
export function relayQuestion(c: Ctx): CallQuestion | null {
  if (c.family.length < 2) return null;
  const L = callLines(c.member.role, (k, v) => tServer(c.lang, k, v));
  return { text: L.relay, topic: 'loi-nhan', photo: false, event: 'none' };
}

/** Bộ câu đã soạn trong tuần dùng tiếp được không: phải là bản v2, cùng thứ tiếng và tên linh vật hiện tại,
 *  và đúng loại (người chưa gọi lần nào cần bộ câu cuộc gọi thử, người đã gọi thì không). Không thì soạn lại. */
export function scriptReusable(old: CallScript | null, c: Pick<Ctx, 'lang' | 'mascot'>, first: boolean): boolean {
  return !!old && old.v === 2 && (old.lang ?? 'vi') === c.lang && (old.mascot ?? DEFAULT_MASCOT_NAME) === (c.mascot ?? DEFAULT_MASCOT_NAME) && !!old.trial === first;
}

// ---------- Chống bịa: suspect() ở guard.ts (dấu hiệu bịa vi, en, ko + tên riêng, con số phải có trong dữ liệu) ----------

/** Tên đầy đủ của ngôn ngữ người nghe, cho dòng "Reply in ..." của prompt. */
export const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese', en: 'English', ko: 'Korean' };

// i18n-ok-begin: prompt gửi AI (tiếng Anh, có ví dụ theo từng thứ tiếng), không phải chữ hiện cho người dùng.
// ---------- AI soạn câu hỏi ----------

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['greeting', 'checkin', 'story', 'used_facts'],
  properties: {
    greeting: { type: 'string' },
    checkin: { type: 'string' },
    story: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'theme', 'photo', 'event'],
      properties: {
        text: { type: 'string' },
        theme: { type: 'string', enum: [...STORY_THEMES] },
        photo: { type: 'boolean' },
        event: { type: 'string', enum: [...EVENT_HINTS] },
      },
    },
    used_facts: { type: 'array', items: { type: 'string' } },
  },
};

/** Cách Mây xưng hô và giọng nói theo ngôn ngữ người nghe. */
export const ADDRESS: Record<Lang, string> = {
  vi: `Vietnamese, the way a warm, unhurried person really talks on the phone.
When talking to a parent (role bo or me), Mây calls itself "con" and addresses them as Bố or Mẹ. When talking to a child (role con), Mây calls itself "mình" and uses their name.`,
  en: `English, the way a warm, unhurried family member really talks on the phone. Simple everyday words.
Mây says I and me. When talking to a parent, call role me Mom and role bo Dad. When talking to a child (role con), Mây uses their name sparingly.`,
  ko: `Korean in warm, gentle 해요체, the way a caring family member really talks on the phone. Simple everyday words. Every sentence ends in a 요 form (for example 하셨어요, 궁금해요, 들려주세요); never use the formal 합니다 or 입니다 style.
Mây always calls itself 저, and writes its own name only as Mây in Latin letters, never in Hangul. When talking to a parent (role bo or me), use respectful honorific forms (for example 드셨어요, 하셨어요, 계세요); you may address them as 어머님 (role me) or 아버님 (role bo), at most twice in the whole script, never by their first name. When talking to a child (role con), use plain warm 해요체 without honorific verb forms and call them by their name followed by 님, sparingly.`,
};

const EXAMPLES: Record<Lang, { story: string; forbidden: string }> = {
  vi: { story: 'An đi xa rồi mà mẹ vẫn nhớ An mê canh chua. Mẹ kể con nghe về một bữa cơm hồi An còn ở nhà mà mẹ nhớ nhất đi.', forbidden: '"lần trước", "hôm trước", "hôm qua", "lúc nãy", "như bạn đã gửi", "tấm ảnh bạn gửi", "bạn từng kể"' },
  en: { story: 'An is far away now, but you still remember how much An loves sour soup. Tell me about a family meal from when An still lived at home, the one you remember most.', forbidden: '"last time", "the other day", "yesterday", "earlier", "as you sent", "the photo you sent", "you told me", "you mentioned", "remember when"' },
  ko: { story: 'An님이 멀리 있어도 An님이 새콤한 국을 좋아하던 건 아직 기억하시죠. An님이 집에 있던 시절의 식사 중에 가장 기억에 남는 날 이야기를 들려주세요.', forbidden: '"지난번", "저번에", "어제", "아까", "보내주신", "말씀하신", "전에 말한"' },
};

/** Prompt viết sẵn cho tên Mây: nhà đã đặt tên khác thì thay bằng tên ấy (tiếng Hàn bỏ luật "chỉ viết chữ Latin"). */
export function named(prompt: string, name: string) {
  if (name === DEFAULT_MASCOT_NAME) return prompt;
  return prompt.replace('writes its own name only as Mây in Latin letters, never in Hangul', `writes its own name exactly as ${name}`).split('Mây').join(name);
}

function scriptSystem(lang: Lang, name = DEFAULT_MASCOT_NAME, trial = false) {
  const ex = EXAMPLES[lang];
  return named(`You write the script for a short voice call inside Sweet Home, a family app for families whose child lives far from home. The caller is Mây, the app's little mascot. The phone reads every line aloud, and the person answers by speaking.

LANGUAGE AND TONE. ${ADDRESS[lang]}
Short sentences. No em dash or long dash, no emoji, no lists, no quotation marks.
The lines are read aloud, so never write the English app name; if a name is needed, Mây calls itself Mây. Mây is the one who called, so never thank the person for calling. Write every person's name exactly as it appears in the input, never translated or transliterated. The role codes bo, me and con are not names: never write them as words.

WHAT YOU MAY USE. Only the facts in the JSON input. Every field is real data from the database. A field that starts with "none yet" (for example "none yet: no previous call", "none yet: no photos", "none yet: no calendar events") means there is nothing, so you know nothing about it. A field that is missing from the input is unknown too. Field values may be in another language; never copy them word for word unless it is a name or a food the person wrote.

HARD RULES, never break them:
1. Never mention a photo, message, call, earlier session, memory or detail that is not in the input. Never write ${ex.forbidden} or anything similar unless that exact thing is in the input.
2. Never guess a name, date, place, country, number, age or relationship. Use only names and facts that appear in the input. Do not assume where anyone lives or studies; only lives_in says where someone lives.
3. Ask only open, safe questions that assume nothing. Every question must be answerable without any outside data, by a person who just picked up the phone.
4. Write exactly two questions, each one or two short sentences.
   checkin: one short question about how they are right now, answerable in a word, assuming nothing outside the input.
   story: one story opener that invites a long telling (tell me about..., what was it like when...), never a question with one short factual answer. Use one real detail from the input as the reason to ask; if the input has none, simply invite the story. The opener names no date unless that date is in the input.
   Example opener, only to show the pattern (never copy its names or details; the rules on names still apply): "${ex.story}"
   Never ask for a message to someone in the family; the app adds its own closing question for that.
5. Never repeat a question in already_asked, in any language.
6. Only follow up on an earlier answer if it is listed in own_earlier_answers, and quote nothing that is not there.
7. story.photo is true only when the story is about a moment people often keep photos of (a wedding, a trip, an old house). The opener must never imply that a photo was already received.
8. If wedding_question_allowed is true, the story asks when they got married and to tell about that day, with theme ngay-cuoi, photo true and event wedding. Otherwise never ask about a wedding and never use theme ngay-cuoi.
9. story.theme is the code that fits the opener: tuoi-tho childhood, que-nha the home they grew up in, bo-me-minh their own parents, ngay-cuoi the wedding, cong-viec work, con-chao-doi the day their child was born, con-di-xa the day a child left home, mon-an food, tet-cac-dip Tet and family occasions, ban-be friends, uoc-mo dreams, dan-con-chau what they want to pass on to the children. When role is con, never use con-chao-doi or dan-con-chau. Set story.event to the kind of date the answer will likely contain (wedding, anniversary, birthday, memory), otherwise none.
10. Earlier answers come from past calls. Refer to them only as being from an earlier call (last time) and never with today, now or any present-tense time. If previous_calls says none yet, never refer to any earlier call at all. Never put a time on an earlier answer (no last week, no 지난주). Never assume whether a child is a son or a daughter unless the intro says so. Never invent relatives (grandchildren, siblings, cousins, anyone's children) unless listed in family_members.
11. The intro field "unsaid" is private: it may guide your tone, but never quote it or hint at its content.

FAMILY DATA THAT GROWS OVER TIME (each rule applies only when its field is in the input):
12. Local time and weather come only from person.lives_in. If lives_in has no weather, never mention the weather. In family_members, lives_in, hours_apart (how many hours that member's clock is ahead of the person's; negative means behind) and distance_km tell where the others are.
13. Occasions come only from upcoming_occasions (in_days is how many days away). When an occasion there is within 30 days and a memory entry talks about it, the story may ask deeper about that occasion: how they will keep it this year, how it was in earlier years.
14. Unless rule 8 applies, pick story.theme from untold_themes or from a told_themes entry with depth short. Prefer the theme that fits an upcoming occasion (tet-cac-dip near Lunar New Year, Christmas or Mid-Autumn). Never use the theme of the first told_themes entry, which is the newest. story.theme is always one of allowed_themes.
15. memory lists what the family told Mây in earlier calls. An entry with told_by_you false was told by someone else: use it only together with who told it (for example: Mẹ kể là ..., or Mom told me ...), never as if Mây knew it by itself. Write every name from memory exactly as given. used_facts lists the id of every memory entry your lines use, or is empty.
16. When profile_gaps is a list, the checkin may weave in one gap question: seen is how long since they last saw the family, food is the home dish they miss most (for a parent, the dish their child loves most).
17. A memory entry with private true is something the person told only Mây. It may only be touched gently in the checkin, never used as or inside the story opener, because the story opener can later be shown to the whole family.
18. recent_contact lists people this person got in touch with after Mây nudged them. When it lists someone, the greeting or checkin may warmly ask how talking with that person went, with their name exactly as given. Never put a time on it (no yesterday, the other day, last time, recently, or anything similar) and never guess what they talked about.

The greeting is one or two short sentences and mentions nothing outside the input.${trial ? `

TRIAL CALL. The input field trial is true: this is the person's very first call, a short getting-to-know-you chat. The story is one easy, warm, everyday story or a favorite memory, taken from the intro answers or from where they live, never anything heavy. Keep it light and inviting.` : ''}

Reply in ${LANG_NAME[lang]}. The greeting, checkin and story text must be written in ${LANG_NAME[lang]} only.`, name);
}

/** Danh sách rỗng thì nhãn "none yet: ..." như các mục khác. */
const orNone = <T>(list: T[], label: string): T[] | string => (list.length ? list : `none yet: ${label}`);

/** Nơi ở của người nghe cho AI: chỉ những gì biết chắc; không có thời tiết thì không có mục weather; không biết ở đâu thì "none yet". */
function livesIn(p: ScriptExtras['place']) {
  if (!p.name && !p.country) return 'none yet: place not known';
  return { ...(p.name ? { place: p.name } : {}), ...(p.country ? { country: p.country } : {}), local_time: p.localTime, ...(p.weather ? { weather: p.weather } : {}) };
}

/** Dữ liệu thật đưa cho AI: mục trống ghi rõ "none yet" bằng nhãn tiếng Anh trung tính. Có dữ liệu lớn dần (extras) thì thêm tuổi, nơi ở,
 *  cả nhà ở đâu, sổ nhớ, dịp sắp tới, bản đồ chủ đề; không có thì chỉ các mục cũ. */
export function scriptFacts(c: Ctx) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const intro = Object.fromEntries(Object.entries(c.member.intro).filter(([, v]) => String(v ?? '').trim()));
  const x = c.extras;
  return {
    today,
    person: {
      name: c.member.name, role: c.member.role, intro: Object.keys(intro).length ? intro : 'none yet: no intro answers',
      ...(x ? { age: x.age ?? 'none yet: no birth date', lives_in: livesIn(x.place), profile_gaps: orNone(x.gaps, 'nothing missing') } : {}),
    },
    family_members: x
      ? orNone(x.family.map((m) => ({ name: m.name, role: m.role, lives_in: m.place ?? 'none yet: place not known',
        // Giờ chênh, khoảng cách chỉ khi biết cả hai nơi (không thì là đoán theo giờ Việt Nam).
        ...(m.km != null ? { hours_apart: m.hoursApart, distance_km: m.km } : {}) })), 'no one else in the family')
      : c.family,
    calendar: c.events.length ? c.events : 'none yet: no calendar events',
    previous_calls: c.doneCalls.length ? { count: c.doneCalls.length, last: c.doneCalls[0] } : 'none yet: no previous call',
    own_earlier_answers: c.stories.length ? c.stories : 'none yet: no transcribed answers',
    saved_photos: c.photoCount ? { count: c.photoCount, captions: c.captions.length ? c.captions : 'none yet: no captions' } : 'none yet: no photos',
    already_asked: c.asked.length ? c.asked : 'none yet: nothing asked',
    wedding_question_allowed: themesOf(c).includes('ngay-cuoi'),
    ...(x ? {
      memory: orNone(x.memory.map((m) => ({ id: m.id, about: m.about, told_by: m.toldBy, told_by_you: m.toldByYou, private: m.private, kind: m.kind, fact: m.fact })), 'nothing in memory'),
      upcoming_occasions: orNone(x.occasions.map((o) => ({ name: o.name, date: o.date, in_days: o.inDays, who: o.who })), 'no occasion in the next 30 days'),
      told_themes: orNone(x.told.map((t) => ({ theme: t.theme, times: t.times, depth: t.turns >= 3 ? 'deep' : 'short', last: t.last })), 'no story told'),
      untold_themes: orNone(x.themes.filter((t) => !x.told.some((d) => d.theme === t)), 'every theme told'),
      allowed_themes: x.themes,
      recent_contact: orNone(x.recent, 'no contact after a nudge'),
    } : {}),
  };
}

const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Trả lời của AI theo SCRIPT_SCHEMA (lời tạm biệt là câu cố định nên AI không viết). */
type ScriptRaw = { greeting: string; checkin: string; story: { text: string; theme: string; photo: boolean; event: CallQuestion['event'] }; used_facts?: unknown };

export async function aiScript(c: Ctx, week: string, timeoutMs?: number, opts: { trial?: boolean } = {}): Promise<CallScript | null> {
  const trial = !!opts.trial;
  const facts = scriptFacts(c);
  const x = c.extras;
  // Tên tháng tiếng Anh của các ngày có trong lịch và các dịp sắp tới cũng tính là dữ liệu thật ("your birthday in March"),
  // giờ địa phương kiểu 12 giờ cũng vậy (20:00 là "8 giờ tối").
  // Mã vai (bo, me, con) không phải tên: bỏ khỏi dữ liệu đối chiếu để câu "Hi Bo" bị chặn.
  const months = [...c.events.map((e) => e.month), ...(x?.occasions ?? []).map((o) => Number(o.date.slice(5, 7)))].map((m) => MONTH_EN[m - 1] ?? '');
  const hour12 = x ? String(Number(x.place.localTime.slice(0, 2)) % 12 || 12) : '';
  const hay = JSON.stringify(facts).replace(/"role":"(bo|me|con)"/g, '') + ' ' + months.join(' ') + ' ' + hour12 + ' ' + (c.mascot ?? '');
  // Sổ nhớ có điều chính người này kể thì được nói "Mẹ từng kể...".
  const allow: Allow = { prevCall: c.doneCalls.length > 0, ownStory: c.stories.length > 0 || !!x?.memory.some((m) => m.toldByYou), photos: c.photoCount > 0 };
  const r = await askJSON<ScriptRaw>(scriptSystem(c.lang, c.mascot, trial), JSON.stringify(trial ? { ...facts, trial: true } : facts, null, 1), SCRIPT_SCHEMA, undefined, timeoutMs);
  if (!r) return null;
  // Câu mẫu thay câu AI hỏng: cuộc gọi thử lấy từ bộ câu thử (chuyện dễ), không lấy bộ câu tuần (có thể là ngày cưới).
  const tpl = trial ? firstScript(c) : templateScript(c, week);
  // Câu AI viết: làm sạch rồi qua lớp chống bịa; không ổn thì null (dùng câu mẫu).
  const ok = (raw: unknown) => {
    const text = String(raw || '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').trim();
    if (!text) return null;
    const why = suspect(text, hay, allow, c.lang);
    if (why) { console.warn(`[call] bỏ câu "${text}": ${why}`); return null; }
    return text;
  };
  const checkin = ok(r.checkin);
  // Câu mở chuyện chính: đúng chủ đề cho vai, chỉ hỏi ngày cưới khi được hỏi, chưa từng hỏi; không thì chuyện của bộ câu mẫu.
  const s = r.story;
  const text = ok(s?.text), theme = s?.theme;
  const event = eventFor(String(theme), EVENT_HINTS.includes(s?.event) ? s.event : 'none');
  const fits = !!text && isTheme(theme) && themesOf(c).includes(theme)
    && (event !== 'wedding' || facts.wedding_question_allowed) && !c.asked.includes(text);
  const story = fits ? storyQ(text, theme, !!s.photo, event) : tpl.questions[1];
  const relay = trial ? null : relayQuestion(c);
  // Sự thật AI nói đã dùng: chỉ nhận mã có trong sổ nhớ đã đưa vào; /call/start đánh dấu đã dùng.
  const ids = new Set((x?.memory ?? []).map((m) => m.id));
  const used = [...new Set(Array.isArray(r.used_facts) ? r.used_facts : [])].filter((id): id is string => typeof id === 'string' && ids.has(id));
  return {
    greeting: ok(r.greeting) ?? tpl.greeting,
    questions: [checkin ? checkinQ(checkin) : tpl.questions[0], story, ...(relay ? [relay] : [])],
    goodbye: byeOf(c),
    source: 'ai',
    lang: c.lang,
    mascot: c.mascot ?? DEFAULT_MASCOT_NAME,
    v: 2, follow: trial ? TRIAL_FOLLOW : MAX_STORY_FOLLOW,
    ...(trial ? { trial: true } : {}),
    ...(used.length ? { used } : {}),
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

function replySystem(lang: Lang, name = DEFAULT_MASCOT_NAME) {
  return named(`You are Mây, the mascot of the family app Sweet Home, on a warm voice call with a family member. They just answered a question out loud (speech recognition text, may have errors).
React warmly to what is written in "answer": when the answer has a concrete detail (an object, food, place, person or feeling the person actually said), your reply must echo that exact detail in your own words.
Never add any fact, name, number, place, photo, memory or event that is not in "answer". Never refer to anything earlier, and never use phrases like "you said", "you mentioned", "last time" or their equivalents; just echo the detail directly.
Do not ask a new question. Never say the English app name. No em dash, no emoji, no quotation marks.
${REPLY_STYLE[lang]}

Reply in ${LANG_NAME[lang]}.`, name);
}

// i18n-ok-end
export async function quickReply(who: { name: string; role: string } | undefined, question: string, said: string, memberId: string, provider?: Provider | null) {
  const lang = reqLang();
  // Lời chép quá ngắn thì không đủ để đáp theo ý: để máy khách dùng câu đáp mẫu. Tiếng Hàn đếm âm tiết (ít dấu cách hơn).
  const short = lang === 'ko'
    ? said.replace(/[^\p{L}\p{N}]/gu, '').length < 6
    : said.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).length < 3;
  if (short) return null;
  const { rows: [fam] } = await pool.query('select f.mascot_name from members m join families f on f.id = m.family_id where m.id = $1', [memberId]);
  const bot = fam?.mascot_name || DEFAULT_MASCOT_NAME;
  const text = await askQuick(replySystem(lang, bot), JSON.stringify({ person: { name: who?.name ?? '', role: who?.role ?? 'con' }, question, answer: said.slice(0, 1500) }), 1800);
  const clean = text?.replace(/\s*[—–]\s*/g, ', ').replace(/["“”]/g, '').split('\n')[0].trim().slice(0, 140) || null;
  if (!clean) return null;
  // Chỉ nhận câu đáp không có tên, số hay mốc thời gian lạ so với điều người ấy vừa nói.
  const why = suspect(clean, `${said} ${who?.name ?? ''} ${bot}`, { prevCall: false, ownStory: false, photos: false }, lang);
  if (why) { console.warn(`[call] bỏ câu đáp "${clean}": ${why}`); return null; }
  // Đọc sẵn câu đáp ngay (chỉ khi còn dư ngân sách) bằng đúng nhà cung cấp máy khách đã chốt lúc nhấc máy: lúc máy khách xin giọng
  // sẽ nhận chung kết quả, đỡ một lượt mạng. Không biết nhà cung cấp (giọng máy, bản app cũ) thì không đọc trước, khỏi tốn hạn mức.
  if (provider) void speech(clean, memberId, { optional: true, provider });
  return clean;
}

/** Nhà cung cấp giọng máy khách gửi kèm (đã chốt lúc nhấc máy). */
const providerOf = (v: unknown): Provider | null => (v === 'openai' || v === 'gemini' ? v : null);

// i18n-ok-begin: prompt hỏi thêm (tiếng Anh, có ví dụ theo từng thứ tiếng), mẫu nhận câu hỏi ngày.
// ---------- Mây hỏi thêm cho câu chuyện liền mạch ----------

/** Hạn chờ AI sau mỗi lượt kể: quá thì đi tiếp như cũ, không hỏi thêm. */
export const TURN_AI_MS = 2500;

const TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reaction', 'follow_up', 'day', 'month', 'year', 'real_story'],
  properties: {
    reaction: { type: 'string' },
    follow_up: { type: 'string' },
    day: { type: 'integer' },
    month: { type: 'integer' },
    year: { type: 'integer' },
    real_story: { type: 'boolean' },
  },
};

const FOLLOW_STYLE: Record<Lang, string> = {
  vi: `Example follow_up (role me, she told about a market trip but not who came): "Hôm đó Mẹ đi chợ với ai ạ?". Same for role con: "Hôm đó bạn đi với ai thế?".
Example date follow_up: "Mẹ còn nhớ hôm cưới là ngày mấy tháng mấy không ạ?" (role me), "Bạn còn nhớ hôm đó là ngày mấy tháng mấy không?" (role con).
They are done when they say things like "thôi", "hết rồi", "vậy thôi".`,
  en: `Example follow_up (she told about a market trip but not who came): "Who went to the market with you that day?".
Example date follow_up: "Do you remember the day and month of the wedding?".
They are done when they say things like "that's all".`,
  ko: `Example follow_up (she told about a market trip but not who came): "그날 시장에는 누구랑 같이 가셨어요?" (role bo or me), "그날 누구랑 같이 갔어요?" (role con).
Example date follow_up: "결혼식이 몇 월 며칠이었는지 기억나세요?" (role bo or me).
They are done when they say things like "그게 다예요".`,
};

function turnSystem(lang: Lang, name = DEFAULT_MASCOT_NAME) {
  return named(`You are Mây, the mascot of the family app Sweet Home, on a warm voice call with a family member. Mây asked about one story and the person is telling it out loud (speech recognition text, may have errors). "story" lists every turn of this story so far: what Mây asked and what they answered. The last item is the newest answer.

Return JSON with:
- reaction: ONE short spoken reaction to the newest answer.
- follow_up: "" or ONE short question that continues exactly this story.
- day, month, year: the date of the event in this story if the person clearly said both the day and the month anywhere in the story (year only if they said it), otherwise 0. Never guess or compute a date.
- real_story: true only if the person told a real, concrete story or memory with specific details (people, places, a moment), the kind worth keeping a photo of. false for short, vague or everyday answers.

REACTION. React warmly to the newest answer: when it has a concrete detail (an object, food, place, person or feeling the person actually said), echo that exact detail in your own words. Do not ask a question in the reaction.
${REPLY_STYLE[lang]}

FOLLOW_UP.
1. If can_follow is false, follow_up is "".
2. Walk the beats of this one story: the setting (which occasion, where, when), who was there, what happened, how it felt then, what they would say about it now. Skip every beat the story already tells, anywhere in story. Ask about one missing beat.
3. follow_up is "" when every beat is told, or when the person says they are done or want to stop.
4. The question continues exactly what they are telling: pick up a detail they actually said and stay on this one story. Never change topic.
5. If need_date is true and the story has no day and month yet, follow_up must ask for the day and month of that event.
6. One short, easy question, answerable by voice. Same way of addressing the person as in the reaction.
${FOLLOW_STYLE[lang]}

HARD RULES. Never add any fact, name, number, place, photo, memory or event that is not in story. Never refer to earlier calls. Never use phrases like "you said", "you mentioned", "last time" or their equivalents. Never say the English app name. No em dash, no emoji, no quotation marks.

Reply in ${LANG_NAME[lang]}.`, name);
}

/** Câu hỏi thêm có đang hỏi ngày không (để chắc câu hỏi có `event` luôn được hỏi ngày). */
const DATE_ASK: Record<Lang, RegExp> = {
  vi: /ngày|tháng|hôm nào|bao giờ|khi nào|năm nào/i,
  en: /\b(date|day|month|when)\b/i,
  ko: /날짜|며칠|몇\s*월|언제/,
};
// i18n-ok-end

type TurnRaw = { reaction: string; follow_up: string; day: number; month: number; year: number; real_story: boolean };

export type TurnInput = {
  lang: Lang;
  who: { name: string; role: string };
  /** Tên linh vật của nhà. */
  bot: string;
  /** Câu hỏi chính của câu chuyện. */
  q: CallQuestion;
  /** Các lượt của câu chuyện tới giờ, lượt cuối là câu vừa kể. */
  story: Array<{ asked: string; answer: string }>;
  /** Lượt vừa kể: 0 là câu chính, 1..max là câu trả lời cho câu hỏi thêm. */
  turn: number;
  /** Trần câu hỏi thêm của chuyện này (script.follow). */
  max: number;
  /** Câu chuyện đã có ngày (đã nhắc lại cho chắc) chưa. */
  dated: boolean;
  /** Câu mở chuyện chính, chỉ có ở lượt hỏi thăm (để nối vào câu đáp thành một câu nói). */
  next: string | null;
};

const isParent = (role: string) => role === 'bo' || role === 'me';
function selfOf(lang: Lang, role: string) {
  const self = role === 'bo' ? tServer(lang, 'call.self.bo') : role === 'me' ? tServer(lang, 'call.self.me') : '';
  return { self, Self: self ? self[0].toUpperCase() + self.slice(1) : '' };
}
export const cleanLine = (s: unknown) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”«»]/g, '').split('\n')[0].replace(/\s+/g, ' ').trim();

function validDate(day: unknown, month: unknown, year: unknown): TurnAI['date'] {
  const d = Math.round(Number(day)), m = Math.round(Number(month)), y = Math.round(Number(year));
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
  return { day: d, month: m, year: y >= 1900 && y <= new Date().getFullYear() ? y : null };
}

/** Ngày đọc lên theo thứ tiếng (bảng chữ callScript.date.*). */
export function dateText(lang: Lang, d: { day: number; month: number; year: number | null }) {
  const month = lang === 'en' ? MONTH_EN[d.month - 1] : d.month;
  return tServer(lang, d.year ? 'callScript.date.full' : 'callScript.date.short', { day: d.day, month, year: d.year ?? '' });
}

/** Sau mỗi lượt kể, một lần gọi AI: câu đáp, câu hỏi thêm (nếu cần), ngày nghe được, có chuyện thật để xin ảnh không.
 *  Lượt hỏi thăm không hỏi thêm: câu đáp nối luôn câu mở chuyện chính thành một câu nói (đỡ một lượt giọng).
 *  Không có AI, AI lỗi hay quá hạn: null, máy khách đi tiếp như cũ. Mọi câu AI viết đều qua suspect(). */
export async function turnAI(p: TurnInput, timeoutMs = TURN_AI_MS): Promise<TurnAI | null> {
  const last = p.story.at(-1)?.answer?.trim() ?? '';
  if (!last || p.q.topic === 'loi-nhan') return null;
  const checkin = p.q.part === 'checkin';
  const canFollow = !checkin && p.turn < p.max;
  const needDate = p.q.event !== 'none' && !p.dated;
  const r = await askJSON<TurnRaw>(turnSystem(p.lang, p.bot), JSON.stringify({
    person: { name: p.who.name, role: p.who.role },
    question: p.q.text, event: p.q.event,
    story: p.story.map((s) => ({ asked: s.asked, answer: s.answer.slice(0, 1500) })),
    can_follow: canFollow, need_date: canFollow && needDate,
  }), TURN_SCHEMA, 400, timeoutMs);
  if (!r) return null;
  const hay = [p.q.text, ...p.story.flatMap((s) => [s.asked, s.answer]), p.who.name, p.bot].join(' ');
  // Câu chuyện có trong dữ liệu nên được nói "vừa kể"; cuộc gọi trước, ảnh đã gửi thì không.
  const allow: Allow = { prevCall: false, ownStory: true, photos: false };
  const ok = (raw: unknown, max: number, what: string) => {
    const c = cleanLine(raw);
    if (!c || c.length > max) return null;
    const why = suspect(c, hay, allow, p.lang);
    if (why) { console.warn(`[call] bỏ ${what} "${c}": ${why}`); return null; }
    return c;
  };
  const reply = ok(r.reaction, 160, 'câu đáp'); // i18n-ok: nhãn chỉ để ghi log
  const date = validDate(r.day, r.month, r.year);
  const { self, Self } = selfOf(p.lang, p.who.role);
  const who = isParent(p.who.role) ? 'parent' : 'child';
  // Có ngày lần đầu: Mây nhắc lại ngắn cho chắc (câu mẫu, số lấy từ ngày đã kiểm).
  const confirm = date && needDate ? tServer(p.lang, `callScript.dateOk.${who}`, { date: dateText(p.lang, date), self, Self }) : null;
  let follow = canFollow ? ok(r.follow_up, 200, 'câu hỏi thêm') : null; // i18n-ok
  // Câu hỏi có event mà chưa nghe ngày: câu hỏi thêm phải hỏi ngày, AI quên thì dùng câu mẫu.
  if (canFollow && needDate && !date && !(follow && DATE_ASK[p.lang].test(follow))) follow = tServer(p.lang, `callScript.askDate.${who}`, { self, Self });
  if (checkin) {
    // Hỏi thăm không phải chuyện (không xin ảnh); vừa giới hạn đọc thì gộp câu mở chuyện chính vào cùng câu nói.
    const both = [reply, p.next].filter(Boolean).join(' ');
    const joined = !!p.next && both.length <= TTS_MAX;
    return { reply, follow: null, date, confirm, story: false, say: (joined ? both : reply) || null, joined };
  }
  const parts = [reply && follow && /[?？]$/.test(reply) ? null : reply, confirm, follow];
  let say = parts.filter(Boolean).join(' ');
  if (say.length > TTS_MAX) say = [confirm, follow].filter(Boolean).join(' ');
  if (say.length > TTS_MAX) say = follow ?? '';
  return { reply, follow, date, confirm, story: !!r.real_story, say: say || null };
}

// i18n-ok-begin: prompt chuyển lời nhắn (tiếng Anh, có ví dụ theo từng thứ tiếng).
// ---------- Lời nhắn khó nói ----------

const RELAY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nothing', 'recipients'],
  properties: {
    nothing: { type: 'boolean' },
    recipients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['member', 'said', 'push'],
        properties: { member: { type: 'integer' }, said: { type: 'string' }, push: { type: 'string' } },
      },
    },
  },
};

const RELAY_EXAMPLES: Record<Lang, string> = {
  vi: `said (sender An, role con; recipient role me): "An nhắn là dạo này nhớ mẹ lắm mà bận quá. Lát mẹ gọi hay nhắn cho An nhé."
push (sender role me; recipient An): "An ơi, dạo này mẹ nhớ An lắm đấy, gọi cho mẹ nhé"`,
  en: `said (sender An, role con; recipient role me): "An wanted me to tell you that An misses you a lot but has been so busy. Maybe give An a call later."
push (sender role me; recipient An): "An, I've been missing you lots lately. Give me a call, okay?"`,
  ko: `said (sender An, role con; recipient role me): "An님이 요즘 엄마가 많이 보고 싶은데 너무 바빴대요. 이따 An님께 전화 한번 해 보세요."
push (sender role me; recipient An): "An아, 요즘 엄마가 많이 보고 싶어. 전화 한번 줘"`,
};

function relaySystem(langs: Lang[], name = DEFAULT_MASCOT_NAME) {
  return named(`You help Mây, the mascot of the family app Sweet Home, pass on something a family member found hard to say in person. At the end of a voice call Mây asked them the question in "ask". "message" is what they answered (speech recognition text, may contain errors).

Decide:
1. nothing: true when they left no message (they said no, nothing, not now, or only small talk). Then recipients is empty.
2. recipients: who the message is for, by index in family_members. Use only members they named or clearly meant by a family word (mom, dad, my son, the kids, everyone). If there is a message but it is unclear for whom, use the indexes in default_recipients. Never invent anyone.
3. For each recipient write two lines in that recipient's language (field language of the member), only from what the sender actually said, adding nothing:
   - said: what Mây will say aloud to the recipient in their next call. Talk about the sender in the third person, warm and short (one or two sentences), then a gentle nudge to get in touch.
   - push: a phone notification in the sender's own voice (first person as the sender, the way the sender's family role talks), addressed to the recipient by their name, suggesting they get in touch. At most 120 characters.
Examples:
${langs.map((l) => RELAY_EXAMPLES[l]).join('\n')}

How Mây talks in said:
${langs.map((l) => ADDRESS[l]).join('\n')}

HARD RULES. Never add any fact, name, number, place or event that is not in the message. Never use time words like yesterday, today or last week, because the note is delivered later. Write names exactly as in the input. The role codes bo, me and con are not names. No em dash, no emoji, no quotation marks.`, name);
}
// i18n-ok-end

type RelayRaw = { nothing: boolean; recipients: Array<{ member: number; said: string; push: string }> };
export type RelayMember = { id: string; name: string; role: string; lang: string | null };
export type RelayPlan = { to: string; said: string; push: string | null };

/** Người nhận mặc định khi không rõ: con thì bố mẹ, bố mẹ thì các con; không có thì mọi người khác trong nhà. */
export function defaultRecipients(senderRole: string, family: RelayMember[]) {
  const want = isParent(senderRole) ? family.filter((m) => m.role === 'con') : family.filter((m) => isParent(m.role));
  return want.length ? want : family;
}

// i18n-ok-begin: từ gọi vai trong nhà (vi, en, ko) để đoán người nhận khi không có AI.
const ROLE_WORDS: Record<string, RegExp> = {
  bo: /(?<!\p{L})(bố|cha|tía|dad|daddy|father|아빠|아버지|아버님)(?!\p{L})/iu,
  me: /(?<!\p{L})(mẹ|má|mom|mommy|mum|mother|엄마|어머니|어머님)(?!\p{L})/iu,
  con: /(?<!\p{L})(con|các con|kids?|children|son|daughter|아들|딸|애들|자녀)(?!\p{L})/iu,
};
// i18n-ok-end
/** Không có AI: lấy những người được gọi đúng tên hoặc đúng vai trong lời nhắn (vai của chính người gửi không tính, vì đó thường là cách tự xưng). */
function mentioned(text: string, senderRole: string, family: RelayMember[]) {
  const t = text.toLowerCase().normalize('NFC');
  const word = (w: string) => new RegExp(`(?<!\\p{L})${w.toLowerCase().normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'u').test(t);
  return family.filter((m) => (m.name.trim() && word(m.name.trim())) || (m.role !== senderRole && ROLE_WORDS[m.role]?.test(t)));
}

/** Câu Mây nói lại khi không có câu AI dùng được: nhắc nguyên lời người gửi. */
function fallbackSaid(lang: Lang, role: string, from: string, text: string) {
  const t = cleanLine(text).replace(/[.!?…\s]+$/, '');
  const short = t.length > 170 ? `${t.slice(0, 169).trimEnd()}…` : t;
  return tServer(lang, `callScript.relay.said.${isParent(role) ? 'parent' : 'child'}`, { from, text: short, ...selfOf(lang, role) });
}

/** AI đọc câu trả lời ở bước lời nhắn: gửi cho ai, câu Mây sẽ nói lại, câu thông báo. Không AI thì gửi theo gợi ý mặc định (trừ khi chỉ là "không có gì"). */
export async function planRelays(p: { sender: RelayMember; family: RelayMember[]; ask: string; text: string; bot: string }, timeoutMs = 15_000): Promise<RelayPlan[]> {
  const text = p.text.trim();
  if (!text || !p.family.length) return [];
  const speak = langOf(p.sender.lang);
  const defaults = defaultRecipients(p.sender.role, p.family);
  const langs = [...new Set(p.family.map((m) => langOf(m.lang)))];
  const r = await askJSON<RelayRaw>(relaySystem(langs, p.bot), JSON.stringify({
    sender: { name: p.sender.name, role: p.sender.role },
    ask: p.ask, message: text.slice(0, 2000),
    family_members: p.family.map((m, index) => ({ index, name: m.name, role: m.role, language: LANG_NAME[langOf(m.lang)] })),
    default_recipients: defaults.map((m) => p.family.indexOf(m)),
  }, null, 1), RELAY_SCHEMA, 1500, timeoutMs);
  if (r?.nothing) return [];
  if (!r && relayNone(text, speak)) return [];
  const picks: Array<{ m: RelayMember; said?: string; push?: string }> = [];
  for (const x of r?.recipients ?? []) {
    const m = p.family[Math.round(Number(x?.member))];
    if (m && !picks.some((y) => y.m.id === m.id)) picks.push({ m, said: x.said, push: x.push });
  }
  // AI không chạy: ai được gọi tên hay gọi vai thì gửi người đó (lời nhắn khó nói không nên tới tay người khác); không rõ thì theo gợi ý.
  // AI chạy mà không chọn được ai: theo gợi ý.
  if (!picks.length) {
    const called = r ? [] : mentioned(text, p.sender.role, p.family);
    picks.push(...(called.length ? called : defaults).map((m) => ({ m })));
  }
  const names = p.family.map((m) => m.name).join(' ');
  return picks.map(({ m, said, push }) => {
    const lang = langOf(m.lang);
    const hay = `${text} ${p.sender.name} ${m.name} ${names} ${p.bot}`;
    const allow: Allow = { prevCall: false, ownStory: true, photos: false, message: true };
    const ok = (raw: unknown, max: number, what: string) => {
      const c = cleanLine(raw);
      if (!c || c.length > max) return null;
      const why = suspect(c, hay, allow, lang);
      if (why) { console.warn(`[call] bỏ ${what} "${c}": ${why}`); return null; }
      return c;
    };
    return { to: m.id, said: ok(said, 280, 'câu chuyển lời') ?? fallbackSaid(lang, m.role, p.sender.name, text), push: ok(push, 160, 'câu thông báo') }; // i18n-ok
  });
}

// Mỗi cuộc gọi chỉ một lượt rút lời nhắn chạy cùng lúc (máy khách gửi lại khi mạng chập).
const relaying = new Set<string>();

/** Câu trả lời ở bước lời nhắn vừa tới: rút người nhận, lưu mỗi người một hàng relays. Cuộc gọi đã chốt thì báo luôn cho người nhận. */
export async function saveRelays(call: { id: string; family_id: string; member_id: string }, ans: { question: string; transcript: string | null; media: string | null }) {
  if (!ans.transcript?.trim() || relaying.has(call.id)) return;
  relaying.add(call.id);
  try {
    const { rows: had } = await pool.query('select 1 from relays where call_id = $1 limit 1', [call.id]);
    if (!had.length) {
      const { rows: members } = await pool.query('select id, name, role, lang from members where family_id = $1 order by created_at', [call.family_id]);
      const sender = members.find((m) => m.id === call.member_id);
      if (!sender) return;
      const plans = await planRelays({ sender, family: members.filter((m) => m.id !== sender.id), ask: ans.question, text: ans.transcript, bot: await mascotName(call.family_id) });
      for (const x of plans) {
        await pool.query(
          `insert into relays (id, family_id, call_id, from_id, to_id, transcript, media, said, push) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (call_id, to_id) do nothing`,
          [randomUUID(), call.family_id, call.id, sender.id, x.to, ans.transcript, ans.media, x.said, x.push]);
      }
      if (plans.length) console.log(`[call] lời nhắn cuộc gọi ${call.id.slice(0, 8)}: ${plans.length} người nhận`);
    }
    // Cuộc gọi đã chốt (câu trả lời tới sau /finish, hoặc AI rút xong sau đó) thì báo ngay; chưa chốt thì afterCall báo.
    const { rows: [c] } = await pool.query('select status from calls where id = $1', [call.id]);
    if (c?.status === 'done') await pushRelays(call.id);
  } finally {
    relaying.delete(call.id);
  }
}

/** Mây Live, ngay sau khi /finish chốt: rút người nhận từ đúng lời của ô lời nhắn (lời dài nhất, relayAnswer). Lệnh kết thúc đi sau mọi lượt
 *  trong hàng chờ nên lúc này ô lời nhắn đã đủ; rút khi từng lượt tới thì câu "dạ có" trước lời thật có thể thành lời nhắn. Không lưu tệp tiếng. */
async function liveRelays(call: { id: string; family_id: string; member_id: string }) {
  try {
    const a = await relayAnswer(call.id);
    if (a) await saveRelays(call, { ...a, media: null });
  } catch (e) { console.error('[call] lỗi lưu lời nhắn:', (e as Error).message); }
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

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** Câu SQL của bước rút ngày vào lịch (saveDates), xuất ra để DB giả trong test khớp đúng từng câu. */
export const DATES_SQL = {
  call: 'select * from calls where id = $1',
  answers: 'select idx, turn, question, transcript from call_answers where call_id = $1 and topic <> all($2::text[]) order by idx, turn',
  events: 'select kind, title, day, month, year from events where family_id = $1',
  member: 'select name, role, lang from members where id = $1',
  langs: 'select lang from members where family_id = $1',
  insert: `insert into events (id, family_id, member_id, kind, title, day, month, year, lunar, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
};

/** Thứ tiếng của nhà: thứ tiếng nhiều người dùng nhất trong nhà (chưa chọn là tiếng Việt); hoà thì theo người kể. */
async function homeLang(fid: string, speaker: Lang, db: Db): Promise<Lang> {
  const { rows } = await db.query(DATES_SQL.langs, [fid]);
  const n: Record<Lang, number> = { vi: 0, en: 0, ko: 0 };
  for (const r of rows) n[langOf(r.lang)]++;
  const top = Math.max(...Object.values(n));
  return n[speaker] === top ? speaker : LANGS.find((l) => n[l] === top) ?? speaker;
}

export async function saveDates(callId: string, db: Db = pool) {
  const { rows: [call] } = await db.query(DATES_SQL.call, [callId]);
  if (!call) return;
  const script: CallScript = JSON.parse(call.script);
  // Đọc cả các lượt hỏi thêm (ngày thường nằm ở câu trả lời cho "hôm đó là ngày nào"). Lời nhắn khó nói và câu hỏi thăm
  // (NO_EPISODE_TOPICS) không bao giờ vào lịch chung.
  const { rows: answers } = await db.query(DATES_SQL.answers, [callId, [...NO_EPISODE_TOPICS]]);
  const said = answers.filter((a) => (a.transcript ?? '').trim());
  if (!said.length) return;
  const { rows: existing } = await db.query(DATES_SQL.events, [call.family_id]);
  const { rows: [who] } = await db.query(DATES_SQL.member, [call.member_id]);
  // Người kể nói thứ tiếng của bộ câu hỏi; tên ngày và ghi chú theo thứ tiếng của nhà (cả nhà cùng xem lịch).
  const speak = langOf(script.lang ?? who?.lang);
  const home = await homeLang(call.family_id, speak, db);

  let found: Found[] | null = null;
  const ai = await askJSON<{ events: Found[] }>(datesSystem(speak, home), JSON.stringify({
    speaker: { name: who?.name, role: who?.role }, calendar: existing,
    call: said.map((a) => ({ question: a.question, answer: a.transcript })),
  }, null, 1), DATES_SCHEMA, 2000);
  if (ai?.events) found = ai.events;
  else found = regexDates(said.map((a) => ({ transcript: a.transcript, event: script.questions[a.idx]?.event ?? 'none' })), speak, home);

  // Chuyện chưa đồng ý chia sẻ (calls.shared đã chốt lúc này: /finish đi sau /share, /keep trong cùng hàng chờ): lịch chung chỉ nhận
  // ngày, tên theo loại và ghi chú soạn sẵn, không có chữ AI viết từ chuyện; ngày đáng nhớ và ngày khác thì bỏ hẳn.
  const priv = !call.shared;
  for (const e of found) {
    const kind = ['birthday', 'wedding', 'anniversary', 'memory', 'other'].includes(e.kind) ? e.kind : 'other';
    if (priv && (kind === 'memory' || kind === 'other')) continue;
    const day = Math.round(e.day), month = Math.round(e.month);
    const year = e.year && e.year >= 1900 && e.year <= new Date().getFullYear() ? Math.round(e.year) : null;
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) continue;
    if (existing.some((x) => x.day === day && x.month === month && (x.kind === e.kind || x.title === e.title))) continue;
    const title = priv ? KIND_TITLE(kind, home) ?? tServer(home, 'callEvent.memory')
      : String(e.title || KIND_TITLE(e.kind, home) || tServer(home, 'callEvent.memory')).replace(/\s*[—–]\s*/g, ', ').slice(0, 80);
    await db.query(DATES_SQL.insert,
      [randomUUID(), call.family_id, call.member_id, kind,
        title, day, month, year, !priv && e.note ? String(e.note).slice(0, 500) : tServer(home, 'callEvent.note', { name: who?.name ?? '' }).trim(), call.member_id],
    );
    existing.push({ kind: e.kind, title, day, month, year });
    console.log(`[call] thêm vào lịch: ${title} ${day}/${month}${year ? '/' + year : ''}`);
  }
}

/** Người kể chọn giữ riêng (hay hết giờ) khi cuộc gọi chưa chốt: gỡ lời đồng ý của lần thử trước (tải lại giữa cuộc gọi rồi gọi tiếp
 *  cùng cuộc gọi). Cuộc gọi đã chốt thì không đổi gì: từ đó chỉ nút chia sẻ mới chia sẻ được. */
export const KEEP_SQL = `update calls set shared = false where id = $1 and member_id = $2 and status = 'ready'`;
export async function keepCall(callId: string, memberId: string, db: Db = pool): Promise<boolean> {
  return ((await db.query(KEEP_SQL, [callId, memberId])).rowCount ?? 0) > 0;
}

async function afterCall(callId: string) {
  // Lời nhắn khó nói: báo cho người nhận trước (nhanh), rồi mới tới lịch và podcast.
  try { await pushRelays(callId); } catch (e) { console.error('[call] lỗi báo lời nhắn:', (e as Error).message); }
  try { await saveDates(callId); } catch (e) { console.error('[call] lỗi rút ngày:', (e as Error).message); }
  // Sổ nhớ và tín hiệu Mây nối người (server/memory.ts).
  try { await extractCall(callId, { signals: true }); } catch (e) { console.error('[memory] lỗi rút sổ nhớ:', (e as Error).message); }
  try { await buildPodcastsForCall(callId); } catch (e) { console.error('[call] lỗi podcast:', (e as Error).message); }
}

// ---------- Đường dẫn ----------

type Fn = (req: any, res: express.Response) => Promise<unknown>;
const h = (fn: Fn) => (req: any, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json({ error: err.message || tReq('error.server') });
  });

/** Hạn chờ AI soạn bộ câu hỏi lúc nhấc máy (máy khách xin ngay khi chuông reo nên thường đã có trước khi bấm). */
const START_AI_MS = 7000;

// Giới hạn tần suất: người có mã máy không gọi dồn được để đốt ngân sách Gemini, OpenAI. Máy khách gặp 429 thì dùng câu mẫu, chữ phụ đề,
// hoặc (câu trả lời) để hàng chờ thử lại sau, nên người dùng thật không thấy lỗi.
const byMember = (req: express.Request) => (req as express.Request & { member: { id: string } }).member.id;
const limitStart = limitBy({ name: 'call-start', per: new Limit(30, 3600e3), key: byMember });
const limitAnswer = limitBy({ name: 'call-answer', per: new Limit(30, 10 * 60e3), key: byMember });
// Mây Live: một cuộc gọi 15 phút không có số câu hỏi thêm cố định, mỗi lượt kể một lần gửi; lượt Live không chép lời, không gọi AI.
const limitAnswerLive = limitBy({ name: 'call-answer-live', per: new Limit(120, 10 * 60e3), key: byMember });
/** Chọn trần theo ?live=1 trên đường dẫn (đọc được trước multer, thân chưa có): không có thì limitAnswer như cũ. ?live=1 chỉ mở được nhánh Live (/answer). */
const limitAnswerBy: express.RequestHandler = (req, res, next) => (req.query.live === '1' ? limitAnswerLive : limitAnswer)(req, res, next);
const limitReply = limitBy({ name: 'call-reply', per: new Limit(20, 10 * 60e3), key: byMember });
const limitTts = limitBy({ name: 'call-tts', per: new Limit(150, 10 * 60e3), key: byMember });
// Nhiều thành viên giả cùng một nơi: thêm trần theo IP (cả nhà dùng chung wifi vẫn dư).
const limitTtsIp = limitBy({ name: 'call-tts-ip', per: new Limit(400, 10 * 60e3) });
const limitPhoto = limitBy({ name: 'call-photo', per: new Limit(60, 10 * 60e3), key: byMember });
const limitHear = limitBy({ name: 'call-hear', per: new Limit(20, 10 * 60e3), key: byMember });
// AI soạn bộ câu mới: mỗi người 4 lần mỗi giờ (đổi ngôn ngữ, đổi tên linh vật), quá thì dùng bộ câu mẫu chứ không báo lỗi.
const aiScripts = new Limit(4, 3600e3);

/** Lượt kể máy khách gửi: 0 là câu chính, 1..MAX_STORY_FOLLOW là câu hỏi thêm. */
const turnOf = (v: unknown) => Math.min(MAX_STORY_FOLLOW, Math.max(0, Math.round(Number(v)) || 0));
/** Câu hỏi thêm máy khách gửi kèm (đúng câu Mây đã hỏi ở lượt đó). */
const askedOf = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
const yes = (v: unknown) => v === true || v === 'true' || v === '1';
/** Mã hàng cố định theo khoá máy khách gửi (gửi lại thì trùng mã, không thêm hàng). */
const uuidOf = (s: string) => { const x = createHash('sha256').update(s).digest('hex'); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`; };

/** Các lượt trước của câu chuyện: máy khách gửi kèm (có lời chép ngay), thiếu thì lấy trong DB (hàng chờ có thể chưa gửi tới). */
async function turnInput(call: { id: string; member_id: string; family_id: string }, script: CallScript, idx: number, turn: number, asked: string, transcript: string, body: Record<string, unknown>): Promise<TurnInput> {
  const q = script.questions[idx];
  let prior: Array<{ q?: unknown; a?: unknown }> = [];
  try { const v = typeof body.prior === 'string' ? JSON.parse(body.prior) : body.prior; if (Array.isArray(v)) prior = v.slice(0, MAX_STORY_FOLLOW); } catch {}
  const [{ rows: prev }, { rows: [m] }] = await Promise.all([
    pool.query('select turn, question, transcript from call_answers where call_id = $1 and idx = $2 and turn < $3', [call.id, idx, turn]),
    pool.query('select m.name, m.role, f.mascot_name from members m join families f on f.id = m.family_id where m.id = $1', [call.member_id]),
  ]);
  const story: TurnInput['story'] = [];
  for (let k = 0; k < turn; k++) {
    const d = prev.find((x) => x.turn === k), c = prior[k];
    const a = String((typeof c?.a === 'string' && c.a.trim()) || d?.transcript || '').slice(0, 1500);
    story.push({ asked: d?.question || askedOf(c?.q) || (k === 0 ? q.text : ''), answer: a });
  }
  story.push({ asked, answer: transcript.slice(0, 1500) });
  return {
    lang: langOf(script.lang ?? reqLang()), who: { name: m?.name ?? '', role: m?.role ?? 'con' }, bot: m?.mascot_name || DEFAULT_MASCOT_NAME,
    q, story, turn, max: script.follow ?? MAX_STORY_FOLLOW, dated: yes(body.dated),
    next: q.part === 'checkin' ? script.questions.find((x) => x.part === 'story')?.text ?? null : null,
  };
}

/** AI sau một lượt kể, rồi đọc sẵn đúng câu Mây sẽ nói bằng nhà cung cấp máy khách đã chốt (câu có hỏi thêm thì không coi là câu phụ). */
export async function turnReply(input: TurnInput, memberId: string, provider: Provider | null, speak: typeof speech = speech): Promise<TurnAI | null> {
  const ai = await turnAI(input);
  // Câu có hỏi thêm, hay câu hỏi thăm đã gộp câu mở chuyện chính, là câu hỏi của cuộc gọi: không coi là câu phụ (câu phụ bị bỏ khi ngân sách còn ít).
  if (ai?.say && provider) void speak(ai.say, memberId, { optional: !ai.follow && !ai.joined, provider });
  return ai;
}

/** Ba byte, tám byte hay mười hai byte đầu tệp: JPEG, PNG, WebP. Loại khác (HEIC, GIF, tệp giả đuôi ảnh) thì null. */
export function imageKind(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

async function sniff(file: string) {
  const fh = await open(file, 'r');
  try { const { buffer, bytesRead } = await fh.read(Buffer.alloc(16), 0, 16, 0); return imageKind(buffer.subarray(0, bytesRead)); } finally { await fh.close(); }
}

// Câu xin phép chia sẻ, hai câu đáp và câu tạm biệt (mọi vai, mọi thứ tiếng), gọn khoảng trắng như chữ máy khách gửi; tính một lần khi cần.
let mustSet: Set<string> | null = null;
const mustVoice = (text: string) => (mustSet ??= new Set(LANGS.flatMap((lang) => CALL_ROLES.flatMap((role) => {
  const L = callLines(role, (k, v) => tServer(lang, k, v));
  return [L.share, L.shareYes, L.shareNo, L.bye];
})).map((s) => s.replace(/\s+/g, ' ').trim()))).has(text);

/** Giọng cho một câu (POST /call/tts). provider: nhà cung cấp đã chốt lúc nhấc máy, dùng đúng nhà đó và không tự đổi giữa chừng.
 *  kind 'fixed': lấy từ kho; riêng câu xin phép chia sẻ, hai câu đáp và câu tạm biệt chưa có thì đọc ngay một lần như câu bắt buộc
 *  rồi nằm trong kho mãi; câu cố định khác (máy khách xin trước, có khi không nói) chỉ lấy từ kho. kind 'reply': câu đáp theo nội dung,
 *  chỉ đọc khi còn dư ngân sách. */
export async function ttsFor(body: { text?: unknown; kind?: unknown; provider?: unknown }, who: string): Promise<{ url: string | null; reason?: string; off?: boolean }> {
  const text = String(body.text || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > TTS_MAX) return { url: null, reason: 'fail' };
  const kind = body.kind === 'fixed' || body.kind === 'reply' ? body.kind : undefined;
  const asked = body.provider;
  const picked = pickProvider();
  const provider: Provider = asked === 'openai' || asked === 'gemini' ? asked : picked === 'device' ? defaultProvider() : picked;
  const hit = cachedSpeech(text, provider);
  if (hit) return { url: hit };
  // Nạp sẵn lúc khởi động hụt (ngân sách ngày đã dưới 30%, một lần đọc lỗi): câu xin phép, câu đáp, câu tạm biệt đọc ngay ở đây,
  // không thì bước xin phép chỉ còn chữ và chuông. Câu cố định khác thiếu thì thôi (không tốn ngân sách cho câu có khi không nói).
  if (kind === 'fixed' && !mustVoice(text)) return { url: null, reason: 'skip' };
  if (!providerOn(provider)) return { url: null, off: true, reason: 'nokey' };
  const gate = gateOf(provider);
  const why = gate.blocked(kind === 'reply');
  if (why) return { url: null, reason: kind === 'reply' && why === 'budget' && !gate.blocked() ? 'skip' : why };
  const p = speech(text, who, { optional: kind === 'reply', provider });
  const url = p ? await p : null;
  return url ? { url } : { url: null, reason: gate.blocked() ?? 'fail' };
}

/** Lời nhắn người khác gửi cho người này, chưa chuyển (Mây nói ở cuối cuộc gọi). Chỉ lời nhắn của cuộc gọi đã xong. */
export async function pendingRelays(memberId: string): Promise<CallRelay[]> {
  const { rows } = await pool.query(
    `select r.id, r.said from relays r left join calls c on c.id = r.call_id
     where r.to_id = $1 and r.delivered_at is null and coalesce(r.said, '') <> '' and (r.call_id is null or c.status = 'done')
     order by r.created_at limit 3`, [memberId]);
  return rows.map((x) => ({ id: x.id, said: x.said }));
}

export function callRouter(upload: multer.Multer) {
  const r = express.Router();
  const media = (f?: Express.Multer.File) => (f ? `/media/${f.filename}` : null);

  // Thẻ mời gọi: người mới được mời gọi thử sau TRIAL_AFTER_MIN phút; sau đó mỗi tuần một lần trong khung cuối tuần.
  r.get('/call/due', h(async (req, res) => {
    const { rows: [m] } = await pool.query(
      `select extract(epoch from now() - created_at) / 60 as minutes,
        exists(select 1 from calls where member_id = $1 and status = 'done') as had,
        exists(select 1 from calls where member_id = $1 and week = $2 and status = 'done' and not trial) as week_done
       from members where id = $1`, [req.member.id, weekKey()]);
    const { due, trial } = dueState({ minutesSinceJoin: Number(m?.minutes ?? 0), hadDone: !!m?.had, doneThisWeek: !!m?.week_done, callTime: callTime() });
    res.json({ due, done: !!m?.week_done, trial });
  }));

  // Nhấc máy: lấy bộ câu hỏi của tuần (soạn một lần, gọi lại thì dùng tiếp).
  r.post('/call/start', limitStart, h(async (req, res) => {
    const { id: mid, family_id: fid } = req.member;
    const week = weekKey();
    const c = await context(mid, fid);
    const first = c.doneCalls.length === 0;
    const { rows } = await pool.query(`select id, script from calls where member_id = $1 and week = $2 and status = 'ready' order by created_at desc limit 1`, [mid, week]);
    const old: CallScript | null = rows[0] ? JSON.parse(rows[0].script) : null;
    const relays = await pendingRelays(mid);
    if (scriptReusable(old, c, first)) return res.json({ id: rows[0].id, script: old, relays });
    // Người dùng đã bấm Nghe máy và đang chờ: nạp dữ liệu lớn dần (chỉ khi soạn mới, bộ câu dùng lại không cần) rồi AI soạn;
    // cả hai quá 7 giây thì dùng bộ câu mẫu, không để màn hình im lặng.
    const t0 = Date.now();
    c.extras = await loadScriptExtras({ id: mid, family_id: fid }, c.lang)
      .catch((e) => { console.warn('[call] không nạp được dữ liệu soạn câu:', (e as Error).message); return undefined; });
    const aiMs = Math.max(1000, START_AI_MS - (Date.now() - t0));
    const script = first
      ? (aiScripts.take(mid) ? await aiScript(c, week, aiMs, { trial: true }) : null) ?? firstScript(c)
      : (aiScripts.take(mid) ? await aiScript(c, week, aiMs) : null) ?? templateScript(c, week);
    const id = randomUUID();
    // Cuộc gọi mới chưa đồng ý chia sẻ: bước xin phép cuối chuyện chính (POST /call/:id/share) mới bật shared.
    await pool.query('insert into calls (id, family_id, member_id, week, script, shared, trial) values ($1,$2,$3,$4,$5,false,$6)', [id, fid, mid, week, JSON.stringify(script), first]);
    // Sự thật AI đã dùng khi soạn: lần sau ưu tiên điều chưa nhắc (pickFacts). Lỗi thì thôi, không chặn cuộc gọi.
    if (script.used?.length) {
      await pool.query('update memory_facts set used_at = now(), used_count = used_count + 1 where id = any($1) and family_id = $2', [script.used, fid])
        .catch((e) => console.warn('[call] không đánh dấu được sự thật đã dùng:', (e as Error).message));
    }
    res.json({ id, script, relays });
    // Giọng đọc do máy khách xin khi cần (lời chào + câu đầu một lần, mỗi câu sau xin trước một câu), máy chủ không tự đọc trước.
  }));

  // Một lượt kể: idx là câu chuyện, turn 0 câu chính, 1..MAX_STORY_FOLLOW là câu hỏi thêm (question là đúng câu Mây đã hỏi).
  // Gửi lại (hàng chờ thử lại) thì thay hàng cũ cùng (idx, turn), không bao giờ thành hai hàng.
  r.post('/call/:id/answer', limitAnswerBy, upload.single('file'), h(async (req, res) => {
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    // multer đã ghi tệp trước khi kiểm: từ chối thì xoá luôn, không để tệp mồ côi.
    const drop = () => (req.file ? unlink(req.file.path).catch(() => {}) : undefined);
    if (!call) { await drop(); return res.status(404).json(errorBody('call_not_found')); }
    const script: CallScript = JSON.parse(call.script);
    // Mây Live (kịch bản v3, live=1): máy đã chép lời, Mây đã đáp trong cuộc gọi, nên không chép lời, không gọi AI; lượt không trần 4.
    // Ô, lượt, chủ đề, thẻ câu hỏi qua lớp lọc: liveAnswerRow. Ô lời nhắn giữ lời dài nhất và rút người nhận lúc chốt (/finish).
    if (script.v === 3 && yes(req.body?.live)) {
      const row = liveAnswerRow(script, req.body, await liveCheckFor(call));
      if (!row) { await drop(); return res.status(400).json(errorBody('question_not_found')); }
      const relay = row.topic === 'loi-nhan';
      // Tiếng của lời nhắn khó nói không giữ lại (hàng call_answers không có media như đường cũ; relays.media chưa nơi nào đọc, tệp không hàng nào trỏ tới thì xoá người không dọn được).
      const stored = await storeLiveAnswer(call, row, relay ? null : media(req.file));
      if (relay) await drop();
      res.json({ ok: true, transcript: row.transcript, reply: null, ai: null });
      // Tới sau khi đã chốt (máy khách gửi lại): lời nhắn rút ngay, chuyện thì dựng lại tập và rút lại sổ nhớ như đường cũ.
      if (relay) { if (stored && call.status === 'done') void saveRelays(call, { question: row.question, transcript: row.transcript, media: null }).catch((e) => console.error('[call] lỗi lưu lời nhắn:', (e as Error).message)); }
      else if (call.status === 'done') { rebuildCallSoon(call.id); extractSoon(call.id); }
      return;
    }
    // ?live=1 (trần riêng 120) chỉ cho lượt Live ở trên: không mở đường cũ, nơi có chép lời và AI.
    if (req.query.live === '1') { await drop(); return res.status(400).json(errorBody('question_not_found')); }
    const idx = Number(req.body.idx);
    const q = script.questions[idx];
    if (!q) { await drop(); return res.status(400).json(errorBody('question_not_found')); }
    // Bản app cũ không gửi turn: giữ đúng cách cũ (một câu đáp, không hỏi thêm).
    const fresh = req.body.turn !== undefined;
    const relay = q.topic === 'loi-nhan';
    const turn = relay ? 0 : turnOf(req.body.turn);
    const asked = turn === 0 ? q.text : askedOf(req.body.question) || q.text;
    const aid = randomUUID();
    let transcript = String(req.body.transcript || '').trim().slice(0, 4000) || null;
    // Lời nhắn khó nói chỉ người nhận được nghe: bản ghi nằm ở bảng relays, hàng call_answers không có media (podcast chỉ lấy hàng có media).
    const file = media(req.file);
    await pool.query('delete from call_answers where call_id = $1 and idx = $2 and turn = $3', [call.id, idx, turn]);
    await pool.query(
      'insert into call_answers (id, call_id, family_id, member_id, idx, turn, question, topic, media, transcript, seconds) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [aid, call.id, call.family_id, call.member_id, idx, turn, asked, q.topic, relay ? null : file, transcript, Number(req.body.seconds) || null],
    );
    // Máy không chép được lời (iPhone hay bị): nhờ Gemini (dự phòng OpenAI) chép theo thứ tiếng của cuộc gọi, quá 8 giây thì thôi. Chép được thì đáp luôn.
    let reply: string | null = null;
    let ai: TurnAI | null = null;
    if (!transcript && req.file) {
      transcript = (await transcribe(path.join(MEDIA_DIR, req.file.filename), req.member.id, 8000, langOf(script.lang ?? reqLang())))?.slice(0, 4000) ?? null;
      if (transcript) {
        await pool.query('update call_answers set transcript = $2 where id = $1', [aid, transcript]);
        if (!relay && fresh && useGemini()) {
          ai = await turnReply(await turnInput(call, script, idx, turn, asked, transcript, req.body), req.member.id, providerOf(req.body.provider));
          reply = ai?.reply ?? null;
        } else if (!relay) {
          const { rows: [m] } = await pool.query('select name, role from members where id = $1', [call.member_id]);
          reply = await quickReply(m, asked, transcript, req.member.id, providerOf(req.body.provider));
        }
      }
    }
    res.json({ ok: true, transcript, reply, ai });
    if (relay) void saveRelays(call, { question: asked, transcript, media: file }).catch((e) => console.error('[call] lỗi lưu lời nhắn:', (e as Error).message));
    // Câu trả lời tới sau khi cuộc gọi đã chốt (máy khách gửi lại): dựng lại tập và rút lại sổ nhớ của cuộc gọi cho đủ câu.
    else if (call.status === 'done') { rebuildCallSoon(call.id); extractSoon(call.id); }
  }));

  // Nghe xong một lượt: một lần gọi AI trả câu đáp, câu hỏi thêm (nếu cần), ngày nghe được, có chuyện để xin ảnh không (TurnAI).
  // Không có khoá hay quá hạn thì ai null, máy khách dùng câu mẫu và đi tiếp như cũ. Bản app cũ (không gửi turn) chỉ nhận câu đáp như trước.
  r.post('/call/:id/reply', limitReply, h(async (req, res) => {
    const said = String(req.body.transcript || '').trim().slice(0, 1500);
    if (!said) return res.json({ text: null, ai: null });
    const { rows: [call] } = await pool.query('select c.*, m.name, m.role from calls c join members m on m.id = c.member_id where c.id = $1 and c.member_id = $2', [req.params.id, req.member.id]);
    if (!call) return res.status(404).json(errorBody('call_not_found'));
    const script = JSON.parse(call.script) as CallScript;
    const idx = Number(req.body.idx);
    const q = script.questions[idx];
    const provider = providerOf(req.body.provider);
    if (req.body.turn === undefined || !q || q.topic === 'loi-nhan' || !useGemini()) {
      return res.json({ text: await quickReply(call, q?.text ?? '', said, req.member.id, provider), ai: null });
    }
    const turn = turnOf(req.body.turn);
    const asked = turn === 0 ? q.text : askedOf(req.body.question) || q.text;
    const ai = await turnReply(await turnInput(call, script, idx, turn, asked, said, req.body), req.member.id, provider);
    res.json({ text: ai?.reply ?? null, ai });
  }));

  // Nhấc máy là hỏi trước một lần: cả cuộc gọi dùng giọng OpenAI, Gemini hay giọng máy ('device'). Con số dùng/hạn mức chỉ trả cho thành viên (đã qua auth).
  r.get('/call/tts-status', h(async (req, res) => {
    const s = ttsStatus();
    res.json({ ok: s.ok, provider: s.provider, reason: s.reason, ...(req.member ? { used: s.used, limit: s.limit } : {}) });
  }));

  // Giọng đọc của Mây (ttsFor): trả về đường dẫn file âm thanh. url null thì kèm reason (budget, cooldown, nokey, skip, fail) để máy hiện chữ.
  r.post('/call/tts', limitTts, limitTtsIp, h(async (req, res) => res.json(await ttsFor(req.body, req.member.id))));

  // Ảnh cho một câu chuyện (idx): mỗi ảnh một hàng vault có story = idx. Máy khách gửi từng ảnh một (hàng chờ thử lại riêng từng ảnh),
  // kèm key để gửi lại không thành hai hàng. Chỉ nhận JPEG, PNG, WebP thật (đọc byte đầu tệp, không tin đuôi hay kiểu máy khách báo).
  r.post('/call/:id/photo', limitPhoto, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 12 }]), h(async (req, res) => {
    const got = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const files = [...(got.file ?? []), ...(got.files ?? [])];
    const { rows: [call] } = await pool.query('select * from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
    if (!call || !files.length) {
      await Promise.all(files.map((f) => unlink(f.path).catch(() => {})));
      return res.status(400).json(errorBody('photo_missing'));
    }
    const script: CallScript = JSON.parse(call.script);
    const idx = Number(req.body.idx);
    const q = Number.isInteger(idx) ? script.questions[idx] : undefined;
    const story = q && q.topic !== 'loi-nhan' ? idx : null;
    const key = /^[\w-]{6,64}$/.test(String(req.body.key ?? '')) ? String(req.body.key) : null;
    let saved = 0, bad = 0;
    for (const [i, f] of files.entries()) {
      const kind = await sniff(f.path).catch(() => null);
      if (!kind) { bad++; await unlink(f.path).catch(() => {}); continue; }
      // Đuôi tệp theo đúng loại ảnh thật (ảnh thu nhỏ và podcast nhận ảnh theo đuôi).
      let name = f.filename;
      if (!(kind === 'jpg' ? /\.jpe?g$/i : new RegExp(`\\.${kind}$`, 'i')).test(name)) {
        name = `${name.replace(/\.[^.]*$/, '')}.${kind}`;
        await rename(f.path, path.join(path.dirname(f.path), name));
      }
      const id = key ? uuidOf(`${call.id}|${key}|${i}`) : randomUUID();
      const { rowCount } = await pool.query(
        'insert into vault (id, family_id, member_id, media, caption, call_id, story) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing',
        [id, call.family_id, call.member_id, `/media/${name}`, q ? tReq(`topic.${q.topic}`) : null, call.id, story]);
      if (rowCount) saved++;
      else await unlink(path.join(path.dirname(f.path), name)).catch(() => {});
    }
    if (!saved && bad) return res.status(400).json(errorBody('photo_type'));
    res.json({ ok: true, saved });
  }));

  // Bước xin ảnh: máy không tự chép được lời (iPhone cài app hay vậy) thì chép câu trả lời ngắn để biết người nghe có nói "để sau" không.
  // Không lưu hàng nào, xoá tệp ngay sau khi chép. Chép quá 5 giây thì trả null, máy khách chờ người nghe bấm nút.
  r.post('/call/:id/hear', limitHear, upload.single('file'), h(async (req, res) => {
    try {
      const { rows: [call] } = await pool.query('select script from calls where id = $1 and member_id = $2', [req.params.id, req.member.id]);
      if (!call || !req.file) return res.status(404).json(errorBody('call_not_found'));
      const script: CallScript = JSON.parse(call.script);
      const text = await transcribe(req.file.path, req.member.id, 5000, langOf(script.lang ?? reqLang()));
      res.json({ transcript: text?.slice(0, 300) ?? null });
    } finally {
      if (req.file) await unlink(req.file.path).catch(() => {});
    }
  }));

  // Người kể đồng ý chia sẻ chuyện của cuộc gọi cho cả nhà (bước xin phép cuối chuyện chính). Không có thân, gửi lại được.
  // Qua shareCall: lời đồng ý tới sau khi tập đã dựng thì tập, sự thật vẫn sang cả nhà và người được nhắc vẫn được báo.
  r.post('/call/:id/share', h(async (req, res) => {
    if (!(await shareCall(String(req.params.id), req.member.id))) return res.status(404).json(errorBody('call_not_found'));
    res.json({ ok: true });
  }));

  // Người kể giữ riêng (nói không, bấm Giữ riêng hay hết giờ): cuộc gọi chưa chốt thì gỡ lời đồng ý trước đó (keepCall). Gửi lại được, luôn ok.
  r.post('/call/:id/keep', h(async (req, res) => {
    await keepCall(String(req.params.id), req.member.id);
    res.json({ ok: true });
  }));

  // Mây đã chuyển xong một lời nhắn cho người đang nghe.
  r.post('/call/:id/relay/:rid/heard', h(async (req, res) => {
    await pool.query(
      `update relays set delivered_call_id = $1, delivered_at = now()
       where id = $2 and to_id = $3 and delivered_at is null and exists (select 1 from calls where id = $1 and member_id = $3)`,
      [req.params.id, req.params.rid, req.member.id]);
    res.json({ ok: true });
  }));

  // Gọi lặp được (máy khách thử lại khi mạng chập): chỉ lần đầu chốt cuộc gọi và chạy việc sau cuộc gọi, các lần sau chỉ trả ok.
  // Mây Live gửi kèm (multipart của hàng chờ, nên có upload.none()) câu hẹn hook và các câu Mây đã nói may: finishLive kiểm, ghi câu hẹn
  // và log câu nghi bịa trước khi chốt, lỗi chỉ ghi log; chốt xong thì rút lời nhắn khó nói từ ô lời nhắn. Không có hai trường ấy thì như cũ.
  r.post('/call/:id/finish', upload.none(), h(async (req, res) => {
    const live = !!req.body && ('hook' in req.body || 'may' in req.body);
    if (live) await finishLive(String(req.params.id), req.member.id, req.body).catch((e) => console.error('[call-live] lỗi chốt cuộc gọi:', (e as Error).message));
    const { rowCount } = await pool.query(`update calls set status = 'done', done_at = now() where id = $1 and member_id = $2 and status = 'ready'`, [req.params.id, req.member.id]);
    res.json({ ok: true });
    if (rowCount) void afterCall(req.params.id);
    if (rowCount && live) void liveRelays({ id: String(req.params.id), family_id: req.member.family_id, member_id: req.member.id });
  }));

  // Ảnh của cuộc gọi chưa chia sẻ chỉ người kể thấy.
  r.get('/vault', h(async (req, res) => {
    const { rows } = await pool.query(
      `select * from vault where family_id = $1 and not exists (select 1 from calls c where c.id = vault.call_id and not c.shared and c.member_id <> $2)
       order by created_at desc limit 60`, [req.member.family_id, req.member.id]);
    res.json(rows.map((v) => ({ id: v.id, memberId: v.member_id, media: v.media, caption: v.caption, createdAt: v.created_at })));
  }));

  return r;
}
