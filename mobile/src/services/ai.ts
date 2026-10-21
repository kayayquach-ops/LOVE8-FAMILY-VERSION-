// Lớp AI của app. Khi có EXPO_PUBLIC_API_URL, app gọi máy chủ (thư mục functions/),
// nơi giữ API key và gọi Claude. Khi chưa có, app chạy bằng kịch bản mẫu để demo.
// Không bao giờ đặt API key trong code app.
import type { ChatMessage, ChatMode, Story } from '@/data/types';
import { QUESTION_BANK } from '@/data/questions';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
export const AI_MODE: 'live' | 'demo' = API_URL ? 'live' : 'demo';

export type AiTurn = { text: string; kind?: ChatMessage['kind'] };

export type InterviewContext = {
  mode: ChatMode;
  history: ChatMessage[];
  speakerName: string;
  speakerRole: string;
  familyNames: string[];
  pendingQuestion?: { from: string; text: string };
};

const CRISIS = ['tự tử', 'muốn chết', 'không muốn sống', 'tự làm hại', 'kết thúc tất cả'];

export function looksLikeCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS.some((w) => t.includes(w));
}

export const CRISIS_TEXT =
  'Thư rất lo khi nghe điều này. Bạn không phải một mình. Ở Hàn Quốc, bạn có thể gọi ngay 109 (đường dây phòng chống tự tử, 24/7). ' +
  'Nếu khẩn cấp ở Việt Nam, gọi 115. Bạn có muốn Thư báo cho một người thân bạn tin tưởng không?';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI server error ${res.status}`);
  return (await res.json()) as T;
}

export async function interviewReply(ctx: InterviewContext): Promise<AiTurn> {
  const last = [...ctx.history].reverse().find((m) => m.from === 'me');
  if (last && looksLikeCrisis(last.text)) return { text: CRISIS_TEXT, kind: 'crisis' };
  if (API_URL) {
    try {
      return await post<AiTurn>('/interview', ctx);
    } catch {
      // Mất mạng hoặc máy chủ lỗi: dùng kịch bản mẫu để cuộc trò chuyện không bị đứt.
    }
  }
  await new Promise((r) => setTimeout(r, 700));
  return demoReply(ctx);
}

function userTurnsSince(history: ChatMessage[], kinds: Array<ChatMessage['kind']>): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.from === 'ai' && m.kind && kinds.includes(m.kind)) break;
    if (m.from === 'me') n++;
  }
  return n;
}

function demoReply(ctx: InterviewContext): AiTurn {
  const turns = userTurnsSince(ctx.history, ['consent', 'save-story', 'saved', 'relayed']);
  if (ctx.mode === 'confide') {
    if (turns <= 1) {
      return {
        text: `Thư nghe rồi. Nghe như ${ctx.speakerName.split(' ').pop()} đã giữ chuyện này trong lòng khá lâu. Điều gì làm bạn khó nói trực tiếp với bố mẹ nhất?`,
      };
    }
    return {
      kind: 'consent',
      text: 'Cảm ơn bạn đã tin Thư. Bạn có muốn Thư chuyển lời này cho bố mẹ không? Thư có thể chuyển nguyên văn, nói khéo lại, hoặc chỉ giữ riêng cho bạn.',
    };
  }
  if (turns <= 1) {
    const followUps = [
      'Chuyện đó xảy ra năm nào, lúc ấy ai ở cạnh bạn?',
      'Khoảnh khắc nào trong chuyện đó bạn nhớ rõ nhất?',
      'Lúc đó bạn cảm thấy thế nào?',
    ];
    return { text: followUps[ctx.history.length % followUps.length] };
  }
  return {
    kind: 'save-story',
    text: 'Câu chuyện hay quá. Thư lưu thành một trang trong sổ ký ức của gia đình nhé? Cả nhà sẽ được nghe và hỏi thêm.',
  };
}

export async function softenMessage(text: string, toName: string): Promise<string> {
  if (API_URL) {
    try {
      return (await post<{ text: string }>('/soften', { text, toName })).text;
    } catch {}
  }
  return `${toName} ơi, con có chuyện muốn nói mà ngại. ${text.trim()} Con chỉ muốn bố mẹ hiểu cho con thôi ạ.`;
}

const CHAPTER_HINTS: Array<[string, string[]]> = [
  ['tinh-yeu', ['yêu', 'cưới', 'hẹn hò', 'tỏ tình', 'người yêu']],
  ['mon-an', ['nấu', 'món', 'ăn', 'bếp', 'canh', 'kho']],
  ['lam-cha-me', ['sinh con', 'chào đời', 'con gái', 'con trai', 'nuôi con']],
  ['lap-nghiep', ['làm việc', 'công việc', 'nhà máy', 'kiếm tiền', 'đi làm', 'lương']],
  ['que-huong', ['quê', 'làng', 'giỗ', 'tổ tiên', 'ông bà']],
  ['tuoi-tho', ['hồi nhỏ', 'hồi bé', 'tuổi thơ', 'đi học lớp']],
  ['loi-dan', ['dặn', 'mong con', 'hãy nhớ']],
];

export type StructuredStory = Pick<Story, 'title' | 'chapterId' | 'quote' | 'people' | 'places' | 'emotion' | 'emoji' | 'followUps'> & {
  year?: number;
};

export async function structureStory(transcript: string, tellerName: string): Promise<StructuredStory> {
  if (API_URL) {
    try {
      return await post<StructuredStory>('/structure-story', { transcript, tellerName });
    } catch {}
  }
  const lower = transcript.toLowerCase();
  const chapterId = CHAPTER_HINTS.find(([, words]) => words.some((w) => lower.includes(w)))?.[0] ?? 'tuoi-tre';
  const sentences = (transcript.match(/[^.!?…]+[.!?…]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
  const first = sentences[0] ?? transcript;
  const title = first.split(/\s+/).slice(0, 8).join(' ').replace(/[.,!?…]+$/, '');
  const quote = [...sentences].filter((s) => s.length < 110).sort((a, b) => b.length - a.length)[0] ?? first;
  const yearMatch = transcript.match(/(19|20)\d{2}/);
  const emojiByChapter: Record<string, string> = {
    'tinh-yeu': '💌', 'mon-an': '🍲', 'lam-cha-me': '👶', 'lap-nghiep': '🧵',
    'que-huong': '🌾', 'tuoi-tho': '🪁', 'loi-dan': '🕯️', 'tuoi-tre': '🚲',
  };
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    chapterId,
    quote,
    people: [],
    places: [],
    emotion: 'ấm áp',
    emoji: emojiByChapter[chapterId],
    followUps: QUESTION_BANK[chapterId].slice(0, 2),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
  };
}

/** Câu hỏi tiếp theo cho người kể: ưu tiên câu người thân gửi, sau đó lấy từ bộ câu hỏi. */
export function nextQuestion(askedCount: number): { chapterId: string; text: string } {
  const chapters = Object.keys(QUESTION_BANK);
  const chapterId = chapters[askedCount % chapters.length];
  const list = QUESTION_BANK[chapterId];
  return { chapterId, text: list[Math.floor(askedCount / chapters.length) % list.length] };
}
