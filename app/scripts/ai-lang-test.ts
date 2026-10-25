// Kiểm thật AI soạn câu hỏi, câu đáp và rút ngày cho en, ko bằng Gemini văn bản (KHÔNG gọi TTS).
// Chạy: GEMINI_API_KEY phải có sẵn trong biến môi trường của tiến trình (không đọc file .env, không in khoá).
//   node --import tsx scripts/ai-lang-test.ts [số lần, mặc định 3] > kết quả.json
// In ra JSON: mỗi tình huống, mỗi lần: câu cuối cùng (đã qua lọc) và các câu bị lọc bỏ kèm lý do.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (!process.env.GEMINI_API_KEY) { console.error('Thiếu GEMINI_API_KEY trong biến môi trường.'); process.exit(1); }
process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'ai-lang-'));
// Không bao giờ đọc thành tiếng trong lúc kiểm: tắt mọi nhà cung cấp TTS.
delete process.env.OPENAI_API_KEY;
process.env.TTS_PROVIDER = 'openai';

const { aiScript, quickReply, datesSystem, DATES_SCHEMA } = await import('../server/call.ts');
const { askJSON } = await import('../server/ai.ts');
const { runWithLang } = await import('../server/i18n.ts');
type Ctx = import('../server/call.ts').Ctx;
type Lang = 'vi' | 'en' | 'ko';

const runs = Number(process.argv[2]) || 3;
const week = '2026-10-19';
const dropped: string[] = [];
const warn = console.warn;
console.warn = (...a: unknown[]) => { const s = a.map(String).join(' '); if (s.startsWith('[call] bỏ')) dropped.push(s); else warn(...a); };
console.log = () => {};

const family = [{ name: 'Lan', role: 'con' }, { name: 'Hùng', role: 'bo' }, { name: 'Mai', role: 'me' }];
const base = (lang: Lang, role: string, name: string): Ctx => ({
  lang, member: { id: 'm1', name, role, intro: {} }, family, events: [], asked: [], stories: [], doneCalls: [], photoCount: 0, captions: [],
});

const answers: Record<Lang, Array<{ question: string; answer: string }>> = {
  vi: [],
  en: [
    { question: 'How was your week over there? Even one small story is fine.', answer: 'It was busy, I had two exams, but on Saturday I cooked pho with my roommate and it tasted almost like home.' },
    { question: 'What do you miss most about home, being over there?', answer: "Honestly I miss Mom's fish sauce caramel pork and the noise of the market in the morning." },
  ],
  ko: [
    { question: '이번 주에 집에서 좋은 일 있으셨어요?', answer: '네, 이번 주에 마당에 고추를 심었어요. 남편이랑 같이 했는데 재미있었어요.' },
    { question: '어릴 때 자주 드시던 음식 중에 지금도 맛이 기억나는 게 있으세요?', answer: '어머니가 해 주시던 된장찌개요. 겨울에 먹으면 정말 따뜻했어요.' },
  ],
};

function scenarios(lang: Lang): Array<{ id: string; title: string; ctx: Ctx }> {
  const s1 = base(lang, lang === 'en' ? 'con' : 'me', lang === 'en' ? 'Lan' : 'Mai');
  const s2 = base(lang, lang === 'en' ? 'con' : 'me', lang === 'en' ? 'Lan' : 'Mai');
  s2.doneCalls = ['2026-10-12'];
  s2.stories = answers[lang];
  s2.asked = answers[lang].map((a) => a.question);
  const s3 = base(lang, 'bo', 'Hùng');
  s3.doneCalls = ['2026-10-12', '2026-10-05'];
  s3.photoCount = 3;
  s3.captions = lang === 'en' ? ['Sunday lunch at home', 'The garden in spring'] : ['일요일 점심', '봄 마당'];
  s3.events = [
    { kind: 'birthday', title: lang === 'en' ? "Mai's birthday" : 'Mai님 생일', day: 12, month: 3, year: null },
    { kind: 'wedding', title: lang === 'en' ? "Mom and Dad's wedding day" : '엄마 아빠 결혼식 날', day: 20, month: 11, year: 1998 },
  ];
  return [
    { id: 'S1', title: 'người mới: chưa có cuộc gọi, câu trả lời, ảnh hay sự kiện nào', ctx: s1 },
    { id: 'S2', title: 'đã có 1 cuộc gọi và 2 câu trả lời thật', ctx: s2 },
    { id: 'S3', title: 'có 3 ảnh (2 chú thích) và 2 sự kiện lịch, chưa có câu trả lời chép được', ctx: s3 },
  ];
}

const out: Record<string, unknown> = {};
for (const lang of ['en', 'ko'] as const) {
  for (const sc of scenarios(lang)) {
    const list = [];
    for (let i = 0; i < runs; i++) {
      dropped.length = 0;
      const t0 = Date.now();
      const s = await aiScript(sc.ctx, week);
      list.push({ ms: Date.now() - t0, source: s?.source ?? null, greeting: s?.greeting, questions: s?.questions.map((q) => `${q.text} [${q.topic}${q.photo ? ', photo' : ''}${q.event !== 'none' ? ', ' + q.event : ''}]`), goodbye: s?.goodbye, dropped: [...dropped] });
    }
    out[`${lang}.${sc.id}`] = { title: sc.title, member: sc.ctx.member, runs: list };
  }
}

// Câu đáp ngắn (askQuick) theo đúng ngôn ngữ, 2 câu mỗi thứ tiếng.
const replies: unknown[] = [];
const said: Record<'en' | 'ko', Array<[string, string, string]>> = {
  en: [['con', 'What did you eat today?', 'I made instant noodles with an egg because I was too tired to cook.'], ['me', 'What did you eat today?', 'I had rice with grilled fish and some morning glory from the garden.']],
  ko: [['me', '오늘은 뭐 드셨어요?', '오늘은 남편이랑 칼국수 먹었어요. 비가 와서 따뜻한 게 먹고 싶었어요.'], ['con', '오늘은 뭐 먹었어요?', '학교 식당에서 김치볶음밥 먹었어요.']],
};
for (const lang of ['en', 'ko'] as const) {
  for (const [role, q, a] of said[lang]) {
    dropped.length = 0;
    const name = role === 'con' ? 'Lan' : 'Mai';
    const r = await runWithLang(lang, () => quickReply({ name, role }, q, a, 'm1'));
    replies.push({ lang, role, answer: a, reply: r, dropped: [...dropped] });
  }
}
out.replies = replies;

// Rút ngày: người kể en/ko, nhà theo thứ tiếng người kể.
const dates: unknown[] = [];
const told: Record<'en' | 'ko', string> = {
  en: 'We got married on March 12, 1995, in my hometown. And my mother, she was born on 3 June 1950.',
  ko: '저희는 1995년 3월 12일에 결혼했어요. 그리고 우리 딸 생일은 7월 8일이에요.',
};
for (const lang of ['en', 'ko'] as const) {
  const r = await askJSON(datesSystem(lang, lang), JSON.stringify({ speaker: { name: 'Mai', role: 'me' }, calendar: [], call: [{ question: 'When did you get married?', answer: told[lang] }] }, null, 1), DATES_SCHEMA, 2000);
  dates.push({ lang, told: told[lang], result: r });
}
out.dates = dates;

process.stdout.write(JSON.stringify(out, null, 1) + '\n');
process.exit(0);
