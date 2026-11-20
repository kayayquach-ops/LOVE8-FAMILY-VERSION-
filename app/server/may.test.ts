// Kiểm thử Mây nối người (server/may.ts): tìm người nhận từ lời kể, xếp tín hiệu vào hàng chờ với hạn đúng loại.
// Không cần DB, không gọi mạng. Chạy: node --import tsx --test server/may.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const M = await import('./may.ts');

// Nhà bốn người: bố Hùng, mẹ Lan, hai con An và Bình. Mặc định ở Hà Nội, ai cũng bật "Mây nhắc mình liên lạc".
const hung = { id: 'hung', name: 'Hùng', role: 'bo' }, lan = { id: 'lan', name: 'Lan', role: 'me' };
const an = { id: 'an', name: 'Nguyễn Văn An', role: 'con' }, binh = { id: 'binh', name: 'Bình', role: 'con' };
const family = [hung, lan, an, binh];
const members = family.map((m) => ({ ...m, city: 'hanoi', may_nudge: true }));
const lanM = members.find((m) => m.id === lan.id)!;

test('người nhận: tên khớp đúng một người, theo vai thì mọi người đúng vai, mơ hồ thì không ai', () => {
  const ids = (t: string, from = lan, fam = family) => M.resolveTargets(t, from, fam).sort();
  assert.deepEqual(ids('An'), [an.id]);
  assert.deepEqual(ids('bé An'), [an.id]);
  assert.deepEqual(ids('Anh'), []);                       // không khớp một phần tên
  assert.deepEqual(ids('các con'), [an.id, binh.id].sort());
  assert.deepEqual(ids('con'), []);                       // hai con: "con" mơ hồ
  assert.deepEqual(ids('con', lan, family.filter((m) => m.id !== binh.id)), [an.id]);
  assert.deepEqual(ids('bố'), [hung.id]);
  assert.deepEqual(ids('mẹ'), []);                        // người kể là mẹ: không tự gửi cho mình
  assert.deepEqual(ids('bố mẹ', an), [hung.id, lan.id].sort());
  assert.deepEqual(ids('An', lan, [...family, { id: 'an2', name: 'Trần An', role: 'con' }]), []);
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('Minh'), []);
});

test('hàng chờ: hạn theo loại, gửi đúng người, tắt công tắc thì không, upcoming nhắc trước một hôm theo giờ người nhận', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const sig = (kind: string, target = '', date: any = null) => ({ kind, target, evidence: 'e', date });
  const plan = (signals: any[], fam = members, speaker = lanM) => M.planSignals({ familyId: 'F', callId: 'c1', speaker, family: fam, signals, now });
  const miss = plan([sig('miss', 'An')]);
  assert.deepEqual(miss.map((r) => [r.to_id, r.kind]), [[an.id, 'miss']]);
  assert.equal(miss[0].expires_at.toISOString(), '2026-11-21T03:00:00.000Z');
  assert.deepEqual(plan([sig('good_news')]).map((r) => r.to_id).sort(), [hung.id, an.id, binh.id].sort());
  assert.equal(plan([sig('good_news')])[0].expires_at.toISOString(), '2026-11-22T03:00:00.000Z');
  assert.deepEqual(plan([sig('good_news')], members.map((m) => (m.id === binh.id ? { ...m, may_nudge: false } : m))).map((r) => r.to_id).sort(), [hung.id, an.id].sort());
  assert.deepEqual(plan([sig('miss', 'An')], members, { ...lanM, may_nudge: false }), []);
  assert.deepEqual(plan([sig('worry', 'An')]), []);       // worry chỉ vào sổ nhớ, không thành lời nhắc
  assert.equal(plan([sig('miss', 'An'), sig('miss', 'An')]).length, 1);
  const kst = members.map((m) => ({ ...m, city: 'seoul' }));
  const up = plan([sig('upcoming', '', { day: 25, month: 11 })], kst).find((r) => r.to_id === an.id)!;
  assert.equal(up.due_at.toISOString(), '2026-11-24T00:00:00.000Z');      // 9:00 KST hôm trước
  assert.equal(up.expires_at.toISOString(), '2026-11-24T15:00:00.000Z');  // hết ngày hôm trước
  const soon = plan([sig('upcoming', '', { day: 21, month: 11 })], kst).find((r) => r.to_id === an.id)!;
  assert.equal(soon.due_at.toISOString(), now.toISOString());
  assert.deepEqual(plan([sig('upcoming', '', { day: 20, month: 11 })], kst), []); // hôm trước đã qua
  assert.deepEqual(plan([sig('upcoming', '', { day: 31, month: 2 })], kst), []);  // ngày không có thật
});
