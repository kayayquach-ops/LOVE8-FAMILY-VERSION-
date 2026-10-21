import type { AppState, FamilyEvent, Member, Role } from '@/data/types';
import { daysBetween, lunarOf, nextSolarAnniversary, nextSolarForLunar } from './lunar';

export const member = (s: AppState, id: string): Member | undefined => s.family.members.find((m) => m.id === id);
export const me = (s: AppState): Member => member(s, s.meId) ?? s.family.members[0];
export const others = (s: AppState): Member[] => s.family.members.filter((m) => m.id !== s.meId);

export function isToday(iso: string, ref = new Date()): boolean {
  return daysBetween(new Date(iso), ref) === 0;
}

export function postedToday(s: AppState, memberId: string): boolean {
  return s.posts.some((p) => p.authorId === memberId && isToday(p.createdAt));
}

/** Số ngày kể từ lần cuối mình gọi cho người này (người dùng tự bấm "Đã gọi"). */
export function daysSinceCall(s: AppState, memberId: string): number {
  const last = s.calls[memberId];
  return last ? daysBetween(new Date(last), new Date()) : 99;
}

export type Nudge = { member: Member; days: number; starter: string };

// Câu mở lời gợi ý, chọn theo vai của người được gọi.
const STARTERS: Partial<Record<Role, string>> = {
  me: 'Hỏi mẹ món canh mẹ hay nấu hồi con còn bé',
  bo: 'Hỏi bố vườn nhà mình dạo này có cây gì mới',
  ong: 'Hỏi ông dạo này ông có hay đi tập thể dục buổi sáng không',
  ba: 'Hỏi bà hôm nay bà ăn gì, ngủ có ngon không',
  em: 'Gửi em một bức ảnh nơi mình đang ở',
  anh: 'Kể cho anh nghe một chuyện vui ở trường tuần này',
  chi: 'Kể cho chị nghe một chuyện vui ở trường tuần này',
  con: 'Hỏi con tuần này ăn uống thế nào, có ngủ đủ không',
};

export function nudges(s: AppState): Nudge[] {
  return others(s)
    .map((m) => ({ member: m, days: daysSinceCall(s, m.id), starter: STARTERS[m.role] ?? 'Hỏi thăm hôm nay mọi người thế nào' }))
    .filter((n) => n.days >= s.settings.nudgeAfterDays)
    .sort((a, b) => b.days - a.days);
}

export type UpcomingEvent = { event: FamilyEvent; date: Date; inDays: number };

export function nextOccurrence(e: FamilyEvent, from = new Date()): Date {
  return e.calendar === 'lunar' ? nextSolarForLunar(e.day, e.month, from) : nextSolarAnniversary(e.day, e.month, from);
}

export function upcoming(s: AppState, from = new Date()): UpcomingEvent[] {
  return s.events
    .map((event) => {
      const date = nextOccurrence(event, from);
      return { event, date, inDays: daysBetween(from, date) };
    })
    .sort((a, b) => a.inDays - b.inDays);
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
