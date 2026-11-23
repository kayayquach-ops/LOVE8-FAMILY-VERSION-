// Kiểm thử mốc của lọ sao (src/shared.ts, app/docs/lo-moc.md): mốc kế tiếp và thẻ "nhà mình chạm mốc".
// Chạy: node --import tsx --test src/jarMilestones.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JAR_MILESTONES, milestoneNews, nextMilestone } from './shared.ts';

test('các mốc: 40, 100, 200, 400, 700, 1000', () => {
  assert.deepEqual([...JAR_MILESTONES], [40, 100, 200, 400, 700, 1000]);
});

test('mốc kế tiếp: mốc nhỏ nhất lớn hơn số sao; đúng bằng mốc là đã chạm; qua mốc cuối thì không còn', () => {
  const cases: Array<[number, number | null]> = [
    [0, 40], [28, 40], [39, 40], [40, 100], [41, 100], [99, 100], [100, 200], [399, 400], [400, 700], [700, 1000], [999, 1000], [1000, null], [5000, null],
  ];
  for (const [total, next] of cases) assert.equal(nextMilestone(total), next, `tổng ${total}`);
});

test('thẻ chạm mốc: chưa chạm thì không có; vừa chạm thì báo, có quà khi kho có ưu đãi cho mốc đó', () => {
  assert.equal(milestoneNews(0, 0, []), null);
  assert.equal(milestoneNews(28, 0, [40]), null);
  assert.equal(milestoneNews(39, 0, [40]), null);
  assert.deepEqual(milestoneNews(40, 0, []), { at: 40, gift: false });
  assert.deepEqual(milestoneNews(40, 0, [40, 100]), { at: 40, gift: true });
  assert.deepEqual(milestoneNews(41, 0, [100]), { at: 40, gift: false });
});

test('thẻ chạm mốc: mỗi mốc báo một lần; qua nhiều mốc một lúc thì báo mốc cao nhất, có quà nếu một trong các mốc mới có quà', () => {
  assert.equal(milestoneNews(40, 40, [40]), null);
  assert.equal(milestoneNews(99, 40, [40]), null);
  assert.deepEqual(milestoneNews(100, 40, [40]), { at: 100, gift: false });
  assert.deepEqual(milestoneNews(150, 0, [40]), { at: 100, gift: true });
  assert.deepEqual(milestoneNews(150, 40, [40]), { at: 100, gift: false });
  assert.deepEqual(milestoneNews(1200, 100, [700]), { at: 1000, gift: true });
  assert.equal(milestoneNews(5000, 1000, [1000]), null);
  // Sao giảm (xoá bài, có người rời nhà) dưới mốc đã báo: không báo lại.
  assert.equal(milestoneNews(30, 40, [40]), null);
});
