// Sổ nhớ của Mây (20/11/2026): những điều Mây nghe được trong cuộc gọi và nhớ để nhắc lại khi gọi người khác.
// Sau mỗi cuộc gọi một lần gọi AI rút sự thật và tín hiệu; mỗi điều phải có câu gốc nằm trong câu trả lời, không thì bỏ.
// Lời nhắn khó nói (topic loi-nhan) và "điều chưa nói" (intro.unsaid) không bao giờ tới đây. Chi tiết: docs/may-moi.md.
// Kiểm bằng server/memory.test.ts (DB giả theo từng câu trong MEM_SQL, Gemini giả).
import { randomUUID } from 'node:crypto';
import { pool } from './db.ts';
import { askJSON, hasAI } from './ai.ts';
import { suspect } from './guard.ts';
import { langOf, type Lang } from './i18n.ts';
import { foldText, planSignals, queueSignals, SIGNAL_KINDS, type SignalKind, type SignalMember } from './may.ts';

export { foldText };

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// Mỗi câu một dòng: server/members.test.ts đọc các câu create table, add column để dựng lược đồ.
export async function migrateMemory(db: Db = pool) {
  await db.query(`
    create table if not exists memory_facts (
      id text primary key, family_id text not null references families(id),
      about_id text references members(id), source_id text not null references members(id),
      kind text not null, text text not null, text_en text not null, details jsonb not null default '{}'::jsonb,
      call_id text references calls(id) on delete cascade, answer_id text,
      visibility text not null default 'family', replacement_id text,
      created_at timestamptz not null default now(), used_at timestamptz, used_count int not null default 0
    );
    create index if not exists memory_facts_about on memory_facts (family_id, about_id);
    create index if not exists memory_facts_source on memory_facts (source_id);
  `);
}

export const FACT_KINDS = ['person', 'place', 'food', 'habit', 'like', 'worry', 'wish', 'milestone', 'occasion', 'health', 'relationship'] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export const OCCASION_KEYS = ['tet', 'trung-thu', 'noel', 'new-year', 'women-8-3', 'women-20-10', 'teachers-20-11', 'mothers-day', 'fathers-day', 'parents-day-kr', 'birthday', 'wedding'] as const;
export type OccasionKey = (typeof OCCASION_KEYS)[number];
export const MAX_FACTS_PER_CALL = 12;
export const MAX_SIGNALS_PER_CALL = 4;
export type Visibility = 'family' | 'self';

export type Person = { id: string; name: string; role: string };
export type ExtractInput = {
  lang: Lang; speaker: Person; family: Person[]; // family includes the speaker
  answers: Array<{ id: string; question: string; transcript: string }>;   // never loi-nhan
  known: Array<{ id: string; kind: string; text_en: string }>;            // facts of the speaker from earlier calls
};
export type FactDraft = { kind: FactKind; aboutId: string | null; text: string; textEn: string; evidence: string; answerId: string; sensitive: boolean; occasion: OccasionKey | ''; replaces: string | null };
export type SignalDraft = { kind: SignalKind; target: string; evidence: string; date: { day: number; month: number } | null };

// ---------- Kiểm điều AI trả về ----------

/** Mã câu trả lời đầu tiên chứa nguyên câu gốc (so sau khi gấp chữ). Câu gốc gấp xong phải dài 8 tới 300 ký tự. */
export function findEvidence(evidence: string, answers: ExtractInput['answers']): string | null {
  const e = foldText(evidence);
  if (e.length < 8 || e.length > 300) return null;
  return answers.find((a) => foldText(a.transcript).includes(e))?.id ?? null;
}

/** Một dòng chữ sạch như cleanLine ở call.ts: gạch dài thành dấu phẩy, bỏ ngoặc kép, một dòng. */
const cleanLine = (s: unknown) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/["“”«»]/g, '').split('\n')[0].replace(/\s+/g, ' ').trim();
const MAX_TEXT = 160;
const ALLOW = { prevCall: true, ownStory: true, photos: true };
const knownId = (v: unknown, p: ExtractInput) => (typeof v === 'string' && p.known.some((k) => k.id === v) ? v : null);
const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** Một sự thật AI trả về: đủ câu gốc, đúng loại, đúng người, chữ qua suspect(). 'same' là trùng sự thật đã có; hỏng thì null. */
export function checkFact(raw: unknown, p: ExtractInput): FactDraft | 'same' | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isIn(FACT_KINDS, r.kind)) return null;
  const evidence = String(r.evidence ?? '').trim();
  const answerId = findEvidence(evidence, p.answers);
  if (!answerId) return null;
  if (!Number.isInteger(r.about) || (r.about as number) < -1 || (r.about as number) >= p.family.length) return null;
  const aboutId = r.about === -1 ? null : p.family[r.about as number].id;
  const text = cleanLine(r.text), textEn = cleanLine(r.text_en);
  if (!text || !textEn || text.length > MAX_TEXT || textEn.length > MAX_TEXT) return null;
  // Tên và số trong câu phải có trong câu gốc hoặc là tên người trong nhà.
  const hay = [evidence, ...p.family.map((m) => m.name)].join(' ');
  for (const [s, lang] of [[text, p.lang], [textEn, 'en']] as const) {
    const why = suspect(s, hay, ALLOW, lang);
    if (why) { console.warn(`[memory] bỏ sự thật "${s}": ${why}`); return null; }
  }
  if (knownId(r.same_as, p)) return 'same';
  return {
    kind: r.kind, aboutId, text, textEn, evidence, answerId, sensitive: r.private === true,
    occasion: isIn(OCCASION_KEYS, r.occasion) ? r.occasion : '', replaces: knownId(r.replaces, p),
  };
}

/** Một tín hiệu AI trả về: có câu gốc, người được nhắc nằm trong câu gốc; low, good_news, upcoming chỉ về chính người kể; upcoming cần ngày tháng. */
export function checkSignal(raw: unknown, p: ExtractInput): SignalDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isIn(SIGNAL_KINDS, r.kind)) return null;
  const evidence = String(r.evidence ?? '').trim();
  if (!findEvidence(evidence, p.answers)) return null;
  const target = String(r.target ?? '').trim();
  const t = foldText(target);
  if (t && !` ${foldText(evidence)} `.includes(` ${t} `)) return null;
  if (t && (r.kind === 'low' || r.kind === 'good_news' || r.kind === 'upcoming')) return null;
  let date: SignalDraft['date'] = null;
  if (r.kind === 'upcoming') {
    const day = r.day, month = r.month;
    if (!Number.isInteger(day) || !Number.isInteger(month) || (day as number) < 1 || (day as number) > 31 || (month as number) < 1 || (month as number) > 12) return null;
    date = { day: day as number, month: month as number };
  }
  return { kind: r.kind, target, evidence, date };
}

/** Ai được dùng sự thật này: sức khoẻ, lo lắng, chuyện nhạy cảm, chuyện chưa đồng ý chia sẻ thì chỉ người kể. */
export function visibilityOf(kind: FactKind, sensitive: boolean, shared: boolean): Visibility {
  return kind === 'health' || kind === 'worry' || sensitive || !shared ? 'self' : 'family';
}

// i18n-ok-begin: prompt gửi AI (tiếng Anh), không phải chữ hiện cho người dùng.
// ---------- AI rút sổ nhớ ----------

// Giống LANG_NAME ở call.ts; không import call.ts vì call.ts import file này (tránh vòng import).
const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese', en: 'English', ko: 'Korean' };

const MEMORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['facts', 'signals'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'about', 'text', 'text_en', 'evidence', 'private', 'occasion', 'same_as', 'replaces'],
        properties: {
          kind: { type: 'string', enum: [...FACT_KINDS] },
          about: { type: 'integer' },
          text: { type: 'string' },
          text_en: { type: 'string' },
          evidence: { type: 'string' },
          private: { type: 'boolean' },
          occasion: { type: 'string', enum: ['', ...OCCASION_KEYS] },
          same_as: { type: 'string' },
          replaces: { type: 'string' },
        },
      },
    },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'target', 'evidence', 'day', 'month'],
        properties: {
          kind: { type: 'string', enum: [...SIGNAL_KINDS] },
          target: { type: 'string' },
          evidence: { type: 'string' },
          day: { type: 'integer' },
          month: { type: 'integer' },
        },
      },
    },
  },
};

function memorySystem(lang: Lang) {
  const L = LANG_NAME[lang];
  return `You read the answers from one family voice call. Mây, the family's AI friend, asked the questions; the speaker answered by voice (speech recognition in ${L}, may contain recognition errors). Pull out lasting facts about the speaker and their family for Mây's memory book, and signals that someone in the family should get in touch.

Facts:
1. Take facts only from what the speaker answered, never from Mây's questions.
2. evidence is copied word for word from one answer: the part that proves the fact, at least a few words.
3. text is one short sentence in ${L}, written from the family's point of view: name people by their name or a family word (Mom, Dad, Grandma), never with I, my, we or our. text_en is the same sentence in English. Spell every name exactly as in the input, and keep names of places and holidays in text_en exactly as the speaker said them, never translated. Add nothing the speaker did not say.
4. about is the index in family_members of the person the fact is about, or -1 for the whole family or someone not in the list.
5. kind: person (a relative or friend mentioned), place, food, habit, like, worry, wish, milestone (school, work, wedding, moving house), occasion, health, relationship.
6. private is true for health, money, conflicts, worries and anything the speaker may not want others to hear.
7. same_as is the id of a known_facts entry that says the same thing; replaces is the id of a known_facts entry this fact corrects or updates. Only ids from known_facts, otherwise empty.
8. occasion is set only when the fact is about how the family keeps that occasion, otherwise empty.
9. Skip small talk and anything not worth remembering. At most ${MAX_FACTS_PER_CALL} facts.

Signals, only when the speaker clearly said it, at most ${MAX_SIGNALS_PER_CALL}:
- miss: the speaker misses someone in the family. want_contact: the speaker wants to call, meet or hear someone. good_news: the speaker has good news to share. worry: the speaker is worried about someone in the family. low: the speaker is tired, sad or ill. upcoming: the speaker has something important coming (an exam, an interview, a trip home, a check-up).
- target is the exact word the speaker used for the person (a name or a family word), empty when the signal is about the speaker. low, good_news and upcoming are always about the speaker, so their target is empty.
- day and month only when the speaker said both, otherwise 0.
- evidence is copied word for word from one answer.

Never use an em dash or quotation marks. If nothing qualifies, return empty lists.

Reply in ${L} for text.`;
}
// i18n-ok-end

/** Một lần gọi AI cho cả cuộc gọi; mọi điều trả về đi qua checkFact, checkSignal. AI không trả lời hay trả sai dạng thì null. */
export async function extractMemory(p: ExtractInput, ask: typeof askJSON = askJSON, timeoutMs = 45_000): Promise<{ facts: Array<FactDraft | 'same'>; signals: SignalDraft[] } | null> {
  const user = JSON.stringify({
    speaker: { index: p.family.findIndex((m) => m.id === p.speaker.id), name: p.speaker.name, role: p.speaker.role },
    family_members: p.family.map((m, index) => ({ index, name: m.name, role: m.role })),
    known_facts: p.known.length ? p.known.map((k) => ({ id: k.id, kind: k.kind, text: k.text_en })) : 'none yet',
    answers: p.answers.map((a) => ({ question: a.question, answer: a.transcript })),
  }, null, 1);
  const res = await ask<{ facts?: unknown; signals?: unknown }>(memorySystem(p.lang), user, MEMORY_SCHEMA, 3000, timeoutMs);
  if (!res || typeof res !== 'object' || (!Array.isArray(res.facts) && !Array.isArray(res.signals))) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    facts: list(res.facts).map((f) => checkFact(f, p)).filter((f): f is FactDraft | 'same' => f !== null).slice(0, MAX_FACTS_PER_CALL),
    signals: list(res.signals).map((s) => checkSignal(s, p)).filter((s): s is SignalDraft => s !== null).slice(0, MAX_SIGNALS_PER_CALL),
  };
}

// ---------- Rút sổ nhớ cho một cuộc gọi ----------

export const MEM_SQL = {
  call: 'select id, family_id, member_id, status, shared, script, done_at from calls where id = $1',
  members: 'select id, name, role, lang, city, loc_share, loc_lat, loc_lon, loc_at, may_nudge from members where family_id = $1 order by created_at',
  answers: `select id, question, transcript from call_answers where call_id = $1 and topic <> 'loi-nhan' and coalesce(transcript, '') <> '' order by idx, turn`,
  // Sự thật người kể đã kể, hoặc người khác kể về người kể mà cả nhà được biết; chưa bị thay (hoặc bị chính cuộc gọi này thay ở lần rút trước).
  known: `select id, kind, text_en from memory_facts where family_id = $1 and (source_id = $2 or (about_id = $2 and visibility = 'family'))
     and call_id is distinct from $3 and (replacement_id is null or replacement_id in (select id from memory_facts where call_id = $3))
     order by created_at desc limit 60`,
  unreplace: 'update memory_facts set replacement_id = null where replacement_id in (select id from memory_facts where call_id = $1)',
  clear: 'delete from memory_facts where call_id = $1',
  insert: `insert into memory_facts (id, family_id, about_id, source_id, kind, text, text_en, details, call_id, answer_id, visibility)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  replace: 'update memory_facts set replacement_id = $2 where id = $1',
  done: 'update calls set memory_at = now() where id = $1',
  failed: 'update calls set memory_tries = memory_tries + 1 where id = $1',
  next: `select id from calls where status = 'done' and memory_at is null and memory_tries < 3 order by done_at limit 1`,
};

export type MemoryDeps = { db: Db; ask: typeof askJSON; now: () => Date };
const DEPS: MemoryDeps = { db: pool, ask: askJSON, now: () => new Date() };
const DAY_MS = 24 * 3600e3;

/** Thứ tiếng người kể nói trong cuộc gọi: theo bộ câu hỏi, không có thì theo người đó. */
function callLang(script: string, memberLang: string | null): Lang {
  try { return langOf(JSON.parse(script).lang ?? memberLang); } catch { return langOf(memberLang); }
}

// Mỗi cuộc gọi chỉ một lượt rút chạy cùng lúc (sau cuộc gọi, câu trả lời muộn, rút bù có thể trùng nhau).
const extracting = new Set<string>();

/** Rút sổ nhớ cho một cuộc gọi đã xong: thay toàn bộ sự thật của cuộc gọi này; signals và cuộc gọi trong 24 giờ thì xếp tín hiệu. */
export async function extractCall(callId: string, opts: { signals: boolean }, deps: MemoryDeps = DEPS): Promise<'done' | 'skip' | 'failed'> {
  if (extracting.has(callId)) return 'skip';
  extracting.add(callId);
  try {
    const { db } = deps;
    const { rows: [call] } = await db.query(MEM_SQL.call, [callId]);
    if (call?.status !== 'done') return 'skip';
    const [{ rows: family }, { rows: answers }, { rows: known }] = await Promise.all([
      db.query(MEM_SQL.members, [call.family_id]),
      db.query(MEM_SQL.answers, [callId]),
      db.query(MEM_SQL.known, [call.family_id, call.member_id, callId]),
    ]);
    const speaker: (SignalMember & { lang: string | null }) | undefined = family.find((m) => m.id === call.member_id);
    if (!speaker || !answers.length) { await db.query(MEM_SQL.done, [callId]); return 'skip'; }
    const person = (m: Person): Person => ({ id: m.id, name: m.name, role: m.role });
    const input: ExtractInput = { lang: callLang(call.script, speaker.lang), speaker: person(speaker), family: family.map(person), answers, known };
    const got = await extractMemory(input, deps.ask);
    if (!got) { await db.query(MEM_SQL.failed, [callId]); return 'failed'; }

    await db.query(MEM_SQL.unreplace, [callId]);
    await db.query(MEM_SQL.clear, [callId]);
    for (const f of got.facts) {
      if (f === 'same') continue;
      const id = randomUUID();
      const details = JSON.stringify({ evidence: f.evidence, sensitive: f.sensitive, occasion: f.occasion, lang: input.lang });
      await db.query(MEM_SQL.insert, [id, call.family_id, f.aboutId, speaker.id, f.kind, f.text, f.textEn, details, callId, f.answerId, visibilityOf(f.kind, f.sensitive, call.shared)]);
      if (f.replaces) await db.query(MEM_SQL.replace, [f.replaces, id]);
    }
    await db.query(MEM_SQL.done, [callId]);

    const now = deps.now();
    if (opts.signals && now.getTime() - new Date(call.done_at).getTime() < DAY_MS) {
      const n = await queueSignals(db, planSignals({ familyId: call.family_id, callId, speaker, family, signals: got.signals, now }));
      if (n) console.log(`[memory] cuộc gọi ${callId.slice(0, 8)}: ${n} tín hiệu chờ gửi`);
    }
    return 'done';
  } finally {
    extracting.delete(callId);
  }
}

// Câu trả lời tới muộn (sau khi cuộc gọi đã chốt): gom lại rồi rút lại sổ nhớ của cuộc gọi đó một lần, như rebuildCallSoon ở podcast.ts.
const later = new Map<string, ReturnType<typeof setTimeout>>();
export function extractSoon(callId: string): void {
  clearTimeout(later.get(callId));
  later.set(callId, setTimeout(() => {
    later.delete(callId);
    extractCall(callId, { signals: true }).catch((e) => console.error('[memory] rút lại sau câu trả lời muộn:', (e as Error).message));
  }, 30_000));
}

/** Rút bù một cuộc gọi cũ chưa rút (cũ nhất trước, bỏ cuộc gọi đã thử 3 lần). Cuộc gọi cũ không xếp tín hiệu. true khi đã xử lý một cuộc gọi. */
export async function backfillOnce(deps: MemoryDeps = DEPS): Promise<boolean> {
  const { rows: [next] } = await deps.db.query(MEM_SQL.next);
  if (!next) return false;
  await extractCall(next.id, { signals: false }, deps);
  return true;
}

/** Rút bù sau khi khởi động 60 giây, mỗi cuộc gọi cách nhau gapMs, hết cuộc gọi cần rút thì dừng (cuộc gọi mới do afterCall rút). Không có AI thì thôi. */
export function startMemoryBackfill(deps: MemoryDeps = DEPS, gapMs = 20_000): void {
  if (!hasAI()) return;
  const tick = async () => {
    let more = false;
    try { more = await backfillOnce(deps); } catch (e) { console.error('[memory] rút bù lỗi:', (e as Error).message); }
    if (more) setTimeout(tick, gapMs);
  };
  setTimeout(tick, 60_000);
}
