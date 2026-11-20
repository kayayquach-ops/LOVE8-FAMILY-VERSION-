// Kiểm logic cuộc gọi Mây Live ở máy khách (src/liveTurns.ts). Chạy: node --import tsx --test src/liveTurns.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askStep, awayMs, byeDue, CAPTURE_START, captureNext, clockCue, clockDue, CUE, finishJob, holdNext, idleDue, liveStart, onRec, onShareEnd, onTool, onTurn, photoCue,
  recDue, remindAllow, remindFor, SILENT_MS, silentDue, type AskStep, type Capture, type CaptureAction, type CaptureEvent, type Hold, type Job, type LiveState,
} from './liveTurns.ts';
import { SHARE_START, shareNext, type ShareEvent } from './callShare.ts';
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

test('xin phép chia sẻ: nhà một người, chưa có chuyện, hỏi lần hai thì bỏ qua; lúc đang hỏi thì lời nói không thành lượt kể', () => {
  const lone = onTool(ONE(), { name: 'ask_share' });
  assert.deepEqual(lone.effects, [], 'nhà một người: không hiện nút');
  assert.equal(lone.result, 'They are the only one in the family: skip this step.');
  const none = onTool(S(), { name: 'ask_share' });
  assert.deepEqual(none.effects, [], 'chưa kể chuyện nào: không hiện nút');
  assert.equal(none.result, 'No story was told: skip this step.');
  const r = onTool(TOLD(), { name: 'ask_share' });
  assert.deepEqual(r.effects, [{ kind: 'share' }], 'đủ điều kiện: hiện hai nút');
  assert.equal(r.state.share, 'asking');
  assert.equal(r.result, 'The two buttons are showing. Ask your one short question now, then say nothing until the app tells you the answer.');
  const again = onTool(r.state, { name: 'ask_share' });
  assert.equal(again.result, 'Already asked: do not ask again.', 'hỏi lần hai: bảo model đừng hỏi');
  assert.deepEqual(again.effects, [], 'hỏi lần hai: không hiện lại nút');
  const t = onTurn(r.state, { question: 'Cả nhà nghe được không ạ?', transcript: 'Dạ được', seconds: 2 });
  assert.equal(t.job, null, 'câu trả lời xin phép không thành lượt kể');
  assert.equal(t.consent, true, 'lượt ấy là câu trả lời xin phép');
  const yes = onShareEnd(r.state, 'yes');
  assert.deepEqual(yes.job, { url: '/api/call/c1/share', fields: {} }, 'đồng ý: gửi /share');
  assert.equal(yes.cue, CUE.shareYes);
  assert.equal(yes.state.share, 'done');
  assert.equal(yes.state.idx, 0, 'xong bước xin phép thì về ô 0');
  const timeout = onShareEnd(r.state, 'timeout');
  assert.deepEqual(timeout.job, { url: '/api/call/c1/keep', fields: {} }, 'hết giờ: giữ riêng');
  assert.equal(timeout.cue, CUE.shareNo);
  const no = onShareEnd(r.state, 'no');
  assert.deepEqual(no.job, { url: '/api/call/c1/keep', fields: {} }, 'không đồng ý: giữ riêng');
  assert.equal(no.cue, CUE.shareNo);
  const hang = onShareEnd(r.state, 'hangup');
  assert.equal(hang.job, null, 'cúp máy: không gửi gì');
  assert.equal(hang.cue, null, 'cúp máy: không nhắn model');
  assert.equal(hang.state.share, 'done');
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
  for (const f of [{ name: 'ask_share' }, { name: 'end_call', args: { next_hook: 'x' } }, { name: 'relay_heard', args: { id: 'r1' } }, { name: 'ask_photo' }, { name: 'xyz' }]) {
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
  assert.equal(closed.result, 'Story closed. Open the next seed or go to the closing steps.');
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
  // Lượt 3 là lời nhắn; Mây gọi ask_share ngay trước câu hỏi chia sẻ (khép ô 1, đang hỏi): lời nhắn vẫn vào ô 1, không bị bỏ.
  s = onRec(onTool(r.state, { name: 'relay_open' }).state, 3);
  s = onTool(s, { name: 'ask_share' }).state;
  assert.equal(s.share, 'asking');
  r = onTurn(s, { key: 3, question: 'Có điều gì khó nói không ạ?', transcript: 'Con nhắn bố là con thương bố', seconds: 5 });
  assert.equal(r.job?.fields.idx, '1', 'lời nhắn vào ô 1, không về ô hỏi thăm');
  assert.equal(r.consent, false, 'lời nhắn không phải câu trả lời xin phép');
  // Lượt 4 bắt đầu sau câu hỏi chia sẻ: đó mới là câu trả lời xin phép.
  r = onTurn(onRec(r.state, 4), { key: 4, question: 'Cả nhà nghe được không ạ?', transcript: 'Dạ được', seconds: 1 });
  assert.equal(r.job, null, 'câu trả lời xin phép không gửi như lượt kể');
  assert.equal(r.consent, true);
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

test('xin phép bằng giọng (R8): tiếng Mây bị giữ vẫn khép lượt nên đọc được lời đồng ý; chỉ tính đã hỏi khi Mây đã cất tiếng sau lời đáp công cụ', () => {
  let ask: AskStep = 'tool';
  ask = askStep(ask, 'done');
  assert.equal(ask, 'tool', 'lượt chỉ có lời gọi công cụ xong: chưa hỏi');
  ask = askStep(ask, 'audio');
  assert.equal(ask, 'spoke');
  ask = askStep(ask, 'done');
  assert.equal(ask, 'asked', 'Mây cất tiếng rồi xong lượt: đã hỏi');
  assert.equal(askStep(ask, 'audio'), 'asked', 'đã hỏi thì giữ nguyên');
  let s = onTool(TOLD(), { name: 'ask_share' }).state;
  let c = CAPTURE_START, a: CaptureAction[];
  ({ capture: c, actions: a } = captureNext(c, { type: 'gate' }));
  s = onRec(s, (a[0] as { key: number }).key);
  ({ capture: c } = captureNext(c, { type: 'in', text: 'Dạ được' }));
  // Mây tự đáp: tiếng ấy không phát, nhưng vẫn báo captureNext để khép lượt.
  ({ capture: c } = captureNext(c, { type: 'audio' }));
  ({ capture: c, actions: a } = captureNext(c, { type: 'done' }));
  const turn = a.find((x) => x.kind === 'turn');
  assert.deepEqual(turn, { kind: 'turn', key: 1, question: '', transcript: 'Dạ được' }, 'lời đồng ý thành một lượt');
  const r = onTurn(s, { key: 1, question: '', transcript: 'Dạ được', seconds: 1.2 });
  assert.equal(r.job, null, 'không gửi như lượt kể');
  assert.equal(r.consent, true, 'đưa cho bước xin phép');
  assert.equal(shareNext(shareNext(SHARE_START, { type: 'asked' }), { type: 'heard', text: 'Dạ được' }).end, 'yes', 'bộ đọc câu trả lời hiểu là đồng ý');
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
  // Nhà chưa kể chuyện nào: relay_open, lời nhắn, rồi Mây nhắc lại lời nhắn và chào luôn (end_call, không có ask_share).
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

test('cả cuộc gọi qua captureNext (13 bước): mọi lượt đúng ô, đúng lượt, chỉ câu trả lời xin phép thành lời đồng ý', () => {
  let s: LiveState = S();
  let c: Capture = CAPTURE_START;
  const jobs: Job[] = [];
  const consents: string[] = [];
  const feed = (e: CaptureEvent) => {
    const r = captureNext(c, e);
    c = r.capture;
    for (const a of r.actions) {
      if (a.kind === 'startRec') s = onRec(s, a.key);
      if (a.kind === 'turn') {
        const t = onTurn(s, { key: a.key, question: a.question, transcript: a.transcript, seconds: 3 });
        s = t.state;
        if (t.job) jobs.push(t.job);
        if (t.consent) consents.push(a.transcript);
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
  may('Hay quá. Mẹ kể con nghe về tuổi thơ nhé', [{ name: 'story_close' }, { name: 'story_open', args: { theme: 'tuoi-tho', opener: 'Mẹ kể con nghe về tuổi thơ nhé' } }]); // 6, 7
  user('B1'); may('QB2'); user('B2');
  may('Hay quá. Bố nhắn mẹ là bố nhớ mẹ', [{ name: 'story_close' }, { name: 'relay_heard', args: { id: 'r1' } }]); // 8 chuyển lời nhắn
  user('Ừ mẹ biết rồi');
  may('Mẹ có điều gì khó nói muốn nhắn không ạ?', [{ name: 'relay_open' }]); // 9
  user('SECRET mẹ thương bố'); // 10 lời nhắn khó nói
  may('Cả nhà nghe chuyện hôm nay được không ạ?', [{ name: 'ask_share' }]); // 11
  user('Dạ được'); // 12 trả lời xin phép, tiếng Mây tự đáp bị giữ nhưng vẫn báo captureNext
  feed({ type: 'audio' }); feed({ type: 'done' });
  const se = onShareEnd(s, 'yes');
  s = se.state;
  if (se.job) jobs.push(se.job);
  feed({ type: 'gate' });
  may('Chào mẹ, tuần sau kể tiếp nhé', [{ name: 'end_call', args: { next_hook: 'Tuần sau kể tiếp' } }]); // 13 chào
  user('Chào con');
  feed({ type: 'hangup' });

  const ans = jobs.filter((j) => j.url.includes('/answer')).map((j) => `${j.fields.idx}:${j.fields.turn}:${j.fields.transcript}`);
  assert.deepEqual(ans, ['0:0:Mẹ khoẻ', '2:0:A1', '2:1:A2', '2:2:A3', '2:3:A4 photo talk', '3:0:B1', '3:1:B2', '0:1:Ừ mẹ biết rồi', '1:0:SECRET mẹ thương bố', '0:2:Chào con'],
    'hỏi thăm ở ô 0, hai chuyện ở ô 2 và 3 đủ cả đoạn cuối, lời nhắn ở ô 1, lời chào ở ô 0');
  assert.deepEqual(consents, ['Dạ được'], 'chỉ câu trả lời xin phép đưa cho bước xin phép');
  assert.deepEqual(jobs.filter((j) => !j.url.includes('/answer')).map((j) => j.url),
    ['/api/call/c1/story', '/api/call/c1/story', '/api/call/c1/relay/r1/heard', '/api/call/c1/share'], 'hai ô chuyện, một lời nhắn đã chuyển, một lời đồng ý');
  assert.equal(s.hook, 'Tuần sau kể tiếp', 'câu hẹn giữ lại cho /finish');
  assert.equal(s.storyTurns, 6, 'sáu lượt kể chuyện');
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
  assert.equal(r.consent, false, 'không coi là lời đồng ý');
  assert.deepEqual(r.state.turns, {}, 'không đếm lượt');
});

test('kết thúc bước xin phép chỉ khi đang hỏi: gọi thừa thì không gửi gì', () => {
  const idle = onShareEnd(S(), 'yes');
  assert.equal(idle.job, null, 'chưa hỏi: không gửi /share');
  assert.equal(idle.cue, null, 'chưa hỏi: không nhắn model');
  assert.equal(idle.state.share, 'none', 'chưa hỏi: bước xin phép không đổi');
  const done = onShareEnd(onTool(TOLD(), { name: 'ask_share' }).state, 'no').state;
  const twice = onShareEnd(done, 'yes');
  assert.equal(twice.job, null, 'đã xong: lần sau không đổi thành đồng ý');
  assert.equal(twice.cue, null);
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
    url: '/api/call/c1/finish', fields: { hook: 'Tuần sau kể tiếp chuyện bà nhé', may: '["Chào mẹ","Mẹ kể tiếp đi ạ"]' }, last: true,
  });
  assert.deepEqual(finishJob(S(), []).fields, { hook: '', may: '[]' }, 'không có câu hẹn vẫn gửi đủ hai trường');
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

test('giữ tiếng Mây lúc xin phép (phán quyết 11): từ lúc đã hỏi tới lúc có câu trả lời; có câu trả lời giữa lượt của Mây thì bỏ nốt lượt ấy', () => {
  assert.equal(holdNext(null, { type: 'asked' }), 'share', 'đã hỏi: giữ');
  assert.equal(holdNext('share', { type: 'done' }), 'share', 'lượt Mây tự đáp xong mà chưa có câu trả lời: vẫn giữ');
  assert.equal(holdNext('share', { type: 'decided', end: 'yes', mayDone: true }), null, 'câu trả lời có lúc lượt Mây đã xong: thôi giữ, câu đáp câu nhắn được phát');
  assert.equal(holdNext('share', { type: 'decided', end: 'no', mayDone: false }), 'tail', 'bấm nút giữa lượt Mây đang tự đáp: bỏ nốt lượt ấy');
  assert.equal(holdNext('share', { type: 'decided', end: 'timeout', mayDone: false }), 'tail', 'hết giờ giữa lượt ấy: cũng bỏ nốt');
  assert.equal(holdNext('tail', { type: 'done' }), null, 'lượt ấy xong hay bị ngắt: thôi giữ');
  assert.equal(holdNext('share', { type: 'decided', end: 'hangup', mayDone: false }), null, 'cúp máy, end_call, goAway lúc đang hỏi: thôi giữ ngay để lời chào được nghe');
  assert.equal(holdNext(null, { type: 'done' }), null, 'không giữ thì lượt xong không đổi gì');
});

/** Đường nối bước xin phép đúng thứ tự CallLive.tsx (lời gọi ask_share, tiếng Mây, lượt xong, nút), chỉ bằng hàm thuần: tiếng nào được phát,
 *  việc nào vào hàng chờ, câu nhắn nào gửi model. */
function shareWire() {
  const w = { s: TOLD(), c: CAPTURE_START, ask: null as AskStep | null, hold: null as Hold, sh: SHARE_START, mayDone: true, played: [] as string[], jobs: [] as Job[], cues: [] as string[] };
  const decide = (e: ShareEvent) => {
    const next = shareNext(w.sh, e);
    if (next === w.sh) return;
    w.sh = next;
    if (e.type === 'asked') w.hold = holdNext(w.hold, { type: 'asked' });
    if (!next.end) return;
    const r = onShareEnd(w.s, next.end);
    w.s = r.state;
    if (r.job) w.jobs.push(r.job);
    if (r.cue) w.cues.push(r.cue);
    w.hold = holdNext(w.hold, { type: 'decided', end: next.end, mayDone: w.mayDone });
  };
  const feed = (e: CaptureEvent) => {
    const r = captureNext(w.c, e);
    w.c = r.capture;
    for (const a of r.actions) {
      if (a.kind === 'startRec') w.s = onRec(w.s, a.key);
      if (a.kind !== 'turn') continue;
      const t = onTurn(w.s, { key: a.key, question: a.question, transcript: a.transcript, seconds: 2 });
      w.s = t.state;
      if (t.job) w.jobs.push(t.job);
      if (t.consent) decide({ type: 'heard', text: a.transcript });
    }
  };
  return {
    w, feed, decide,
    askShare: () => { w.s = onTool(w.s, { name: 'ask_share' }).state; w.ask = 'tool'; w.mayDone = false; },
    user: (text: string) => { feed({ type: 'loud' }); feed({ type: 'in', text }); },
    may: (text: string) => {
      w.mayDone = false;
      feed({ type: 'audio' });
      if (w.ask) w.ask = askStep(w.ask, 'audio');
      if (!w.hold) { w.played.push(text); feed({ type: 'out', text }); }
    },
    done: () => {
      w.mayDone = true;
      if (w.hold === 'share' && w.c.recording) feed({ type: 'audio' });
      w.hold = holdNext(w.hold, { type: 'done' });
      if (w.ask) { w.ask = askStep(w.ask, 'done'); if (w.ask === 'asked') { w.ask = null; decide({ type: 'asked' }); } }
      feed({ type: 'done' });
      feed({ type: 'gate' });
    },
  };
}

test('xin phép qua đường nối: câu hỏi được phát, Mây tự đáp bị giữ mà vẫn khép lượt trả lời (R8), lời đồng ý chỉ từ bộ đọc câu trả lời', () => {
  const x = shareWire();
  x.feed({ type: 'gate' });
  x.user('Chuyện cuối');                          // lượt kể cuối, bắt đầu trước ask_share
  x.askShare();
  x.may('Cả nhà nghe chuyện hôm nay được không ạ?');
  x.done();                                        // đã hỏi: từ đây giữ tiếng Mây
  assert.equal(x.w.hold, 'share');
  assert.equal(x.w.sh.stage, 'listen');
  x.user('Dạ được');
  x.may('Dạ vâng, con cảm ơn mẹ');                 // Mây tự đáp trước khi app quyết: không phát
  x.done();                                        // lượt trả lời khép, bộ đọc hiểu là đồng ý
  x.may('Cảm ơn mẹ nhiều ạ');                      // câu đáp câu nhắn chia sẻ: phát
  assert.deepEqual(x.w.played, ['Cả nhà nghe chuyện hôm nay được không ạ?', 'Cảm ơn mẹ nhiều ạ'], 'câu Mây tự đáp không bao giờ được nghe');
  assert.deepEqual(x.w.cues, [CUE.shareYes]);
  assert.deepEqual(x.w.jobs.map((j) => (j.url.includes('/answer') ? `answer:${j.fields.idx}:${j.fields.transcript}` : j.url)),
    ['answer:2:Chuyện cuối', '/api/call/c1/share'], 'lượt kể cuối vẫn gửi; câu trả lời không thành lượt kể; đồng ý gửi /share');
  assert.equal(x.w.hold, null);

  // Mây im hẳn (lượt không có tiếng): lượt trả lời vẫn khép khi lượt của Mây xong.
  const y = shareWire();
  y.askShare();
  y.may('Cả nhà nghe được không ạ?');
  y.done();
  y.user('Dạ được');
  y.done();
  assert.equal(y.w.sh.end, 'yes');
  assert.deepEqual(y.w.cues, [CUE.shareYes]);

  // Bấm Giữ riêng giữa lượt Mây đang tự đáp: phần còn lại của lượt ấy vẫn bỏ, lời lưỡng lự không thành gì.
  const z = shareWire();
  z.askShare();
  z.may('Cả nhà nghe được không ạ?');
  z.done();
  z.user('Để mẹ nghĩ đã');
  z.may('Dạ, mẹ cứ');
  z.decide({ type: 'no' });
  z.may('từ từ ạ');
  z.done();
  z.may('Dạ, chuyện hôm nay con giữ riêng nhé');
  assert.deepEqual(z.w.played, ['Cả nhà nghe được không ạ?', 'Dạ, chuyện hôm nay con giữ riêng nhé']);
  assert.deepEqual(z.w.cues, [CUE.shareNo]);
  assert.deepEqual(z.w.jobs.map((j) => j.url), ['/api/call/c1/keep'], 'câu trả lời không thành lượt kể; giữ riêng gửi /keep');
  assert.equal(z.w.sh.end, 'no', 'lời tới sau khi đã quyết không lật được');
});

test('báo model sau bước xin ảnh: ô ảnh còn hiện thì luôn báo; đã ẩn thì chỉ báo khi có ảnh; đang chào hay đang giữ tiếng thì không', () => {
  assert.equal(photoCue({ n: 3, on: true, quiet: false }), '(3 photos arrived.)');
  assert.equal(photoCue({ n: 0, on: true, quiet: false }), '(No photos for now.)', 'Để sau, huỷ khung chọn');
  assert.equal(photoCue({ n: 2, on: false, quiet: false }), '(2 photos arrived.)', 'chọn muộn sau khi ô ảnh đã ẩn: ảnh thật vẫn báo');
  assert.equal(photoCue({ n: 0, on: false, quiet: false }), null, 'huỷ sau khi ô đã ẩn: Mây đã đi tiếp, không báo');
  assert.equal(photoCue({ n: 2, on: true, quiet: true }), null, 'đang chào hay đang giữ tiếng: không báo');
});
