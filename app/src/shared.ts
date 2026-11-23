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
  locShare?: boolean;
  /** Máy chủ đang mở Mây Live (MAY_LIVE, GEMINI_API_KEY): cuộc gọi tuần dùng màn CallLive cho mọi người. */
  mayLive?: boolean };

export type Week = {
  week: string;
  question: string;
  missions: Array<{ key: string; text: string; points: number; done: boolean; doneBy: string[] }>;
  jar: { points: number };
  recap: { photos: number; videos: number; voices: number; hugs: number; meals: Post[]; top?: Post | null };
};

// Cuộc gọi hằng tuần và podcast. Tên chủ đề nằm trong bảng chữ máy chủ (khoá `topic.<mã>`).
export const TOPICS = ['ngay-cuoi', 'tuoi-tho', 'mon-an', 'ky-niem', 'cuoc-song', 'loi-nhan', 'hoi-tham'] as const;
export type Topic = (typeof TOPICS)[number];
export const isTopic = (v: unknown): v is Topic => (TOPICS as readonly unknown[]).includes(v);
/** Không bao giờ thành tập: lời nhắn khó nói, câu hỏi thăm đầu cuộc gọi. */
export const NO_EPISODE_TOPICS: readonly Topic[] = ['loi-nhan', 'hoi-tham'];
/** Chủ đề chuyện chính (bản đồ chủ đề của spec C): mỗi cuộc gọi v2 đào sâu một chủ đề. */
export const STORY_THEMES = ['tuoi-tho', 'que-nha', 'bo-me-minh', 'ngay-cuoi', 'cong-viec', 'con-chao-doi', 'con-di-xa', 'mon-an', 'tet-cac-dip', 'ban-be', 'uoc-mo', 'dan-con-chau'] as const;
export type StoryTheme = (typeof STORY_THEMES)[number];
export const isTheme = (v: unknown): v is StoryTheme => (STORY_THEMES as readonly unknown[]).includes(v);
/** Chủ đề chuyện chính thuộc chủ đề podcast nào (tập theo chủ đề vẫn dùng TOPICS). */
export const THEME_TOPIC: Record<StoryTheme, Topic> = {
  'tuoi-tho': 'tuoi-tho', 'que-nha': 'ky-niem', 'bo-me-minh': 'ky-niem', 'ngay-cuoi': 'ngay-cuoi', 'cong-viec': 'cuoc-song', 'con-chao-doi': 'ky-niem',
  'con-di-xa': 'ky-niem', 'mon-an': 'mon-an', 'tet-cac-dip': 'ky-niem', 'ban-be': 'tuoi-tho', 'uoc-mo': 'tuoi-tho', 'dan-con-chau': 'cuoc-song' };
const CHILD_SKIP: readonly StoryTheme[] = ['ngay-cuoi', 'con-chao-doi', 'dan-con-chau'];
/** Bố mẹ: mọi chủ đề, riêng ngày cưới chỉ khi nhà có đủ bố lẫn mẹ và lịch chưa có ngày cưới. Con: không hỏi ngày cưới, ngày con chào đời, dặn con cháu. */
export function themesFor(role: string, hasPair: boolean, hasWedding: boolean): StoryTheme[] {
  if (role !== 'bo' && role !== 'me') return STORY_THEMES.filter((t) => !CHILD_SKIP.includes(t));
  return STORY_THEMES.filter((t) => t !== 'ngay-cuoi' || (hasPair && !hasWedding));
}
export const EVENT_HINTS = ['none', 'wedding', 'anniversary', 'birthday', 'memory'] as const;
/** part (bộ câu v2): checkin là câu hỏi thăm, story là câu mở chuyện chính (kèm theme); câu lời nhắn không có part. */
export type CallQuestion = { text: string; topic: Topic; photo: boolean; event: (typeof EVENT_HINTS)[number]; part?: 'checkin' | 'story'; theme?: StoryTheme };
/** `lang`: thứ tiếng của bộ câu (bản cũ không có là tiếng Việt). `mascot`: tên linh vật lúc soạn (bản cũ không có là Mây). */
export type CallScript = { greeting: string; questions: CallQuestion[]; goodbye: string; source: 'ai' | 'template' | 'first' | 'live'; lang?: 'vi' | 'en' | 'ko'; mascot?: string;
  /** 2: hỏi thăm, một chuyện chính, lời nhắn (nếu có). 3: Mây Live (server/calllive.ts), ô 0 hỏi thăm, ô 1 lời nhắn, chuyện từ ô LIVE_FIRST_STORY.
   *  Bản cũ không có là ba câu rời. */ v?: 2 | 3;
  /** Trần câu hỏi thêm của chuyện chính. */ follow?: number;
  /** Cuộc gọi thử (cuộc gọi đầu của người mới). */ trial?: boolean;
  /** Mã các sự thật trong sổ nhớ mà AI đã dùng khi soạn (chỉ mã có trong dữ liệu đưa vào); /call/start đánh dấu đã dùng. */ used?: string[];
  /** Mây Live: câu móc để mở đầu cuộc gọi sau. */ next_hook?: string };
/** Kịch bản v3 (Mây Live): ô 0 hỏi thăm và ô 1 lời nhắn luôn có, chuyện đầu tiên ở ô này. */
export const LIVE_FIRST_STORY = 2;
/** Một cuộc gọi Live có tối đa chừng này chuyện (ô LIVE_FIRST_STORY tới LIVE_FIRST_STORY + 19): máy chủ nhận, máy khách mở trong khoảng này. */
export const LIVE_MAX_STORIES = 20;

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
    /** Câu tạm biệt cố định của mọi bộ câu v2 (giọng nằm sẵn trong kho). */
    bye: L('bye'),
  };
}
export const CALL_ROLES = ['bo', 'me', 'con'] as const;

/** Mây hỏi thêm: chuyện chính tối đa 4 lượt (turn 1..4), không còn trần riêng cho cả cuộc gọi. Cuộc gọi thử tối đa 2 lượt. */
export const MAX_STORY_FOLLOW = 4;
export const TRIAL_FOLLOW = 2;
/** Số phút sau khi vào nhà (members.created_at: tạo nhà hoặc được duyệt vào) thì thẻ cuộc gọi thử mới hiện. */
export const TRIAL_AFTER_MIN = 10;

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
  /** Chỉ lượt hỏi thăm: say đã gồm luôn câu mở chuyện chính (máy khách không đọc câu mở riêng nữa). */
  joined?: boolean;
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
  /** false: tập riêng, chỉ người kể thấy (chưa đồng ý chia sẻ); máy chủ không gửi tập riêng của người khác. */
  shared: boolean;
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

// Ưu đãi của nhãn hàng (22/11/2026): coupon, mã giảm giá liên quan tới chăm sóc gia đình và bố mẹ.
// Hợp đồng giữa máy chủ (server/coupons.ts) và app (src/Coupons.tsx, lối vào ở Settings.tsx). Ghi chú: app/docs/uu-dai.md.
export const COUPON_CATEGORIES = ['massage', 'health', 'pharmacy', 'supplement', 'homecare', 'other'] as const;
export type CouponCategory = (typeof COUPON_CATEGORIES)[number];
/** family: chỉ dành cho gói gia đình (app chưa có thanh toán nên hiện chỉ gắn nhãn). expiresAt null: không hết hạn.
 *  milestone: quà mốc của lọ sao (cột min_stars), null là ưu đãi thường. */
export type Coupon = {
  id: string; brand: string; category: CouponCategory; title: string; discount: string;
  code: string | null; url: string | null; expiresAt: string | null; family: boolean; milestone: number | null;
};

// Mốc của lọ sao nhà mình (tổng sao cả nhà, như số lọ đang hiện). Không phải trần: qua mốc cuối sao vẫn tăng.
// Ưu đãi có min_stars bằng một mốc là quà của mốc đó (server/coupons.ts). Ghi chú: app/docs/lo-moc.md.
// scripts/coupons.mjs giữ một bản sao danh sách này (test so hai bản).
export const JAR_MILESTONES = [40, 100, 200, 400, 700, 1000] as const;
/** Mốc kế tiếp: mốc nhỏ nhất lớn hơn total (đúng bằng mốc là đã chạm). Qua mốc cuối thì null. */
export const nextMilestone = (total: number): number | null => JAR_MILESTONES.find((m) => m > total) ?? null;
/** Thẻ "nhà mình chạm mốc": mốc cao nhất đã chạm mà người này chưa được báo (seen: mốc cao nhất đã báo).
 *  gift: một trong các mốc vừa chạm có quà trong kho (gifts do máy chủ báo). Không có mốc mới thì null. */
export function milestoneNews(total: number, seen: number, gifts: readonly number[]): { at: number; gift: boolean } | null {
  const fresh = JAR_MILESTONES.filter((m) => m <= total && m > seen);
  if (!fresh.length) return null;
  return { at: fresh[fresh.length - 1], gift: fresh.some((m) => gifts.includes(m)) };
}
