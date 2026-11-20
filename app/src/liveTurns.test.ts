// Kiểm logic cuộc gọi Mây Live ở máy khách (src/liveTurns.ts). Chạy: node --import tsx --test src/liveTurns.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askStep, CAPTURE_START, captureNext, clockDue, CUE, finishJob, liveStart, onRec, onShareEnd, onTool, onTurn, remindFor,
  type AskStep, type CaptureAction,
} from './liveTurns.ts';
import { SHARE_START, shareNext } from './callShare.ts';

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
  assert.equal(bye.result, 'Say nothing more; the app hangs up.');
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
