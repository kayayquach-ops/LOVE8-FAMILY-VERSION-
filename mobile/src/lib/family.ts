export function inviteMessage(familyName: string, code: string): string {
  return `Cả nhà ơi, vào "${familyName}" trên app Homeletter để xem ảnh mỗi ngày và nghe chuyện của nhau nhé! Mã nhà: ${code}\nhomeletter://join/${code}`;
}

/** Câu hỏi đầu tiên khi mở app: bạn là ai trong nhà. Bản demo gắn mỗi lựa chọn với một người trong gia đình mẫu. */
export const WHO: Array<{ label: string; memberId: string; elder: boolean }> = [
  { label: 'Mẹ', memberId: 'me', elder: true },
  { label: 'Bố', memberId: 'bo', elder: true },
  { label: 'Con gái', memberId: 'lan', elder: false },
  { label: 'Con trai', memberId: 'nam', elder: false },
];
