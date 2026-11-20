// Logic cuộc gọi Mây Live ở máy khách, hàm thuần cho CallLive.tsx nối vào (task 6, 7). Kiểm bằng src/liveTurns.test.ts.
// Công cụ của model làm gì với trạng thái cuộc gọi và đáp model câu gì (onTool), lượt nào vào ô nào (onRec, onTurn), ghi giọng từng lượt
// (captureNext), xin phép chia sẻ (onShareEnd, askStep, giữ tiếng Mây: holdNext), báo sau bước xin ảnh (photoCue), nhắc chống bịa một lần (remindFor, remindAllow), nhắc đồng hồ (clockDue, clockCue), nhắc
// im lặng (silentDue), máy bỏ trên bàn (idleDue), Google sắp đóng kết nối (awayMs), cúp sau lời chào (byeDue), lúc bắt đầu ghi lượt người kể (recDue),
// chốt (finishJob).
// Ô 0 hỏi thăm, ô 1 lời nhắn khó nói, chuyện từ ô LIVE_FIRST_STORY (kịch bản v3, server/calllive.ts). Lời đồng ý chia sẻ chỉ từ hai nút hoặc
// bộ đọc câu trả lời (shareNext, src/callShare.ts), không bao giờ từ model.
// Nối vào (CallLive.tsx), theo đúng thứ tự tin tới, không chen await giữa:
// - startRec của captureNext: state = onRec(state, key) rồi mới ghi; bản chụp có blank thì gửi ngay { type: 'guard' } cho captureNext. Mây gọi công cụ ngay trước câu nói đi kèm, tức là ở đầu câu đáp lượt vừa nói,
//   trước khi lượt ấy được gửi (lúc done); bản chụp giữ cho lượt ấy ô lúc nó bắt đầu, công cụ chỉ có hiệu lực từ lượt sau.
// - turn: onTurn(state, { key, question, transcript, seconds }) ngay (chỉ chờ bản ghi để gửi job); consent true thì đưa lời chép cho shareNext
//   ({ type: 'heard' }), không theo "lượt tới lúc đang xin phép" (lượt nói trước câu hỏi chia sẻ cũng tới lúc ấy).
// - Tiếng Mây bị giữ lúc xin phép (holdNext) vẫn báo captureNext ({ type: 'audio' }) để lượt trả lời khép được (R8); lượt của Mây xong lúc đang giữ
//   mà lượt trả lời còn đang ghi (Mây im, không có tiếng) thì cũng báo { type: 'audio' } trước done; { type: 'asked' } theo askStep.
// - mayLine: remindFor với allow của cuộc gọi Live (remindAllow): ownStory true, message true khi có lời nhắn chờ, photos true khi DATA có ảnh
//   hoặc ảnh đã tới trong cuộc gọi này (CUE.photos(n) với n > 0).
import { slipLive, type Allow } from '../server/guard.ts';
import { isTheme, LIVE_FIRST_STORY, LIVE_MAX_STORIES, type StoryTheme } from './shared';

// i18n-ok-begin: câu nhắn và kết quả công cụ cho model (tiếng Anh như mọi prompt), không phải chữ hiện cho người dùng.
export const CUE = {
  open: '(The call just connected. Greet them by name and begin.)',
  silent: '(The teller has been quiet.)',
  clock: '(Two minutes left. Finish this story gently and go to the closing steps.)',
  shareYes: "(Share answer: yes, the family may hear today's stories.)",
  shareNo: "(Share answer: no, today's stories stay private.)",
  photos: (n: number) => (n ? `(${n} photos arrived.)` : '(No photos for now.)'),
  remind: '(Reminder: only DATA is true. Do not mention earlier calls, earlier stories or photos unless DATA has them.)',
  idle: "(Still nothing heard; they may have stepped away. Call end_call with next week's promise, then say a short warm goodbye.)",
  away: "(The line will drop in a few seconds. Call end_call with next week's promise, then say a short warm goodbye.)",
};
const SAY = {
  notOpened: 'Not opened: use a theme from DATA.allowed_themes and say the opener.',
  opened: 'Story opened.',
  closed: 'Story closed. Open the next seed or go to the closing steps.',
  noStory: 'No story is open: skip the photo.',
  photo: 'The photo button is showing. Wait for them; the app will tell you how many photos arrived.',
  alone: 'They are the only one in the family: skip this step.',
  untold: 'No story was told: skip this step.',
  again: 'Already asked: do not ask again.',
  share: 'The two buttons are showing. Ask your one short question now, then say nothing until the app tells you the answer.',
  unknown: 'Unknown message id.',
  delivered: 'Delivered.',
  askNow: 'Ask now.',
  bye: 'Say your goodbye now; the app hangs up after it.',
  byeAgain: 'Say nothing more; the app hangs up.',
};
// i18n-ok-end

/** Người kể im chừng này (Mây đã nói xong, máy phát đã im) thì nhắc model (CUE.silent), một lần mỗi lượt của Mây. */
export const SILENT_MS = 12_000;
/** Còn chừng này giây thì nhắc model sắp hết giờ (CUE.clock), một lần; xem clockDue. */
export const CLOCK_LEFT_SEC = 120;
/** Mây im chừng này (cộng độ trễ phát của máy) thì mở mic, bắt đầu ghi lượt mới (sự kiện gate). */
export const MIC_GATE_MS = 600;
/** Cuộc gọi chỉ được chừng này giây trở xuống thì không nhắc đồng hồ (R12): vừa vào đã bị bảo khép chuyện. */
const CLOCK_MIN_SEC = 150;
/** Sau lượt tạm biệt: giọng Mây im chừng này mili giây là phát hết, cúp được (byeDue). */
const BYE_QUIET_MS = 300;
/** Chờ giọng phát hết tối đa chừng này sau lượt tạm biệt; end_call xong chừng này mà Mây chưa cất tiếng thì cũng cúp. */
const BYE_DRAIN_MS = 8000;
/** Mây đã nói lời chào mà lượt mãi không xong (không có turnComplete): chừng này sau end_call thì cúp. */
const BYE_MAX_MS = 30_000;
/** Nhắc đồng hồ đợi chừng này không ai nói (clockCue); còn dưới CLOCK_LATE_SEC giây thì thôi đợi. */
const CALM_MS = 2000;
const CLOCK_LATE_SEC = 60;
/** Máy bỏ trên bàn: nhắc im lặng xong chừng này mà vẫn không nghe gì thì nhắc Mây chào (CUE.idle); nhắc chào chừng này mà chưa vào bước chào thì cúp. */
const IDLE_BYE_MS = 60_000;
const IDLE_HANG_MS = 15_000;
/** goAway: cúp cứng sớm hơn timeLeft chừng này; không đọc được timeLeft thì cúp cứng sau AWAY_DEFAULT_MS (socket đóng trước thì cũng kết thúc êm). */
const AWAY_MARGIN_MS = 1500;
const AWAY_DEFAULT_MS = 15_000;

/** Một việc cho hàng chờ gửi (src/outbox.ts, nhóm là mã cuộc gọi). last: chỉ đi sau mọi việc trước nó của cuộc gọi (ô chuyện, chốt). */
export type Job = { url: string; fields: Record<string, string>; last?: boolean };
/** job: đưa vào hàng chờ. photo: hiện ô xin ảnh cho ô chuyện state.lastStory. share: hiện hai nút xin phép. end: Mây chào xong thì cúp máy. */
export type Effect = { kind: 'job'; job: Job } | { kind: 'photo' } | { kind: 'share' } | { kind: 'end' };

/** idx: ô của lượt sau; theme, opener: chuyện đang mở; next: ô chuyện kế tiếp; turns: số lượt đã gửi theo ô; storyTurns: số lượt kể chuyện đã gửi;
 *  family: số người trong nhà; themes: chủ đề được mở (DATA.allowed_themes); relays: mã lời nhắn đang chờ, heard: mã đã chuyển;
 *  share: bước xin phép; hook: câu hẹn tuần sau (end_call); reminded: đã nhắc chống bịa (một lần mỗi cuộc gọi);
 *  lastStory: ô chuyện mở gần nhất (0: chưa có), giữ cả sau story_close để xin ảnh sau khi khép chuyện vẫn được (R5);
 *  rec: ô lúc từng lượt bắt đầu ghi, theo key (onRec), bỏ khi lượt ấy gửi (onTurn); lastRec: ô của lượt ghi gần nhất;
 *  ended: đã có end_call (các lần sau bỏ qua). */
export type LiveState = {
  id: string; idx: number; theme: StoryTheme | null; opener: string; next: number; turns: Record<number, number>; storyTurns: number;
  family: number; themes: StoryTheme[]; relays: string[]; heard: string[]; share: 'none' | 'asking' | 'done'; hook: string; reminded: boolean;
  lastStory: number; rec: Record<number, TurnSlot>; lastRec: number; ended: boolean;
};
/** blank: lượt ngay sau lời nhắn khó nói, câu hỏi của nó (câu Mây đáp lời nhắn, có khi nhắc lại lời nhắn) không gửi. */
export type TurnSlot = { idx: number; theme: StoryTheme | null; opener: string; share: LiveState['share']; blank: boolean };

export function liveStart(p: { id: string; family: number; themes: StoryTheme[]; relays: string[] }): LiveState {
  return {
    id: p.id, idx: 0, theme: null, opener: '', next: LIVE_FIRST_STORY, turns: {}, storyTurns: 0, family: p.family, themes: p.themes,
    relays: p.relays, heard: [], share: 'none', hook: '', reminded: false, lastStory: 0, rec: {}, lastRec: 0, ended: false,
  };
}

/** Một lời gọi công cụ của model: trạng thái mới, câu đáp model (toolResponse) và việc cho app làm. Gọi sai (chủ đề lạ, quá LIVE_MAX_STORIES
 *  chuyện, mã lạ, hỏi lần hai, chào lần hai, công cụ lạ) thì không làm gì, chỉ một câu ngắn để model đi tiếp. Ô lời nhắn (1) khép ở lời gọi
 *  công cụ kế tiếp, relay_open thì mở lại: lượt nói thêm sau lời nhắn (chào, "dạ vâng") không đè lời nhắn. */
export function onTool(s: LiveState, f: { name: string; args?: Record<string, unknown> }): { state: LiveState; result: string; effects: Effect[] } {
  const st = s.idx === 1 ? { ...s, idx: 0 } : s;
  const arg = (k: string) => String(f.args?.[k] ?? '').trim();
  const say = (result: string, state = st, effects: Effect[] = []) => ({ state, result, effects });
  const base = `/api/call/${s.id}`;
  switch (f.name) {
    case 'story_open': {
      const theme = f.args?.theme, opener = arg('opener').slice(0, 300);
      const idx = st.next;
      if (!isTheme(theme) || !st.themes.includes(theme) || !opener || idx >= LIVE_FIRST_STORY + LIVE_MAX_STORIES) return say(SAY.notOpened);
      return say(SAY.opened, { ...st, idx, next: idx + 1, theme, opener, lastStory: idx },
        [{ kind: 'job', job: { url: `${base}/story`, fields: { idx: String(idx), theme, opener }, last: true } }]);
    }
    case 'story_close': return say(SAY.closed, { ...st, idx: 0, theme: null });
    case 'ask_photo': return st.lastStory < LIVE_FIRST_STORY ? say(SAY.noStory) : say(SAY.photo, st, [{ kind: 'photo' }]);
    case 'ask_share':
      if (st.family < 2) return say(SAY.alone);
      if (st.storyTurns === 0) return say(SAY.untold);
      if (st.share !== 'none') return say(SAY.again);
      return say(SAY.share, { ...st, share: 'asking' }, [{ kind: 'share' }]);
    case 'relay_heard': {
      const rid = arg('id');
      if (!st.relays.includes(rid) || st.heard.includes(rid)) return say(SAY.unknown);
      return say(SAY.delivered, { ...st, heard: [...st.heard, rid] },
        [{ kind: 'job', job: { url: `${base}/relay/${encodeURIComponent(rid)}/heard`, fields: {} } }]);
    }
    case 'relay_open': return st.family < 2 ? say(SAY.alone) : say(SAY.askNow, { ...st, idx: 1 });
    case 'end_call': return st.ended ? say(SAY.byeAgain) : say(SAY.bye, { ...st, hook: arg('next_hook').slice(0, 200), ended: true }, [{ kind: 'end' }]);
    default: return say('ok');
  }
}

/** Lượt key bắt đầu ghi (captureNext ra startRec): chụp ô, chuyện và bước xin phép lúc ấy cho onTurn của lượt này. Nhờ vậy câu đáp hỏi thăm
 *  không lọt vào chuyện vừa mở, đoạn cuối chuyện không rơi về ô 0 khi story_close, lời nhắn không mất hay rơi về ô 0 khi ask_share, end_call tới ngay sau.
 *  Lượt ngay sau lượt ở ô lời nhắn thì không gửi câu hỏi: đó là câu Mây đáp lời nhắn, có khi nhắc lại lời nhắn, mà lượt ô 0 vào sổ nhớ. */
export function onRec(s: LiveState, key: number): LiveState {
  const slot: TurnSlot = { idx: s.idx, theme: s.theme, opener: s.opener, share: s.share, blank: s.lastRec === 1 };
  return { ...s, rec: { ...s.rec, [key]: slot }, lastRec: s.idx };
}

/** Một lượt đã khép (captureNext ra turn): việc gửi /answer?live=1 (nơi gọi gắn bản ghi), hoặc null. Ô theo bản chụp của key (onRec); không truyền
 *  key thì theo trạng thái lúc này. Có key mà không có bản chụp (nối thiếu onRec, lượt gửi hai lần) thì bỏ lượt, không đoán ô: đoán sai có thể đưa
 *  lời nhắn khó nói về ô 0 (vào sổ nhớ) hay lời thường vào ô 1 (máy chủ giữ lời dài nhất, có thể đè lời nhắn). Lượt bắt đầu lúc đang xin phép là
 *  câu trả lời xin phép (consent: đưa cho shareNext), không thành lượt kể. */
export function onTurn(s: LiveState, t: { key?: number; question: string; transcript: string; seconds: number }): { state: LiveState; job: Job | null; consent: boolean } {
  const rec = { ...s.rec };
  let at: TurnSlot = { idx: s.idx, theme: s.theme, opener: s.opener, share: s.share, blank: false };
  if (t.key !== undefined) {
    if (!rec[t.key]) return { state: s, job: null, consent: false };
    at = rec[t.key];
    delete rec[t.key];
  }
  const st = { ...s, rec };
  if (at.share === 'asking') return { state: st, job: null, consent: true };
  if (t.seconds < 1 && !t.transcript.trim()) return { state: st, job: null, consent: false };
  const turn = s.turns[at.idx] ?? 0, story = at.idx >= LIVE_FIRST_STORY;
  const fields: Record<string, string> = {
    live: '1', idx: String(at.idx), turn: String(turn), question: at.blank ? '' : t.question.slice(0, 300), transcript: t.transcript, seconds: String(t.seconds),
    ...(story ? { theme: at.theme ?? '', opener: at.opener } : {}),
  };
  return {
    state: { ...st, turns: { ...s.turns, [at.idx]: turn + 1 }, storyTurns: s.storyTurns + (story ? 1 : 0) },
    job: { url: `/api/call/${s.id}/answer?live=1`, fields }, consent: false,
  };
}

/** Bước xin phép xong (shareNext tới done): việc gửi (đồng ý /share, không hay hết giờ /keep, cúp máy không gì) và câu nhắn model. Về ô 0.
 *  Chỉ khi đang hỏi: chưa hỏi hay đã xong thì không đổi gì (lời đồng ý tới muộn không lật được lời từ chối). */
export function onShareEnd(s: LiveState, end: 'yes' | 'no' | 'timeout' | 'hangup'): { state: LiveState; cue: string | null; job: Job | null } {
  if (s.share !== 'asking') return { state: s, cue: null, job: null };
  const state: LiveState = { ...s, share: 'done', idx: 0 };
  if (end === 'hangup') return { state, cue: null, job: null };
  return end === 'yes'
    ? { state, cue: CUE.shareYes, job: { url: `/api/call/${s.id}/share`, fields: {} } }
    : { state, cue: CUE.shareNo, job: { url: `/api/call/${s.id}/keep`, fields: {} } };
}

/** Giữ tiếng Mây lúc xin phép (phán quyết 11): Live tự đáp "dạ được" trước khi app kịp quyết, nên từ lúc câu hỏi đã hỏi xong (asked, askStep) tới lúc
 *  có câu trả lời, tiếng và phụ đề của Mây không phát (tiếng vẫn báo captureNext, R8). 'share': đang giữ. 'tail': câu trả lời tới giữa một lượt của
 *  Mây (bấm nút, hết giờ), bỏ nốt lượt ấy rồi thôi giữ (lượt sau là câu Mây đáp câu nhắn chia sẻ). Câu trả lời tới lúc lượt của Mây đã xong (mayDone,
 *  lời đọc được ngay lúc ấy) hay bước xin phép dừng vì cúp máy, end_call, goAway ('hangup') thì thôi giữ ngay, để câu đáp và lời chào được nghe. */
export type Hold = 'share' | 'tail' | null;
export function holdNext(h: Hold, e: { type: 'asked' } | { type: 'decided'; end: 'yes' | 'no' | 'timeout' | 'hangup'; mayDone: boolean } | { type: 'done' }): Hold {
  if (e.type === 'asked') return 'share';
  if (e.type === 'decided') return e.end === 'hangup' || e.mayDone ? null : 'tail';
  return h === 'tail' ? null : h;
}

/** Câu báo model sau bước xin ảnh: chọn n ảnh, hay bấm Để sau, huỷ khung chọn (n 0). Ô ảnh còn hiện (on) thì luôn báo; đã ẩn (Mây đã sang việc khác,
 *  quá 90 giây) thì chỉ báo khi có ảnh, vì chọn muộn vẫn là ảnh thật; đang chào hay đang giữ tiếng lúc xin phép (quiet) thì không báo. */
export function photoCue(p: { n: number; on: boolean; quiet: boolean }): string | null {
  return p.quiet || (!p.on && p.n === 0) ? null : CUE.photos(p.n);
}

/** R8: sau ask_share, câu hỏi chia sẻ coi là đã hỏi (gửi { type: 'asked' } cho shareNext) khi lượt có tiếng của Mây sau lời đáp công cụ xong.
 *  'tool': vừa đáp ask_share; 'spoke': Mây đã cất tiếng sau đó; 'asked': lượt ấy xong. Lượt chỉ có lời gọi công cụ mà xong trước khi Mây nói thì chưa tính. */
export type AskStep = 'tool' | 'spoke' | 'asked';
export function askStep(a: AskStep, e: 'audio' | 'done'): AskStep {
  if (a === 'tool' && e === 'audio') return 'spoke';
  if (a === 'spoke' && e === 'done') return 'asked';
  return a;
}

/** Cúp máy chưa, sau end_call (Google đóng kết nối sau goAway khi lời chào đã có tiếng thì coi như lượt tạm biệt đã xong: step 'asked'). step theo
 *  askStep từ lúc end_call: công cụ gọi ngay trước lời chào nên lúc ấy giọng chưa tới, máy im chưa có nghĩa là đã chào. quietMs: máy phát im bao lâu;
 *  sinceEnd: từ end_call; sinceDone: từ lúc thành 'asked'. */
export function byeDue(p: { step: AskStep; quietMs: number; sinceEnd: number; sinceDone: number }): boolean {
  if (p.step === 'asked') return p.quietMs >= BYE_QUIET_MS || p.sinceDone >= BYE_DRAIN_MS;
  return p.sinceEnd >= (p.step === 'tool' ? BYE_DRAIN_MS : BYE_MAX_MS);
}

/** Nhắc đồng hồ lúc này chưa (CUE.clock, nơi gọi giữ chỉ nhắc một lần): đã tới lúc (clockDue), Mây đã nói xong lượt và máy phát đã im, không ai nói
 *  CALM_MS (quietMs: từ lúc Mây im, mic nghe to hay có lời chép gần nhất), để không chen ngang ai. Người kể đáp liền mọi lượt thì không có lúc ấy:
 *  còn dưới CLOCK_LATE_SEC giây thì nhắc ngay khi Mây nói xong, để Mây kịp khép chuyện trước khi cúp. */
export function clockCue(p: { maxSec: number; elapsedSec: number; mayDone: boolean; talking: boolean; quietMs: number }): boolean {
  if (!clockDue(p.maxSec, p.elapsedSec) || !p.mayDone || p.talking) return false;
  return p.quietMs >= CALM_MS || p.maxSec - p.elapsedSec <= CLOCK_LATE_SEC;
}

/** Máy để đó không ai nói: nudgedAt lúc nhắc im lặng (0: chưa nhắc, hay người kể đã nói lại), byeAt lúc nhắc Mây chào (0: chưa). 'bye': nhắc Mây
 *  chào (CUE.idle), đường cúp sau lời chào như thường lo phần còn lại; 'hang': nhắc chào đã lâu mà chưa vào bước chào (nơi gọi chỉ hỏi khi chưa có
 *  end_call), cúp luôn. */
export function idleDue(p: { now: number; nudgedAt: number; byeAt: number }): 'bye' | 'hang' | null {
  if (p.byeAt) return p.now - p.byeAt >= IDLE_HANG_MS ? 'hang' : null;
  return p.nudgedAt && p.now - p.nudgedAt >= IDLE_BYE_MS ? 'bye' : null;
}

/** goAway: bao nhiêu mili giây nữa thì cúp cứng nếu lời chào chưa xong. timeLeft của Google là Duration JSON ("12.5s") hay số giây; trừ AWAY_MARGIN_MS. */
export function awayMs(timeLeft: unknown): number {
  const sec = typeof timeLeft === 'number' ? timeLeft : parseFloat(String(timeLeft ?? ''));
  return Number.isFinite(sec) ? Math.max(0, Math.round(sec * 1000) - AWAY_MARGIN_MS) : AWAY_DEFAULT_MS;
}

/** allow của cuộc gọi Live cho remindFor: allow lúc nhấc máy (/call/live, DATA có cuộc gọi trước, có ảnh), cộng chuyện kể ngay trong cuộc gọi
 *  (ownStory luôn true), lời nhắn khi lúc nhấc máy có lời nhắn chờ (relays: số lời nhắn ấy), ảnh khi ảnh đã tới trong cuộc gọi này (photos: số ảnh). */
export function remindAllow(allow: { prevCall: boolean; photos: boolean }, p: { relays: number; photos: number }): Allow {
  return { prevCall: allow.prevCall, ownStory: true, photos: allow.photos || p.photos > 0, message: p.relays > 0 };
}

/** Đến lúc nhắc model người kể im chưa (CUE.silent): Mây đã nói xong lượt (turnComplete), máy phát đã im, không nghe gì SILENT_MS (quietMs: từ lúc
 *  Mây im, lúc mic nghe to hay có lời chép gần nhất), và chưa nhắc từ lần người kể nói gần nhất (nudged: nơi gọi bỏ cờ khi có lời chép của người kể). */
export const silentDue = (p: { mayDone: boolean; talking: boolean; quietMs: number; nudged: boolean }): boolean =>
  p.mayDone && !p.talking && !p.nudged && p.quietMs >= SILENT_MS;

/** Câu Mây vừa nói xong có dấu hiệu bịa (slipLive: không cần dữ liệu, bỏ mốc thời gian vì trong cuộc gọi chúng chỉ lại chính cuộc gọi này)
 *  thì nhắc model một lần mỗi cuộc gọi. allow là allow của cuộc gọi Live (xem đầu tệp). */
export function remindFor(s: LiveState, line: string, allow: Allow, lang: 'vi' | 'en' | 'ko'): { state: LiveState; cue: string | null } {
  if (s.reminded || !slipLive(line, allow, lang)) return { state: s, cue: null };
  return { state: { ...s, reminded: true }, cue: CUE.remind };
}

/** Đến lúc nhắc còn hai phút chưa (CUE.clock; nơi gọi giữ chỉ nhắc một lần). Cuộc gọi chỉ 150 giây trở xuống thì không nhắc. */
export const clockDue = (maxSec: number, elapsedSec: number): boolean => maxSec > CLOCK_MIN_SEC && maxSec - elapsedSec <= CLOCK_LEFT_SEC;

/** Việc chốt cuộc gọi (POST /finish, việc cuối của nhóm): câu hẹn và các câu Mây đã nói (tối đa 120, máy chủ ghi log chống bịa). Cuộc gọi Live nào cũng chốt bằng việc này. */
export function finishJob(s: LiveState, may: string[]): Job {
  return { url: `/api/call/${s.id}/finish`, fields: { hook: s.hook, may: JSON.stringify(may.slice(0, 120)) }, last: true };
}

// ---------- Ghi từng lượt ----------

/** key đếm lượt ghi; recording: đang ghi; loud, heard: lượt đang ghi có tiếng to, lời chép; question: câu Mây nói xong gần nhất (câu hỏi của lượt sau);
 *  mayLine: câu Mây đang nói; pending: lượt đã dừng ghi (Mây bắt đầu đáp) chờ Mây nói xong, vì lời chép của người kể có thể tới muộn;
 *  guard: lượt đang ghi bị gác (lượt ngay sau lượt ở ô lời nhắn khó nói, onRec cho blank): lời chép tới trước tiếng to đầu tiên của lượt bị bỏ, vì đó
 *  có thể là đuôi lời nhắn chép muộn, mà lượt này vào ô 0, nơi sổ nhớ đọc. */
export type Capture = { key: number; recording: boolean; loud: boolean; heard: string; question: string; mayLine: string; pending: { key: number; question: string; heard: string; loud: boolean } | null; guard: boolean };
/** gate: Mây im MIC_GATE_MS cộng độ trễ phát; loud: mic có tiếng to; in, out: lời chép của người kể, của Mây; audio: tiếng đầu tiên của Mây từ lần done
 *  trước (kể cả tiếng không phát lúc xin phép); done: model turnComplete; hangup: cúp máy, mọi lý do; guard: gác lượt đang ghi (nơi gọi gửi ngay sau
 *  startRec khi bản chụp onRec của lượt ấy có blank). */
export type CaptureEvent = { type: 'gate' } | { type: 'loud' } | { type: 'in'; text: string } | { type: 'out'; text: string } | { type: 'audio' } | { type: 'done' } | { type: 'hangup' } | { type: 'guard' };
export type CaptureAction = { kind: 'startRec'; key: number } | { kind: 'stopRec'; key: number } | { kind: 'turn'; key: number; question: string; transcript: string } | { kind: 'mayLine'; text: string };
export const CAPTURE_START: Capture = { key: 0, recording: false, loud: false, heard: '', question: '', mayLine: '', pending: null, guard: false };

/** Bắt đầu ghi lượt người kể chưa (gửi gate cho captureNext): mic đã mở lại (gate: Mây im MIC_GATE_MS cộng độ trễ loa), Mây đã nói ít nhất một lần,
 *  lượt của Mây đã xong (mayDone: turnComplete) hay bị chạm cắt (hush), chưa đang ghi. Mic mở giữa lượt của Mây (tiếng tới chậm, chờ lời đáp công cụ
 *  giữa câu khép chuyện và câu mở chuyện sau) thì chưa: tiếng kế tiếp của Mây sẽ dừng lượt mới ấy và đè lên lượt đang chờ gửi (pending chỉ giữ một). */
export const recDue = (p: { gate: boolean; spoke: boolean; mayDone: boolean; hush: boolean; recording: boolean }): boolean =>
  p.gate && p.spoke && (p.mayDone || p.hush) && !p.recording;

const voiced = (p: { heard: string; loud: boolean }) => p.loud || !!p.heard.trim();
const turnOf = (p: { key: number; question: string; heard: string }): CaptureAction => ({ kind: 'turn', key: p.key, question: p.question, transcript: p.heard.trim() });

/** Bước kế của việc ghi từng lượt. Mic chỉ mở khi Mây im, nên lời chép tới sau khi lượt đã khép vẫn thuộc lượt ấy; lượt chỉ gửi (turn) khi Mây
 *  nói xong và lượt có tiếng; cúp máy thì lượt đang ghi hay đang chờ gửi đúng một lần. */
export function captureNext(c: Capture, e: CaptureEvent): { capture: Capture; actions: CaptureAction[] } {
  switch (e.type) {
    case 'gate':
      if (c.recording) return { capture: c, actions: [] };
      return { capture: { ...c, key: c.key + 1, recording: true, heard: '', loud: false, guard: false }, actions: [{ kind: 'startRec', key: c.key + 1 }] };
    case 'guard': return { capture: c.recording ? { ...c, guard: true } : c, actions: [] };
    case 'loud': return { capture: { ...c, loud: true }, actions: [] };
    case 'in':
      if (c.pending) return { capture: { ...c, pending: { ...c.pending, heard: c.pending.heard + e.text } }, actions: [] };
      if (c.recording && c.guard && !c.loud) return { capture: c, actions: [] };
      return { capture: { ...c, heard: c.heard + e.text }, actions: [] };
    case 'out': return { capture: { ...c, mayLine: c.mayLine + e.text }, actions: [] };
    case 'audio':
      if (!c.recording) return { capture: c, actions: [] };
      return { capture: { ...c, recording: false, pending: { key: c.key, question: c.question, heard: c.heard, loud: c.loud } }, actions: [{ kind: 'stopRec', key: c.key }] };
    case 'done': {
      const actions: CaptureAction[] = c.pending && voiced(c.pending) ? [turnOf(c.pending)] : [];
      const line = c.mayLine.trim();
      if (line) actions.push({ kind: 'mayLine', text: line });
      return { capture: { ...c, pending: null, mayLine: '', question: line || c.question }, actions };
    }
    case 'hangup': {
      const actions: CaptureAction[] = c.pending && voiced(c.pending) ? [turnOf(c.pending)] : [];
      if (c.recording) {
        actions.push({ kind: 'stopRec', key: c.key });
        if (voiced(c)) actions.push(turnOf(c));
      }
      return { capture: { ...c, recording: false, pending: null }, actions };
    }
  }
}
