export type Role = 'con' | 'bo' | 'me' | 'ong' | 'ba' | 'anh' | 'chi' | 'em';

export type Birthday = { calendar: 'solar' | 'lunar'; day: number; month: number; year?: number };

export type Member = {
  id: string;
  name: string;
  role: Role;
  /** Tên cả nhà gọi: Mẹ, Bố, Bà ngoại, hoặc tên riêng của con. */
  roleLabel: string;
  city: string;
  country: 'VN' | 'KR' | 'JP' | 'TW' | 'US' | 'OTHER';
  avatarUri?: string;
  birthday?: Birthday;
  /** Ngày rời nhà (đi du học, đi làm xa), để đếm "đã xa nhà bao nhiêu ngày". */
  awaySince?: string;
  lastActiveAt: string;
  phone?: string;
};

export type Reply = { id: string; authorId: string; text?: string; voiceSec?: number; createdAt: string };

export type PostTag = 'an-com' | 'binh-an' | 'nho-nha' | 'di-hoc' | 'di-lam' | 'khoe' | 'xua';

export type Post = {
  id: string;
  authorId: string;
  createdAt: string;
  caption: string;
  tag?: PostTag;
  photoUri?: string;
  voiceSec?: number;
  /** Ảnh xưa: năm chụp, để xếp vào dòng đời. */
  year?: number;
  reactions: Record<string, string>;
  replies: Reply[];
};

export type Chapter = { id: string; title: string; emoji: string; description: string };

export type Privacy = 'private' | 'selected' | 'family' | 'capsule';

export type Story = {
  id: string;
  tellerId: string;
  title: string;
  chapterId: string;
  year?: number;
  createdAt: string;
  durationSec: number;
  transcript: string;
  quote: string;
  people: string[];
  places: string[];
  emotion: string;
  emoji: string;
  photoEmojis: string[];
  privacy: Privacy;
  sharedWith?: string[];
  reactions: Record<string, string>;
  followUps: string[];
  askedById?: string;
  question?: string;
  perspectives: Array<{ authorId: string; text: string; createdAt: string }>;
};

/**
 * Điều một người gửi qua cuộc gọi của Homeletter:
 * - hidden: câu hỏi giấu kín. Homeletter hỏi khéo, người được hỏi không biết ai muốn biết.
 * - message: lời gửi gắm. Homeletter nói rõ là của ai.
 */
export type Question = {
  id: string;
  fromId: string;
  toId: string;
  kind: 'hidden' | 'message';
  text: string;
  /** Cách Homeletter sẽ hỏi lại cho tự nhiên. */
  gentle?: string;
  status: 'pending' | 'asked' | 'answered';
  letterId?: string;
  storyId?: string;
  createdAt: string;
};

export type FactKind = 'thich' | 'lo' | 'tu-hao' | 'mong' | 'ky-niem';

export type QuizItem = { q: string; options: string[]; answer: number };

/** "Homeletter tuần này": thứ một cuộc gọi để lại cho người nhà. */
export type Letter = {
  id: string;
  speakerId: string;
  forIds: string[];
  createdAt: string;
  callSec: number;
  /** Đoạn giọng thật hay nhất được gửi đi. */
  highlightSec: number;
  title: string;
  quote: string;
  summary: string;
  facts: Array<{ kind: FactKind; text: string }>;
  /** Việc nên làm cùng nhau sau khi nghe. */
  suggestion?: string;
  questionId?: string;
  storyId?: string;
  followUp?: string;
  /** Người kể đã chọn chia sẻ thế nào. */
  shared: 'clip' | 'summary' | 'softened';
  quiz?: QuizItem[];
};

export type SubLang = 'vi' | 'ko' | 'en';

/** Video Homeletter ghép từ ảnh thật và giọng thật trong kho, có phụ đề nhiều thứ tiếng. */
export type Film = {
  id: string;
  title: string;
  speakerId: string;
  occasion: string;
  createdAt: string;
  durationSec: number;
  scenes: Array<{ caption: string; year?: number }>;
  subs: Array<{ at: number } & Record<SubLang, string>>;
  letterId?: string;
  storyId?: string;
};

export type FamilyMessage = {
  id: string;
  /** Người trong nhà, hoặc 'ai' khi Homeletter gửi thư tuần, video, lời nhắc. */
  authorId: string;
  createdAt: string;
  text?: string;
  voiceSec?: number;
  postId?: string;
  letterId?: string;
  filmId?: string;
  /** Lời trả lời một Homeletter, để người kể biết chuyện mình kể đã có người nghe. */
  replyToLetterId?: string;
  /** Gửi riêng. Không có nghĩa là gửi cả nhà. */
  to?: string[];
  /** Hẹn giờ: người nhận chỉ thấy tin từ lúc này, và tin tự phát khi mở app. */
  deliverAt?: string;
  heardBy?: string[];
};

/** "Hẹn nhau tuần này": một việc nhỏ cho hai người làm cùng nhau. */
export type Mission = {
  id: string;
  ids: [string, string];
  text: string;
  why: string;
  action: 'voice' | 'call' | 'photo';
  done?: boolean;
};

export type EventKind = 'birthday' | 'gio' | 'anniversary' | 'milestone' | 'holiday' | 'custom';

export type FamilyEvent = {
  id: string;
  title: string;
  kind: EventKind;
  calendar: 'lunar' | 'solar';
  day: number;
  month: number;
  year?: number;
  /** Chỉ xảy ra một lần (ngày nhập học, ngày tốt nghiệp), không nhắc lại hằng năm. */
  once?: boolean;
  memberId?: string;
  note?: string;
  /** Gợi ý một việc gắn kết cho ngày này. */
  idea?: string;
  storyId?: string;
  remindDaysBefore: number;
};

export type Settings = {
  parentMode: boolean;
  notifications: boolean;
  aiCalls: boolean;
  aiCallDay: 'sun' | 'sat' | 'wed';
  holidays: boolean;
  premium: boolean;
  /** Câu trả lời lúc mới vào app (lần cuối gặp nhau, món nhớ nhất...), để Homeletter hỏi chuyện cho đúng người. */
  intro?: Record<string, string>;
};

export type Family = { id: string; name: string; inviteCode: string; members: Member[] };

export type AppState = {
  onboarded: boolean;
  meId: string;
  family: Family;
  posts: Post[];
  stories: Story[];
  chapters: Chapter[];
  questions: Question[];
  letters: Letter[];
  films: Film[];
  messages: FamilyMessage[];
  missions: Mission[];
  events: FamilyEvent[];
  calls: Record<string, string>;
  settings: Settings;
};
