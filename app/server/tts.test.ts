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
  assert.ok(lines.length <= 3 * 3 * 8, `quá nhiều câu cố định: ${lines.length}`);
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

// ---------- OpenAI làm giọng chính, Gemini dự phòng ----------

const mp3 = Buffer.alloc(2000, 1);
function oaFetch(status = 200, body: BodyInit = '', headers: Record<string, string> = {}) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ url: String(url), init }); return new Response(status === 200 ? new Uint8Array(mp3) : body, { status, headers }); }) as unknown as typeof fetch;
  return { f, seen };
}
function resetOa() {
  voice.oaGate.used = 0; voice.oaGate.until = 0; voice.oaGate.why = null; voice.oaGate.rpm = 60;
  voice.gate.used = 0; voice.gate.until = 0; voice.gate.why = null;
}

test('chọn nhà cung cấp: auto ưu tiên OpenAI, TTS_PROVIDER ép, hỏng thì Gemini rồi giọng máy', () => {
  resetOa();
  delete process.env.OPENAI_API_KEY;
  assert.equal(voice.pickProvider(), 'gemini');
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  assert.equal(voice.pickProvider(), 'openai');
  assert.equal(voice.ttsStatus().provider, 'openai');
  process.env.TTS_PROVIDER = 'gemini';
  assert.equal(voice.pickProvider(), 'gemini');
  process.env.TTS_PROVIDER = 'openai';
  assert.equal(voice.pickProvider(), 'openai');
  voice.oaGate.block(60_000);
  assert.equal(voice.pickProvider(), 'device'); // ép openai thì không rơi sang Gemini
  process.env.TTS_PROVIDER = 'auto';
  assert.equal(voice.pickProvider(), 'gemini');
  voice.gate.block(60_000);
  assert.equal(voice.pickProvider(), 'device');
  const st = voice.ttsStatus();
  assert.equal(st.ok, false);
  assert.equal(st.provider, 'device');
  resetOa();
});

test('OpenAI: gọi đúng API, khoá kho riêng, lời dặn theo ngôn ngữ, trúng kho không gọi lại', async () => {
  resetOa();
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  const m = oaFetch();
  voice._setFetch(m.f);
  const url = await voice.speech('Chào bạn, mình là Mây đây ạ.', 'o1', { provider: 'openai' });
  assert.ok(url && url.endsWith('.mp3'));
  assert.equal(m.seen.length, 1);
  assert.equal(m.seen[0].url, 'https://api.openai.com/v1/audio/speech');
  assert.equal((m.seen[0].init.headers as Record<string, string>).authorization, 'Bearer sk-test-not-real');
  const body = JSON.parse(String(m.seen[0].init.body));
  assert.equal(body.model, 'gpt-4o-mini-tts');
  assert.equal(body.voice, 'coral');
  assert.equal(body.response_format, 'mp3');
  assert.match(body.instructions, /tiếng Việt/);
  const en = await voice.speech('Hello, this is Mây.', 'o1', { provider: 'openai' });
  assert.match(JSON.parse(String(m.seen[1].init.body)).instructions, /English/);
  await voice.speech('안녕하세요, 마이예요.', 'o1', { provider: 'openai' });
  assert.match(JSON.parse(String(m.seen[2].init.body)).instructions, /한국어/);
  // kho riêng: cùng chữ, Gemini có khoá khác
  assert.notEqual(voice.cachedSpeech('Hello, this is Mây.', 'gemini'), en);
  assert.equal(voice.cachedSpeech('Hello, this is Mây.', 'openai'), en);
  assert.equal(await voice.speech('Chào bạn,  mình là Mây đây ạ.', 'o1', { provider: 'openai' }), url);
  assert.equal(m.seen.length, 3);
  assert.equal(voice.oaGate.used, 3);
});

test('không đổi giọng giữa cuộc gọi: mỗi provider chỉ gọi đúng nhà của nó', async () => {
  resetOa();
  const c1: string[] = [];
  voice._setFetch((async (u: string) => { c1.push(String(u)); return new Response('{"error":{}}', { status: 500 }); }) as unknown as typeof fetch);
  assert.equal(await voice.speech('Câu thử cho Gemini số một', 'o2', { provider: 'gemini' }), null);
  assert.ok(c1.length > 0 && c1.every((u) => u.includes('generativelanguage')));
  const c2: string[] = [];
  voice._setFetch((async (u: string) => { c2.push(String(u)); return new Response('{"error":{"code":"server_error"}}', { status: 500 }); }) as unknown as typeof fetch);
  assert.equal(await voice.speech('Câu thử cho OpenAI lỗi 500', 'o2', { provider: 'openai' }), null);
  assert.ok(c2.length > 0 && c2.every((u) => u.includes('openai.com')));
  assert.ok(voice.oaGate.stats.err >= 1);
  assert.equal(voice.pickProvider(), 'openai'); // lỗi 500 không đặt cờ chặn
});

test('OpenAI 401 và 429 hết số dư đặt cờ 30 phút, 429 tốc độ theo retry-after', async () => {
  resetOa();
  const m401 = oaFetch(401, '{"error":{"code":"invalid_api_key","message":"Incorrect API key provided: sk-test-not-real"}}');
  voice._setFetch(m401.f);
  assert.equal(await voice.speech('Câu cho lỗi bốn không một', 'o3', { provider: 'openai' }), null);
  assert.ok(voice.oaGate.until - Date.now() > 29 * 60_000);
  assert.equal(voice.pickProvider(), 'gemini');
  assert.equal(voice.speech('Câu khác sau cờ chặn', 'o3', { provider: 'openai' }), null);
  assert.equal(m401.seen.length, 1);
  resetOa();
  const mq = oaFetch(429, '{"error":{"code":"insufficient_quota"}}');
  voice._setFetch(mq.f);
  assert.equal(await voice.speech('Câu cho hết số dư', 'o3', { provider: 'openai' }), null);
  assert.ok(voice.oaGate.until - Date.now() > 29 * 60_000);
  assert.equal(voice.oaGate.why, 'budget');
  resetOa();
  const mr = oaFetch(429, '{"error":{"code":"rate_limit_exceeded"}}', { 'retry-after': '7' });
  voice._setFetch(mr.f);
  assert.equal(await voice.speech('Câu cho giới hạn tốc độ', 'o3', { provider: 'openai' }), null);
  const left = voice.oaGate.until - Date.now();
  assert.ok(left > 5_000 && left <= 7_100, `chờ ${left}`);
  resetOa();
});

test('ngân sách ngày OpenAI và giới hạn mỗi người', async () => {
  resetOa();
  process.env.OPENAI_TTS_DAILY = '2';
  const m = oaFetch(); voice._setFetch(m.f);
  assert.ok(await voice.speech('Ngân sách câu một', 'o4', { provider: 'openai' }));
  assert.ok(await voice.speech('Ngân sách câu hai', 'o4', { provider: 'openai' }));
  assert.equal(voice.speech('Ngân sách câu ba', 'o4', { provider: 'openai' }), null);
  assert.equal(voice.pickProvider(), 'gemini');
  delete process.env.OPENAI_TTS_DAILY;
  resetOa();
  for (let i = 0; i < 40; i++) assert.ok(voice.allow('openai:u', 40));
  assert.equal(voice.allow('openai:u', 40), false);
});

test('chép lời: Gemini lỗi thì OpenAI gpt-4o-mini-transcribe, không khoá thì thôi', async () => {
  resetOa();
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  const f = path.join(dir, 'in.wav');
  const { execFileSync } = await import('node:child_process');
  try { execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', f], { stdio: 'ignore' }); } catch { return; }
  const seen: { url: string; init: RequestInit }[] = [];
  voice._setFetch((async (u: string, init: RequestInit) => {
    seen.push({ url: String(u), init });
    return String(u).includes('openai.com') ? new Response('xin chào cả nhà\n', { status: 200 }) : new Response('boom', { status: 500 });
  }) as unknown as typeof fetch);
  assert.equal(await voice.transcribe(f, 'stt1', 8000, 'vi'), 'xin chào cả nhà');
  assert.ok(seen[0].url.includes('generativelanguage') && seen[1].url === 'https://api.openai.com/v1/audio/transcriptions');
  const form = seen[1].init.body as FormData;
  assert.equal(form.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(form.get('language'), 'vi');
  assert.equal(form.get('response_format'), 'text');
  delete process.env.OPENAI_API_KEY;
  seen.length = 0;
  assert.equal(await voice.transcribe(f, 'stt2', 8000, 'vi'), null);
  assert.ok(seen.every((x) => x.url.includes('generativelanguage')));
});

test.after(() => { rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50); });

// Lớp lọc chống bịa và đọc ngày (vi, en, ko).
await import('./guard.test.ts');
