export type Role = 'con' | 'bo' | 'me' | 'ong' | 'ba' | 'anh' | 'chi' | 'em';

export type Birthday = { calendar: 'solar' | 'lunar'; day: number; month: number; year?: number };

export type Member = {
  id: string;
  name: string;
  role: Role;
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

export type PostTag = 'an-com' | 'binh-an' | 'nho-nha' | 'di-hoc' | 'di-lam' | 'cuoi-tuan' | 'khoe';

export type Post = {
  id: string;
  authorId: string;
  createdAt: string;
  caption: string;
  tag?: PostTag;
  emoji?: string;
  photoUri?: string;
  voiceSec?: number;
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

export type Question = {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  status: 'pending' | 'asked' | 'answered';
  storyId?: string;
  createdAt: string;
};

export type EventKind = 'birthday' | 'gio' | 'tet' | 'anniversary' | 'custom';

export type FamilyEvent = {
  id: string;
  title: string;
  kind: EventKind;
  calendar: 'lunar' | 'solar';
  day: number;
  month: number;
  year?: number;
  memberId?: string;
  note?: string;
  remindDaysBefore: number;
};

export type ChatMode = 'story' | 'confide';

export type ChatMessage = {
  id: string;
  from: 'ai' | 'me';
  text: string;
  createdAt: string;
  voiceSec?: number;
  /** Tin đặc biệt của AI: hỏi ý trước khi chuyển lời, hoặc gợi ý lưu thành trang ký ức. */
  kind?: 'text' | 'consent' | 'save-story' | 'crisis' | 'relayed' | 'saved';
  storyId?: string;
};

export type Capsule = {
  id: string;
  fromId: string;
  toIds: string[];
  title: string;
  message: string;
  openOn: string;
  createdAt: string;
  voiceSec?: number;
};

export type Recipe = {
  id: string;
  tellerId: string;
  title: string;
  emoji: string;
  minutes: number;
  serves: number;
  ingredients: string[];
  steps: string[];
  tip: string;
  koreaSwaps: string[];
  cookedBy: string[];
};

export type Settings = {
  parentMode: boolean;
  language: 'vi' | 'ko';
  notifications: boolean;
  aiCalls: boolean;
  aiCallDay: 'sun' | 'sat' | 'wed';
  nudgeAfterDays: number;
  premium: boolean;
};

export type Family = { id: string; name: string; inviteCode: string; members: Member[] };

export type AppState = {
  onboarded: boolean;
  signedIn: boolean;
  meId: string;
  family: Family;
  posts: Post[];
  stories: Story[];
  chapters: Chapter[];
  questions: Question[];
  events: FamilyEvent[];
  chats: Record<ChatMode, ChatMessage[]>;
  capsules: Capsule[];
  recipes: Recipe[];
  calls: Record<string, string>;
  settings: Settings;
};
