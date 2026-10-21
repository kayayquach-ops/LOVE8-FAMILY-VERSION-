// Lớp AI của app. Khi có EXPO_PUBLIC_API_URL, app gọi máy chủ (thư mục functions/),
// nơi giữ API key và gọi Claude. Khi chưa có, app chạy bằng kịch bản mẫu để demo.
// Không bao giờ đặt API key trong code app.
import { QUESTION_BANK } from '@/data/questions';
import type { AppState, Member } from '@/data/types';
import { relativeTime } from '@/lib/format';
import { aiAddress, callName, isElder, isMinor, member, others } from '@/lib/selectors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
export const AI_MODE: 'live' | 'demo' = API_URL ? 'live' : 'demo';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI server error ${res.status}`);
  return (await res.json()) as T;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Viết lại câu hỏi giấu kín thành câu Homeletter sẽ hỏi: vòng qua một kỷ niệm gần đó,
 * không nói ai muốn biết. Bản demo không có AI nên trả về undefined.
 */
export async function gentleAsk(text: string, from: Member, to: Member): Promise<string | undefined> {
  if (!API_URL) return undefined;
  try {
    return (await post<{ text: string }>('/gentle', { text, from: from.roleLabel, to: to.roleLabel, address: aiAddress(to) })).text;
  } catch {
    return undefined;
  }
}

export function hiddenSuggestions(target: Member): string[] {
  const k = callName(target);
  if (isElder(target)) {
    return [`Hồi trẻ ${k} mơ làm nghề gì?`, `${cap(k)} có buồn khi con đi xa không?`, `Điều gì làm ${k} lo nhất bây giờ?`, `${cap(k)} có tiếc điều gì không?`];
  }
  return ['Con có thật sự ổn không?', 'Con có bạn thân ở đó chưa?', 'Học xong con muốn làm gì?', 'Điều gì con ngại nói với bố mẹ?'];
}

export function messageSuggestions(target: Member): string[] {
  const k = callName(target);
  if (isElder(target)) return [`Con thương ${k} lắm.`, `${cap(k)} nhớ giữ ấm, trời trở lạnh rồi.`, 'Tết này con về.'];
  return ['Bố mẹ tự hào về con.', 'Ăn uống cho đủ nhé con.', 'Mệt thì cứ gọi về.'];
}

export type CallStep = {
  kind: 'opener' | 'checkin' | 'message' | 'hidden' | 'followup' | 'theme' | 'mood' | 'closing' | 'handoff';
  text: string;
  /** Vì sao Homeletter hỏi câu này. Không bao giờ hiện cho người được gọi. */
  why: string;
  fromId?: string;
  /** Câu hỏi giấu kín của chính người đang xem kế hoạch. */
  mine?: boolean;
};

const CHECKIN: Record<string, string> = {
  'an-com': 'Hôm ấy ai ăn cùng?',
  'di-hoc': 'Hôm nay có chuyện gì vui hay mệt không?',
  'khoe': 'Kể Homeletter nghe chuyện đằng sau tấm ảnh nhé?',
  'binh-an': 'Hôm ấy đi đâu, gặp những ai?',
};

const ELDER_THEMES = ['tuoi-tho', 'tuoi-tre', 'tinh-yeu', 'lap-nghiep', 'lam-cha-me', 'que-huong', 'mon-an', 'loi-dan'];

const CHILD_THEMES: Array<{ title: string; q: (a: string) => string }> = [
  { title: 'bạn bè', q: (a) => `Ở đó, ai là người ${a} hay nói chuyện nhất?` },
  { title: 'ước mơ', q: (a) => `Học xong, ${a} muốn làm gì nhất?` },
  { title: 'những ngày đầu ở xa', q: (a) => `Ngày đầu tiên ở nơi mới, ${a} nhớ nhất điều gì?` },
  { title: 'niềm vui nhỏ', q: (a) => `Tuần này điều gì làm ${a} cười nhiều nhất?` },
];

/**
 * Kế hoạch một cuộc gọi của Homeletter, ghép từ những gì nhà mình đang có: ảnh vừa gửi, lời gửi gắm,
 * câu hỏi giấu kín, chuyện còn dở lần trước, chủ đề chưa ai hỏi. Trong cuộc gọi thật, AI còn nghe
 * câu trả lời để hỏi tiếp và đổi sang chuyện nhẹ hơn khi người kể ngại.
 */
export function planCall(s: AppState, targetId: string, viewerId = s.meId): CallStep[] {
  const target = member(s, targetId);
  if (!target) return [];
  const addr = aiAddress(target);
  const elder = isElder(target);
  const viewer = member(s, viewerId);
  const steps: CallStep[] = [];
  const pending = s.questions.filter((q) => q.toId === targetId && q.status === 'pending');
  const messages = pending.filter((q) => q.kind === 'message');
  const hidden = isMinor(target) ? [] : pending.filter((q) => q.kind === 'hidden');

  const opener = member(s, messages[0]?.fromId ?? (viewerId !== targetId ? viewerId : hidden[0]?.fromId ?? ''));
  if (opener) {
    steps.push({
      kind: 'opener', fromId: opener.id,
      text: openerLine(opener, target),
      why: `Giọng thật của ${callName(opener)} mở đầu, để ${callName(target)} biết người nhà đang nghĩ đến mình`,
    });
  }

  const recent = s.posts.find((p) => p.authorId === targetId && p.tag !== 'xua' && Date.now() - new Date(p.createdAt).getTime() < 3 * 86400_000);
  if (recent) {
    const short = recent.caption.length > 48 ? `${recent.caption.slice(0, 46).trim()}…` : recent.caption;
    steps.push({
      kind: 'checkin',
      text: `${cap(addr)} vừa gửi ảnh “${short}”. ${CHECKIN[recent.tag ?? ''] ?? 'Kể Homeletter nghe về tấm ảnh nhé?'}`,
      why: `Từ ảnh ${callName(target)} gửi ${relativeTime(recent.createdAt)}`,
    });
  }

  for (const q of messages) {
    const from = member(s, q.fromId);
    steps.push({
      kind: 'message', fromId: q.fromId,
      text: `${from?.roleLabel} nhờ Homeletter nhắn ${addr}: “${q.text}”`,
      why: 'Lời gửi gắm: Homeletter nói rõ là của ai',
    });
  }

  const othersHidden = hidden.filter((q) => q.fromId !== viewerId);
  for (const q of hidden) {
    if (q.fromId !== viewerId && viewerId !== targetId) continue;
    steps.push({
      kind: 'hidden', fromId: q.fromId, mine: q.fromId === viewerId,
      text: q.gentle ?? 'Homeletter mở đầu bằng một kỷ niệm gần đó, rồi để người kể tự nói tới chuyện này.',
      why: `Bạn muốn biết: “${q.text}”. Homeletter hỏi vòng để ${callName(target)} tự kể, không nói ai hỏi.`,
    });
  }
  if (viewerId !== targetId && othersHidden.length) {
    steps.push({
      kind: 'hidden',
      text: `${othersHidden.length} câu hỏi giấu kín của người khác trong nhà`,
      why: 'Chỉ người hỏi mới xem được câu đó',
    });
  }

  const last = s.letters.filter((l) => l.speakerId === targetId && l.followUp).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (last?.followUp) {
    steps.push({ kind: 'followup', text: last.followUp, why: `Lần trước ${callName(target)} nhắc tới chuyện này mà chưa kể hết` });
  }

  if (elder) {
    const told = new Set(s.stories.filter((st) => st.tellerId === targetId).map((st) => st.chapterId));
    const theme = ELDER_THEMES.find((c) => !told.has(c));
    const chapter = s.chapters.find((c) => c.id === theme);
    if (theme && chapter) {
      steps.push({
        kind: 'theme',
        text: QUESTION_BANK[theme][0].replace(/bố\/mẹ/gi, addr).replace(/\*$/, ''),
        why: `Nhà mình chưa có chuyện nào về ${chapter.title.toLowerCase()} của ${callName(target)}`,
      });
    }
  } else {
    const t = CHILD_THEMES[s.letters.filter((l) => l.speakerId === targetId).length % CHILD_THEMES.length];
    steps.push({ kind: 'theme', text: t.q(addr), why: `Bố mẹ chưa nghe ${callName(target)} kể về ${t.title}` });
    steps.push({
      kind: 'mood',
      text: `Tuần này có lúc nào ${addr} thấy mệt hay buồn không? Không muốn kể thì cứ nói "bỏ qua" nhé.`,
      why: `Hỏi nhẹ về sức khoẻ tinh thần. Câu trả lời chỉ gửi đi khi ${callName(target)} đồng ý`,
    });
  }

  steps.push({
    kind: 'closing',
    text: `Có điều gì ${addr} muốn nhắn riêng cho ${elder ? 'các con' : 'bố mẹ'} không? Homeletter sẽ gửi đúng giọng ${addr} vào sáng mai.`,
    why: 'Lời nhắn này thành lời chào buổi sáng trong Chat',
  });

  const partner = viewerId !== targetId ? viewer : opener;
  if (partner) {
    steps.push({
      kind: 'handoff', fromId: partner.id,
      text: `Nếu ${callName(partner)} đang rảnh, Homeletter hỏi ${addr} có muốn nói chuyện với ${callName(partner)} luôn không, rồi nối máy.`,
      why: 'AI mở lời, người thật nói tiếp',
    });
  }
  return steps;
}

/** Lời mở đầu ghi sẵn bằng giọng thật của người nhà. */
export function openerLine(from: Member, to: Member): string {
  if (isElder(to)) return `${to.roleLabel} ơi, tối nay Homeletter gọi ${callName(to)} nói chuyện nhé. Con thương ${callName(to)} lắm.`;
  return `${to.roleLabel} ơi, Homeletter gọi con một lúc nhé. ${from.roleLabel} thương con.`;
}

/** Ai đang trực tuyến để nối máy sau cuộc gọi: người hoạt động trong 15 phút gần đây. */
export function onlineNow(s: AppState): Member[] {
  return others(s).filter((m) => Date.now() - new Date(m.lastActiveAt).getTime() < 15 * 60_000);
}
