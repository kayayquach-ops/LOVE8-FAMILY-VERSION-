// Chạy: node --import tsx --test src/callPhoto.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_HEAR_MS, PHOTO_START, PHOTO_WAIT, photoMic, photoNext, photoNo, type PhotoEvent, type PhotoStage, type PhotoState } from './callPhoto.ts';

const run = (events: PhotoEvent[], from: PhotoState = PHOTO_START, lang: 'vi' | 'en' | 'ko' = 'vi') =>
  events.reduce((s, e) => photoNext(s, e, lang), from);
const at = (stage: PhotoStage): PhotoState => ({ stage, end: null });

test('giọng: "để sau", "không có", "thôi" là bỏ qua; "có" hay lời rỗng thì chờ bấm nút', () => {
  for (const s of ['để sau', 'Thôi để sau nhé.', 'không có', 'Dạ không có ạ', 'mình không có ảnh nào', 'thôi', 'thôi khỏi', 'chưa có đâu', 'để lúc khác nha', 'lần sau nhé', 'không']) {
    assert.equal(photoNo(s, 'vi'), true, s);
  }
  for (const s of ['có', 'có chứ', 'có, để mình tìm', 'để mình chọn đã', 'ừ', 'không biết nữa', '', '   ']) assert.equal(photoNo(s, 'vi'), false, s);
  assert.equal(photoNo(null), false);
  for (const s of ['no', 'Maybe later.', 'not right now', "I don't have any", 'nope, next time']) assert.equal(photoNo(s, 'en'), true, s);
  for (const s of ['yes', 'sure, one sec', 'I know one']) assert.equal(photoNo(s, 'en'), false, s);
  for (const s of ['없어요', '나중에 할게요', '괜찮아요', '아니요']) assert.equal(photoNo(s, 'ko'), true, s);
  for (const s of ['네', '있어요']) assert.equal(photoNo(s, 'ko'), false, s);
  // Câu dài là đang kể, không phải từ chối.
  assert.equal(photoNo('ảnh này không có gì đặc biệt nhưng mình thích lắm vì hôm đó cả nhà đi biển', 'vi'), false);
});

test('hỏi xong thì nghe; nói "để sau" là xong, nói "có" hay im lặng thì chờ bấm nút', () => {
  assert.deepEqual(run([{ type: 'asked' }]), at('listen'));
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: 'thôi để sau nhé' }]), { stage: 'done', end: 'no' });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: 'có' }]), at('wait'));
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: '' }]), at('wait'));
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: 'no thanks' }], PHOTO_START, 'en'), { stage: 'done', end: 'no' });
});

test('máy không tự chép được lời: chờ máy chủ chép, quá giờ thì chờ bấm nút', () => {
  const think = run([{ type: 'asked' }, { type: 'heard', text: null }]);
  assert.deepEqual(think, at('think'));
  assert.deepEqual(photoNext(think, { type: 'heard', text: 'không có' }), { stage: 'done', end: 'no' });
  assert.deepEqual(photoNext(think, { type: 'heard', text: '' }), at('wait'));
  assert.deepEqual(photoNext(think, { type: 'heard', text: null }), at('wait'));
  assert.deepEqual(photoNext(think, { type: 'timeout' }), at('wait'));
});

test('nút luôn có tác dụng, ở chặng nào cũng vậy', () => {
  for (const stage of ['ask', 'listen', 'think', 'wait', 'picker'] as PhotoStage[]) {
    assert.deepEqual(photoNext(at(stage), { type: 'later' }), { stage: 'done', end: 'later' }, stage);
    assert.deepEqual(photoNext(at(stage), { type: 'pick' }), at('picker'), stage);
    assert.deepEqual(photoNext(at(stage), { type: 'files', n: 3 }), { stage: 'done', end: 'photos' }, stage);
    assert.deepEqual(photoNext(at(stage), { type: 'hangup' }), { stage: 'done', end: 'hangup' }, stage);
  }
  // Bấm Chọn ảnh lần nữa thì tính giờ lại (đối tượng mới).
  const picker = at('picker');
  assert.notEqual(photoNext(picker, { type: 'pick' }), picker);
});

test('huỷ khung chọn ảnh thì quay lại chờ nút; không chọn gì mãi thì hết giờ và đi tiếp', () => {
  assert.deepEqual(run([{ type: 'pick' }, { type: 'files', n: 0 }]), at('wait'));
  assert.deepEqual(run([{ type: 'pick' }, { type: 'files', n: 0 }, { type: 'timeout' }]), { stage: 'done', end: 'timeout' });
  assert.deepEqual(run([{ type: 'pick' }, { type: 'timeout' }]), { stage: 'done', end: 'timeout' });
  assert.deepEqual(run([{ type: 'asked' }, { type: 'heard', text: '' }, { type: 'timeout' }]), { stage: 'done', end: 'timeout' });
});

test('sự kiện lạc chặng bị bỏ qua (trả đúng đối tượng cũ); xong rồi thì đứng yên', () => {
  const picker = at('picker');
  for (const e of [{ type: 'asked' }, { type: 'heard', text: 'thôi' }, { type: 'heard', text: null }] as PhotoEvent[]) assert.equal(photoNext(picker, e), picker);
  const ask = at('ask');
  assert.equal(photoNext(ask, { type: 'timeout' }), ask);
  assert.equal(photoNext(ask, { type: 'heard', text: 'thôi' }), ask);
  const wait = at('wait');
  assert.equal(photoNext(wait, { type: 'files', n: 0 }), wait);
  const done: PhotoState = { stage: 'done', end: 'later' };
  for (const e of [{ type: 'pick' }, { type: 'files', n: 2 }, { type: 'timeout' }, { type: 'hangup' }] as PhotoEvent[]) assert.equal(photoNext(done, e), done);
});

test('không chặng nào treo: chặng nào cũng có hẹn giờ, trừ lúc Mây hỏi (câu nói luôn tự xong)', () => {
  for (const stage of ['listen', 'think', 'wait', 'picker'] as PhotoStage[]) {
    assert.ok((PHOTO_WAIT[stage] ?? 0) > 0, stage);
    // Hết giờ tối đa hai lần là xong.
    assert.equal(run([{ type: 'timeout' }, { type: 'timeout' }], at(stage)).stage, 'done', stage);
  }
  // Nghe mà máy ghi âm không báo xong: hẹn giờ đưa về chờ nút, không đứng mãi.
  assert.ok(PHOTO_WAIT.listen! > PHOTO_HEAR_MS);
  assert.deepEqual(photoNext(at('listen'), { type: 'timeout' }), at('wait'));
  assert.equal(PHOTO_WAIT.ask, undefined);
  // Hỏi xong rồi nghe: đi hết chuỗi hẹn giờ vẫn ra được.
  assert.deepEqual(run([{ type: 'asked' }, { type: 'timeout' }, { type: 'timeout' }]), { stage: 'done', end: 'timeout' });
});

test('mic: tắt khi chỉ chờ bấm nút, bật khi Mây hỏi và khi nghe', () => {
  assert.equal(photoMic(at('ask')), true);
  assert.equal(photoMic(at('listen')), true);
  for (const stage of ['think', 'wait', 'picker'] as PhotoStage[]) assert.equal(photoMic(at(stage)), false, stage);
  assert.equal(photoMic({ stage: 'done', end: 'photos' }), true);
});
