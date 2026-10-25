// Kiểu dữ liệu và danh mục dùng chung cho máy chủ và giao diện.

export type Role = 'bo' | 'me' | 'con';
export type Kind = 'photo' | 'video' | 'voice' | 'hug';

export type Member = { id: string; name: string; role: Role; avatar?: string | null; city?: string | null; phone?: string | null; lastSeen: string };
export type Family = { id: string; name: string; code: string };
export type Reply = { id: string; authorId: string; kind: 'voice' | 'text'; media?: string | null; text?: string | null; seconds?: number | null; createdAt: string };
export type Post = {
  id: string; authorId: string; kind: Kind; media?: string | null; caption?: string | null; meal: boolean; seconds?: number | null;
  questionWeek?: string | null; createdAt: string; reactions: Record<string, string>; replies: Reply[];
};
export type Me = { family: Family; me: Member; members: Member[]; unseen: number };

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
/** `lang`: thứ tiếng của bộ câu (bản cũ không có là tiếng Việt). */
export type CallScript = { greeting: string; questions: CallQuestion[]; goodbye: string; source: 'ai' | 'template' | 'first'; lang?: 'vi' | 'en' | 'ko' };

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
  };
}
export const CALL_ROLES = ['bo', 'me', 'con'] as const;

export type Chapter = { at: number; until: number; say: string; who?: string; question?: string; transcript?: string | null };
export type Podcast = {
  id: string; kind: 'person' | 'topic'; title: string; topic: string; memberId: string | null; duration: number;
  cover: string | null; media: string | null; chapters: Chapter[]; status: 'rendering' | 'ready' | 'failed'; createdAt: string;
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
