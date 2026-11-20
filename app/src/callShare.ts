// Bước xin phép chia sẻ cuối chuyện chính: Mây hỏi "chia sẻ cho cả nhà nghe được không?", người kể trả lời bằng giọng hoặc bấm nút.
// Cùng khuôn với bước xin ảnh (callPhoto.ts). Hàm thuần, kiểm bằng src/callShare.test.ts.
// Chặng nào cũng có lối ra (nút, giọng, hẹn giờ). Không đồng ý, không trả lời, hết giờ hay cúp máy thì chuyện giữ riêng.

type Lang = 'vi' | 'en' | 'ko';

/** ask: Mây đang hỏi. listen: đang nghe câu trả lời. think: máy chủ đang chép lời (máy không tự chép được).
 * wait: chỉ chờ bấm nút. done: xong, end cho biết vì sao. */
export type ShareStage = 'ask' | 'listen' | 'think' | 'wait' | 'done';
export type ShareEnd = 'yes' | 'no' | 'timeout' | 'hangup';
/** again: chế độ chặt đã nghe tiếp một lần vì câu trả lời chỉ có tiếng đệm (shareNext). */
export type ShareState = { stage: ShareStage; end: ShareEnd | null; again?: boolean };
/** strict: chế độ chặt của Mây Live (shareAnswer). Không truyền thì như màn cũ, từng chữ. */
export type ShareOpts = { strict?: boolean };
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
/** Lời từ chối rõ ràng: xét trước tiên, có nó thì câu "không sao", "no problem" cũng thành giữ riêng ("không sao đâu, đừng chia sẻ").
 * Câu hỏi ngược "sao không chia sẻ" đứng đầu câu trả lời là đồng ý ("không sao, không chia sẻ" thì vẫn là từ chối); "I don't mind" không phải từ chối. */
const SHARE_REFUSE: Record<Lang, RegExp> = {
  vi: /(^|\s)(đừng|giữ riêng|để sau|(?<!^sao )không chia sẻ)(\s|$)/,
  en: /(^|\s)(private|don['’]?t(?! mind)|keep it)(\s|$)/,
  ko: /(안 ?\S+도 ?돼|하지 ?마|말아)/,
};
/** Có chữ phủ định mà vẫn là đồng ý ("không sao", "sao không", "được thôi", "I don't mind"): xét ngay sau lời từ chối rõ ràng. */
const SHARE_SURE: Partial<Record<Lang, RegExp>> = {
  vi: /(^|\s)(không sao|sao không|chia sẻ đi|được thôi|thôi được)(\s|$)/,
  en: /(^|\s)(no problem|why not|don['’]?t mind)(\s|$)/,
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
/** "dạ", "có", "ừm", "ờ" chỉ là đồng ý khi là cả câu trả lời, có thể kèm ạ, chứ, vâng, được, rồi, có ("dạ", "dạ được", "dạ có ạ"):
 *  đứng trong câu dài thì thường là tiếng đệm trước khi lưỡng lự ("dạ để con nghĩ đã", "có ai nghe"). */
const SHARE_YES_WHOLE: Partial<Record<Lang, RegExp>> = {
  vi: /^(dạ|có|ừm|ờ)( (ạ|chứ|vâng|được|rồi|có)){0,2}$/,
};
/** Câu lưỡng lự: chưa rõ, chờ bấm nút ("có lẽ", "có thể", "có khi", "để mẹ nghĩ đã", "để con xem", "để mẹ tính"). */
const SHARE_HEDGE: Partial<Record<Lang, RegExp>> = {
  vi: /(^|\s)(có lẽ|có thể|có khi)(\s|$)|(^|\s)để( \S+)* (nghĩ|xem|tính)(\s|$)/,
};
/** Chế độ chặt (Mây Live: Gemini khép lượt sau 1,6 giây im, nên câu trả lời hay dừng ở "dạ", "yeah", "네" là tiếng đệm): thêm câu lưỡng lự... */
const STRICT_HEDGE: Record<Lang, RegExp> = {
  vi: /(^|\s)(khoan|từ từ|chờ|đợi|không biết)(\s|$)/,
  en: /(^|\s)(maybe|not sure|let me|wait|hold on|i guess|hmm+|um+|uh+)(\s|$)/,
  ko: /(글쎄|생각|잠깐|아마|모르)/,
};
/** ...và chỉ lời đồng ý rõ ràng mới là đồng ý (không có SHARE_YES_WHOLE). "안 좋아요", "못 들려줘", 좋아하- không tính. Không bao giờ thêm 괜찮아요. */
const STRICT_YES: Record<Lang, RegExp> = {
  vi: /(^|\s)(được|đồng ý|chia sẻ|có chứ)(\s|$)/,
  en: /(^|\s)(yes|sure|go ahead|of course|please do|share it|that['’]?s fine)(\s|$)/,
  ko: /(?<!(안|못) ?)(좋아요|좋아(?![하해했])|그래요|돼요|되요|공유해|들려줘|물론)/,
};
/** Câu hỏi ngược ở chế độ chặt: đuôi câu "là sao", "cơ", "ai", "gì", "nào", "à", "hả" (không dùng "sao" trơn: "sao không" là đồng ý), "with who". */
const STRICT_ASK: Partial<Record<Lang, RegExp>> = {
  vi: /(^|\s)(là sao|cơ|ai|gì|nào|à|hả)$/,
  en: /(^|\s)with whom?(\s|$)/,
};
/** Tiếng đệm: cả câu chỉ có những chữ này (kèm ạ, chứ, rồi, nhé, 요). Chế độ chặt coi là chưa rõ và nghe tiếp một lần (shareNext). */
const BACKCHANNEL: Record<Lang, RegExp> = {
  vi: /^(dạ|vâng|ừ|ừm|ờ|có|rồi|ok|okay|ạ|chứ|nhé)( (dạ|vâng|ừ|ừm|ờ|có|rồi|ok|okay|ạ|chứ|nhé))*$/,
  en: /^(yeah|yep|yup|ok|okay|mm|mhm|uh huh|right|alright)( (yeah|yep|yup|ok|okay|mm|mhm|uh huh|right|alright))*$/,
  ko: /^(네|예|응|어|음)+요?( (네|예|응|어|음)+요?)*$/,
};
// i18n-ok-end

const norm = (raw: string) => raw.toLowerCase().normalize('NFC').replace(/[.,!?…~"“”]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Câu trả lời ngắn là đồng ý, từ chối, hay chưa rõ (null: chờ bấm nút). Gọn chữ như photoNo; lời rỗng hay dài quá 10 từ thì chưa rõ.
 *  Đồng ý nhầm thì không gỡ được (tập, sổ nhớ sang cả nhà, có báo), còn chưa rõ chỉ hiện hai nút rồi hết giờ là giữ riêng: nghi thì chưa rõ.
 *  o.strict (Mây Live): thêm câu lưỡng lự STRICT_HEDGE và câu hỏi ngược STRICT_ASK, và sau lời từ chối chỉ lời đồng ý rõ ràng STRICT_YES mới là đồng ý. */
export function shareAnswer(text: string | null | undefined, lang: Lang = 'vi', o: ShareOpts = {}): 'yes' | 'no' | null {
  const raw = String(text ?? '');
  const s = norm(raw);
  if (!s || s.split(' ').length > 10) return null;
  if (SHARE_REFUSE[lang].test(s)) return 'no';
  // Có dấu hỏi là hỏi lại ("dạ?" của người lớn tuổi là "gì cơ?"), hay lưỡng lự: chưa rõ. Xét trước "không sao" ("không sao, để mẹ nghĩ đã").
  if (/[?？]/.test(raw) || SHARE_HEDGE[lang]?.test(s) || (o.strict && (STRICT_HEDGE[lang].test(s) || STRICT_ASK[lang]?.test(s)))) return null;
  if (SHARE_SURE[lang]?.test(s)) return 'yes';
  if (SHARE_NO[lang].test(s)) return 'no';
  if (o.strict) return STRICT_YES[lang].test(s) ? 'yes' : null;
  return SHARE_YES[lang].test(s) || SHARE_YES_WHOLE[lang]?.test(s) ? 'yes' : null;
}

/** Chặng kế tiếp. Sự kiện không hợp chặng hiện tại thì trả lại đúng đối tượng cũ (nơi gọi so sánh để bỏ qua). o.strict: shareAnswer chặt, và câu
 *  trả lời chỉ có tiếng đệm lúc đang nghe thì nghe tiếp một lần (đối tượng mới, again), để "dạ" rồi "được" ở hai lượt vẫn là đồng ý. */
export function shareNext(s: ShareState, e: ShareEvent, lang: Lang = 'vi', o: ShareOpts = {}): ShareState {
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
      const a = shareAnswer(e.text, lang, o);
      if (a) return end(a);
      if (o.strict && s.stage === 'listen' && !s.again && BACKCHANNEL[lang].test(norm(e.text))) return { stage: 'listen', end: null, again: true };
      return to('wait');
    }
    case 'timeout':
      if (s.stage === 'listen' || s.stage === 'think') return to('wait');
      return s.stage === 'wait' ? end('timeout') : s;
  }
  return s;
}

/** Mic chỉ tắt lúc chờ bấm nút và lúc chờ máy chủ chép lời. Lúc Mây hỏi, lúc nghe và khi xong thì như cả cuộc gọi. */
export const shareMic = (s: ShareState) => s.stage === 'ask' || s.stage === 'listen' || s.stage === 'done';
