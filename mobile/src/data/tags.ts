import type { PostTag } from './types';

// Nhãn cho ảnh gửi cả nhà: gắn với nghi thức hỏi han của nhà Việt.
export const POST_TAGS: Array<{ tag: PostTag; label: string; caption: string }> = [
  { tag: 'an-com', label: 'Ăn cơm chưa?', caption: 'Con ăn cơm rồi nè!' },
  { tag: 'binh-an', label: 'Bình an', caption: 'Hôm nay con vẫn ổn ạ' },
  { tag: 'nho-nha', label: 'Nhớ nhà', caption: 'Nhớ nhà quá' },
  { tag: 'di-hoc', label: 'Đi học', caption: 'Đang ở trường' },
  { tag: 'di-lam', label: 'Đi làm', caption: 'Đi làm thôi' },
  { tag: 'khoe', label: 'Khoe nè', caption: 'Khoe cả nhà cái này' },
];

export function tagLabel(tag?: PostTag): string | undefined {
  return POST_TAGS.find((t) => t.tag === tag)?.label;
}
