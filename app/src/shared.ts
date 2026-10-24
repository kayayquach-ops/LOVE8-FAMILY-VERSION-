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

// Cuộc gọi hằng tuần và podcast.
export const TOPICS = {
  'ngay-cuoi': 'Ngày cưới',
  'tuoi-tho': 'Tuổi thơ',
  'mon-an': 'Món ăn nhà mình',
  'ky-niem': 'Kỷ niệm',
  'cuoc-song': 'Cuộc sống bây giờ',
  'loi-nhan': 'Lời nhắn',
} as const;
export type Topic = keyof typeof TOPICS;
export const EVENT_HINTS = ['none', 'wedding', 'anniversary', 'birthday', 'memory'] as const;
export type CallQuestion = { text: string; topic: Topic; photo: boolean; event: (typeof EVENT_HINTS)[number] };
export type CallScript = { greeting: string; questions: CallQuestion[]; goodbye: string; source: 'ai' | 'template' | 'first' };

/** Câu cố định trong cuộc gọi (chào, đáp mẫu, nhắc, tạm biệt). Máy chủ nạp sẵn giọng Gemini cho từng câu, nên chỉ phụ thuộc vai, không phụ thuộc tên. */
export function callLines(role: string) {
  const parent = role === 'bo' || role === 'me';
  const self = role === 'bo' ? 'bố' : role === 'me' ? 'mẹ' : '';
  const Self = self ? self[0].toUpperCase() + self.slice(1) : '';
  return {
    ack: parent ? 'Dạ, con nghe đây ạ.' : 'Ừm, mình nghe đây.',
    slow: parent ? `${Self} cứ từ từ nhé, nhớ gì kể nấy.` : 'Cứ từ từ nhé, nhớ gì kể nấy.',
    busy: parent ? `Chắc ${self} đang bận. Tuần sau con gọi lại nhé.` : 'Chắc bạn đang bận. Tuần sau mình gọi lại nhé.',
    skip: parent ? 'Dạ, không sao. Mình nói chuyện khác nhé.' : 'Không sao. Mình nói chuyện khác nhé.',
    photo: parent ? `${Self} có tấm ảnh nào muốn kể cho con nghe không? Gửi con giữ giúp nhé.` : 'Bạn có tấm ảnh nào muốn kể cho mình nghe không? Gửi mình giữ giúp nhé.',
    short: parent ? ['Dạ, con hiểu rồi ạ.', 'Dạ, con nghe rồi ạ.', `Dạ, con cảm ơn ${self}.`] : ['Dạ, mình hiểu rồi.', 'Ừ, mình nghe rồi nhé.', 'Cảm ơn bạn đã kể nhé.'],
    long: parent ? ['Nghe hay quá ạ.', `Con thích nghe ${self} kể lắm.`, 'Thương quá ạ.', 'Dạ, con nhớ rồi.', `Hay quá. Lần sau ${self} kể tiếp con nghe nhé.`]
      : ['Nghe hay quá.', 'Thương ghê.', 'Mình nhớ rồi nhé.', 'Nghe mà thấy ấm ghê.', 'Hay quá. Lần sau kể tiếp nhé.'],
  };
}
export const CALL_ROLES = ['bo', 'me', 'con'] as const;

export type Chapter = { at: number; until: number; say: string; who?: string; question?: string; transcript?: string | null };
export type Podcast = {
  id: string; kind: 'person' | 'topic'; title: string; topic: string; memberId: string | null; duration: number;
  cover: string | null; media: string | null; chapters: Chapter[]; status: 'rendering' | 'ready' | 'failed'; createdAt: string;
};

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

export type City = { name: string; lat: number; lon: number; tz: string };

/** Thành phố lưu dạng JSON (gõ tìm bất kỳ nơi nào), bản cũ lưu mã trong danh sách có sẵn. */
export function cityOf(v?: string | null): City | undefined {
  if (!v) return undefined;
  if (v.startsWith('{')) { try { const c = JSON.parse(v); return { name: c.name, lat: c.lat, lon: c.lon, tz: c.tz }; } catch { return undefined; } }
  return CITIES[v];
}

export const ROLE_LABEL: Record<Role, string> = { bo: 'Bố', me: 'Mẹ', con: 'Con' };

/** Bao lâu không mở app thì báo cho cả nhà. */
export const SILENT_HOURS = 48;
