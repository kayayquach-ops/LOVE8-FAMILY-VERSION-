// Thử giọng OpenAI cho en, ko qua đúng hàm speech() trong server/voice.ts (lời dặn OA_STYLE, giọng theo ngôn ngữ). KHÔNG gọi Gemini TTS.
// Mỗi câu một yêu cầu OpenAI (4 câu). Chép lại bằng Gemini văn bản (nếu có GEMINI_API_KEY) để kiểm đọc đúng thứ tiếng.
// Chạy: OPENAI_API_KEY (và GEMINI_API_KEY nếu muốn chép lại) có sẵn trong biến môi trường; không in khoá.
//   node --import tsx scripts/ai-lang-test-tts.ts <thư mục lưu mp3>
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

if (!process.env.OPENAI_API_KEY) { console.error('Thiếu OPENAI_API_KEY trong biến môi trường.'); process.exit(1); }
const dir = path.resolve(process.argv[2] || 'tts-lang-test');
mkdirSync(dir, { recursive: true });
process.env.MEDIA_DIR = dir;
process.env.TTS_PROVIDER = 'openai';
process.env.OPENAI_TTS_DAILY = '4';

const voice = await import('../server/voice.ts');
const LINES = [
  'Hi Dad, it\'s Mây. Just a few small questions, it won\'t take long. How\'s your day, Dad? Anything nice happen?',
  'Grilled fish and morning glory from the garden sounds so fresh, Mom.',
  '안녕하세요, 어머님. Mây예요. 잘 지내셨어요? 오늘은 뭐 드셨어요?',
  '지난번에 마당에 고추를 심으셨다고 하셨는데, 잘 자라고 있나요?',
];
const out = [];
for (const text of LINES) {
  const t0 = Date.now();
  const url = await voice.speech(text, 'lang-test', { provider: 'openai' });
  const ms = Date.now() - t0;
  if (!url) { out.push({ text, ok: false, ms }); continue; }
  const file = path.join(dir, url.replace('/media/', ''));
  let seconds: number | null = null;
  try { seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()); } catch {}
  const lang = voice.textLang(text);
  const heard = process.env.GEMINI_API_KEY ? await voice.transcribe(file, 'lang-test-stt', 15000, lang) : null;
  out.push({ text, ok: true, lang, voice: voice.OA_VOICE(text), ms, bytes: statSync(file).size, seconds, file, heard });
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
process.exit(0);
