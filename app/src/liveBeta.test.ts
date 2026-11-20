// Kiểm thử công tắc ẩn "Thử Mây mới" (src/liveBeta.ts): chạm năm lần trong 3 giây thì mở, cờ lưu trong máy. Chạy: node --import tsx --test src/liveBeta.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveBeta, revealTap, setLiveBeta } from './liveBeta.ts';

test('chạm mở công tắc thử: năm lần trong 3 giây thì mở, chậm quá thì đếm lại, mở xong đếm từ đầu', () => {
  const run = (times: number[]) => {
    let taps: number[] = [];
    return times.map((t) => { const r = revealTap(taps, t); taps = r.taps; return r.hit; });
  };
  assert.deepEqual(run([0, 400, 800, 1200, 1600]), [false, false, false, false, true]);
  // Lần đầu đã quá 3 giây khi chạm lần năm: chưa đủ.
  assert.deepEqual(run([0, 1000, 2000, 2500, 3000]), [false, false, false, false, false]);
  assert.deepEqual(run([0, 1000, 2000, 2500, 3000, 3100]), [false, false, false, false, false, true]);
  // Mở rồi thì năm lần chạm tiếp theo mới mở lại.
  assert.deepEqual(run([0, 1, 2, 3, 4, 5, 6, 7, 8]), [false, false, false, false, true, false, false, false, false]);
});

test('cờ thử trong máy: chưa có thì tắt, ghi rồi thì bật; máy chặn bộ nhớ thì không lỗi', () => {
  const g = globalThis as { localStorage?: unknown };
  const store = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  try {
    assert.equal(liveBeta(), false);
    setLiveBeta();
    assert.equal(store.get('mayLiveBeta'), '1');
    assert.equal(liveBeta(), true);
    g.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.equal(liveBeta(), false);
    assert.doesNotThrow(() => setLiveBeta());
  } finally {
    delete g.localStorage;
  }
});
