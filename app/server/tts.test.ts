// Kiểm thử nhẹ cho hàng đợi, ngân sách ngày, cờ 429 và kho âm thanh. Không gọi Gemini thật: fetch được thay bằng hàm giả.
// Chạy: npm run test:tts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'tts-test-'));
process.env.MEDIA_DIR = dir;
process.env.GEMINI_API_KEY = 'test-key-not-real';
process.env.GEMINI_TTS_DAILY = '10';

const { TtsGate, TtsLimited, nextPacificMidnight, pacificDay } = await import('./ttsgate.ts');
const voice = await import('./voice.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = () => Promise.resolve('ok');

test('không vượt N yêu cầu trong cửa sổ trượt', async () => {
  const g = new TtsGate({ rpm: 3, windowMs: 300, daily: () => 100, concurrency: 5 });
  const starts: number[] = [];
  await Promise.all(Array.from({ length: 7 }, () => g.schedule(0, async () => { starts.push(Date.now()); return 1; })));
  assert.equal(starts.length, 7);
  starts.sort((a, b) => a - b);
  for (let i = 0; i + 3 < starts.length; i++) assert.ok(starts[i + 3] - starts[i] >= 295, `cửa sổ ${i}: ${starts[i + 3] - starts[i]} ms`);
});

test('ưu tiên: câu cuộc gọi trước, nạp sẵn sau', async () => {
  const g = new TtsGate({ rpm: 1, windowMs: 150, daily: () => 100, maxWaitMs: 5000 });
  const order: string[] = [];
  const go = (name: string, prio: number) => g.schedule(prio, async () => { order.push(name); return name; });
  const a = go('A', 1);
  await sleep(10);
  const c = go('C-warm', 1);
  const d = go('D-call', 0);
  await Promise.all([a, c, d]);
  assert.deepEqual(order, ['A', 'D-call', 'C-warm']);
});

test('ngân sách ngày chặn đúng và đặt lại sang ngày mới (giờ Thái Bình Dương)', async () => {
  let t = Date.parse('2026-10-25T12:00:00Z');
  const g = new TtsGate({ now: () => t, rpm: 100, daily: () => 5 });
  for (let i = 0; i < 5; i++) assert.equal(await g.schedule(0, ok), 'ok');
  await assert.rejects(g.schedule(0, ok), (e: any) => e instanceof TtsLimited && e.reason === 'budget');
  assert.equal(g.status().ok, false);
  t += 24 * 3600e3;
  assert.notEqual(pacificDay(t), g.day);
  assert.equal(g.blocked(), null);
  assert.equal(g.used, 0);
  assert.equal(await g.schedule(0, ok), 'ok');
});

test('câu không bắt buộc chỉ khi còn trên 30% ngân sách', async () => {
  const g = new TtsGate({ rpm: 100, daily: () => 10 });
  for (let i = 0; i < 7; i++) await g.schedule(0, ok);
  assert.equal(g.blocked(true), null); // còn 3 = 30%
  await g.schedule(0, ok);
  assert.equal(g.blocked(true), 'budget'); // còn 2
  assert.equal(g.blocked(false), null);
  await assert.rejects(g.schedule(1, ok, true), (e: any) => e instanceof TtsLimited);
});

test('429 đặt cờ rồi tự khôi phục', async () => {
  let t = Date.parse('2026-10-25T20:00:00Z');
  const g = new TtsGate({ now: () => t, rpm: 100, daily: () => 100 });
  // Có RetryInfo
  g.note429(JSON.stringify({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' }] } }));
  assert.equal(g.blocked(), 'cooldown');
  assert.equal(g.until - t, 36_000);
  await assert.rejects(g.schedule(0, ok), (e: any) => e.reason === 'cooldown');
  t += 37_000;
  assert.equal(g.blocked(), null);
  // Không có RetryInfo: 10 phút
  g.note429('quota exceeded');
  assert.equal(g.until - t, 600_000);
  t += 601_000;
  assert.equal(g.blocked(), null);
  // Theo ngày: đến nửa đêm Thái Bình Dương
  g.note429('Quota exceeded for metric ... GenerateRequestsPerDayPerProjectPerModel-FreeTier');
  assert.equal(g.until, nextPacificMidnight(t));
  assert.equal(g.blocked(), 'budget');
  t = g.until + 1000;
  assert.equal(g.blocked(), null);
});

test('429 làm các yêu cầu đang xếp hàng bị từ chối, không gọi thêm', async () => {
  const g = new TtsGate({ rpm: 1, windowMs: 400, daily: () => 100, maxWaitMs: 5000 });
  await g.schedule(0, ok);
  let called = 0;
  const waiting = g.schedule(0, async () => { called++; return 1; });
  await sleep(20);
  g.note429('x');
  await assert.rejects(waiting, (e: any) => e instanceof TtsLimited);
  assert.equal(called, 0);
});

function fakeFetch() {
  let calls = 0;
  const f = (async () => {
    calls++;
    const pcm = Buffer.alloc(4800).toString('base64');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm } }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, count: () => calls };
}

test('trúng kho thì không gọi Gemini và không tính ngân sách', async () => {
  const m = fakeFetch();
  voice._setFetch(m.f);
  const before = voice.gate.used;
  const url = await voice.speech('Chào bạn, mình là Mây đây.', 't1');
  assert.ok(url);
  assert.equal(m.count(), 1);
  assert.equal(voice.gate.used, before + 1);
  const again = await voice.speech('Chào bạn,   mình là Mây đây. ', 't1');
  assert.equal(again, url);
  assert.equal(m.count(), 1);
  assert.equal(voice.gate.used, before + 1);
  assert.equal(voice.speech('Câu khác chưa có', 't1', { cacheOnly: true }), null);
  assert.equal(m.count(), 1);
});

test('API trả 429 thì đặt cờ, trả null, các câu sau không gọi nữa', async () => {
  let calls = 0;
  voice._setFetch((async () => { calls++; return new Response('{"error":{"details":[{"retryDelay":"20s"}]}}', { status: 429 }); }) as unknown as typeof fetch);
  const p = voice.speech('Một câu mới hoàn toàn số một', 't2');
  assert.equal(await p, null);
  assert.equal(calls, 1);
  assert.equal(voice.ttsStatus().ok, false);
  assert.equal(voice.ttsStatus().reason, 'cooldown');
  assert.equal(voice.speech('Một câu mới hoàn toàn số hai', 't2'), null);
  assert.equal(calls, 1);
  voice.gate.until = 0;
  voice.gate.why = null;
});

test('nạp sẵn rải rác: bỏ câu đã có, dừng khi ngân sách còn dưới 30%', async () => {
  const call = await import('./call.ts');
  const lines = call.fixedLines();
  assert.ok(lines.length <= 3 * 2 * 8, `quá nhiều câu cố định: ${lines.length}`);
  voice.gate.used = 0;
  voice.gate.until = 0;
  const m = fakeFetch();
  voice._setFetch(m.f);
  voice.gate.rpm = 100; // cửa sổ 8 yêu cầu mỗi phút đã kiểm riêng ở trên; ở đây chỉ kiểm logic nạp
  const t0 = Date.now();
  await call.warmFixedVoices(1);
  // daily = 10: nạp đến khi còn dưới 3 lượt, tức tối đa 8 lượt
  assert.ok(m.count() <= 8 && m.count() >= 7, `đã gọi ${m.count()}`);
  assert.ok(voice.gate.remaining() >= 2);
  // Chạy lại: các câu đã có thì bỏ, chỉ nạp tiếp phần còn thiếu mà vẫn trong ngân sách
  const n = m.count();
  await call.warmFixedVoices(1);
  assert.equal(m.count(), n);
  assert.ok(Date.now() - t0 < 10_000);
});

test.after(() => { rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50); });
