// Chạy: node --import tsx --test src/callShare.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_START, shareAnswer, shareMic, shareNext, type ShareEvent } from './callShare.ts';

test('trả lời bằng giọng: đồng ý, giữ riêng, hay chưa rõ (chờ bấm nút)', () => {
  for (const s of ['được', 'Ừ được', 'ok con', 'chia sẻ đi', 'vâng', 'được chứ', 'không sao đâu, chia sẻ đi']) assert.equal(shareAnswer(s, 'vi'), 'yes', s);
  for (const s of ['không', 'thôi', 'đừng', 'để sau', 'thôi giữ riêng nhé', 'không được']) assert.equal(shareAnswer(s, 'vi'), 'no', s);
  for (const s of ['', 'để mẹ nghĩ đã', 'hôm nay trời đẹp quá']) assert.equal(shareAnswer(s, 'vi'), null, s);
  for (const s of ['yes', 'sure', 'okay go ahead', 'yeah']) assert.equal(shareAnswer(s, 'en'), 'yes', s);
  for (const s of ['no', 'not now', "please don't", 'keep it private']) assert.equal(shareAnswer(s, 'en'), 'no', s);
  for (const s of ['네', '좋아요', '그래요', '돼요']) assert.equal(shareAnswer(s, 'ko'), 'yes', s);
  for (const s of ['아니요', '싫어요', '안 돼요', '나중에요']) assert.equal(shareAnswer(s, 'ko'), 'no', s);
});

test('chữ phủ định mà là đồng ý ở tiếng Anh; "네" phải đứng riêng, đuôi câu "좋네요" không tính', () => {
  for (const s of ['no problem', 'why not']) assert.equal(shareAnswer(s, 'en'), 'yes', s);
  for (const s of ['네, 그렇게 해요', '네']) assert.equal(shareAnswer(s, 'ko'), 'yes', s);
  assert.equal(shareAnswer('오늘 날씨 좋네요', 'ko'), null);
  assert.equal(shareAnswer('안돼요', 'ko'), 'no');
});

test('có lời từ chối rõ thì câu "không sao", "no problem" mất tác dụng; "được thôi", "I don\'t mind" là đồng ý', () => {
  for (const s of ['không sao đâu, đừng chia sẻ', 'Không sao, con cứ giữ riêng nhé', 'sao không giữ riêng']) assert.equal(shareAnswer(s, 'vi'), 'no', s);
  // "sao không chia sẻ" chỉ là đồng ý khi đứng đầu câu; "không sao, không chia sẻ" là từ chối.
  for (const s of ['Không sao, không chia sẻ nhé', 'không sao đâu, không chia sẻ']) assert.equal(shareAnswer(s, 'vi'), 'no', s);
  assert.equal(shareAnswer('No problem, keep it private', 'en'), 'no');
  for (const s of ['안 해도 돼요', '안 보내도 돼요']) assert.equal(shareAnswer(s, 'ko'), 'no', s);
  for (const s of ['được thôi', 'thôi được rồi', 'sao không chia sẻ']) assert.equal(shareAnswer(s, 'vi'), 'yes', s);
  for (const s of ["I don't mind", "sure, I don't mind"]) assert.equal(shareAnswer(s, 'en'), 'yes', s);
});

test('đáp kiểu nói thường "có", "dạ", "ừm", "ờ" là đồng ý; có lời từ chối thì vẫn giữ riêng', () => {
  for (const s of ['có', 'Dạ', 'dạ.', 'ừm', 'ờ', 'dạ được', 'có chứ', 'Dạ có', 'ừm được']) assert.equal(shareAnswer(s, 'vi'), 'yes', s);
  for (const s of ['dạ không', 'không ạ', 'có… thôi đừng', 'dạ thôi', 'ờ để sau', 'dạ con giữ riêng', 'có, mà đừng chia sẻ nhé']) assert.equal(shareAnswer(s, 'vi'), 'no', s);
});

test('"dạ", "có", "ừm", "ờ" chỉ là đồng ý khi là cả câu trả lời; hỏi lại, lưỡng lự thì chưa rõ (chờ nút); có lời từ chối rõ thì vẫn giữ riêng', () => {
  for (const s of ['dạ', 'dạ ạ', 'có chứ', 'dạ được', 'ừm được', 'dạ vâng', 'dạ có ạ', 'ờ rồi', 'có có']) assert.equal(shareAnswer(s, 'vi'), 'yes', s);
  const unsure: Array<[string, 'vi' | 'en' | 'ko']> = [
    ['dạ?', 'vi'], ['dạ để con nghĩ đã', 'vi'], ['ừm để mẹ xem đã', 'vi'], ['ừm… mẹ nghĩ đã', 'vi'], ['dạ, để con suy nghĩ', 'vi'], ['ờ để mẹ tính', 'vi'],
    ['có lẽ', 'vi'], ['có lẽ vậy', 'vi'], ['có thể', 'vi'], ['có khi để mai', 'vi'], ['có thể được', 'vi'],
    ['dạ chia sẻ cho ai ạ', 'vi'], ['có ai nghe', 'vi'], ['được không?', 'vi'], ['không sao, để mẹ nghĩ đã', 'vi'], ['yes?', 'en'], ['네?', 'ko'],
  ];
  for (const [s, l] of unsure) assert.equal(shareAnswer(s, l), null, s);
  for (const s of ['đừng chia sẻ nhé?', 'giữ riêng được không?']) assert.equal(shareAnswer(s, 'vi'), 'no', s);
});

test('chặng: hỏi, nghe, đồng ý hay giữ riêng; chưa rõ thì chờ nút; hết giờ chờ nút là giữ riêng; cúp máy là giữ riêng', () => {
  const run = (es: ShareEvent[], from = SHARE_START) => es.reduce((s, e) => shareNext(s, e, 'vi'), from);
  assert.deepEqual(run([{ type: 'asked' }]), { stage: 'listen', end: null });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: 'được' }]), { stage: 'done', end: 'yes' });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: null }, { type: 'heard', text: 'không' }]), { stage: 'done', end: 'no' });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: 'hôm nay trời đẹp quá' }]), { stage: 'wait', end: null });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'timeout' }]), { stage: 'wait', end: null });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'timeout' }, { type: 'timeout' }]), { stage: 'done', end: 'timeout' });
  assert.deepEqual(run([{ type: 'yes' }]), { stage: 'done', end: 'yes' });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'no' }]), { stage: 'done', end: 'no' });
  assert.deepEqual(run([{ type: 'hangup' }]), { stage: 'done', end: 'hangup' });
  const done = run([{ type: 'yes' }]);
  assert.equal(shareNext(done, { type: 'no' }), done);
  assert.equal(shareNext(SHARE_START, { type: 'timeout' }), SHARE_START);
});

test('mic tắt lúc chờ nút và lúc máy chủ chép lời', () => {
  assert.equal(shareMic({ stage: 'wait', end: null }), false);
  assert.equal(shareMic({ stage: 'think', end: null }), false);
  assert.equal(shareMic({ stage: 'listen', end: null }), true);
});
