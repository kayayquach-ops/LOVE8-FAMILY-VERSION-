// Kiểm thử cộng token Gemini Live ở máy khách (src/liveUsage.ts). Chạy: node --import tsx --test src/liveUsage.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { addUsage, emptyUsage } from './liveUsage.ts';

test('cộng token Live: mỗi usageMetadata một lượt, tách chữ và tiếng hai chiều', () => {
  const t = emptyUsage();
  addUsage(t, { promptTokenCount: 100, responseTokenCount: 40, totalTokenCount: 140, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 70 }, { modality: 'AUDIO', tokenCount: 30 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 40 }] });
  addUsage(t, { promptTokenCount: 10 });
  assert.deepEqual([t.n, t.prompt, t.response, t.inText, t.inAudio, t.outAudio], [2, 110, 40, 70, 30, 40]);
  // Thêm: loại khác (IMAGE) và số rác không cộng.
  addUsage(t, { promptTokenCount: 'x', promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 5 }] });
  assert.deepEqual([t.n, t.prompt, t.inText, t.inAudio, t.total], [3, 110, 70, 30, 140]);
});
