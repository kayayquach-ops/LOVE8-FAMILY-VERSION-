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

test('chế độ chặt (Mây Live): tiếng đệm đứng một mình chưa rõ, chỉ lời đồng ý rõ ràng mới là đồng ý; mặc định không đổi', () => {
  const S = { strict: true };
  const table: Array<[string, 'vi' | 'en' | 'ko', 'yes' | 'no' | null]> = [
    ['dạ', 'vi', null], ['có ạ', 'vi', null], ['dạ được', 'vi', 'yes'], ['ừ chia sẻ đi', 'vi', 'yes'], ['được rồi để mẹ nghĩ', 'vi', null],
    ['yeah', 'en', null], ['yeah sure', 'en', 'yes'], ['ok wait', 'en', null], ['네', 'ko', null], ['네 좋아요', 'ko', 'yes'],
  ];
  for (const [s, lang, want] of table) assert.equal(shareAnswer(s, lang, S), want, s);
  // Tiếng đệm người duyệt chỉ ra: chặt thì chưa rõ, mặc định vẫn như cũ (màn cũ Call.tsx không đổi).
  for (const s of ['dạ', 'dạ vâng', 'vâng', 'ừ', 'có ạ', 'ok']) {
    assert.equal(shareAnswer(s, 'vi', S), null, `chặt: ${s}`);
    assert.equal(shareAnswer(s, 'vi'), 'yes', `mặc định: ${s}`);
  }
  for (const s of ['yeah let me think', 'ok wait', 'hold on', 'maybe', 'yep', 'mhm', 'uh huh', 'alright']) assert.equal(shareAnswer(s, 'en', S), null, s);
  for (const s of ['네 잠깐만요', '글쎄요', '예', '응', '괜찮아요', '안 좋아요']) assert.equal(shareAnswer(s, 'ko', S), null, s);
  for (const s of ['khoan đã', 'từ từ', 'chờ chút', 'không biết nữa']) assert.equal(shareAnswer(s, 'vi', S), null, s);
  // Từ chối, "không sao", lời đồng ý rõ vẫn như mặc định.
  for (const s of ['không', 'thôi giữ riêng nhé', 'không được', 'dạ không ạ']) assert.equal(shareAnswer(s, 'vi', S), 'no', s);
  for (const s of ['được', 'đồng ý', 'có chứ', 'không sao đâu, chia sẻ đi', 'thôi được']) assert.equal(shareAnswer(s, 'vi', S), 'yes', s);
  for (const s of ['yes', 'of course', 'please do', 'share it', "that's fine", 'no problem']) assert.equal(shareAnswer(s, 'en', S), 'yes', s);
  for (const s of ['좋아요', '그래요', '돼요', '공유해 주세요', '물론이죠']) assert.equal(shareAnswer(s, 'ko', S), 'yes', s);
  assert.equal(shareAnswer('안 돼요', 'ko', S), 'no');
});

test('chế độ chặt: chỉ có tiếng đệm thì nghe tiếp một lần ("dạ" rồi "được" ở hai lượt vẫn là đồng ý), lần sau mới chờ nút', () => {
  const S = { strict: true };
  const listen = shareNext(SHARE_START, { type: 'asked' }, 'vi', S);
  const again = shareNext(listen, { type: 'heard', text: 'Dạ' }, 'vi', S);
  assert.equal(again.stage, 'listen', 'tiếng đệm: vẫn nghe');
  assert.notEqual(again, listen, 'đối tượng mới để nơi gọi đặt lại hẹn giờ nghe');
  assert.equal(shareNext(again, { type: 'heard', text: 'được' }, 'vi', S).end, 'yes', 'lượt sau nói rõ: đồng ý');
  assert.equal(shareNext(again, { type: 'heard', text: 'vâng' }, 'vi', S).stage, 'wait', 'tiếng đệm lần hai: chờ nút');
  assert.equal(shareNext(listen, { type: 'heard', text: 'hôm nay trời đẹp' }, 'vi', S).stage, 'wait', 'lời khác chưa rõ: chờ nút ngay');
  assert.equal(shareNext(again, { type: 'timeout' }, 'vi', S).stage, 'wait', 'hết giờ nghe: chờ nút');
  // Mặc định: "dạ" vẫn là đồng ý như màn cũ.
  assert.equal(shareNext(listen, { type: 'heard', text: 'Dạ' }).end, 'yes');
});

test('chế độ chặt: câu hỏi ngược (đuôi "là sao", "cơ", "ai", "gì", "nào", "à", "hả"; "with who") chưa rõ; 좋아하- không phải 좋아', () => {
  const S = { strict: true };
  for (const s of ['chia sẻ là sao', 'chia sẻ cho ai cơ', 'được à', 'chia sẻ gì', 'chia sẻ cho ai', 'được hả']) assert.equal(shareAnswer(s, 'vi', S), null, s);
  assert.equal(shareAnswer('sao không chia sẻ', 'vi', S), 'yes', '"sao không" vẫn là đồng ý');
  assert.equal(shareAnswer('được chứ', 'vi', S), 'yes');
  assert.equal(shareAnswer('ừ được nhé', 'vi', S), 'yes');
  assert.equal(shareAnswer('share it with who', 'en', S), null);
  assert.equal(shareAnswer('sure, share it with whom', 'en', S), null);
  assert.equal(shareAnswer('좋아하시는 거', 'ko', S), null);
  assert.equal(shareAnswer('좋아해요', 'ko', S), null);
  for (const k of ['좋아합니다', '좋아한다', '좋아할 거예요', '좋아할까요']) assert.equal(shareAnswer(k, 'ko', S), null, k);
  assert.equal(shareAnswer('chia sẻ sao', 'vi', S), null);
  assert.equal(shareAnswer('được, không sao', 'vi', S), 'yes');
  assert.equal(shareAnswer('sao không chia sẻ', 'vi', S), 'yes');
  assert.equal(shareAnswer('좋아요', 'ko', S), 'yes');
  // Mặc định không đổi.
  assert.equal(shareAnswer('được à'), 'yes', 'mặc định như cũ');
});
