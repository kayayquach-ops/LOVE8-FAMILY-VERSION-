// Kiểu dữ liệu và danh mục dùng chung cho máy chủ và giao diện.

export type Role = 'bo' | 'me' | 'con';
export type Kind = 'photo' | 'video' | 'voice' | 'hug';

export type Member = { id: string; name: string; role: Role; avatar?: string | null; city?: string | null; phone?: string | null; lastSeen: string; loc?: MemberLoc };
/** Vị trí đang chia sẻ của một người (server/location.ts): chỉ có khi người đó tự bật chia sẻ và đã gửi vị trí.
 *  lat, lon làm tròn 4 số lẻ (khoảng 11 m). place: tên nơi gần nhất theo ba thứ tiếng, near là "gần {nơi}". tz: múi giờ nơi đó. */
export type MemberLoc = { lat: number; lon: number; at: string; tz: string; place: { vi: string; en: string; ko: string; near: boolean } };
export type Family = { id: string; name: string; code: string; mascotName?: string | null; mascotShape?: string | null };

// Linh vật của mỗi nhà: tên tự đặt (mặc định Mây) và một trong các hình có sẵn. cloud là bản gốc.
export const MASCOT_SHAPES = ['cloud', 'chick', 'bunny', 'kitten', 'bear', 'sprout', 'riceball', 'star'] as const;
export type MascotShape = (typeof MASCOT_SHAPES)[number];
export const isMascotShape = (v: unknown): v is MascotShape => (MASCOT_SHAPES as readonly unknown[]).includes(v);
// i18n-ok-begin: tên riêng của linh vật, giữ nguyên ở mọi thứ tiếng.
export const DEFAULT_MASCOT_NAME = 'Mây';
// i18n-ok-end
export const MASCOT_NAME_MAX = 20;
/** Tên linh vật đã làm sạch: bỏ khoảng trắng thừa và ký tự điều khiển; rỗng hoặc dài quá thì null. */
export function cleanMascotName(v: unknown): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f{}<>]/g, '').replace(/\s+/g, ' ').trim().normalize('NFC');
  const n = [...s].length;
  return n >= 1 && n <= MASCOT_NAME_MAX ? s : null;
}
export const mascotNameOf = (f?: { mascotName?: string | null } | null) => f?.mascotName || DEFAULT_MASCOT_NAME;
const KO_JOSA: Record<string, string> = { 는: '은', 가: '이', 예요: '이에요', 를: '을', 와: '과' };
/** Thay {mascot} bằng tên linh vật. Tiếng Hàn: tên tận cùng bằng âm có patchim thì đổi trợ từ (는→은, 가→이, 예요→이에요...). */
export function fillMascot(s: string, name: string, lang?: string): string {
  if (!s.includes('{mascot}')) return s;
  const last = name.charCodeAt(name.length - 1);
  if (lang === 'ko' && last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0) {
    s = s.replace(/\{mascot\}(는|가|예요|를|와)/g, (_m, j: string) => `{mascot}${KO_JOSA[j]}`);
  }
  return s.split('{mascot}').join(name);
}
export type Reply = { id: string; authorId: string; kind: 'voice' | 'text'; media?: string | null; text?: string | null; seconds?: number | null; createdAt: string };
export type Post = {
  id: string; authorId: string; kind: Kind; media?: string | null; caption?: string | null; meal: boolean; seconds?: number | null;
  questionWeek?: string | null; createdAt: string; reactions: Record<string, string>; replies: Reply[];
  /** Ảnh chụp chung do AI ghép: id lượt chụp và ảnh thật của từng người (để hiện nhãn "ảnh ghép AI" và hàng ảnh thật). */
  shotId?: string | null; shotParts?: string[];
};
/** Lời xin vào nhà đang chờ (server/join.ts): chỉ người duyệt nhận được danh sách này. */
export type JoinRequest = { id: string; name: string; role: Role; city: string | null; createdAt: string };
/** approverId: người duyệt người mới (người vào nhà sớm nhất còn ở nhà). requests: chỉ người duyệt có; waiting: người khác chỉ biết số người đang chờ. */
export type Me = { family: Family; me: Member; members: Member[]; unseen: number; approverId?: string | null; requests?: JoinRequest[]; waiting?: number;
  /** Mình có đang bật chia sẻ vị trí với cả nhà không (chỉ người gọi /api/me biết của chính mình). */
  locShare?: boolean };

export type Week = {
  week: string;
  question: string;
  missions: Array<{ key: string; text: string; points: number; done: boolean; doneBy: string[] }>;
  jar: { points: number; level: number; capacity: number; gifts: number };
  recap: { photos: number; videos: number; voices: number; hugs: number; meals: Post[]; top?: Post | null };
};

// Cuộc gọi hằng tuần và podcast. Tên chủ đề nằm trong bảng chữ máy chủ (khoá `topic.<mã>`).
export const TOPICS = ['ngay-cuoi', 'tuoi-tho', 'mon-an', 'ky-niem', 'cuoc-song', 'loi-nhan'] as const;
export type Topic = (typeof TOPICS)[number];
export const isTopic = (v: unknown): v is Topic => (TOPICS as readonly unknown[]).includes(v);
export const EVENT_HINTS = ['none', 'wedding', 'anniversary', 'birthday', 'memory'] as const;
export type CallQuestion = { text: string; topic: Topic; photo: boolean; event: (typeof EVENT_HINTS)[number] };
/** `lang`: thứ tiếng của bộ câu (bản cũ không có là tiếng Việt). `mascot`: tên linh vật lúc soạn (bản cũ không có là Mây). */
export type CallScript = { greeting: string; questions: CallQuestion[]; goodbye: string; source: 'ai' | 'template' | 'first'; lang?: 'vi' | 'en' | 'ko'; mascot?: string };

/** Hàm tra chữ: máy khách truyền `t`, máy chủ truyền `tServer` theo ngôn ngữ của người nghe. */
export type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** Câu cố định trong cuộc gọi (chào, đáp mẫu, nhắc, tạm biệt). Máy chủ nạp sẵn giọng Gemini cho từng câu, nên chỉ phụ thuộc vai, không phụ thuộc tên.
 * Chữ nằm ở bảng chữ máy khách (khoá `call.line.*`); máy chủ tra cùng bảng ấy, chỉ một nguồn. */
export function callLines(role: string, tr: Tr) {
  const parent = role === 'bo' || role === 'me';
  const who = parent ? 'parent' : 'child';
  const self = role === 'bo' ? tr('call.self.bo') : role === 'me' ? tr('call.self.me') : '';
  const Self = self ? self[0].toUpperCase() + self.slice(1) : '';
  const L = (k: string) => tr(`call.line.${k}.${who}`, { self, Self });
  return {
    ack: L('ack'),
    slow: L('slow'),
    busy: L('busy'),
    skip: L('skip'),
    photo: L('photo'),
    short: [1, 2].map((n) => L(`short${n}`)),
    long: [1, 2, 3].map((n) => L(`long${n}`)),
    /** Lời nhắn khó nói: câu hỏi cuối cuộc gọi, câu nhận lời, câu mở đầu khi chuyển lời người khác nhắn. */
    relay: L('relay'),
    relayOk: L('relayOk'),
    relayIntro: L('relayIntro'),
  };
}
export const CALL_ROLES = ['bo', 'me', 'con'] as const;

/** Mây hỏi thêm: tối đa 2 lượt mỗi câu chuyện (turn 1, 2), tối đa 4 lượt mỗi cuộc gọi. */
export const MAX_STORY_FOLLOW = 2;
export const MAX_CALL_FOLLOW = 4;

/** Kết quả AI sau mỗi lượt kể (POST /call/:id/reply, hoặc /answer khi máy chủ tự chép lời). */
export type TurnAI = {
  /** Câu đáp ngắn theo điều vừa kể, null thì máy khách dùng câu mẫu. */
  reply: string | null;
  /** Câu hỏi thêm nối đúng câu chuyện; null khi đã đủ hoặc hết lượt. */
  follow: string | null;
  /** Ngày nghe được trong câu chuyện (đủ ngày và tháng). */
  date: { day: number; month: number; year: number | null } | null;
  /** Câu Mây nhắc lại ngày cho chắc, chỉ lần đầu nghe ngày của câu hỏi có `event`. */
  confirm: string | null;
  /** Có chuyện thật, đáng xin ảnh. */
  story: boolean;
  /** Cả câu Mây nói: reply + confirm + follow (máy chủ đã xin giọng trước đúng chuỗi này). */
  say: string | null;
};

/** Lời nhắn người khác gửi cho người đang nghe, Mây chuyển ở cuối cuộc gọi. */
export type CallRelay = { id: string; said: string };

// i18n-ok-begin: mẫu nhận biết câu "không có gì đâu", không phải chữ hiện cho người dùng.
const RELAY_NONE: Record<'vi' | 'en' | 'ko', RegExp> = {
  vi: /^((dạ|ừ|ừm|à|ờ|ơ|thôi|chắc|hiện|giờ|thì|cũng|vâng|con|mẹ|bố|mình|tôi)\s+)*(không|chưa|hết)(\s+(có|ạ|đâu|gì|rồi|nữa|cần|sao|ai|nhé|cả|hết|con|mẹ|bố|mình))*$|^(thôi|không sao|thôi khỏi|để sau|lần sau)(\s+(ạ|nhé|đi|đâu|nha|nhá))*$/,
  en: /^((um+|uh+|oh|well|hmm+|no|nope|nah|i think|i guess|actually|sorry)[\s,]+)*(no|nope|nah|nothing|not really|not now|not today|i'?m good|i'?m fine|that'?s all|no thanks|maybe next time|next time|nothing really)([\s,]+(thanks|thank you|really|for now|right now|at the moment|i think))*$/,
  ko: /^((음|어|아|그냥|저는|지금은|딱히|별로|글쎄요?)\s*)*(없어요|없습니다|없어|없네요|아니요|아뇨|아니에요|괜찮아요|됐어요|다음에요?|다음에\s*할게요)([\s.]*(요|감사합니다|고마워요))*$/,
};
// i18n-ok-end
/** Câu trả lời cho bước lời nhắn chỉ là "không có gì" (ngắn, chỉ lời từ chối) thì thôi, không ép. Câu dài có nội dung thì không tính. */
export function relayNone(text: string | null | undefined, lang: 'vi' | 'en' | 'ko' = 'vi'): boolean {
  const s = String(text ?? '').toLowerCase().normalize('NFC').replace(/[.,!?…~"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return true;
  if (s.split(' ').length > 8) return false;
  return RELAY_NONE[lang].test(s);
}

export type Chapter = { at: number; until: number; say: string; who?: string; question?: string; transcript?: string | null };
export type Podcast = {
  id: string; kind: 'person' | 'topic'; title: string; topic: string; memberId: string | null; duration: number;
  cover: string | null; media: string | null; chapters: Chapter[]; status: 'rendering' | 'ready' | 'failed'; createdAt: string;
  /** Video dọc có ảnh và phụ đề (chỉ tập theo cuộc gọi); poster là ảnh bìa của video. */
  video: string | null; poster: string | null; videoStatus: 'none' | 'rendering' | 'ready' | 'failed';
};

// i18n-ok-begin: địa danh, đợt sau thêm tên tiếng Anh, tiếng Hàn.
// Thành phố có sẵn: đủ để hiện giờ và thời tiết bên đó (Open-Meteo, không cần khoá).
export const CITIES: Record<string, { name: string; lat: number; lon: number; tz: string }> = {
  hanoi: { name: 'Hà Nội', lat: 21.03, lon: 105.85, tz: 'Asia/Ho_Chi_Minh' },
  haiphong: { name: 'Hải Phòng', lat: 20.86, lon: 106.68, tz: 'Asia/Ho_Chi_Minh' },
  namdinh: { name: 'Nam Định', lat: 20.42, lon: 106.17, tz: 'Asia/Ho_Chi_Minh' },
  nghean: { name: 'Nghệ An', lat: 18.67, lon: 105.69, tz: 'Asia/Ho_Chi_Minh' },
  danang: { name: 'Đà Nẵng', lat: 16.05, lon: 108.2, tz: 'Asia/Ho_Chi_Minh' },
  hcm: { name: 'TP.HCM', lat: 10.78, lon: 106.7, tz: 'Asia/Ho_Chi_Minh' },
  dongnai: { name: 'Đồng Nai', lat: 10.95, lon: 106.82, tz: 'Asia/Ho_Chi_Minh' },
  seoul: { name: 'Seoul', lat: 37.57, lon: 126.98, tz: 'Asia/Seoul' },
  busan: { name: 'Busan', lat: 35.18, lon: 129.08, tz: 'Asia/Seoul' },
  ulsan: { name: 'Ulsan', lat: 35.54, lon: 129.31, tz: 'Asia/Seoul' },
  daegu: { name: 'Daegu', lat: 35.87, lon: 128.6, tz: 'Asia/Seoul' },
  tokyo: { name: 'Tokyo', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
  osaka: { name: 'Osaka', lat: 34.69, lon: 135.5, tz: 'Asia/Tokyo' },
  taipei: { name: 'Đài Bắc', lat: 25.03, lon: 121.56, tz: 'Asia/Taipei' },
};
// i18n-ok-end

export type City = { name: string; lat: number; lon: number; tz: string };

/** Thành phố lưu dạng JSON (gõ tìm bất kỳ nơi nào), bản cũ lưu mã trong danh sách có sẵn. */
export function cityOf(v?: string | null): City | undefined {
  if (!v) return undefined;
  if (v.startsWith('{')) { try { const c = JSON.parse(v); return { name: c.name, lat: c.lat, lon: c.lon, tz: c.tz }; } catch { return undefined; } }
  return CITIES[v];
}

/** Bao lâu không mở app thì báo cho cả nhà. */
export const SILENT_HOURS = 48;

/** Ảnh thu nhỏ máy chủ dựng sẵn (cạnh ngắn bằng size px); video thì là khung đầu dạng ảnh. Đường dẫn khác (ảnh tạm, link ngoài) giữ nguyên. */
export const thumb = (url: string | null | undefined, size: 160 | 360 | 1080) =>
  url && /^\/media\/[\w-]+\.(jpe?g|png|webp|mp4|webm|mov)$/i.test(url) ? `/media/w/${size}/${url.slice(7)}` : url ?? '';

// Chụp chung dù ở xa (17/11/2026): mỗi người tự chụp selfie ở nơi mình, AI ghép thành một ảnh cả nhà theo dịp.
// Hợp đồng giữa máy chủ (server/shot.ts) và app (src/GroupShot.tsx, Camera.tsx). Thiết kế: app/docs/chup-chung.md.
export const SHOT_OCCASIONS = ['mam-com', 'tet', 'trung-thu', 'sinh-nhat', 'chuseok', 'di-choi'] as const;
export type ShotOccasion = (typeof SHOT_OCCASIONS)[number] | 'tu-viet';
export const isShotOccasion = (v: unknown): v is ShotOccasion => v === 'tu-viet' || (SHOT_OCCASIONS as readonly unknown[]).includes(v);
/** waiting: chờ mọi người chụp; developing: AI đang ghép; done: có ảnh; failed: lỗi hoặc hết lượt (xem error). */
export type ShotStatus = 'waiting' | 'developing' | 'done' | 'failed';
/** Lỗi trả về trong Shot.error: limit = hết lượt hôm nay, blocked = AI từ chối, error = lỗi khác. */
export type ShotError = 'limit' | 'blocked' | 'error';
/** media null: người đó chưa chụp. */
export type ShotPart = { memberId: string; media: string | null; at: string | null };
export type Shot = {
  id: string; byId: string; occasion: ShotOccasion; custom: string | null;
  status: ShotStatus; result: string | null; error: ShotError | null;
  parts: ShotPart[]; createdAt: string; doneAt: string | null; postId: string | null;
};
/** Ghi tối đa cho ô tự viết dịp. */
export const SHOT_CUSTOM_MAX = 80;
