// Dữ liệu soạn câu lớn dần cho Mây (21/11/2026, spec C): sổ nhớ, dịp trong 30 ngày, bản đồ chủ đề đã kể, nơi ở thật, giờ và thời tiết,
// người vừa liên lạc được sau lời nhắc của Mây (chỉ tên, không có gì từ tín hiệu).
// call.ts (context) nạp một lần khi soạn bộ câu; scriptFacts đưa cho AI, templateScript dùng bản đồ chủ đề. Chi tiết: docs/may-moi.md.
// Mây Live (21/11/2026, plan may-live task 2): mức độ sâu, mồi chuyện xếp hạng, câu hẹn của cuộc gọi trước, giọng ấm, thời tiết thành cảm giác;
// bộ câu cũ không đọc các mục này (scriptFacts lấy từng mục theo tên).
// Riêng tư: sự thật 'self' của người khác không bao giờ vào (câu SQL lẫn pickFacts); điều 'self' của chính người nghe không thành mồi chuyện;
// không đọc intro.unsaid, không đọc lời nhắn khó nói.
// Kiểm bằng server/callfacts.test.ts (DB giả theo từng câu trong EXTRAS_SQL).
import { upcoming } from './calendar.ts';
import { pool } from './db.ts';
import { tServer, type Lang } from './i18n.ts';
import type { FactKind, OccasionKey } from './memory.ts';
import { distanceKm, hoursApart, localParts, placeOfMember, tzOfMember, weatherAt, weatherFeelAt } from './place.ts';
import { nextOccurrence } from '../src/lunar.ts';
import { isTheme, NO_EPISODE_TOPICS, themesFor, type CallScript, type StoryTheme } from '../src/shared.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** Tối đa chừng này sự thật trong sổ nhớ đưa vào một lần soạn. */
export const MAX_MEMORY = 30;
/** Dịp trong chừng này ngày tới mới đưa vào. */
export const OCCASION_DAYS = 30;

/** Ngày lễ chung (tên ở khoá máy chủ occasion.<mã>): dương lịch, âm lịch (src/lunar.ts), hoặc thứ trong tuần lần thứ n của tháng (weekday 0 là Chủ nhật). */
export const HOLIDAYS: Array<{ key: OccasionKey; lunar?: boolean; day?: number; month?: number; nth?: { n: number; weekday: number; month: number } }> = [
  { key: 'tet', lunar: true, day: 1, month: 1 },
  { key: 'trung-thu', lunar: true, day: 15, month: 8 },
  { key: 'noel', day: 25, month: 12 },
  { key: 'new-year', day: 1, month: 1 },
  { key: 'women-8-3', day: 8, month: 3 },
  { key: 'women-20-10', day: 20, month: 10 },
  { key: 'teachers-20-11', day: 20, month: 11 },
  { key: 'mothers-day', nth: { n: 2, weekday: 0, month: 5 } },
  { key: 'fathers-day', nth: { n: 3, weekday: 0, month: 6 } },
  { key: 'parents-day-kr', day: 8, month: 5 },
];

type Day = { day: number; month: number; year: number };
const DAY_MS = 86400e3;
const utc = (d: Day) => Date.UTC(d.year, d.month - 1, d.day);

/** Lần tới (từ hôm nay trở đi) của một ngày lễ, mốc nửa đêm UTC của ngày đó. */
function nextHoliday(h: (typeof HOLIDAYS)[number], today: Day): number | null {
  const nth = h.nth;
  if (nth) {
    const at = (year: number) => {
      const first = Date.UTC(year, nth.month - 1, 1);
      return first + (((nth.weekday - new Date(first).getUTCDay() + 7) % 7) + 7 * (nth.n - 1)) * DAY_MS;
    };
    return [today.year, today.year + 1].map(at).find((t) => t >= utc(today)) ?? null;
  }
  const occ = nextOccurrence({ day: h.day!, month: h.month!, lunar: !!h.lunar }, today);
  return occ ? utc(occ) : null;
}

export type Occasion = { key: OccasionKey | 'event'; name: string; date: string; inDays: number; who: string | null };
/** Ngày của nhà (upcoming() ở calendar.ts): sinh nhật theo ngày sinh, các ngày trong lịch. */
export type FamilyEvent = { title: string; kind: string; date: string; inDays: number; dobName?: string };

/** Lễ chung và ngày của nhà trong OCCASION_DAYS ngày tới, gần nhất trước. Lễ chung mang tên theo thứ tiếng người nghe; ngày của nhà giữ tên trong lịch. */
export function upcomingOccasions(p: { today: Day; lang: Lang; events: FamilyEvent[] }): Occasion[] {
  const out: Occasion[] = [];
  for (const h of HOLIDAYS) {
    const t = nextHoliday(h, p.today);
    if (t == null) continue;
    out.push({ key: h.key, name: tServer(p.lang, `occasion.${h.key}`), date: new Date(t).toISOString().slice(0, 10), inDays: Math.round((t - utc(p.today)) / DAY_MS), who: null });
  }
  for (const e of p.events) {
    const key = e.kind === 'birthday' ? 'birthday' : e.kind === 'wedding' || e.kind === 'anniversary' ? 'wedding' : 'event';
    out.push({ key, name: e.title, date: e.date, inDays: e.inDays, who: key === 'birthday' ? e.dobName ?? null : null });
  }
  return out.filter((o) => o.inDays >= 0 && o.inDays <= OCCASION_DAYS).sort((a, b) => a.inDays - b.inDays);
}

export type ThemeTold = { theme: StoryTheme; times: number; turns: number; last: string };
/** Bộ câu cũ (ba câu rời, trước v2): chủ đề trùng tên chủ đề chuyện chính thì tính, chủ đề khác bỏ qua. */
const OLD_TOPIC_THEME: Partial<Record<string, StoryTheme>> = { 'ngay-cuoi': 'ngay-cuoi', 'tuoi-tho': 'tuoi-tho', 'mon-an': 'mon-an' };

/** Bản đồ chủ đề đã kể: mỗi chủ đề kể mấy lần, lần kể sâu nhất bao nhiêu lượt, lần gần nhất ngày nào. Mới nhất trước.
 *  storyTurns: số lượt kể của cả cuộc gọi. v3 (Mây Live) có nhiều chuyện mỗi cuộc gọi: có turnsByIdx (số lượt theo ô) thì mỗi ô chuyện
 *  tính lượt của riêng ô đó, không có thì như v2. Hai ô cùng chủ đề trong một cuộc gọi: một lần kể, lấy ô sâu nhất. */
export function topicMap(calls: Array<{ script: CallScript; doneAt: string; storyTurns: number; turnsByIdx?: Record<string, number> }>): ThemeTold[] {
  const map = new Map<StoryTheme, ThemeTold>();
  for (const c of calls) {
    const qs = c.script?.questions ?? [];
    const v = c.script?.v;
    const slots = v === 2 || v === 3
      ? qs.flatMap((q, i) => (q.part === 'story' ? [{ theme: q.theme, turns: v === 3 && c.turnsByIdx ? Number(c.turnsByIdx[i]) || 0 : c.storyTurns }] : []))
      : qs.map((q) => ({ theme: OLD_TOPIC_THEME[q.topic], turns: c.storyTurns }));
    const deepest = new Map<StoryTheme, number>();
    for (const s of slots) if (isTheme(s.theme)) deepest.set(s.theme, Math.max(deepest.get(s.theme) ?? 0, s.turns));
    const day = String(c.doneAt).slice(0, 10);
    for (const [theme, turns] of deepest) {
      const t = map.get(theme) ?? { theme, times: 0, turns: 0, last: '' };
      t.times++;
      t.turns = Math.max(t.turns, turns);
      if (day > t.last) t.last = day;
      map.set(theme, t);
    }
  }
  return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export type FactPick = { id: string; about_id: string | null; source_id: string; kind: string; text_en: string; visibility: string;
  details: { occasion?: string }; used_at: Date | null; used_count: number; created_at: Date };

/** Sự thật đưa vào một lần soạn: chỉ điều cả nhà được biết hoặc chính người nghe kể. Điểm: về người nghe 4, người nghe kể 1,
 *  chưa dùng lần nào 3 (dùng rồi mà quá 30 ngày 1), gắn dịp sắp tới 3. Điểm cao trước, bằng điểm thì mới trước; tối đa max. */
export function pickFacts(rows: FactPick[], p: { listenerId: string; occasionKeys: string[]; now: Date; max?: number }): FactPick[] {
  const old = (f: FactPick) => !f.used_at || p.now.getTime() - new Date(f.used_at).getTime() > 30 * DAY_MS;
  const score = (f: FactPick) => (f.about_id === p.listenerId ? 4 : 0) + (f.source_id === p.listenerId ? 1 : 0)
    + (f.used_count === 0 ? 3 : old(f) ? 1 : 0) + (f.details?.occasion && p.occasionKeys.includes(f.details.occasion) ? 3 : 0);
  return rows.filter((f) => f.visibility === 'family' || f.source_id === p.listenerId)
    .map((f) => ({ f, s: score(f) }))
    .sort((a, b) => b.s - a.s || new Date(b.f.created_at).getTime() - new Date(a.f.created_at).getTime())
    .slice(0, p.max ?? MAX_MEMORY)
    .map((x) => x.f);
}

/** Mây Live: biết nhà này tới đâu. 0 làm quen, 1 gia đình, 2 sâu (spec F của docs/may-that-hon-dieu-tra.md). */
export type Depth = 0 | 1 | 2;
/** done: số cuộc gọi đã xong (hàng của EXTRAS_SQL.calls), facts: số sự thật nạp được (hàng của EXTRAS_SQL.facts). */
export function depthOf(p: { done: number; facts: number }): Depth {
  if (p.done === 0 || p.facts < 5) return 0;
  return p.done >= 4 && p.facts > 20 ? 2 : 1;
}

/** Loại sự thật thuộc chủ đề chuyện nào (sợi chuyện bỏ ngỏ ở mức 2); loại không có ở đây không thành sợi chuyện. */
export const KIND_THEME: Partial<Record<FactKind, StoryTheme>> = { person: 'bo-me-minh', place: 'que-nha', food: 'mon-an', milestone: 'cong-viec', relationship: 'bo-me-minh', wish: 'uoc-mo', occasion: 'tet-cac-dip' };

export type SeedKind = 'hook' | 'food' | 'seen' | 'place' | 'away' | 'heard' | 'person' | 'together' | 'occasion' | 'thread' | 'relation' | 'everyday' | 'childhood';
/** Một mồi chuyện cho Mây Live: hint tiếng Anh cho AI (tên, món, nơi, sự thật giữ nguyên như dữ liệu), theme là chủ đề chuyện nếu có. */
export type Seed = { kind: SeedKind; hint: string; theme: StoryTheme | null };
export type SeedInput = { depth: Depth; role: string; intro: { seen?: string; food?: string }; place: string | null; far: boolean;
  family: Array<{ name: string; role: string }>; memory: ScriptExtras['memory']; occasions: Occasion[]; told: ThemeTold[]; themes: StoryTheme[];
  hook: string | null; hasPair: boolean };

/** Mỗi cuộc gọi chừng này mồi. */
const MAX_SEEDS = 5;
const MIN_SEEDS = 3;
/** Loại mồi không bị bỏ vì chủ đề đã kể sâu (câu hẹn, chuyện người khác kể, sợi chuyện vốn chỉ lấy chủ đề chưa kể sâu). */
const KEEP_WHEN_DEEP: readonly SeedKind[] = ['hook', 'heard', 'thread'];

// i18n-ok-begin: gợi ý mồi chuyện tiếng Anh chỉ đưa vào lời dặn cho AI (Mây Live); nhà đặt tên linh vật khác thì lời dặn thay tên (named, task 3).
const EVERYDAY: Seed = { kind: 'everyday', hint: 'Something small from their week that made them smile.', theme: null };
const TOGETHER: Seed = { kind: 'together', hint: 'A time the whole family was together: a trip, a Tet, a meal.', theme: 'tet-cac-dip' };
const CHILDHOOD: Seed = { kind: 'childhood', hint: 'What they loved doing as a child.', theme: 'tuoi-tho' };
/** Người trong nhà gọi theo quan hệ với người nghe: bố mẹ chỉ có mồi về con, con chỉ có mồi về bố mẹ (chữ luôn đúng từ phía người nghe). */
const ROLE_WORD: Record<string, string> = { me: 'their mother', bo: 'their father', con: 'their child' };

/** Mồi chuyện xếp hạng cho Mây Live (3 tới 5): câu hẹn tuần trước luôn đầu, rồi theo mức độ sâu. Mức 0 từ khảo sát, nơi ở, vai (không mặc định
 *  tuổi thơ); mức 1 về người trong nhà, dịp, điều người khác kể; mức 2 sợi chuyện bỏ ngỏ, quan hệ. Bỏ chủ đề không hợp vai, chủ đề đã kể sâu,
 *  mồi trùng; thiếu thì thêm mồi chung. Điều riêng ('self') không bao giờ thành mồi. Chi tiết: docs/may-moi.md mục Mây Live (thử). */
export function seedsFor(p: SeedInput): Seed[] {
  const parent = p.role === 'bo' || p.role === 'me';
  const seed = (kind: SeedKind, hint: string, theme: StoryTheme | null = null): Seed => ({ kind, hint, theme });
  const deep = (theme: StoryTheme | null) => theme != null && p.told.some((t) => t.theme === theme && t.turns >= 3);
  const { food, seen } = p.intro;

  const foodSeed = () => (food ? [seed('food', parent ? `The dish their child loves: ${food}. Who cooks it, a meal with it they remember.`
    : `The home dish they miss most: ${food}. Who made it, a meal they remember.`, 'mon-an')] : []);
  const seenSeed = () => (seen === 'week' || seen === 'months' || seen === 'year'
    ? [seed('seen', `The last time the family was all together (survey: ${seen}). Where, who was there, what they did.`, 'tet-cac-dip')]
    : seen === 'together' ? [seed('seen', 'They live together but rarely talk: an ordinary day at home, a small thing they like doing together.')] : []);
  const placeSeed = () => (!p.place ? [] : parent ? [seed('place', `Daily life at home in ${p.place} these days.`, 'que-nha')]
    : [seed('place', `Life in ${p.place}: what a normal day there is like, what surprised them.`, 'cong-viec')]);
  const away = () => (!p.far ? [] : parent ? [seed('away', 'What they felt when their child moved far away, and what they do when they miss them.', 'con-di-xa')]
    : [seed('away', 'What they miss most about home and the family.', 'que-nha')]);
  const occasion = () => p.occasions.slice(0, 1).map((o) => seed('occasion', `${o.name} is in ${o.inDays} days: how they will keep it this year, how it was in earlier years.`,
    HOLIDAYS.some((h) => h.key === o.key) ? 'tet-cac-dip' : null));
  const heard = () => p.memory.filter((m) => !m.toldByYou && !m.private).slice(0, 1)
    .map((m) => seed('heard', `${m.toldBy} told Mây: ${m.fact}. Ask their side of it and say who told it.`));
  const people = (n: number) => p.family.filter((m) => (parent ? m.role === 'con' : m.role === 'bo' || m.role === 'me')).slice(0, n)
    .map((m) => seed('person', `A story about ${m.name} (${ROLE_WORD[m.role]}): a moment with them they remember well.`, parent ? null : 'bo-me-minh'));
  const threads = () => p.memory.flatMap((m) => {
    const theme = KIND_THEME[m.kind as FactKind];
    return !m.private && theme && !deep(theme) ? [seed('thread', `Mentioned before but never told as a story: ${m.fact} (told by ${m.toldBy}).`, theme)] : [];
  }).slice(0, 2);
  const relation = () => (!parent ? [seed('relation', 'Their parents when they were young, what they know of how they met.', 'bo-me-minh')]
    : p.hasPair ? [seed('relation', `How they and ${p.role === 'me' ? 'their husband' : 'their wife'} met, their early days together.`, 'ngay-cuoi')] : []);

  const hook = p.hook ? [seed('hook', `Last call ended with this promise: ${p.hook}`)] : [];
  const candidates = [...hook, ...(p.depth === 0 ? [...foodSeed(), ...seenSeed(), ...placeSeed(), ...away(), EVERYDAY]
    : p.depth === 1 ? [...occasion(), ...heard(), ...people(2), TOGETHER, ...foodSeed(), EVERYDAY]
    : [...threads(), ...relation(), ...heard(), ...occasion(), ...people(1), TOGETHER])];
  const out: Seed[] = [];
  for (const c of candidates) {
    if (c.theme && !p.themes.includes(c.theme)) continue;
    if (deep(c.theme) && !KEEP_WHEN_DEEP.includes(c.kind)) continue;
    if (out.some((s) => s.hint === c.hint)) continue;
    out.push({ ...c });
  }
  const seeds = out.slice(0, MAX_SEEDS);
  for (const f of [EVERYDAY, TOGETHER, CHILDHOOD]) if (seeds.length < MIN_SEEDS && !seeds.some((s) => s.kind === f.kind)) seeds.push({ ...f });
  return seeds;
}
// i18n-ok-end

export type ScriptExtras = {
  age: number | null;
  /** feel: Mây Live, thời tiết thành cảm giác không số (weatherFeel); bộ câu cũ chỉ đọc weather. */
  place: { name: string | null; country: string | null; tz: string; localTime: string; weather: string | null; feel: string | null };
  family: Array<{ name: string; role: string; place: string | null; hoursApart: number; km: number | null }>;
  /** private: điều 'self' của chính người nghe (chỉ được nhắc nhẹ ở câu hỏi thăm, không bao giờ vào câu mở chuyện chính, vì câu mở thành thẻ trong tập cả nhà xem). */
  memory: Array<{ id: string; about: string; toldBy: string; toldByYou: boolean; private: boolean; kind: string; fact: string }>;
  occasions: Occasion[]; told: ThemeTold[]; themes: StoryTheme[]; gaps: Array<'food' | 'seen'>;
  /** Tên những người mà người nghe đã liên lạc được sau một lời nhắc của Mây (contact_at trong 7 ngày qua), mới nhất trước. */
  recent: string[];
  /** Mây Live: mức độ sâu, mồi chuyện xếp hạng, câu hẹn của cuộc gọi xong gần nhất, giọng ấm (khảo sát "chưa nói thương bao giờ"). */
  depth: Depth; seeds: Seed[]; hook: string | null; warm: boolean;
};

export const EXTRAS_SQL = {
  member: `select id, name, role, to_char(dob, 'YYYY-MM-DD') as dob, city, loc_share, loc_lat, loc_lon, loc_at, intro,
     exists(select 1 from events e where e.family_id = members.family_id and e.kind = 'wedding') as has_wedding from members where id = $1`,
  family: 'select id, name, role, city, loc_share, loc_lat, loc_lon, loc_at from members where family_id = $1 order by created_at',
  // Chưa bị thay; cả nhà được biết hoặc chính người nghe kể (điều 'self' của người khác không bao giờ lấy).
  facts: `select id, about_id, source_id, kind, text_en, visibility, details, used_at, used_count, created_at from memory_facts
     where family_id = $1 and replacement_id is null and (visibility = 'family' or source_id = $2) order by created_at desc limit 300`,
  // Cuộc gọi đã xong của người nghe, kèm số lượt kể có lời chép ngoài câu hỏi thăm và lời nhắn khó nói ($2 = NO_EPISODE_TOPICS),
  // cả cuộc gọi (story_turns) và theo từng ô (idx_turns, JSON { ô: lượt }, không có lượt nào thì null; cuộc gọi v3 có nhiều chuyện).
  calls: `select c.script, to_char(c.done_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as done_at,
     (select count(*)::int from call_answers a where a.call_id = c.id and a.topic <> all($2::text[]) and coalesce(a.transcript, '') <> '') as story_turns,
     (select json_object_agg(t.idx, t.n) from (select a.idx, count(*)::int as n from call_answers a
       where a.call_id = c.id and a.topic <> all($2::text[]) and coalesce(a.transcript, '') <> '' group by a.idx) t) as idx_turns
     from calls c where c.member_id = $1 and c.status = 'done' order by c.done_at desc limit 100`,
  // Người phía bên kia của lời nhắc có người nghe ở một đầu, đã liên lạc sau $2 (7 ngày trước), còn trong nhà. Chỉ lấy tên.
  recent: `select m.name from may_nudges n
     join members m on m.id = (case when n.from_id = $1 then n.to_id else n.from_id end) and m.family_id = n.family_id
     where (n.from_id = $1 or n.to_id = $1) and n.contact_at > $2
     group by m.id, m.name order by max(n.contact_at) desc`,
};

export type ExtrasDeps = { db: Db; fetch: typeof fetch; now: () => Date; events: (familyId: string) => Promise<FamilyEvent[]> };
const DEPS: ExtrasDeps = { db: pool, fetch: (u, i) => fetch(u, i), now: () => new Date(), events: (fid) => upcoming(pool, fid, OCCASION_DAYS) };

const pad = (n: number) => String(n).padStart(2, '0');

/** Tuổi tròn vào ngày today theo ngày sinh YYYY-MM-DD; không có hay vô lý thì null. */
function ageOn(dob: unknown, today: Day): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob ?? ''));
  if (!m) return null;
  const age = today.year - Number(m[1]) - (today.month * 100 + today.day < Number(m[2]) * 100 + Number(m[3]) ? 1 : 0);
  return age >= 0 && age < 130 ? age : null;
}

/** Dữ liệu soạn câu lớn dần của một người: tuổi, nơi ở (giờ, thời tiết), cả nhà ở đâu, sổ nhớ, dịp, chủ đề đã kể, chỗ trống hồ sơ. */
export async function loadScriptExtras(member: { id: string; family_id: string }, lang: Lang, deps: ExtrasDeps = DEPS): Promise<ScriptExtras> {
  const { db } = deps;
  const now = deps.now();
  const [{ rows: [me] }, { rows: family }, { rows: facts }, { rows: calls }, { rows: recent }, events] = await Promise.all([
    db.query(EXTRAS_SQL.member, [member.id]),
    db.query(EXTRAS_SQL.family, [member.family_id]),
    db.query(EXTRAS_SQL.facts, [member.family_id, member.id]),
    db.query(EXTRAS_SQL.calls, [member.id, [...NO_EPISODE_TOPICS]]),
    db.query(EXTRAS_SQL.recent, [member.id, new Date(now.getTime() - 7 * DAY_MS)]),
    deps.events(member.family_id),
  ]);
  if (!me) throw new Error(`member ${member.id} not found`);

  const tz = tzOfMember(me);
  const here = placeOfMember(me, lang);
  const local = localParts(tz, now);
  const [year, month, day] = local.date.split('-').map(Number);
  const today = { year, month, day };
  const occasions = upcomingOccasions({ today, lang, events });

  const names = new Map<string, string>(family.map((m) => [m.id, m.name]));
  const memory = pickFacts(facts, { listenerId: me.id, occasionKeys: occasions.map((o) => o.key), now })
    .map((f) => ({ id: f.id, about: f.about_id == null ? 'whole family' : names.get(f.about_id), toldBy: names.get(f.source_id),
      toldByYou: f.source_id === me.id, private: f.visibility === 'self', kind: f.kind, fact: f.text_en }))
    .filter((f): f is ScriptExtras['memory'][number] => f.about != null && f.toldBy != null);

  // Chỉ đọc ba câu khảo sát: food, seen (hồ sơ còn trống gì, mồi chuyện), love (giọng ấm); "điều chưa nói" không bao giờ đọc ở đây.
  let intro: Record<string, unknown> = {};
  try { intro = JSON.parse(me.intro || '{}') ?? {}; } catch {}
  const has = (k: string) => String(intro[k] ?? '').trim() !== '';
  const answer = (k: 'food' | 'seen') => { const v = intro[k]; return typeof v === 'string' && v.trim() ? v.trim() : undefined; };
  const gaps: ScriptExtras['gaps'] = [];
  if (!has('food') && !facts.some((f) => f.kind === 'food' && f.about_id === me.id)) gaps.push('food');
  if (!has('seen')) gaps.push('seen');

  const parsed = (r: { script: string }): CallScript | null => { try { return JSON.parse(r.script) as CallScript; } catch { return null; } };
  const told = topicMap(calls.flatMap((r) => {
    const script = parsed(r);
    const turnsByIdx = r.idx_turns && typeof r.idx_turns === 'object' ? (r.idx_turns as Record<string, number>) : {};
    return script ? [{ script, doneAt: String(r.done_at), storyTurns: Number(r.story_turns) || 0, turnsByIdx }] : [];
  }));
  const hasPair = family.some((m) => m.role === 'bo') && family.some((m) => m.role === 'me');
  const themes = themesFor(me.role, hasPair, !!me.has_wedding);
  // Câu hẹn chỉ lấy ở cuộc gọi xong gần nhất (hàng đầu, mới nhất trước); cuộc gọi đó không có thì thôi, không lùi về cuộc trước.
  const lastHook = calls.length ? parsed(calls[0])?.next_hook : undefined;
  const hook = typeof lastHook === 'string' && lastHook.trim() ? lastHook.trim() : null;

  const weather = here ? await weatherAt(here.lat, here.lon, deps.fetch) : null;
  // Sau weatherAt cùng toạ độ: đọc lại kho nhớ, không hỏi mạng lần nữa.
  const feel = here ? await weatherFeelAt(here.lat, here.lon, deps.fetch) : null;
  const others = family.filter((m) => m.id !== me.id).map((m) => {
    const p = placeOfMember(m, lang);
    return { name: m.name, role: m.role, place: [p?.name, p?.country].filter(Boolean).join(', ') || null,
      hoursApart: hoursApart(tzOfMember(m), tz, now), km: p && here ? distanceKm(p, here) : null };
  });
  const seen = answer('seen');
  const far = others.some((m) => m.km != null && m.km >= 300) || seen === 'months' || seen === 'year';
  const depth = depthOf({ done: calls.length, facts: facts.length });

  return {
    age: ageOn(me.dob, today),
    place: {
      name: here?.name ?? null, country: here?.country ?? null, tz,
      localTime: `${pad(Math.floor(local.minutes / 60))}:${pad(local.minutes % 60)}`,
      weather, feel,
    },
    family: others,
    memory, occasions, told,
    themes,
    gaps,
    recent: recent.map((r) => String(r.name)),
    depth,
    seeds: seedsFor({ depth, role: me.role, intro: { seen, food: answer('food') }, place: here?.name ?? here?.country ?? null, far,
      family: others.map((m) => ({ name: m.name, role: m.role })), memory, occasions, told, themes, hook, hasPair }),
    hook,
    warm: intro.love === 'never',
  };
}
