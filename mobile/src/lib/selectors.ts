import { HOLIDAYS } from '@/data/holidays';
import type { AppState, FamilyEvent, FamilyMessage, Letter, Member, Mission, Post, Role } from '@/data/types';
import { daysBetween, lunarOf, nextSolarAnniversary, nextSolarForLunar } from './lunar';

export const member = (s: AppState, id: string): Member | undefined => s.family.members.find((m) => m.id === id);
export const me = (s: AppState): Member => member(s, s.meId) ?? s.family.members[0];
export const others = (s: AppState): Member[] => s.family.members.filter((m) => m.id !== s.meId);

const ELDER: Role[] = ['bo', 'me', 'ong', 'ba'];

/** Bố mẹ, ông bà là "thế hệ trên": chữ to hơn, Homeletter xưng hô kính trọng. */
export const isElder = (m: Member) => ELDER.includes(m.role);

/** Cách gọi một người giữa câu: "gọi cho mẹ", "gọi cho Lan". */
export function callName(m?: Member): string {
  if (!m) return '';
  return isElder(m) ? m.roleLabel.charAt(0).toLowerCase() + m.roleLabel.slice(1) : m.roleLabel;
}

/** Cách Homeletter xưng hô khi gọi một người: cô Hoa, chú Minh, bà, Lan. */
export function aiAddress(m?: Member): string {
  if (!m) return 'bạn';
  const given = m.name.trim().split(/\s+/).pop() ?? m.name;
  if (m.role === 'me') return `cô ${given}`;
  if (m.role === 'bo') return `chú ${given}`;
  if (m.role === 'ba') return 'bà';
  if (m.role === 'ong') return 'ông';
  return given;
}

const generation = (r: Role) => (r === 'ong' || r === 'ba' ? 0 : r === 'bo' || r === 'me' ? 1 : 2);

/** Hồ sơ "hiểu nhau" chỉ mở cho người khác thế hệ: con xem của bố mẹ, bố mẹ xem của con. */
export function canUnderstand(viewer: Member, target: Member): boolean {
  return viewer.id !== target.id && generation(viewer.role) !== generation(target.role);
}

export const understandable = (s: AppState) => others(s).filter((m) => canUnderstand(me(s), m));

/** Dưới 18 tuổi: Homeletter không nhận câu hỏi giấu kín về người này. */
export function isMinor(m: Member, ref = new Date()): boolean {
  const y = m.birthday?.year;
  return !!y && ref.getFullYear() - y < 18;
}

export function isToday(iso: string, ref = new Date()): boolean {
  return daysBetween(new Date(iso), ref) === 0;
}

export function postedToday(s: AppState, memberId: string): boolean {
  return s.posts.some((p) => p.authorId === memberId && isToday(p.createdAt));
}

/** Số ngày kể từ lần cuối mình gọi cho người này. */
export function daysSinceCall(s: AppState, memberId: string): number {
  const last = s.calls[memberId];
  return last ? daysBetween(new Date(last), new Date()) : 99;
}

/** Mâm cơm chung hôm nay: tấm ảnh bữa cơm mỗi người đã gửi. */
export function mealToday(s: AppState): Record<string, Post | undefined> {
  const out: Record<string, Post | undefined> = {};
  for (const m of s.family.members) {
    out[m.id] = s.posts.find((p) => p.authorId === m.id && p.tag === 'an-com' && isToday(p.createdAt));
  }
  return out;
}

/** Số ngày liền nhà mình có ảnh mới (tính cả hôm nay nếu đã có). */
export function streak(s: AppState, ref = new Date()): number {
  const days = new Set(s.posts.map((p) => daysBetween(new Date(p.createdAt), ref)));
  let n = days.has(0) ? 0 : 1;
  const start = n;
  while (days.has(n)) n++;
  return n - start;
}

export function missionFor(s: AppState): Mission | undefined {
  return s.missions.find((m) => !m.done && m.ids.includes(s.meId));
}

/** Homeletter mình được đọc: thư của chính mình, và thư người kể đã đồng ý gửi cho mình. */
export function visibleLetters(s: AppState): Letter[] {
  return s.letters
    .filter((l) => l.speakerId === s.meId || l.forIds.includes(s.meId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const lettersFrom = (s: AppState, speakerId: string) => visibleLetters(s).filter((l) => l.speakerId === speakerId);

export const isScheduled = (m: FamilyMessage, ref = new Date()) => !!m.deliverAt && new Date(m.deliverAt) > ref;

/** Thời điểm tin hiện trong chat: tin hẹn giờ đã đến hẹn tính từ giờ hẹn; tin còn chờ thì người gửi thấy ở lúc ghi. */
export const shownAt = (m: FamilyMessage, ref = new Date()) => (m.deliverAt && !isScheduled(m, ref) ? m.deliverAt : m.createdAt);

export function visibleMessages(s: AppState, ref = new Date()): FamilyMessage[] {
  const letters = new Set(visibleLetters(s).map((l) => l.id));
  return s.messages
    .filter((m) => {
      const mine = m.authorId === s.meId;
      if (m.to && !mine && !m.to.includes(s.meId)) return false;
      if (!mine && isScheduled(m, ref)) return false;
      if (m.letterId && !letters.has(m.letterId)) return false;
      return true;
    })
    .sort((a, b) => shownAt(a).localeCompare(shownAt(b)));
}

/** Lời chào buổi sáng gửi riêng mình, đã đến giờ mà mình chưa nghe: tự phát khi mở app. */
export function unheardMorning(s: AppState, ref = new Date()): FamilyMessage | undefined {
  return visibleMessages(s, ref).find(
    (m) => m.deliverAt && m.voiceSec && m.authorId !== s.meId && m.to?.includes(s.meId) && !(m.heardBy ?? []).includes(s.meId),
  );
}

export function calendarEvents(s: AppState): FamilyEvent[] {
  return s.settings.holidays ? [...s.events, ...HOLIDAYS] : s.events;
}

export type UpcomingEvent = { event: FamilyEvent; date: Date; inDays: number };

export function nextOccurrence(e: FamilyEvent, from = new Date()): Date {
  if (e.once && e.year) return new Date(e.year, e.month - 1, e.day);
  return e.calendar === 'lunar' ? nextSolarForLunar(e.day, e.month, from) : nextSolarAnniversary(e.day, e.month, from);
}

export function upcoming(s: AppState, from = new Date()): UpcomingEvent[] {
  return calendarEvents(s)
    .map((event) => {
      const date = nextOccurrence(event, from);
      return { event, date, inDays: daysBetween(from, date) };
    })
    .filter((e) => e.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays);
}

/** Lần thứ mấy của một ngày kỷ niệm, ví dụ "27 năm" ngày cưới, "tròn 25 tuổi". */
export function yearsAt(e: FamilyEvent, date: Date): number | undefined {
  if (!e.year || e.once || e.calendar === 'lunar') return undefined;
  const n = date.getFullYear() - e.year;
  return n > 0 ? n : undefined;
}

export type TimelineItem = { year: number; title: string; who?: Member; teller?: Member; storyId?: string; future?: boolean; date?: Date };

/** Dòng đời nhà mình: cột mốc có năm, cộng những chuyện đã kể có năm. */
export function timeline(s: AppState, ref = new Date()): TimelineItem[] {
  const linked = new Set(s.events.map((e) => e.storyId).filter(Boolean));
  const items: TimelineItem[] = [];
  for (const e of s.events) {
    if (!e.year || e.kind === 'gio') continue;
    const who = e.memberId ? member(s, e.memberId) : undefined;
    const date = new Date(e.year, e.month - 1, e.day);
    const title = e.kind === 'birthday' && who ? `${who.roleLabel} chào đời` : e.title;
    const story = e.storyId ? s.stories.find((st) => st.id === e.storyId) : undefined;
    items.push({ year: e.year, title, who, teller: story && member(s, story.tellerId), storyId: e.storyId, future: date > ref, date });
  }
  for (const st of visibleStories(s)) {
    if (!st.year || linked.has(st.id)) continue;
    items.push({ year: st.year, title: st.title, who: member(s, st.tellerId), teller: member(s, st.tellerId), storyId: st.id });
  }
  return items.sort((a, b) => a.year - b.year || (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}

/** Lời nhắc gửi ảnh xưa: theo dịp sắp tới trong 45 ngày, không thì một chủ đề của tuần. */
export function photoPrompt(s: AppState, ref = new Date()): { text: string; occasion?: string } {
  const near = upcoming(s, ref).filter((u) => u.inDays <= 45);
  for (const u of near) {
    const who = u.event.memberId ? member(s, u.event.memberId) : undefined;
    if (u.event.kind === 'anniversary') return { occasion: `Còn ${u.inDays} ngày đến ${u.event.title.toLowerCase()}`, text: 'Ai còn giữ ảnh cưới của bố mẹ không?' };
    if (u.event.kind === 'birthday' && who) return { occasion: `Còn ${u.inDays} ngày đến sinh nhật ${callName(who)}`, text: `Gửi một tấm ảnh ngày xưa của ${callName(who)} nhé.` };
    if (u.event.id === 'h-tet') return { occasion: `Còn ${u.inDays} ngày đến Tết`, text: 'Nhà mình còn ảnh Tết xưa nào không?' };
    if (u.event.id === 'h-vu-lan') return { occasion: `Còn ${u.inDays} ngày đến Vu Lan`, text: 'Gửi một tấm ảnh bố mẹ hồi trẻ nhé.' };
  }
  return { text: 'Tuần này: một tấm ảnh nhà mình ngày xưa.' };
}

export function daysAway(m: Member, ref = new Date()): number | undefined {
  return m.awaySince ? daysBetween(new Date(m.awaySince), ref) : undefined;
}

export function daysToTet(ref = new Date()): number {
  return daysBetween(ref, nextSolarForLunar(1, 1, ref));
}

export function visibleStories(s: AppState) {
  return s.stories.filter(
    (st) =>
      st.privacy === 'family' ||
      st.tellerId === s.meId ||
      (st.privacy === 'selected' && (st.sharedWith ?? []).includes(s.meId)),
  );
}

export function lunarToday(ref = new Date()) {
  return lunarOf(ref);
}

const CALL_DAY = { sun: 'Chủ nhật', sat: 'Thứ Bảy', wed: 'Thứ Tư' } as const;

/** Lần tới Homeletter gọi, theo giờ của người được gọi. */
export function nextCallLabel(s: AppState): string {
  return `${CALL_DAY[s.settings.aiCallDay]}, 20:00`;
}
