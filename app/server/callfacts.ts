// Dữ liệu soạn câu lớn dần cho Mây (21/11/2026, spec C): sổ nhớ, dịp trong 30 ngày, bản đồ chủ đề đã kể, nơi ở thật, giờ và thời tiết.
// call.ts (context) nạp một lần khi soạn bộ câu; scriptFacts đưa cho AI, templateScript dùng bản đồ chủ đề. Chi tiết: docs/may-moi.md.
// Riêng tư: sự thật 'self' của người khác không bao giờ vào (câu SQL lẫn pickFacts); không đọc intro.unsaid, không đọc lời nhắn khó nói.
// Kiểm bằng server/callfacts.test.ts (DB giả theo từng câu trong EXTRAS_SQL).
import { upcoming } from './calendar.ts';
import { pool } from './db.ts';
import { tServer, type Lang } from './i18n.ts';
import type { OccasionKey } from './memory.ts';
import { distanceKm, hoursApart, localParts, placeOfMember, tzOfMember, weatherAt } from './place.ts';
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

/** Bản đồ chủ đề đã kể: mỗi chủ đề kể mấy lần, lần kể sâu nhất bao nhiêu lượt, lần gần nhất ngày nào. Mới nhất trước. */
export function topicMap(calls: Array<{ script: CallScript; doneAt: string; storyTurns: number }>): ThemeTold[] {
  const map = new Map<StoryTheme, ThemeTold>();
  for (const c of calls) {
    const qs = c.script?.questions ?? [];
    const themes = c.script?.v === 2 ? qs.filter((q) => q.part === 'story').map((q) => q.theme) : qs.map((q) => OLD_TOPIC_THEME[q.topic]);
    const day = String(c.doneAt).slice(0, 10);
    for (const theme of new Set(themes)) {
      if (!isTheme(theme)) continue;
      const t = map.get(theme) ?? { theme, times: 0, turns: 0, last: '' };
      t.times++;
      t.turns = Math.max(t.turns, c.storyTurns);
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

export type ScriptExtras = {
  age: number | null;
  place: { name: string | null; country: string | null; tz: string; localTime: string; weather: string | null };
  family: Array<{ name: string; role: string; place: string | null; hoursApart: number; km: number | null }>;
  /** private: điều 'self' của chính người nghe (chỉ được nhắc nhẹ ở câu hỏi thăm, không bao giờ vào câu mở chuyện chính, vì câu mở thành thẻ trong tập cả nhà xem). */
  memory: Array<{ id: string; about: string; toldBy: string; toldByYou: boolean; private: boolean; kind: string; fact: string }>;
  occasions: Occasion[]; told: ThemeTold[]; themes: StoryTheme[]; gaps: Array<'food' | 'seen'>;
};

export const EXTRAS_SQL = {
  member: `select id, name, role, to_char(dob, 'YYYY-MM-DD') as dob, city, loc_share, loc_lat, loc_lon, loc_at, intro,
     exists(select 1 from events e where e.family_id = members.family_id and e.kind = 'wedding') as has_wedding from members where id = $1`,
  family: 'select id, name, role, city, loc_share, loc_lat, loc_lon, loc_at from members where family_id = $1 order by created_at',
  // Chưa bị thay; cả nhà được biết hoặc chính người nghe kể (điều 'self' của người khác không bao giờ lấy).
  facts: `select id, about_id, source_id, kind, text_en, visibility, details, used_at, used_count, created_at from memory_facts
     where family_id = $1 and replacement_id is null and (visibility = 'family' or source_id = $2) order by created_at desc limit 300`,
  // Cuộc gọi đã xong của người nghe, kèm số lượt kể có lời chép ngoài câu hỏi thăm và lời nhắn khó nói ($2 = NO_EPISODE_TOPICS).
  calls: `select c.script, to_char(c.done_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as done_at,
     (select count(*)::int from call_answers a where a.call_id = c.id and a.topic <> all($2::text[]) and coalesce(a.transcript, '') <> '') as story_turns
     from calls c where c.member_id = $1 and c.status = 'done' order by c.done_at desc limit 100`,
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
  const [{ rows: [me] }, { rows: family }, { rows: facts }, { rows: calls }, events] = await Promise.all([
    db.query(EXTRAS_SQL.member, [member.id]),
    db.query(EXTRAS_SQL.family, [member.family_id]),
    db.query(EXTRAS_SQL.facts, [member.family_id, member.id]),
    db.query(EXTRAS_SQL.calls, [member.id, [...NO_EPISODE_TOPICS]]),
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

  // Chỉ đọc hai câu khảo sát food, seen để biết hồ sơ còn trống gì; "điều chưa nói" không bao giờ đọc ở đây.
  let intro: Record<string, unknown> = {};
  try { intro = JSON.parse(me.intro || '{}') ?? {}; } catch {}
  const has = (k: string) => String(intro[k] ?? '').trim() !== '';
  const gaps: ScriptExtras['gaps'] = [];
  if (!has('food') && !facts.some((f) => f.kind === 'food' && f.about_id === me.id)) gaps.push('food');
  if (!has('seen')) gaps.push('seen');

  const told = topicMap(calls.flatMap((r) => {
    try { return [{ script: JSON.parse(r.script) as CallScript, doneAt: String(r.done_at), storyTurns: Number(r.story_turns) || 0 }]; } catch { return []; }
  }));
  const hasPair = family.some((m) => m.role === 'bo') && family.some((m) => m.role === 'me');

  return {
    age: ageOn(me.dob, today),
    place: {
      name: here?.name ?? null, country: here?.country ?? null, tz,
      localTime: `${pad(Math.floor(local.minutes / 60))}:${pad(local.minutes % 60)}`,
      weather: here ? await weatherAt(here.lat, here.lon, deps.fetch) : null,
    },
    family: family.filter((m) => m.id !== me.id).map((m) => {
      const p = placeOfMember(m, lang);
      return { name: m.name, role: m.role, place: [p?.name, p?.country].filter(Boolean).join(', ') || null,
        hoursApart: hoursApart(tzOfMember(m), tz, now), km: p && here ? distanceKm(p, here) : null };
    }),
    memory, occasions, told,
    themes: themesFor(me.role, hasPair, !!me.has_wedding),
    gaps,
  };
}
