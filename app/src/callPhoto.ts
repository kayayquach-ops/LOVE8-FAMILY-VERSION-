// Bước xin ảnh trong cuộc gọi: Mây hỏi, người nghe bấm nút hoặc trả lời bằng giọng. Hàm thuần, kiểm bằng src/callPhoto.test.ts.
// Chặng nào cũng có lối ra (nút, giọng, hẹn giờ), nên cuộc gọi không bao giờ đứng ở đây.
import { relayNone } from './shared';

type Lang = 'vi' | 'en' | 'ko';

/** ask: Mây đang hỏi. listen: đang nghe câu trả lời. think: máy chủ đang chép lời (máy không tự chép được).
 * wait: chỉ chờ bấm nút. picker: khung chọn ảnh đang mở. done: xong, end cho biết vì sao. */
export type PhotoStage = 'ask' | 'listen' | 'think' | 'wait' | 'picker' | 'done';
export type PhotoEnd = 'photos' | 'later' | 'no' | 'timeout' | 'hangup';
export type PhotoState = { stage: PhotoStage; end: PhotoEnd | null };
export type PhotoEvent =
  | { type: 'asked' }
  /** text null: có nói nhưng chưa có lời chép (đang nhờ máy chủ); '' là im lặng hoặc không chép được. */
  | { type: 'heard'; text: string | null }
  | { type: 'pick' }
  /** Khung chọn ảnh trả về, n = 0 là huỷ. */
  | { type: 'files'; n: number }
  | { type: 'later' }
  | { type: 'timeout' }
  | { type: 'hangup' };

export const PHOTO_START: PhotoState = { stage: 'ask', end: null };

/** Nghe câu trả lời ở bước ảnh tối đa chừng này: chỉ cần biết có hay không, không phải nghe kể. */
export const PHOTO_HEAR_MS = 12000;

/** Mỗi chặng chờ tối đa bao lâu rồi tự đi tiếp (ms). Lúc Mây hỏi không hẹn giờ (câu nói luôn tự xong, speech.ts có hẹn giờ riêng).
 * Lúc nghe đã có giới hạn riêng (PHOTO_HEAR_MS), hẹn giờ ở đây chỉ để chắc chắn: máy ghi âm không báo xong thì vẫn đi tiếp. */
export const PHOTO_WAIT: Partial<Record<PhotoStage, number>> = { listen: PHOTO_HEAR_MS + 4000, think: 7000, wait: 12000, picker: 60000 };

// i18n-ok-begin: mẫu nhận biết câu từ chối gửi ảnh ("để sau", "không có", "thôi"), không phải chữ hiện cho người dùng.
const PHOTO_NO: Record<Lang, RegExp> = {
  vi: /(^|\s)(để (sau|lúc khác|khi khác|hôm khác|bữa khác|lần khác|mai)|lần sau|lần khác|hôm khác|bữa khác|lúc khác|khi khác|thôi|khỏi|không (có|gửi|cần|muốn|đâu|ạ|nhé)|chưa (có|tìm|gửi|cần|muốn))(\s|$)/,
  en: /(^|\s)(later|next time|another time|not (right )?now|not today|no|nope|nah|nothing|skip|don'?t have|do not have)(\s|$)/,
  ko: /(나중에|다음에|없어|없습니다|없네요|아니요|아뇨|아니에요|괜찮아요|됐어요|안 (할|보낼)게요)/,
};
// i18n-ok-end

/** Câu trả lời ngắn có ý "để sau", "không có", "thôi" không. Dùng lại relayNone (bước lời nhắn) rồi thêm các câu riêng của bước ảnh.
 * Lời rỗng không tính là từ chối: im lặng hay máy không chép được thì vẫn chờ bấm nút. */
export function photoNo(text: string | null | undefined, lang: Lang = 'vi'): boolean {
  const s = String(text ?? '').toLowerCase().normalize('NFC').replace(/[.,!?…~"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.split(' ').length > 10) return false;
  return relayNone(s, lang) || PHOTO_NO[lang].test(s);
}

/** Chặng kế tiếp. Sự kiện không hợp chặng hiện tại thì trả lại đúng đối tượng cũ (nơi gọi so sánh để bỏ qua). */
export function photoNext(s: PhotoState, e: PhotoEvent, lang: Lang = 'vi'): PhotoState {
  if (s.stage === 'done') return s;
  const end = (x: PhotoEnd): PhotoState => ({ stage: 'done', end: x });
  const to = (stage: PhotoStage): PhotoState => (stage === s.stage ? s : { stage, end: null });
  switch (e.type) {
    case 'hangup': return end('hangup');
    case 'later': return end('later');
    case 'files': return e.n > 0 ? end('photos') : s.stage === 'picker' ? to('wait') : s;
    // Luôn là đối tượng mới, kể cả khi đang mở khung chọn ảnh: bấm lại thì tính giờ lại.
    case 'pick': return { stage: 'picker', end: null };
    case 'asked': return s.stage === 'ask' ? to('listen') : s;
    case 'heard':
      if (s.stage !== 'listen' && s.stage !== 'think') return s;
      if (e.text === null) return s.stage === 'listen' ? to('think') : to('wait');
      return photoNo(e.text, lang) ? end('no') : to('wait');
    case 'timeout':
      if (s.stage === 'listen' || s.stage === 'think') return to('wait');
      return s.stage === 'wait' || s.stage === 'picker' ? end('timeout') : s;
  }
  return s;
}

/** Mic chỉ tắt lúc chờ bấm nút, lúc khung chọn ảnh mở và lúc chờ máy chủ chép lời. Lúc Mây hỏi, lúc nghe và khi xong thì như cả cuộc gọi. */
export const photoMic = (s: PhotoState) => s.stage === 'ask' || s.stage === 'listen' || s.stage === 'done';
