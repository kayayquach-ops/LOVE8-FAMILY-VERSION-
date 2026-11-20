// Bước xin phép chia sẻ cuối chuyện chính: Mây hỏi "chia sẻ cho cả nhà nghe được không?", người kể trả lời bằng giọng hoặc bấm nút.
// Cùng khuôn với bước xin ảnh (callPhoto.ts). Hàm thuần, kiểm bằng src/callShare.test.ts.
// Chặng nào cũng có lối ra (nút, giọng, hẹn giờ). Không đồng ý, không trả lời, hết giờ hay cúp máy thì chuyện giữ riêng.

type Lang = 'vi' | 'en' | 'ko';

/** ask: Mây đang hỏi. listen: đang nghe câu trả lời. think: máy chủ đang chép lời (máy không tự chép được).
 * wait: chỉ chờ bấm nút. done: xong, end cho biết vì sao. */
export type ShareStage = 'ask' | 'listen' | 'think' | 'wait' | 'done';
export type ShareEnd = 'yes' | 'no' | 'timeout' | 'hangup';
export type ShareState = { stage: ShareStage; end: ShareEnd | null };
export type ShareEvent =
  | { type: 'asked' }
  /** text null: có nói nhưng chưa có lời chép (đang nhờ máy chủ); '' là im lặng hoặc không chép được. */
  | { type: 'heard'; text: string | null }
  | { type: 'yes' }
  | { type: 'no' }
  | { type: 'timeout' }
  | { type: 'hangup' };

export const SHARE_START: ShareState = { stage: 'ask', end: null };

/** Nghe câu trả lời tối đa chừng này: chỉ cần biết được hay không. */
export const SHARE_HEAR_MS = 8000;

/** Mỗi chặng chờ tối đa bao lâu rồi tự đi tiếp (ms). Lúc Mây hỏi không hẹn giờ (câu nói luôn tự xong). */
export const SHARE_WAIT: Partial<Record<ShareStage, number>> = { listen: SHARE_HEAR_MS + 4000, think: 7000, wait: 12000 };

// i18n-ok-begin: mẫu nhận biết câu đồng ý hay từ chối chia sẻ, không phải chữ hiện cho người dùng.
/** Có chữ phủ định mà vẫn là đồng ý ("không sao", "sao không", "chia sẻ đi"): xét trước tiên. */
const SHARE_SURE: Partial<Record<Lang, RegExp>> = {
  vi: /(^|\s)(không sao|sao không|chia sẻ đi)(\s|$)/,
  en: /(^|\s)(no problem|why not)(\s|$)/,
};
const SHARE_NO: Record<Lang, RegExp> = {
  vi: /(^|\s)(không|thôi|đừng|để sau|chưa|khỏi|giữ riêng)(\s|$)/,
  en: /(^|\s)(no|nope|not now|don['’]?t|private|later)(\s|$)/,
  ko: /(아니|싫어|안 ?돼|나중에)/,
};
const SHARE_YES: Record<Lang, RegExp> = {
  vi: /(^|\s)(được|ừ|ok|okay|vâng|đồng ý|có chứ)(\s|$)/,
  en: /(^|\s)(yes|yeah|sure|ok|okay|go ahead)(\s|$)/,
  ko: /(^|\s)네(\s|$)|좋아요|그래요|돼요/,
};
// i18n-ok-end

/** Câu trả lời ngắn là đồng ý, từ chối, hay chưa rõ (null: chờ bấm nút). Gọn chữ như photoNo; lời rỗng hay dài quá 10 từ thì chưa rõ. */
export function shareAnswer(text: string | null | undefined, lang: Lang = 'vi'): 'yes' | 'no' | null {
  const s = String(text ?? '').toLowerCase().normalize('NFC').replace(/[.,!?…~"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.split(' ').length > 10) return null;
  if (SHARE_SURE[lang]?.test(s)) return 'yes';
  if (SHARE_NO[lang].test(s)) return 'no';
  return SHARE_YES[lang].test(s) ? 'yes' : null;
}

/** Chặng kế tiếp. Sự kiện không hợp chặng hiện tại thì trả lại đúng đối tượng cũ (nơi gọi so sánh để bỏ qua). */
export function shareNext(s: ShareState, e: ShareEvent, lang: Lang = 'vi'): ShareState {
  if (s.stage === 'done') return s;
  const end = (x: ShareEnd): ShareState => ({ stage: 'done', end: x });
  const to = (stage: ShareStage): ShareState => (stage === s.stage ? s : { stage, end: null });
  switch (e.type) {
    case 'hangup': return end('hangup');
    case 'yes': return end('yes');
    case 'no': return end('no');
    case 'asked': return s.stage === 'ask' ? to('listen') : s;
    case 'heard': {
      if (s.stage !== 'listen' && s.stage !== 'think') return s;
      if (e.text === null) return s.stage === 'listen' ? to('think') : to('wait');
      const a = shareAnswer(e.text, lang);
      return a ? end(a) : to('wait');
    }
    case 'timeout':
      if (s.stage === 'listen' || s.stage === 'think') return to('wait');
      return s.stage === 'wait' ? end('timeout') : s;
  }
  return s;
}

/** Mic chỉ tắt lúc chờ bấm nút và lúc chờ máy chủ chép lời. Lúc Mây hỏi, lúc nghe và khi xong thì như cả cuộc gọi. */
export const shareMic = (s: ShareState) => s.stage === 'ask' || s.stage === 'listen' || s.stage === 'done';
