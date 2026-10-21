import type { Role } from '@/data/types';

export const ROLES: Array<{ label: string; role: Role }> = [
  { label: 'Con gái', role: 'con' }, { label: 'Con trai', role: 'con' }, { label: 'Mẹ', role: 'me' },
  { label: 'Bố', role: 'bo' }, { label: 'Bà', role: 'ba' }, { label: 'Ông', role: 'ong' },
  { label: 'Chị', role: 'chi' }, { label: 'Anh', role: 'anh' }, { label: 'Em', role: 'em' },
];

export function inviteMessage(familyName: string, code: string): string {
  return `Cả nhà ơi, vào "${familyName}" trên app Homeletter để xem ảnh mỗi ngày và nghe chuyện của nhau nhé! Mã nhà: ${code}\nhomeletter://join/${code}`;
}

/** Bố mẹ, ông bà là "thế hệ trên": AI xưng "cháu" và hỏi chuyện đời. */
export function isElder(role: Role): boolean {
  return role === 'bo' || role === 'me' || role === 'ong' || role === 'ba';
}
