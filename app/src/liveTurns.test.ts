// Kiểm logic cuộc gọi Mây Live ở máy khách (src/liveTurns.ts). Chạy: node --import tsx --test src/liveTurns.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askStep, awayMs, byeDue, CAPTURE_START, captureNext, clockCue, clockDue, CUE, finishJob, guarded, idleDue, liveStart, onRec, onTool, onTurn, photoCue,
  recDue, relayLine, remindAllow, remindFor, SILENT_MS, silentDue, type AskStep, type Capture, type CaptureAction, type CaptureEvent, type Job, type LiveState,
} from './liveTurns.ts';
import { LIVE_FIRST_STORY, LIVE_MAX_STORIES } from './shared.ts';

const S = () => liveStart({ id: 'c1', family: 3, themes: ['tuoi-tho', 'mon-an'], relays: ['r1'] });
const ONE = () => liveStart({ id: 'c1', family: 1, themes: ['tuoi-tho', 'mon-an'], relays: [] });
const OPEN = { name: 'story_open', args: { theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' } };
/** Một chuyện đã kể một lượt (storyTurns 1), chuyện vẫn mở. */
const TOLD = () => onTurn(onTool(S(), OPEN).state, { question: 'Mẹ kể con nghe về món canh chua nhé', transcript: 'Hồi đó mẹ nấu canh chua', seconds: 8 }).state;

test('mở chuyện: ô từ 2 tăng dần, việc lưu ô là việc cuối nhóm; chủ đề lạ hay câu mở rỗng thì không mở', () => {
  let r = onTool(S(), { name: 'story_open', args: { theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' } });
  assert.equal(r.state.idx, 2);
  assert.deepEqual(r.effects, [{ kind: 'job', job: { url: '/api/call/c1/story', fields: { idx: '2', theme: 'mon-an', opener: 'Mẹ kể con nghe về món canh chua nhé' }, last: true } }]);
  assert.equal(r.result, 'Story opened.', 'kết quả cho model khi mở được');
  r = onTool(r.state, { name: 'story_open', args: { theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' } });
  assert.equal(r.state.idx, 3);
  assert.deepEqual(onTool(S(), { name: 'story_open', args: { theme: 'ngay-cuoi', opener: 'x' } }).effects, []);
  assert.deepEqual(onTool(S(), { name: 'story_open', args: { theme: 'mon-an', opener: '  ' } }).effects, []);
  const bad = onTool(S(), { name: 'story_open', args: { theme: 'ngay-cuoi', opener: 'x' } });
  assert.equal(bad.result, 'Not opened: use a theme from DATA.allowed_themes and say the opener.', 'chủ đề ngoài danh sách: bảo model chọn lại');
  assert.equal(bad.state.idx, 0, 'không mở thì ô không đổi');
  assert.equal(onTool(S(), { name: 'story_open', args: { theme: 'mon-an', opener: 'a'.repeat(400) } }).state.opener.length, 300, 'câu mở tối đa 300 chữ');
});

test('lượt kể: đúng ô, đúng lượt, có theme và câu mở cho ô chuyện; lời im dưới 1 giây thì không gửi', () => {
  let r = onTurn(S(), { question: 'Hôm nay mẹ thế nào ạ?', transcript: 'Mẹ khoẻ', seconds: 3 });
  assert.deepEqual(r.job, { url: '/api/call/c1/answer?live=1', fields: { live: '1', idx: '0', turn: '0', question: 'Hôm nay mẹ thế nào ạ?', transcript: 'Mẹ khoẻ', seconds: '3' } },
    'trước khi mở chuyện: ô 0, lượt 0, không có theme, gửi tới ?live=1');
  let s = onTool(r.state, OPEN).state;
  r = onTurn(s, { question: 'Mẹ kể con nghe về món canh chua nhé', transcript: 'Hồi đó mẹ nấu', seconds: 9 });
  assert.equal(r.job?.fields.idx, '2', 'lượt đầu của chuyện vào ô 2');
  assert.equal(r.job?.fields.turn, '0', 'lượt đầu của ô chuyện là lượt 0');
  assert.equal(r.job?.fields.theme, 'mon-an', 'ô chuyện gửi kèm theme');
  assert.equal(r.job?.fields.opener, 'Mẹ kể con nghe về món canh chua nhé', 'ô chuyện gửi kèm câu mở');
  r = onTurn(r.state, { question: 'Canh chua nấu với gì ạ?', transcript: 'Với cá lóc', seconds: 4 });
  assert.equal(r.job?.fields.turn, '1', 'lượt thứ hai của ô chuyện là lượt 1');
  assert.equal(r.state.storyTurns, 2, 'hai lượt kể chuyện');
  s = onTool(r.state, { name: 'story_close' }).state;
  r = onTurn(s, { question: 'Hay quá', transcript: 'Ừ', seconds: 2 });
  assert.equal(r.job?.fields.idx, '0', 'khép chuyện thì về ô 0');
  assert.equal(r.job?.fields.turn, '1', 'ô 0 đếm tiếp lượt của riêng nó');
  assert.equal(r.job?.fields.theme, undefined, 'ô 0 không gửi theme');
  assert.equal(r.state.storyTurns, 2, 'lượt ở ô 0 không tính là lượt kể chuyện');
  assert.equal(onTurn(S(), { question: 'Q', transcript: '', seconds: 0.4 }).job, null, 'im dưới 1 giây, không lời: không gửi');
  assert.equal(onTurn(S(), { question: 'Q', transcript: 'Dạ', seconds: 0.4 }).job?.fields.transcript, 'Dạ', 'ngắn mà có lời: vẫn gửi');
  assert.equal(onTurn(S(), { question: 'Q', transcript: '', seconds: 2 }).job?.fields.seconds, '2', 'có tiếng mà chưa chép được lời: vẫn gửi');
  assert.equal(onTurn(S(), { question: 'q'.repeat(400), transcript: 'Dạ', seconds: 2 }).job?.fields.question.length, 300, 'câu hỏi tối đa 300 chữ');
});

test('ask_share (công cụ đã bỏ): model còn gọi thì chỉ nhận ok, không đổi gì, không hiện nút', () => {
  const r = onTool(TOLD(), { name: 'ask_share' });
  assert.equal(r.result, 'ok');
  assert.deepEqual(r.effects, []);
  assert.deepEqual(r.state, TOLD());
});

test('lời nhắn: chỉ mã đang chờ và chưa chuyển; mở bước lời nhắn thì lượt sau vào ô 1', () => {
  const r = onTool(S(), { name: 'relay_heard', args: { id: 'r1' } });
  assert.deepEqual(r.effects, [{ kind: 'job', job: { url: '/api/call/c1/relay/r1/heard', fields: {} } }], 'mã đang chờ: báo đã chuyển');
  assert.equal(r.result, 'Delivered.');
  assert.deepEqual(r.state.heard, ['r1']);
  const again = onTool(r.state, { name: 'relay_heard', args: { id: 'r1' } });
  assert.equal(again.result, 'Unknown message id.', 'chuyển rồi thì không chuyển lại');
  assert.deepEqual(again.effects, []);
  assert.deepEqual(onTool(S(), { name: 'relay_heard', args: { id: 'r9' } }).effects, [], 'mã lạ: không gửi gì');
  const odd = liveStart({ id: 'c1', family: 3, themes: [], relays: ['a/b'] });
  assert.equal((onTool(odd, { name: 'relay_heard', args: { id: 'a/b' } }).effects[0] as { job: { url: string } }).job.url, '/api/call/c1/relay/a%2Fb/heard', 'mã lời nhắn được mã hoá trong đường dẫn');
  const open = onTool(S(), { name: 'relay_open' });
  assert.equal(open.state.idx, 1, 'mở bước lời nhắn: ô 1');
  assert.equal(open.result, 'Ask now.');
  assert.equal(onTurn(open.state, { question: 'Có điều gì khó nói không ạ?', transcript: 'Con nhắn bố', seconds: 4 }).job?.fields.idx, '1', 'lượt sau vào ô 1');
  const lone = onTool(ONE(), { name: 'relay_open' });
  assert.equal(lone.result, 'They are the only one in the family: skip this step.', 'nhà một người: bỏ bước lời nhắn');
  assert.equal(lone.state.idx, 0);
});

test('ô lời nhắn khép ở lời gọi công cụ kế tiếp: lượt nói thêm sau đó không đè lời nhắn', () => {
  const open = onTool(S(), { name: 'relay_open' }).state;
  for (const f of [{ name: 'end_call', args: { next_hook: 'x' } }, { name: 'relay_heard', args: { id: 'r1' } }, { name: 'ask_photo' }, { name: 'xyz' }]) {
    assert.equal(onTool(open, f).state.idx, 0, `${f.name} khép ô lời nhắn`);
  }
  assert.equal(onTool(open, OPEN).state.idx, 2, 'mở chuyện thì sang ô chuyện');
  assert.equal(onTool(open, { name: 'relay_open' }).state.idx, 1, 'mở lại bước lời nhắn thì vẫn ô 1');
});

test('chào và câu hẹn; công cụ lạ thì ok; xin ảnh khi chưa mở chuyện thì bỏ qua', () => {
  const bye = onTool(S(), { name: 'end_call', args: { next_hook: '  Tuần sau kể tiếp chuyện bà nhé ' } });
  assert.equal(bye.state.hook, 'Tuần sau kể tiếp chuyện bà nhé', 'câu hẹn đã cắt khoảng trắng');
  assert.deepEqual(bye.effects, [{ kind: 'end' }]);
  assert.equal(bye.result, 'Say your goodbye now; the app hangs up after it.', 'model nói lời chào và câu hẹn, app cúp sau đó');
  const bare = onTool(S(), { name: 'end_call', args: {} });
  assert.equal(bare.state.hook, '', 'không có câu hẹn: rỗng');
  assert.deepEqual(bare.effects, [{ kind: 'end' }], 'không có câu hẹn vẫn cúp máy');
  assert.equal(onTool(S(), { name: 'end_call', args: { next_hook: 'h'.repeat(250) } }).state.hook.length, 200, 'câu hẹn tối đa 200 chữ');
  const odd = onTool(S(), { name: 'xyz' });
  assert.equal(odd.result, 'ok', 'công cụ lạ: ok');
  assert.deepEqual(odd.effects, [], 'công cụ lạ: không làm gì');
  const early = onTool(S(), { name: 'ask_photo' });
  assert.deepEqual(early.effects, [], 'chưa mở chuyện: không hiện ô ảnh');
  assert.equal(early.result, 'No story is open: skip the photo.');
});

test('xin ảnh sau khi khép chuyện vẫn được (R5): ảnh thuộc chuyện vừa kể', () => {
  const open = onTool(S(), OPEN).state;
  const during = onTool(open, { name: 'ask_photo' });
  assert.deepEqual(during.effects, [{ kind: 'photo' }], 'đang kể: hiện ô ảnh');
  assert.equal(during.result, 'The photo button is showing. Wait for them; the app will tell you how many photos arrived.');
  const closed = onTool(open, { name: 'story_close' });
  assert.equal(closed.state.idx, 0);
  assert.equal(closed.state.theme, null);
  assert.equal(closed.result, 'Story closed. Go on to the side questions, then the closing steps.');
  assert.equal(closed.state.lastStory, 2, 'khép chuyện vẫn nhớ ô chuyện vừa kể');
  const after = onTool(closed.state, { name: 'ask_photo' });
  assert.deepEqual(after.effects, [{ kind: 'photo' }], 'khép rồi mới xin ảnh: vẫn hiện ô ảnh');
  assert.equal(after.state.lastStory, 2, 'ảnh vào ô chuyện vừa kể');
  assert.equal(onTool(after.state, { name: 'story_open', args: { theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' } }).state.lastStory, 3, 'mở chuyện mới thì ô ảnh theo chuyện mới');
});

test('công cụ gọi ngay trước câu đáp chỉ có hiệu lực từ lượt sau: lượt đang ghi giữ ô lúc bắt đầu', () => {
  // Lượt 1 (hỏi thăm) đang ghi thì Mây gọi story_open ngay trước câu mở: câu đáp hỏi thăm vẫn ở ô 0, không lọt vào tập chuyện.
  let s = onRec(S(), 1);
  s = onTool(s, OPEN).state;
  let r = onTurn(s, { key: 1, question: 'Hôm nay mẹ thế nào ạ?', transcript: 'Mẹ khoẻ', seconds: 2 });
  assert.equal(r.job?.fields.idx, '0', 'câu đáp hỏi thăm vẫn vào ô 0');
  assert.equal(r.job?.fields.theme, undefined, 'câu đáp hỏi thăm không mang theme');
  assert.equal(r.state.storyTurns, 0, 'câu đáp hỏi thăm không tính là lượt kể');
  // Lượt 2 bắt đầu sau câu mở; Mây gọi story_close ngay trước câu khen: đoạn cuối chuyện vẫn ở ô chuyện.
  s = onRec(r.state, 2);
  s = onTool(s, { name: 'story_close' }).state;
  r = onTurn(s, { key: 2, question: 'Mẹ kể con nghe về món canh chua nhé', transcript: 'Hồi đó mẹ nấu canh chua', seconds: 20 });
  assert.equal(r.job?.fields.idx, '2', 'đoạn cuối chuyện vẫn ở ô chuyện');
  assert.equal(r.job?.fields.theme, 'mon-an');
  assert.equal(r.state.storyTurns, 1);
  // Lượt 3 là lời nhắn; Mây gọi ask_photo ngay trước câu kế (khép ô 1): lời nhắn vẫn vào ô 1, không bị bỏ.
  s = onRec(onTool(r.state, { name: 'relay_open' }).state, 3);
  s = onTool(s, { name: 'ask_photo' }).state;
  r = onTurn(s, { key: 3, question: 'Có điều gì khó nói không ạ?', transcript: 'Con nhắn bố là con thương bố', seconds: 5 });
  assert.equal(r.job?.fields.idx, '1', 'lời nhắn vào ô 1, không về ô hỏi thăm');
  assert.deepEqual(r.state.rec, {}, 'gửi xong thì bỏ bản chụp');
});

test('ghi từng lượt: mở mic thì ghi, Mây nói thì dừng, lời chép tới muộn vẫn vào đúng lượt, Mây nói xong mới gửi', () => {
  let c = CAPTURE_START, a: CaptureAction[];
  ({ capture: c } = captureNext(c, { type: 'out', text: 'Hôm nay mẹ thế nào ạ?' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'done' }));
  assert.deepEqual(a, [{ kind: 'mayLine', text: 'Hôm nay mẹ thế nào ạ?' }], 'Mây nói xong: câu ấy thành câu hỏi của lượt sau');
  ({ capture: c, actions: a } = captureNext(c, { type: 'gate' }));
  assert.deepEqual(a, [{ kind: 'startRec', key: 1 }]);
  assert.deepEqual(captureNext(c, { type: 'gate' }).actions, [], 'đang ghi thì mở mic lần nữa không ghi chồng');
  ({ capture: c } = captureNext(c, { type: 'loud' }));
  ({ capture: c } = captureNext(c, { type: 'in', text: 'Mẹ khoẻ' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'audio' }));
  assert.deepEqual(a, [{ kind: 'stopRec', key: 1 }]);
  ({ capture: c } = captureNext(c, { type: 'in', text: ' lắm' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'done' }));
  assert.deepEqual(a[0], { kind: 'turn', key: 1, question: 'Hôm nay mẹ thế nào ạ?', transcript: 'Mẹ khoẻ lắm' });
});

test('ghi từng lượt: lượt không có tiếng thì không gửi; cúp máy giữa lượt gửi đúng một lần', () => {
  let c = CAPTURE_START, a: CaptureAction[];
  ({ capture: c } = captureNext(c, { type: 'gate' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'audio' }));
  assert.deepEqual(a, [{ kind: 'stopRec', key: 1 }], 'lượt im vẫn dừng ghi');
  ({ capture: c, actions: a } = captureNext(c, { type: 'done' }));
  assert.deepEqual(a, [], 'lượt không có tiếng: không gửi');
  ({ capture: c } = captureNext(c, { type: 'gate' }));
  ({ capture: c } = captureNext(c, { type: 'loud' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'hangup' }));
  assert.deepEqual(a, [{ kind: 'stopRec', key: 2 }, { kind: 'turn', key: 2, question: '', transcript: '' }], 'cúp giữa lúc ghi: dừng rồi gửi');
  ({ capture: c, actions: a } = captureNext(c, { type: 'hangup' }));
  assert.deepEqual(a, [], 'cúp lần hai không gửi gì');
  ({ capture: c } = captureNext(c, { type: 'gate' }));
  ({ capture: c } = captureNext(c, { type: 'loud' }));
  ({ capture: c } = captureNext(c, { type: 'audio' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'hangup' }));
  assert.deepEqual(a, [{ kind: 'turn', key: 3, question: '', transcript: '' }], 'cúp lúc lượt đã khép chờ gửi: gửi đúng một lần');
  assert.deepEqual(captureNext(c, { type: 'hangup' }).actions, [], 'rồi cúp thêm cũng không gửi lại');
});

test('bước của lượt Mây sau công cụ (askStep): chỉ tính là đã nói khi Mây đã cất tiếng sau lời đáp công cụ', () => {
  let ask: AskStep = 'tool';
  ask = askStep(ask, 'done');
  assert.equal(ask, 'tool', 'lượt chỉ có lời gọi công cụ xong: chưa nói');
  ask = askStep(ask, 'audio');
  assert.equal(ask, 'spoke');
  ask = askStep(ask, 'done');
  assert.equal(ask, 'asked', 'Mây cất tiếng rồi xong lượt: đã nói');
  assert.equal(askStep(ask, 'audio'), 'asked', 'đã nói thì giữ nguyên');
});

test('nhắc chống bịa: chỉ một lần mỗi cuộc gọi, chỉ khi có dấu hiệu', () => {
  const allow = { prevCall: false, ownStory: true, photos: false };
  const r = remindFor(S(), 'Lần trước mẹ kể chuyện bà', allow, 'vi');
  assert.equal(r.cue, CUE.remind, 'nhắc cuộc gọi trước không có: nhắc');
  assert.equal(r.state.reminded, true);
  assert.equal(remindFor(r.state, 'Lần trước mẹ kể chuyện bà', allow, 'vi').cue, null, 'đã nhắc rồi: không nhắc lại');
  assert.equal(remindFor(S(), 'Mẹ kể tiếp đi ạ', allow, 'vi').cue, null, 'không có dấu hiệu: không nhắc');
});

test('nhắc chống bịa giữa cuộc gọi: câu chỉ lại chính cuộc gọi này không bị nhắc, bịa thật thì nhắc', () => {
  const allow = { prevCall: false, ownStory: true, photos: false };
  const live: Array<[string, 'vi' | 'en' | 'ko']> = [
    ['Lúc nãy mẹ nói bà ngoại ở quê, quê mình ở đâu ạ?', 'vi'],
    ['Hôm qua mẹ đi chợ mua gì ạ?', 'vi'],
    ['Mẹ vừa kể về món canh chua, mẹ nấu với gì ạ?', 'vi'],
    ['That sounds lovely, just now I could picture it.', 'en'],
    ['아까 말씀하신 시장은 어디였어요?', 'ko'],
    ['방금 그 얘기 정말 재밌어요.', 'ko'],
  ];
  for (const [line, lang] of live) assert.equal(remindFor(S(), line, allow, lang).cue, null, line);
  assert.equal(remindFor(S(), 'Ảnh mẹ vừa gửi đẹp quá', allow, 'vi').cue, CUE.remind, 'ảnh chưa gửi: nhắc');
  assert.equal(remindFor(S(), 'Ảnh mẹ vừa gửi đẹp quá', { ...allow, photos: true }, 'vi').cue, null, 'ảnh đã tới trong cuộc gọi: không nhắc');
  assert.equal(remindFor(S(), 'Bố nhắn cho mẹ là bố nhớ mẹ', allow, 'vi').cue, CUE.remind, 'không có lời nhắn chờ: nhắc');
  assert.equal(remindFor(S(), 'Bố nhắn cho mẹ là bố nhớ mẹ', { ...allow, message: true }, 'vi').cue, null, 'có lời nhắn chờ: không nhắc');
});

test('câu Mây đáp lời nhắn khó nói không thành câu hỏi của lượt ô 0 kế đó (lượt ấy vào sổ nhớ)', () => {
  // Nhà chưa kể chuyện nào: relay_open, lời nhắn, rồi Mây nhắc lại lời nhắn và chào luôn (end_call).
  let s = onRec(onTool(S(), { name: 'relay_open' }).state, 1);
  s = onTool(s, { name: 'end_call', args: { next_hook: 'Tuần sau kể chuyện tuổi thơ nhé' } }).state;
  let r = onTurn(s, { key: 1, question: 'Mẹ có điều gì khó nói muốn nhắn không ạ?', transcript: 'Mẹ thương bố nhiều lắm', seconds: 4 });
  assert.equal(r.job?.fields.idx, '1');
  assert.equal(r.job?.fields.question, 'Mẹ có điều gì khó nói muốn nhắn không ạ?', 'ô lời nhắn giữ câu hỏi của nó (không vào sổ nhớ)');
  r = onTurn(onRec(r.state, 2), { key: 2, question: 'Dạ con sẽ nhắn bố là mẹ thương bố nhiều lắm. Chào mẹ nhé', transcript: 'Chào con', seconds: 2 });
  assert.equal(r.job?.fields.idx, '0', 'lời chào vào ô 0');
  assert.equal(r.job?.fields.question, '', 'câu Mây đáp lời nhắn không đi theo lượt ô 0');
  r = onTurn(onRec(r.state, 3), { key: 3, question: 'Mẹ ngủ ngon nhé', transcript: 'Ừ', seconds: 1 });
  assert.equal(r.job?.fields.question, 'Mẹ ngủ ngon nhé', 'lượt sau nữa thì câu hỏi như thường');
});

test('cả cuộc gọi qua captureNext (11 bước, một chuyện): mọi lượt đúng ô, đúng lượt, chuyện thứ hai bị từ chối, không có việc chia sẻ nào', () => {
  let s: LiveState = S();
  let c: Capture = CAPTURE_START;
  const jobs: Job[] = [];
  const feed = (e: CaptureEvent) => {
    const r = captureNext(c, e);
    c = r.capture;
    for (const a of r.actions) {
      if (a.kind === 'startRec') s = onRec(s, a.key);
      if (a.kind === 'turn') {
        const t = onTurn(s, { key: a.key, question: a.question, transcript: a.transcript, seconds: 3 });
        s = t.state;
        if (t.job) jobs.push(t.job);
      }
    }
  };
  /** Một lượt của Mây: các công cụ gọi trước câu nói, câu nói, xong; rồi Mây im thì mở mic. */
  const may = (text: string, tools: Array<{ name: string; args?: Record<string, unknown> }> = []) => {
    for (const f of tools) {
      const r = onTool(s, f);
      s = r.state;
      for (const e of r.effects) if (e.kind === 'job') jobs.push(e.job);
    }
    feed({ type: 'out', text }); feed({ type: 'audio' }); feed({ type: 'done' });
    feed({ type: 'gate' });
  };
  const user = (text: string) => { feed({ type: 'loud' }); feed({ type: 'in', text }); };

  may('Chào mẹ, hôm nay mẹ thế nào ạ?'); // 1 chào
  user('Mẹ khoẻ'); // 2 hỏi thăm
  may('Mẹ kể con nghe về món canh chua nhé', [OPEN]); // 3 mở chuyện ngay trước câu mở
  user('A1'); may('Q2'); user('A2'); may('Q3'); user('A3'); // 4 kể chuyện
  may('Mẹ có ảnh không?', [{ name: 'ask_photo' }]); // 5 xin ảnh
  user('A4 photo talk');
  // 6 khép chuyện; Mây lỡ mở chuyện thứ hai thì bị từ chối (chuyện đã có bốn lượt), nên câu hỏi bên lề và câu trả lời ở ô 0.
  may('Hay quá. Mẹ có nhớ An không ạ?', [{ name: 'story_close' }, { name: 'story_open', args: { theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' } }]);
  user('B1 nhớ lắm'); // 7 câu hỏi bên lề
  may('Dạ. Bố nhắn mẹ là bố nhớ mẹ', [{ name: 'relay_heard', args: { id: 'r1' } }]); // 8 chuyển lời nhắn
  user('Ừ mẹ biết rồi');
  may('Mẹ có lời gì gửi An không ạ?', [{ name: 'relay_open' }]); // 9
  user('SECRET mẹ thương bố'); // 10 lời nhắn gửi người trong nhà
  may('Chào mẹ, tuần sau kể tiếp nhé', [{ name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp' } }]); // 11 chào
  user('Chào con');
  feed({ type: 'hangup' });

  const ans = jobs.filter((j) => j.url.includes('/answer')).map((j) => `${j.fields.idx}:${j.fields.turn}:${j.fields.transcript}`);
  assert.deepEqual(ans, ['0:0:Mẹ khoẻ', '2:0:A1', '2:1:A2', '2:2:A3', '2:3:A4 photo talk', '0:1:B1 nhớ lắm', '0:2:Ừ mẹ biết rồi', '1:0:SECRET mẹ thương bố', '0:3:Chào con'],
    'hỏi thăm ở ô 0, một chuyện ở ô 2 đủ cả đoạn cuối, câu hỏi bên lề ở ô 0, lời nhắn ở ô 1, lời chào ở ô 0');
  assert.deepEqual(jobs.filter((j) => !j.url.includes('/answer')).map((j) => j.url),
    ['/api/call/c1/story', '/api/call/c1/relay/r1/heard'], 'một ô chuyện, một lời nhắn đã chuyển, không /share hay /keep');
  assert.equal(s.hook, 'Tuần sau kể tiếp', 'câu hẹn giữ lại cho /finish');
  assert.equal(s.storyTurns, 4, 'bốn lượt kể chuyện');
});

test('chào hai lần: chỉ lần đầu tính, câu hẹn giữ nguyên, không cúp máy lần hai', () => {
  const first = onTool(S(), { name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp' } });
  const second = onTool(first.state, { name: 'end_call', args: {} });
  assert.equal(second.state.hook, 'Tuần sau kể tiếp', 'câu hẹn lần đầu giữ nguyên');
  assert.deepEqual(second.effects, [], 'không có lệnh cúp máy thứ hai');
  assert.equal(second.result, 'Say nothing more; the app hangs up.', 'lần hai bảo model im, không chào lần nữa');
});

test('khép chuyện khi chưa mở chuyện nào: không làm gì', () => {
  const r = onTool(S(), { name: 'story_close' });
  assert.deepEqual(r.effects, [], 'không có việc gì');
  assert.equal(r.state.idx, 0);
  assert.equal(r.state.lastStory, 0, 'không có chuyện để xin ảnh');
  assert.equal(r.state.next, LIVE_FIRST_STORY, 'ô chuyện kế tiếp không đổi');
  assert.equal(onTool(r.state, { name: 'ask_photo' }).result, 'No story is open: skip the photo.', 'vẫn không xin ảnh được');
});

test('quá số chuyện tối đa của một cuộc gọi thì không mở thêm', () => {
  let s = S();
  for (let i = 0; i < LIVE_MAX_STORIES; i++) s = onTool(s, { name: 'story_open', args: { theme: i % 2 ? 'tuoi-tho' : 'mon-an', opener: `Chuyện ${i}` } }).state;
  assert.equal(s.idx, LIVE_FIRST_STORY + LIVE_MAX_STORIES - 1, 'chuyện cuối cùng được mở ở ô cuối');
  const over = onTool(s, OPEN);
  assert.equal(over.result, 'Not opened: use a theme from DATA.allowed_themes and say the opener.', 'quá số chuyện: không mở');
  assert.deepEqual(over.effects, [], 'không gửi ô chuyện ngoài khoảng máy chủ nhận');
  assert.equal(over.state.idx, s.idx, 'chuyện đang mở giữ nguyên');
});

test('lượt có key mà không có bản chụp thì bỏ, không đoán ô (lời nhắn không thể rơi về ô 0)', () => {
  const s = onTool(S(), { name: 'relay_open' }).state;
  const r = onTurn(s, { key: 7, question: 'Q', transcript: 'Con nhắn bố', seconds: 3 });
  assert.equal(r.job, null, 'không gửi');
  assert.deepEqual(r.state.turns, {}, 'không đếm lượt');
});

test('đồng hồ: còn hai phút thì nhắc; cuộc gọi chỉ 150 giây trở xuống thì không nhắc (R12)', () => {
  assert.equal(clockDue(900, 779), false, 'còn hơn 120 giây: chưa nhắc');
  assert.equal(clockDue(900, 780), true, 'còn 120 giây: nhắc');
  assert.equal(clockDue(150, 30), false, 'cuộc gọi 150 giây: không nhắc');
  assert.equal(clockDue(90, 0), false, 'cuộc gọi ngắn hơn hai phút: không nhắc ngay lúc vào');
  assert.equal(clockDue(151, 31), true, 'trên 150 giây: nhắc như thường');
});

test('chốt cuộc gọi: /finish là việc cuối, kèm câu hẹn và các câu Mây đã nói', () => {
  const s = onTool(S(), { name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp chuyện bà nhé' } }).state;
  assert.deepEqual(finishJob(s, ['Chào mẹ', 'Mẹ kể tiếp đi ạ']), {
    url: '/api/call/c1/finish', fields: { hook: 'Tuần sau kể tiếp chuyện bà nhé', may: '["Chào mẹ","Mẹ kể tiếp đi ạ"]', relay: 'none' }, last: true,
  });
  assert.deepEqual(finishJob(S(), []).fields, { hook: '', may: '[]', relay: 'none' }, 'không có câu hẹn vẫn gửi đủ ba trường');
  assert.equal(finishJob(onTool(S(), { name: 'relay_open' }).state, []).fields.relay, 'tool', 'Mây đã gọi relay_open: máy chủ ghi log relay_open: yes');
  assert.equal(JSON.parse(finishJob(S(), Array(130).fill('x')).fields.may).length, 120, 'tối đa 120 câu');
});

test('allow chống bịa của cuộc gọi Live: chuyện kể ngay trong cuộc gọi luôn được, lời nhắn khi có lời nhắn chờ, ảnh khi DATA có hay ảnh đã tới', () => {
  assert.deepEqual(remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 0 }), { prevCall: false, ownStory: true, photos: false, message: false });
  assert.deepEqual(remindAllow({ prevCall: true, photos: true }, { relays: 2, photos: 0 }), { prevCall: true, ownStory: true, photos: true, message: true });
  assert.equal(remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 3 }).photos, true, 'ảnh tới trong cuộc gọi thì được nhắc ảnh');
  const msg = 'Bố nhắn cho mẹ là bố nhớ mẹ lắm';
  assert.equal(remindFor(S(), msg, remindAllow({ prevCall: false, photos: false }, { relays: 1, photos: 0 }), 'vi').cue, null, 'có lời nhắn chờ: chuyển lời nhắn không bị nhắc');
  assert.equal(remindFor(S(), msg, remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 0 }), 'vi').cue, CUE.remind, 'không có lời nhắn nào: nhắc');
  const photo = 'Ảnh mẹ vừa gửi đẹp quá';
  assert.equal(remindFor(S(), photo, remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 2 }), 'vi').cue, null, 'ảnh đã tới: không nhắc');
  assert.equal(remindFor(S(), photo, remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 0 }), 'vi').cue, CUE.remind, 'chưa có ảnh: nhắc');
  assert.equal(remindFor(S(), 'Như mẹ vừa kể, hồi đó vui ghê', remindAllow({ prevCall: false, photos: false }, { relays: 0, photos: 0 }), 'vi').cue, null,
    'nhắc lại điều vừa kể trong cuộc gọi: không nhắc');
});

test('nhắc im lặng: Mây nói xong, máy phát im, không nghe gì đủ 12 giây; một lần tới khi người kể nói lại', () => {
  const p = { mayDone: true, talking: false, quietMs: SILENT_MS, nudged: false };
  assert.equal(SILENT_MS, 12_000);
  assert.equal(silentDue(p), true, 'đủ 12 giây im: nhắc');
  assert.equal(silentDue({ ...p, quietMs: SILENT_MS - 1 }), false, 'chưa đủ 12 giây');
  assert.equal(silentDue({ ...p, mayDone: false }), false, 'Mây chưa nói xong lượt: không nhắc');
  assert.equal(silentDue({ ...p, talking: true }), false, 'máy còn phát giọng Mây: không nhắc');
  assert.equal(silentDue({ ...p, nudged: true }), false, 'đã nhắc rồi: không nhắc lần hai');
});

test('cúp sau lời chào: chờ lượt tạm biệt có tiếng xong và giọng phát hết; Mây không nói gì sau end_call thì 8 giây là cúp', () => {
  const asked = { step: 'asked' as AskStep, quietMs: 0, sinceEnd: 2000, sinceDone: 500 };
  assert.equal(byeDue(asked), false, 'lượt tạm biệt xong nhưng giọng còn phát: chờ');
  assert.equal(byeDue({ ...asked, quietMs: 299 }), false, 'im chưa đủ 300 ms');
  assert.equal(byeDue({ ...asked, quietMs: 300 }), true, 'im 300 ms: cúp');
  assert.equal(byeDue({ ...asked, sinceDone: 8000 }), true, 'giọng phát mãi không hết: tối đa 8 giây sau lượt tạm biệt');
  assert.equal(byeDue({ step: 'tool', quietMs: 5000, sinceEnd: 7999, sinceDone: 0 }), false, 'mới gọi end_call, chưa có tiếng: máy im cũng chưa cúp (lời chào chưa tới)');
  assert.equal(byeDue({ step: 'tool', quietMs: 8000, sinceEnd: 8000, sinceDone: 0 }), true, 'end_call xong 8 giây vẫn không có tiếng: cúp');
  assert.equal(byeDue({ step: 'spoke', quietMs: 9000, sinceEnd: 29_999, sinceDone: 0 }), false, 'đang nói lời chào: chờ lượt xong');
  assert.equal(byeDue({ step: 'spoke', quietMs: 0, sinceEnd: 30_000, sinceDone: 0 }), true, 'lượt không bao giờ xong: tối đa 30 giây');
  let s: AskStep = 'tool';
  s = askStep(s, 'done');
  assert.equal(byeDue({ step: s, quietMs: 1000, sinceEnd: 1000, sinceDone: 0 }), false, 'lượt chỉ có lời gọi công cụ xong trước khi Mây nói: chưa cúp');
  s = askStep(askStep(s, 'audio'), 'done');
  assert.equal(byeDue({ step: s, quietMs: 300, sinceEnd: 3000, sinceDone: 100 }), true, 'nói lời chào xong, giọng hết: cúp');
});

test('bắt đầu ghi lượt người kể chỉ khi lượt của Mây đã xong hay bị chạm cắt: mic mở giữa lượt không làm mất lượt đang chờ gửi', () => {
  const p = { gate: true, spoke: true, mayDone: true, hush: false, recording: false };
  assert.equal(recDue(p), true, 'mic mở, Mây nói xong: ghi');
  assert.equal(recDue({ ...p, gate: false }), false, 'mic còn chặn (Mây đang nói hay vừa im)');
  assert.equal(recDue({ ...p, spoke: false }), false, 'chưa chào: chưa ghi');
  assert.equal(recDue({ ...p, recording: true }), false, 'đang ghi rồi');
  assert.equal(recDue({ ...p, mayDone: false }), false, 'mic mở giữa lượt của Mây: chưa ghi');
  assert.equal(recDue({ ...p, mayDone: false, hush: true }), true, 'chạm linh vật cắt lời: ghi ngay cho người kể nói');
  // Lượt 1 đã khép (tiếng đầu của Mây), Mây nói "Hay quá ạ", chờ lời đáp story_close và story_open, tiếng hết và mic mở lại, rồi câu mở chuyện sau.
  let c: Capture = CAPTURE_START, a: CaptureAction[] = [], turns: CaptureAction[] = [], mayDone = true;
  const step = (e: CaptureEvent) => {
    if (e.type === 'audio') mayDone = false;
    if (e.type === 'done') mayDone = true;
    ({ capture: c, actions: a } = captureNext(c, e));
    turns.push(...a.filter((x) => x.kind === 'turn'));
  };
  const gateOpens = () => { if (recDue({ gate: true, spoke: true, mayDone, hush: false, recording: c.recording })) step({ type: 'gate' }); };
  gateOpens();
  step({ type: 'loud' });
  step({ type: 'in', text: 'Hồi đó mẹ nấu canh chua cho cả nhà' });
  step({ type: 'audio' });
  step({ type: 'out', text: 'Hay quá ạ.' });
  gateOpens();
  step({ type: 'audio' });
  step({ type: 'out', text: ' Mẹ kể con nghe về bà ngoại nhé?' });
  step({ type: 'done' });
  assert.deepEqual(turns, [{ kind: 'turn', key: 1, question: '', transcript: 'Hồi đó mẹ nấu canh chua cho cả nhà' }], 'lượt 1 vẫn được gửi');
  gateOpens();
  assert.equal(c.key, 2, 'lượt sau bắt đầu ghi khi Mây nói xong');
  assert.equal(c.question, 'Hay quá ạ. Mẹ kể con nghe về bà ngoại nhé?');
  // Không chờ lượt của Mây xong thì lượt chờ gửi bị lượt mở giữa chừng đè mất (lý do của điều kiện mayDone).
  c = CAPTURE_START; turns = [];
  step({ type: 'gate' }); step({ type: 'loud' }); step({ type: 'audio' }); step({ type: 'gate' }); step({ type: 'audio' }); step({ type: 'done' });
  assert.deepEqual(turns, [], 'ghi giữa lượt thì lượt có tiếng biến mất');
});

test('nhắc đồng hồ đợi hai giây không ai nói; còn dưới một phút mà chưa có lúc ấy thì nhắc ngay khi Mây nói xong', () => {
  const p = { maxSec: 540, elapsedSec: 420, mayDone: true, talking: false, quietMs: 2000 };
  assert.equal(clockCue(p), true, 'còn 120 giây, Mây xong, hai giây im: nhắc');
  assert.equal(clockCue({ ...p, quietMs: 600 }), false, 'Mây vừa im (người kể chưa kịp đáp): chưa nhắc');
  assert.equal(clockCue({ ...p, elapsedSec: 419 }), false, 'chưa tới lúc');
  assert.equal(clockCue({ ...p, mayDone: false }), false, 'Mây đang đáp: không chen');
  assert.equal(clockCue({ ...p, talking: true }), false, 'giọng Mây còn phát: không chen');
  assert.equal(clockCue({ ...p, elapsedSec: 480, quietMs: 0 }), true, 'còn 60 giây: Mây xong là nhắc, không chờ im');
  assert.equal(clockCue({ ...p, elapsedSec: 480, quietMs: 0, talking: true }), false, 'còn 60 giây nhưng Mây đang nói: chờ');
  assert.equal(clockCue({ ...p, maxSec: 150, elapsedSec: 100, quietMs: 5000 }), false, 'cuộc gọi 150 giây: không nhắc (R12)');
});

test('máy bỏ trên bàn: nhắc im lặng xong một phút vẫn không nghe gì thì nhắc Mây chào; nhắc chào 15 giây mà chưa vào bước chào thì cúp', () => {
  assert.equal(idleDue({ now: 100_000, nudgedAt: 0, byeAt: 0 }), null, 'chưa nhắc im lặng: không làm gì');
  assert.equal(idleDue({ now: 59_999, nudgedAt: 1, byeAt: 0 }), null, 'chưa đủ một phút sau nhắc im lặng');
  assert.equal(idleDue({ now: 60_001, nudgedAt: 1, byeAt: 0 }), 'bye', 'đủ một phút: nhắc Mây chào');
  assert.equal(idleDue({ now: 74_999, nudgedAt: 1, byeAt: 60_000 }), null, 'đã nhắc chào: chờ Mây chào');
  assert.equal(idleDue({ now: 75_000, nudgedAt: 1, byeAt: 60_000 }), 'hang', 'nhắc chào 15 giây vẫn chưa cúp: cúp');
  assert.match(CUE.idle, /end_call/, 'lời nhắc bảo gọi end_call');
});

test('Google sắp đóng kết nối (goAway): cúp cứng trước timeLeft một chút; không đọc được timeLeft thì 15 giây', () => {
  assert.equal(awayMs('12.5s'), 11_000);
  assert.equal(awayMs('60s'), 58_500);
  assert.equal(awayMs(30), 28_500, 'số giây');
  assert.equal(awayMs('1s'), 0, 'gần hết rồi: cúp ngay');
  assert.equal(awayMs(undefined), 15_000);
  assert.equal(awayMs('abc'), 15_000);
  assert.match(CUE.away, /end_call/, 'lời nhắc bảo gọi end_call với câu hẹn');
});

test('lời chép tới muộn của lời nhắn khó nói không lọt vào lượt ô 0 ngay sau (lượt ấy vào sổ nhớ): lượt bị gác bỏ lời chép trước tiếng to đầu tiên', () => {
  let s = onTool(S(), { name: 'relay_open' }).state;
  let c: Capture = CAPTURE_START, a: CaptureAction[] = [];
  const turns: Array<{ idx: string; transcript: string }> = [];
  const step = (e: CaptureEvent) => {
    ({ capture: c, actions: a } = captureNext(c, e));
    for (const x of a) {
      if (x.kind === 'startRec') {
        s = onRec(s, x.key);
        // Như CallLive.tsx: lượt ngay sau lượt ở ô lời nhắn bị gác.
        if (s.rec[x.key].blank) c = captureNext(c, { type: 'guard' }).capture;
      }
      if (x.kind === 'turn') {
        const r = onTurn(s, { key: x.key, question: x.question, transcript: x.transcript, seconds: 3 });
        s = r.state;
        if (r.job) turns.push({ idx: r.job.fields.idx, transcript: r.job.fields.transcript });
      }
    }
  };
  step({ type: 'gate' });
  step({ type: 'loud' });
  step({ type: 'in', text: 'Mẹ thương bố' });
  step({ type: 'audio' });
  s = onTool(s, { name: 'story_close' }).state;   // lời gọi công cụ kế tiếp khép ô lời nhắn
  step({ type: 'out', text: 'Dạ con nhớ rồi ạ.' });
  step({ type: 'done' });
  step({ type: 'gate' });
  step({ type: 'in', text: ' nhiều lắm' });       // đuôi lời nhắn, chép muộn, tới khi lượt mới đã bắt đầu
  step({ type: 'loud' });
  step({ type: 'in', text: 'Dạ' });
  step({ type: 'audio' });
  step({ type: 'done' });
  assert.deepEqual(turns, [{ idx: '1', transcript: 'Mẹ thương bố' }, { idx: '0', transcript: 'Dạ' }], 'đuôi lời nhắn không vào lượt ô 0');
  // Lượt thường không bị gác: lời chép tới trước tiếng to vẫn giữ (người nói nhỏ).
  c = CAPTURE_START;
  ({ capture: c } = captureNext(c, { type: 'gate' }));
  ({ capture: c } = captureNext(c, { type: 'in', text: 'Con nói nhỏ' }));
  ({ capture: c } = captureNext(c, { type: 'audio' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'done' }));
  assert.deepEqual(a, [{ kind: 'turn', key: 1, question: '', transcript: 'Con nói nhỏ' }]);
  // Gác chỉ cho lượt đang ghi: lượt mới bỏ gác.
  ({ capture: c } = captureNext(captureNext(captureNext(CAPTURE_START, { type: 'gate' }).capture, { type: 'guard' }).capture, { type: 'audio' }));
  ({ capture: c } = captureNext(c, { type: 'done' }));
  ({ capture: c } = captureNext(c, { type: 'gate' }));
  ({ capture: c } = captureNext(c, { type: 'in', text: 'Lượt mới' }));
  assert.equal(c.heard, 'Lượt mới', 'lượt sau lượt bị gác không bị gác');
});

test('gác lượt mới: lượt ngay sau lời nhắn khó nói và lượt đầu sau khi chọn ảnh bị gác, lượt thường thì không', () => {
  assert.equal(guarded(undefined), false);
  assert.equal(guarded({ idx: 0, theme: null, opener: '', blank: true }), true, 'lượt ngay sau lời nhắn khó nói: gác');
  assert.equal(guarded({ idx: 2, theme: 'mon-an', opener: 'x', blank: false }), false);
  assert.equal(guarded({ idx: 2, theme: 'mon-an', opener: 'x', blank: false }, true), true, 'lượt đầu sau khi chọn ảnh: gác');
});

/** Đường nối đúng thứ tự CallLive.tsx (tiếng Mây, lượt xong, mic mở, cúp máy), chỉ bằng hàm thuần: tiếng nào được phát, việc nào vào hàng chờ. */
function wire() {
  const w = { s: TOLD(), c: CAPTURE_START, mayDone: true, played: [] as string[], jobs: [] as Job[] };
  const feed = (e: CaptureEvent) => {
    const r = captureNext(w.c, e);
    w.c = r.capture;
    for (const a of r.actions) {
      if (a.kind === 'startRec') {
        w.s = onRec(w.s, a.key);
        if (guarded(w.s.rec[a.key])) w.c = captureNext(w.c, { type: 'guard' }).capture;
      }
      if (a.kind !== 'turn') continue;
      const t = onTurn(w.s, { key: a.key, question: a.question, transcript: a.transcript, seconds: 2 });
      w.s = t.state;
      if (t.job) w.jobs.push(t.job);
    }
  };
  return {
    w, feed,
    user: (text: string) => { feed({ type: 'loud' }); feed({ type: 'in', text }); },
    may: (text: string) => { w.mayDone = false; feed({ type: 'audio' }); w.played.push(text); feed({ type: 'out', text }); },
    done: () => { w.mayDone = true; feed({ type: 'done' }); feed({ type: 'gate' }); },
    /** Cúp máy (end() của CallLive): lượt đang ghi khép, rồi /finish. */
    end: () => { feed({ type: 'hangup' }); w.jobs.push(finishJob(w.s, [])); },
  };
}

const urls = (jobs: Job[]) => jobs.map((j) => (j.url.includes('/answer') ? `answer:${j.fields.idx}:${j.fields.transcript}` : j.url));

test('không còn bước xin phép: câu "Dạ được" sau câu hỏi cuối là lượt kể thường, cúp máy chỉ gửi /finish (chuyện mặc định chia sẻ)', () => {
  const x = wire();
  x.feed({ type: 'gate' });
  x.user('Chuyện cuối');
  x.may('Mẹ còn muốn kể gì nữa không ạ?');
  x.done();
  x.user('Dạ được');
  x.may('Dạ con cảm ơn mẹ');
  x.done();
  assert.deepEqual(x.w.played, ['Mẹ còn muốn kể gì nữa không ạ?', 'Dạ con cảm ơn mẹ'], 'tiếng Mây không bị giữ');
  x.end();
  assert.deepEqual(urls(x.w.jobs), ['answer:2:Chuyện cuối', 'answer:2:Dạ được', '/api/call/c1/finish'], 'không /share, không /keep');
});

test('báo model sau bước xin ảnh: ô ảnh còn hiện thì luôn báo; đã ẩn thì chỉ báo khi có ảnh; đang chào hay đang giữ tiếng thì không', () => {
  assert.equal(photoCue({ n: 3, on: true, quiet: false }), '(3 photos arrived.)');
  assert.equal(photoCue({ n: 0, on: true, quiet: false }), '(No photos for now.)', 'Để sau, huỷ khung chọn');
  assert.equal(photoCue({ n: 2, on: false, quiet: false }), '(2 photos arrived.)', 'chọn muộn sau khi ô ảnh đã ẩn: ảnh thật vẫn báo');
  assert.equal(photoCue({ n: 0, on: false, quiet: false }), null, 'huỷ sau khi ô đã ẩn: Mây đã đi tiếp, không báo');
  assert.equal(photoCue({ n: 2, on: true, quiet: true }), null, 'đang chào hay đang giữ tiếng: không báo');
});

/** Cuộc gọi thường (không phải lần đầu) của nhà ba người: lời dặn có bước lời nhắn khó nói (bước 5). */
const NORMAL = () => liveStart({ id: 'c1', family: 3, themes: ['tuoi-tho', 'mon-an'], relays: [], trial: false });
const RELAY_FIRST = 'Call relay_open first, then ask if they have a message for someone in the family.';

test('lời nhắn khó nói: Mây chào khi chưa gọi relay_open thì được bảo gọi relay_open trước, một lần', () => {
  const told = onTurn(onTool(NORMAL(), OPEN).state, { question: 'Mẹ kể con nghe về món canh chua nhé', transcript: 'Hồi đó mẹ nấu canh chua', seconds: 8 }).state;
  const e = onTool(told, { name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp' } });
  assert.equal(e.result, RELAY_FIRST, 'end_call trước relay_open: bảo gọi relay_open trước');
  assert.deepEqual(e.effects, [], 'chưa cúp');
  assert.equal(e.state.ended, false);
  assert.equal(e.state.hook, '', 'câu hẹn chưa giữ');
  assert.deepEqual(onTool(e.state, { name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp' } }).effects, [{ kind: 'end' }], 'end_call lần hai thì chào');
  // Đã gọi relay_open thì không bị bảo nữa.
  const opened = onTool(onTool(told, { name: 'relay_open' }).state, { name: 'end_call', args: {} });
  assert.deepEqual(opened.effects, [{ kind: 'end' }], 'đã gọi relay_open: chào ngay');
  // Như điều kiện của lời dặn: nhà một người, cuộc gọi đầu (bỏ bước 5), hay app đã bảo Mây chào (máy bỏ trên bàn, Google sắp đóng kết nối) thì không bảo.
  assert.deepEqual(onTool(liveStart({ id: 'c1', family: 1, themes: [], relays: [], trial: false }), { name: 'end_call', args: {} }).effects, [{ kind: 'end' }], 'nhà một người');
  assert.deepEqual(onTool(liveStart({ id: 'c1', family: 3, themes: [], relays: [], trial: true }), { name: 'end_call', args: {} }).effects, [{ kind: 'end' }], 'cuộc gọi đầu');
  assert.deepEqual(onTool(NORMAL(), { name: 'end_call', args: {} }, { wrap: true }).effects, [{ kind: 'end' }], 'app đã bảo chào: không bắt đầu gì mới');
  assert.deepEqual(onTool(S(), { name: 'end_call', args: {} }).effects, [{ kind: 'end' }], 'không biết có phải cuộc gọi đầu không: không bảo');
});

test('lời nhắn khó nói: Mây hỏi mà quên relay_open lúc không có chuyện đang mở thì câu hỏi của Mây (khó nói, hard to say, 말하기 어려운) đưa lượt sau vào ô 1', () => {
  // Sau story_close (ô 0, sổ nhớ đọc): câu hỏi lời nhắn không kèm relay_open.
  const closed = onTool(onTool(NORMAL(), OPEN).state, { name: 'story_close' }).state;
  const s = relayLine(closed, 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?');
  assert.equal(s.idx, 1, 'lượt sau vào ô 1');
  assert.equal(s.relay, 'line', 'coi như đã gọi relay_open (log ghi là đoán từ câu Mây)');
  const t = onTurn(onRec(s, 5), { key: 5, question: 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?', transcript: 'SECRET mẹ thương bố', seconds: 4 });
  assert.equal(t.job?.fields.idx, '1', 'lời nhắn vào ô 1, không vào ô 0');
  // Đã coi như mở bước lời nhắn: end_call không bị bảo gọi relay_open nữa; công cụ kế tiếp khép ô 1 như thường.
  const a = onTool(t.state, { name: 'end_call', args: {} });
  assert.deepEqual(a.effects, [{ kind: 'end' }]);
  assert.equal(a.state.idx, 0, 'công cụ kế tiếp khép ô 1');
  // Gemini bỏ dấu hỏi: đuôi câu "không", "không ạ" vẫn là câu hỏi.
  for (const q of ['Mẹ có điều gì khó nói muốn nhắn ai không', 'Mẹ có điều gì khó nói muốn con nhắn giúp không ạ.', 'Mẹ có gì khó nói cần con chuyển lời không ạ']) {
    assert.equal(relayLine(closed, q).idx, 1, q);
  }
  // Trước story_open đầu tiên, tiếng Anh và tiếng Hàn (có dấu hỏi, có chữ chuyển lời).
  assert.equal(relayLine(NORMAL(), 'Is there anything hard to say that you would like me to pass on?').idx, 1);
  assert.equal(relayLine(NORMAL(), 'Is there something hard to say you want me to tell someone?').idx, 1);
  assert.equal(relayLine(NORMAL(), '가족에게 하기 어려운 말이 있으면 제가 전해 드릴까요?').idx, 1);
  assert.equal(relayLine(NORMAL(), '가족 중 누구에게 말하기 어려운 얘기를 전달해 드릴까요?').idx, 1);
  // "nhé", "nha" là lời nhẹ của một lời khuyên, không phải câu hỏi; câu không có chữ chuyển lời không phải câu hỏi lời nhắn.
  for (const q of ['Nếu khó nói thì mẹ cứ từ từ nhé', 'Chuyện đó chắc khó nói lắm, mẹ không cần kể đâu nhé.', 'Khó nói thì mình để lúc khác nha',
    'Có gì khó nói thì mẹ bảo con nhắn giúp nhé', 'Chuyện đó khó nói lắm phải không ạ?', '가족에게 하기 어려운 말이 있으세요?', 'Was that hard to say?']) {
    assert.equal(relayLine(closed, q), closed, q);
  }
  // Đã chào (end_call), hay lời dặn không có bước lời nhắn (cuộc gọi đầu, không biết): không đoán.
  const ended = { ...closed, ended: true };
  assert.equal(relayLine(ended, 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?'), ended, 'đã chào: giữ nguyên');
  assert.equal(relayLine(ended, 'Lần sau có gì khó nói thì mẹ cứ nói con nghe nhé'), ended, 'lời chào: giữ nguyên');
  assert.equal(relayLine(closed, 'Lần sau có gì khó nói thì mẹ cứ nói con nghe nhé'), closed, 'câu kiểu lời chào: giữ nguyên');
  const trial = liveStart({ id: 'c1', family: 3, themes: [], relays: [], trial: true });
  assert.equal(relayLine(trial, 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?'), trial, 'cuộc gọi đầu: giữ nguyên');
  assert.equal(relayLine(S(), 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?').idx, 0, 'không biết có phải cuộc gọi đầu: giữ nguyên');
  // Không đổi gì: Mây an ủi giữa chuyện, hay cả câu hỏi lúc chuyện đang mở (đoán nhầm thì lượt kể thành lời nhắn gửi đi).
  const story = onTool(NORMAL(), OPEN).state;
  assert.equal(relayLine(story, 'nếu khó nói thì mẹ cứ từ từ'), story, 'an ủi giữa chuyện: giữ nguyên ô chuyện');
  assert.equal(relayLine(story, 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?'), story, 'chuyện đang mở: không đoán');
  assert.equal(relayLine(closed, 'Chuyện đó chắc khó nói lắm'), closed, 'không phải câu hỏi: giữ nguyên');
  assert.equal(relayLine(closed, 'Hôm nay mẹ thế nào ạ?'), closed, 'câu hỏi thường: giữ nguyên');
  const after = onTool(onTool(NORMAL(), { name: 'relay_open' }).state, { name: 'xyz' }).state;
  assert.equal(relayLine(after, 'Mẹ còn điều gì khó nói nữa không ạ?'), after, 'đã gọi relay_open (ô 1 đã khép): không đoán nữa');
  const one = onTool(NORMAL(), { name: 'relay_open' }).state;
  assert.equal(relayLine(one, 'Chuyện khó nói thế mà mẹ kể con nghe không?'), one, 'đang ở ô 1: giữ nguyên');
  const lone = liveStart({ id: 'c1', family: 1, themes: [], relays: [], trial: false });
  assert.equal(relayLine(lone, 'Mẹ có điều gì khó nói muốn con nhắn giúp không ạ?'), lone, 'nhà một người: không có bước lời nhắn');
});

test('lời nhắn khó nói qua captureNext: Mây khép chuyện rồi hỏi không kèm relay_open, lượt sau vẫn vào ô 1; chạm linh vật cắt câu hỏi rồi nói ngay cũng vậy', () => {
  let s: LiveState = onTool(NORMAL(), OPEN).state;
  let c: Capture = CAPTURE_START;
  const jobs: Job[] = [];
  const feed = (e: CaptureEvent) => {
    const r = captureNext(c, e);
    c = r.capture;
    for (const a of r.actions) {
      if (a.kind === 'startRec') s = onRec(s, a.key);
      if (a.kind === 'mayLine') s = relayLine(s, a.text, c.recording ? c.key : undefined);
      if (a.kind === 'turn') {
        const t = onTurn(s, { key: a.key, question: a.question, transcript: a.transcript, seconds: 3 });
        s = t.state;
        if (t.job) jobs.push(t.job);
      }
    }
  };
  feed({ type: 'out', text: 'Mẹ kể con nghe về món canh chua nhé' }); feed({ type: 'audio' }); feed({ type: 'done' }); feed({ type: 'gate' });
  feed({ type: 'loud' }); feed({ type: 'in', text: 'A1' });
  s = onTool(s, { name: 'story_close' }).state;          // story_close ngay trước câu hỏi lời nhắn
  feed({ type: 'out', text: 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?' }); feed({ type: 'audio' }); feed({ type: 'done' }); feed({ type: 'gate' });
  feed({ type: 'loud' }); feed({ type: 'in', text: 'SECRET mẹ thương bố' });
  feed({ type: 'out', text: 'Dạ con nhớ rồi ạ' }); feed({ type: 'audio' }); feed({ type: 'done' });
  const ans = jobs.map((j) => `${j.fields.idx}:${j.fields.transcript}`);
  assert.deepEqual(ans, ['2:A1', '1:SECRET mẹ thương bố'], 'lượt kể ở ô chuyện, lời nhắn ở ô 1');

  // Chạm linh vật cắt câu hỏi (hush): lượt trả lời đã bắt đầu ghi trước khi lượt của Mây xong, vẫn vào ô 1, lượt sau đó không gửi câu hỏi.
  s = onTool(NORMAL(), OPEN).state;
  c = CAPTURE_START;
  jobs.length = 0;
  feed({ type: 'out', text: 'Mẹ kể con nghe về món canh chua nhé' }); feed({ type: 'audio' }); feed({ type: 'done' }); feed({ type: 'gate' });
  feed({ type: 'loud' }); feed({ type: 'in', text: 'A1' });
  s = onTool(s, { name: 'story_close' }).state;
  feed({ type: 'out', text: 'Có điều gì khó nói mẹ muốn con nhắn giúp không ạ?' }); feed({ type: 'audio' });
  feed({ type: 'gate' }); feed({ type: 'loud' });        // chạm linh vật: mic mở, lượt mới ghi trước khi lượt của Mây xong
  feed({ type: 'done' });                                 // Gemini nghe người kể nói (interrupted): câu Mây (có chữ khó nói) tới lúc lượt trả lời đang ghi
  feed({ type: 'in', text: 'SECRET mẹ thương bố' });
  feed({ type: 'out', text: 'Dạ' }); feed({ type: 'audio' }); feed({ type: 'done' });
  assert.deepEqual(jobs.map((j) => `${j.fields.idx}:${j.fields.transcript}`), ['2:A1', '1:SECRET mẹ thương bố'], 'lượt đang ghi lúc ấy cũng vào ô 1');
  assert.equal(s.lastRec, 1, 'lượt kế đó là lượt ngay sau ô lời nhắn (không gửi câu hỏi)');
});

test('một chuyện mỗi cuộc gọi: chuyện đã có từ hai lượt kể thì story_open lần nữa bị từ chối, không có việc gì; dưới hai lượt (người nghe không muốn kể chuyện ấy) thì vẫn mở', () => {
  const ONE_STORY = 'One story per call: stay with this story, then go on to the side questions.';
  const second = { name: 'story_open', args: { theme: 'tuoi-tho', opener: 'Mẹ ơi, hồi bé mẹ thích chơi trò gì nhất ạ?' } };
  let s = onTool(NORMAL(), OPEN).state;
  s = onTurn(s, { question: 'Mẹ ơi, mẹ có nhớ món Cún thích ăn nhất không ạ?', transcript: 'Thịt ba chỉ rang cháy cạnh', seconds: 6 }).state;
  // Một lượt kể: vẫn coi như người nghe chưa vào chuyện, mở chuyện khác được.
  const early = onTool(s, second);
  assert.equal(early.result, 'Story opened.', 'một lượt kể: vẫn mở chuyện khác');
  assert.equal(early.state.idx, LIVE_FIRST_STORY + 1);
  assert.deepEqual(early.effects.map((e) => e.kind), ['job'], 'lưu ô chuyện mới');
  s = onTurn(s, { question: 'Có bữa nào Cún ăn món đó mà mẹ nhớ mãi không ạ?', transcript: 'Có lần Cún ăn hết cả nồi', seconds: 12 }).state;
  // Hai lượt kể, chuyện còn mở hay đã khép: không mở chuyện thứ hai, trạng thái giữ nguyên.
  for (const st of [s, onTool(s, { name: 'story_close' }).state]) {
    const r = onTool(st, second);
    assert.equal(r.result, ONE_STORY);
    assert.deepEqual(r.effects, [], 'không lưu ô chuyện mới');
    assert.deepEqual(r.state, st, 'ô, chuyện, ô ảnh giữ nguyên');
  }
  // Người nghe không muốn kể chuyện đầu (chưa nói lượt nào hay chỉ một lượt từ chối): chuyện sau mở được, rồi chuyện ấy cũng chỉ một.
  const declined = onTurn(onTool(NORMAL(), OPEN).state, { question: 'Mẹ ơi, mẹ có nhớ món Cún thích ăn nhất không ạ?', transcript: 'Thôi mẹ không muốn kể chuyện đó', seconds: 3 }).state;
  let t = onTool(declined, second);
  assert.equal(t.result, 'Story opened.');
  assert.equal(t.state.lastStory, LIVE_FIRST_STORY + 1, 'ảnh theo chuyện mới');
  for (const a of ['Hồi bé mẹ hay chơi ô ăn quan', 'Chơi với cái Hoa nhà bên']) t = { ...t, state: onTurn(t.state, { question: 'Q', transcript: a, seconds: 5 }).state };
  assert.equal(onTool(t.state, OPEN).result, ONE_STORY, 'chuyện thứ hai đã có hai lượt: không mở thêm');
  // Người kể tự xin đổi chuyện giữa chừng thì mới mở chuyện khác.
  assert.equal(onTool(t.state, OPEN, { heard: 'thôi mẹ kể chuyện khác nhé' }).result, 'Story opened.');
  assert.equal(onTool(t.state, OPEN, { heard: 'mẹ không muốn kể chuyện này nữa' }).result, 'Story opened.');
  assert.equal(onTool(t.state, OPEN, { heard: 'ngon lắm con ạ' }).result, ONE_STORY);
});

test('lời nhắn gửi người trong nhà: Mây quên relay_open mà hỏi "có lời gì gửi ... không" lúc không có chuyện đang mở thì lượt sau vào ô 1; câu an ủi giữa chuyện thì không', () => {
  const told = onTurn(onTool(NORMAL(), OPEN).state, { question: 'Mẹ ơi, mẹ có nhớ món Cún thích ăn nhất không ạ?', transcript: 'Thịt ba chỉ rang cháy cạnh', seconds: 6 }).state;
  const closed = onTool(told, { name: 'story_close' }).state;
  const s = relayLine(closed, 'Mẹ có lời gì muốn gửi Cún không ạ?');
  assert.equal(s.idx, 1, 'lượt sau vào ô 1');
  assert.equal(s.relay, 'line', 'log ghi là đoán từ câu Mây');
  const t = onTurn(onRec(s, 7), { key: 7, question: 'Mẹ có lời gì muốn gửi Cún không ạ?', transcript: 'Bảo Cún ăn uống đầy đủ, mẹ thương', seconds: 4 });
  assert.equal(t.job?.fields.idx, '1', 'lời nhắn vào ô 1, không vào ô 0 nơi sổ nhớ đọc');
  // Câu mời của lời dặn (vi, en, ko) và cách nói gần đó; Gemini bỏ dấu hỏi thì đuôi "không", "không ạ" vẫn là câu hỏi.
  for (const q of ['mẹ có lời gì gửi Cún không ạ?', 'Mẹ có lời gì nhắn Cún không', 'Mẹ có lời gì muốn nói với Cún không ạ.', 'Mẹ muốn gửi Cún lời gì không ạ?',
    'Do you have a message for Cún?', 'Is there anything to tell Cún, Mom?', 'Cún님한테 전할 말 있으세요?', 'Cún님한테 하고 싶은 말 있으세요?']) {
    assert.equal(relayLine(closed, q).idx, 1, q);
  }
  // Giữa chuyện (chuyện đang mở): kể cả đúng câu mời cũng không đổi ô, câu an ủi càng không.
  for (const q of ['Mẹ có lời gì muốn gửi Cún không ạ?', 'Lời gì mẹ muốn nói với Cún hôm ấy thì mẹ cứ từ từ kể nhé']) assert.equal(relayLine(told, q), told, q);
  // Không phải câu hỏi, câu hỏi thường, câu hỏi có "lời gì" mà không có chữ gửi: giữ nguyên.
  for (const q of ['Lời gì mẹ muốn gửi Cún thì lúc nào cũng được nhé', 'Mẹ có nhớ Cún không ạ?', 'Hôm ấy Cún nói lời gì với mẹ ạ?', 'What did Cún tell you that day?']) {
    assert.equal(relayLine(closed, q), closed, q);
  }
  // Các cửa cũ vẫn giữ: đã gọi relay_open, đã chào, cuộc gọi đầu.
  const tool = onTool(onTool(closed, { name: 'relay_open' }).state, { name: 'xyz' }).state;
  assert.equal(relayLine(tool, 'Mẹ có lời gì muốn gửi Cún không ạ?'), tool, 'đã gọi relay_open');
  const ended = { ...closed, ended: true };
  assert.equal(relayLine(ended, 'Mẹ có lời gì muốn gửi Cún không ạ?'), ended, 'đã chào');
  const trial = liveStart({ id: 'c1', family: 3, themes: [], relays: [], trial: true });
  assert.equal(relayLine(trial, 'Mẹ có lời gì muốn gửi Cún không ạ?'), trial, 'cuộc gọi đầu');
});
