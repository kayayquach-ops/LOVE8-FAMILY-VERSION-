// Lớp lọc chống bịa cho câu AI viết (vi, en, ko) và đọc ngày tháng trong lời kể. Không gọi mạng, không đụng DB, kiểm bằng server/guard.test.ts.
import type { Lang } from './i18n.ts';

export type Allow = { prevCall: boolean; ownStory: boolean; photos: boolean };

// i18n-ok-begin: dấu hiệu bịa và tên gọi chung theo từng thứ tiếng, không phải chữ hiện cho người dùng.
// Chữ viết hoa được phép dù không có trong dữ liệu: xưng hô, tên app, ngày lễ, thứ trong tuần.
const NAME_OK = new Set([
  'bố', 'mẹ', 'con', 'bà', 'ông', 'cô', 'chú', 'dì', 'anh', 'chị', 'em', 'mây', 'sweet', 'home', 'tết',
  'i', 'mom', 'dad', 'mommy', 'daddy', 'mum', 'mother', 'father', 'ok', 'okay', 'oh', 'hi', 'hello', 'hey',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'new', 'year', 'lunar', 'christmas', 'easter', 'thanksgiving', 'chuseok', 'seollal', 'may',
]);
// Gốc chữ trước "님" được phép: xưng hô chung, không phải tên riêng.
const KO_OK = new Set(['어머', '아버', '어머니', '아버지', '할머', '할아버', '부모', '선생', '형', '누', '따', '아드', '손', '사모', '고객', '사장', '하느', '하나']);

/** Mỗi nhóm: [lý do, mẫu]. Chạy cho mọi thứ tiếng (mẫu tiếng này không khớp câu tiếng kia). */
const ALWAYS: Array<[string, RegExp]> = [
  ['mốc thời gian không có trong dữ liệu', /hôm (trước|qua|kia|nọ)|lúc nãy|vừa nãy|mới đây|hồi sáng nay/],
  ['mốc thời gian không có trong dữ liệu', /\byesterday\b|\bthe other day\b|\bearlier today\b|\ba (moment|minute|little while) ago\b|\bjust now\b|\blast night\b/],
  ['mốc thời gian không có trong dữ liệu', /어제|그저께|엊그제|아까(?![워운웠와])|방금|얼마 전/],
  ['nhắc tin nhắn không có trong dữ liệu', /tin nhắn\s+(của\s+)?(bạn|bố|mẹ|con)|(bạn|bố|mẹ)\s+(đã\s+)?nhắn\s+(cho|với)/],
  ['nhắc tin nhắn không có trong dữ liệu', /\byour (text|message|note)s?\b|\byou (texted|messaged)\b|\b(message|text)s? you (sent|wrote|left)\b/],
  ['nhắc tin nhắn không có trong dữ liệu', /(보내\s?주신|보내신|보낸|남기신|남겨\s?주신|남긴)\s*(메시지|문자|글|편지)|(메시지|문자)(를|도)?\s*(보내\s?주셨|보내셨|남기셨|보냈)/],
];
const PREV_CALL: RegExp[] = [
  /(lần|buổi|tuần|cuộc gọi|lượt)\s+trước|lần\s+(gọi\s+)?(vừa\s+)?rồi|cuộc gọi\s+(vừa\s+)?rồi/,
  /\blast (time|call|chat|talk)\b|\bprevious (call|chat|time|conversation)\b|\b(when|since) we last (talked|spoke|chatted)\b|\blast week'?s call\b|\bour last\b/,
  /지난번|저번에|저번\s*(통화|이야기|얘기)|지난\s*(통화|대화)|이전\s*(통화|대화)|전에\s*통화/,
];
const OWN_STORY: RegExp[] = [
  /(đã|từng|có lần|hay|vừa)\s+(kể|nói|chia sẻ|nhắc)(\s|$|[,.?!])|như\s+(bạn|bố|mẹ)\s+(đã\s+)?(kể|nói)/,
  /\byou (told|mentioned|said|shared|were telling)\b|\byou'?ve (told|mentioned|said|shared)\b|\b(as|like) you (said|told|mentioned|shared)\b|(?<!\b(do|can|could) you )\bremember when\b|\bremember when we\b/,
  /말씀(하신|하셨던|하셨잖|해\s?주신|해\s?주셨던)|(얘기|이야기)(하신|하셨던|했던|해\s?주신|해\s?주셨던)|말했던|말한\s*(것처럼|대로)|전에\s*(말씀|얘기|이야기|말)/,
];
const PHOTOS: RegExp[] = [
  /ảnh[^.?!]{0,25}\s(bạn|bố|mẹ)\s+(đã\s+|vừa\s+)?(gửi|chụp|đăng|chia sẻ)|(đã|vừa|từng)\s+(gửi|đăng|chụp)[^.?!]{0,25}ảnh|như\s+\S+\s+đã\s+gửi/,
  /\b(photo|picture|pic|image)s?\s+(that\s+)?you\s+(just\s+)?(sent|shared|posted|took|uploaded)\b|\byou\s+(just\s+)?(sent|shared|posted|uploaded)\s+((me|us)\s+)?(a|the|that|those|some|your)?\s*(photo|picture|pic|image)|\bas you (sent|shared|posted)\b|\byour (photo|picture)s? of\b/,
  /(보내\s?주신|보내신|보낸|올리신|올려\s?주신|올린|찍어\s?주신|찍으신)\s*사진|사진(을|도)?\s*(보내\s?주셨|보내셨|올리셨|올려\s?주셨|보냈)|보내\s?주신\s*(것|대로)/,
];
const GENDER: Array<[RegExp, RegExp]> = [
  [/\bdaughters?\b|con gái|딸(?!기)|따님/, /\bdaughter\b|con gái|\bboth\b|cả trai lẫn gái/],
  [/\bsons?\b|con trai|아들|아드님/, /\bson\b|con trai|\bboth\b|cả trai lẫn gái/],
];

const fold = (s: string) => s.toLowerCase().normalize('NFC');

/** Lý do câu này có dấu hiệu bịa (nhắc điều không có trong dữ liệu), hoặc null nếu ổn. haystack là toàn bộ dữ liệu thật đã đưa vào. */
export function suspect(text: string, haystack: string, allow: Allow, lang: Lang = 'vi'): string | null {
  const t = fold(text);
  for (const [why, re] of ALWAYS) if (re.test(t)) return why;
  if (!allow.prevCall && PREV_CALL.some((re) => re.test(t))) return 'nhắc cuộc gọi trước không có';
  if (!allow.ownStory && OWN_STORY.some((re) => re.test(t))) return 'nhắc điều đã kể mà chưa có';
  if (!allow.photos && PHOTOS.some((re) => re.test(t))) return 'nhắc ảnh đã gửi mà chưa có';
  const hay = fold(haystack);
  for (const n of text.match(/\d+/g) ?? []) if (!hay.includes(n)) return `con số ${n} không có trong dữ liệu`;
  // Nước, thành phố viết bằng chữ Hàn (chữ Latin đã do phần kiểm tên viết hoa lo): phải có trong dữ liệu.
  for (const m of t.matchAll(/한국|베트남|미국|일본|중국|호주|서울|부산|하노이|호찌민|다낭/g)) if (!hay.includes(m[0])) return `nơi chốn "${m[0]}" không có trong dữ liệu`;
  // Con trai hay con gái: chỉ nói khi dữ liệu có (đáp án onboarding "kid").
  for (const [re, ok] of GENDER) if (re.test(t) && !ok.test(hay)) return 'đoán con trai hay con gái';
  // Tên viết bằng chữ Latin (Lan, Minh, Grandma...): chữ hoa giữa câu phải có trong dữ liệu.
  for (const sentence of text.match(/[^.!?…]+[.!?…]*/g) ?? []) {
    const toks = sentence.trim().split(/\s+/);
    for (let k = 0; k < toks.length; k++) {
      const raw = toks[k].replace(/^[^\p{L}]+/u, '');
      // Chỉ lấy phần chữ Latin đầu (Lan trong "Lan님", I trong "I'm").
      const w = raw.match(/^\p{Script=Latin}+/u)?.[0] ?? '';
      if (!w || !/^\p{Lu}/u.test(w)) continue;
      if (k === 0) {
        // Đầu câu chỉ kiểm khi đó là tên gọi: "Lan ơi," (vi), "Lan, ..." (en), còn tiếng Hàn thì chữ Latin đầu câu gần như luôn là tên.
        const vocative = lang === 'vi' ? fold(toks[1] ?? '').replace(/[^\p{L}]/gu, '') === 'ơi'
          : lang === 'en' ? /^\p{L}+,/u.test(raw) : true;
        if (!vocative) continue;
      }
      if (NAME_OK.has(fold(w)) || hay.includes(fold(w))) continue;
      return `tên "${w}" không có trong dữ liệu`;
    }
  }
  // Tên viết bằng chữ Hàn: "민수님", "민수 씨".
  for (const m of text.matchAll(/([가-힣]{1,4})님|([가-힣]{1,4})\s씨(?=[\s,.!?은는이가를도께의요]|$)/g)) {
    const stem = m[1] ?? m[2];
    if (KO_OK.has(stem) || hay.includes(stem)) continue;
    return `tên "${stem}" không có trong dữ liệu`;
  }
  return null;
}
// i18n-ok-end: lý do trả về chỉ để ghi log máy chủ.

// ---------- Ngày tháng trong lời kể ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const ORD = '(?:st|nd|rd|th)?';

export type DayMonth = { day: number; month: number; year: number | null };

/** Đọc một ngày có cả ngày lẫn tháng: "ngày 12 tháng 3 năm 1995", "12/3/1995", "March 12, 1995", "12 March 1995", "1995년 3월 12일". */
export function parseDate(text: string, lang: Lang = 'vi'): DayMonth | null {
  const t = text.toLowerCase();
  const out = (d: string | number, m: string | number, y?: string) => {
    const day = +d, month = +m, year = y ? +y : null;
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 ? { day, month, year } : null;
  };
  let m: RegExpMatchArray | null;
  // i18n-ok-begin
  if ((m = t.match(/ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}))?/))) return out(m[1], m[2], m[3]);
  // i18n-ok-end
  if ((m = t.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) return out(m[3], m[2], m[1]);
  if ((m = t.match(new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s*(\\d{4}))?`)))) return out(m[2], MONTHS[m[1]], m[3]);
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MON})\\b\\.?(?:,?\\s*(\\d{4}))?`)))) return out(m[1], MONTHS[m[2]], m[3]);
  if ((m = t.match(/\b(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\b/))) return out(m[3], m[2], m[1]);
  if ((m = t.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{4}))?\b/))) {
    const a = +m[1], b = +m[2];
    if (lang === 'vi') return out(a, b, m[3]);
    // Tiếng Anh viết số dễ nhầm (3/12 là 12 tháng 3 hay 3 tháng 12): chỉ nhận khi một số lớn hơn 12.
    if (lang === 'en') return a > 12 ? out(a, b, m[3]) : b > 12 ? out(b, a, m[3]) : null;
  }
  return null;
}
