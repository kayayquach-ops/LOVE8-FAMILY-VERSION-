// Máy chủ của Homeletter (Firebase Cloud Functions). API key của Claude chỉ nằm ở đây,
// cất trong Secret Manager: firebase functions:secrets:set ANTHROPIC_API_KEY
// App gọi các đường dẫn: /gentle, /interview, /soften, /structure-story, /transcribe.
import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { GENTLE, INTERVIEW_CONFIDE, INTERVIEW_STORY, SOFTEN, STORY_SCHEMA, STRUCTURE_STORY, TURN_SCHEMA } from './prompts.js';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const MODEL = 'claude-opus-5-5';
// Nếu bộ lọc an toàn từ chối một yêu cầu, máy chủ của Anthropic tự chạy lại trên model dự phòng phù hợp.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type ChatMessage = { from: 'ai' | 'me'; text: string };
type InterviewBody = {
  mode: 'story' | 'confide';
  history: ChatMessage[];
  speakerName: string;
  speakerRole: string;
  familyNames: string[];
  pendingQuestion?: { from: string; text: string };
};

function client(): Anthropic {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
}

function firstText(content: Anthropic.Beta.Messages.BetaContentBlock[]): string {
  for (const block of content) if (block.type === 'text') return block.text;
  return '';
}

/** Ghép lịch sử chat thành các lượt user/assistant xen kẽ, bắt đầu bằng user như API yêu cầu. */
function toMessages(body: InterviewBody): Anthropic.Beta.Messages.BetaMessageParam[] {
  const context =
    `[Người đang nói chuyện: ${body.speakerName}, vai trò trong nhà: ${body.speakerRole}. ` +
    `Thành viên: ${body.familyNames.join(', ')}.` +
    (body.pendingQuestion ? ` Câu hỏi người thân gửi: ${body.pendingQuestion.from} muốn hỏi "${body.pendingQuestion.text}".` : '') +
    ']';
  const out: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: context }];
  for (const m of body.history) {
    const role = m.from === 'me' ? 'user' : 'assistant';
    const last = out[out.length - 1];
    if (last.role === role) last.content = `${last.content as string}\n\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  if (out[out.length - 1].role === 'assistant') out.push({ role: 'user', content: '(tiếp tục)' });
  return out;
}

async function interview(body: InterviewBody) {
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    cache_control: { type: 'ephemeral' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TURN_SCHEMA } },
    system: body.mode === 'confide' ? INTERVIEW_CONFIDE : INTERVIEW_STORY,
    messages: toMessages(body),
  });
  if (res.stop_reason === 'refusal') {
    return { text: 'Thư chưa trả lời được câu này. Bạn kể tiếp phần khác nhé?', kind: 'text' };
  }
  return JSON.parse(firstText(res.content)) as { text: string; kind: string };
}

async function soften(text: string, toName: string) {
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 1000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SOFTEN,
    messages: [{ role: 'user', content: `Người nhận: ${toName}\nLời nhắn gốc: ${text}` }],
  });
  return { text: res.stop_reason === 'refusal' ? text : firstText(res.content).trim() };
}

/** Viết lại câu hỏi giấu kín thành câu Homeletter sẽ hỏi trong cuộc gọi: vòng qua kỷ niệm, không lộ người hỏi. */
async function gentle(text: string, from: string, to: string, address: string) {
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 1000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: GENTLE,
    messages: [{ role: 'user', content: `Người muốn biết: ${from}\nNgười được hỏi: ${to} (Homeletter gọi là "${address}")\nĐiều muốn biết: ${text}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  return { text: firstText(res.content).trim() };
}

async function structureStory(transcript: string, tellerName: string) {
  const res = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: STORY_SCHEMA } },
    system: STRUCTURE_STORY,
    messages: [{ role: 'user', content: `Người kể: ${tellerName}\n\nLời kể:\n${transcript}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  return JSON.parse(firstText(res.content));
}

export const api = onRequest({ secrets: [ANTHROPIC_API_KEY], cors: true, region: 'asia-northeast3' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('POST only');
    return;
  }
  try {
    switch (req.path) {
      case '/gentle':
        res.json(await gentle(String(req.body.text ?? ''), String(req.body.from ?? ''), String(req.body.to ?? ''), String(req.body.address ?? '')));
        return;
      case '/interview':
        res.json(await interview(req.body as InterviewBody));
        return;
      case '/soften':
        res.json(await soften(String(req.body.text ?? ''), String(req.body.toName ?? 'Mẹ')));
        return;
      case '/structure-story':
        res.json(await structureStory(String(req.body.transcript ?? ''), String(req.body.tellerName ?? '')));
        return;
      case '/transcribe':
        // Chuyển giọng nói tiếng Việt thành chữ: nối Google Cloud Speech-to-Text (vi-VN) hoặc FPT.AI tại đây.
        // Claude không nhận âm thanh, nên bước này cần dịch vụ riêng.
        res.status(501).json({ error: 'Chưa nối dịch vụ chuyển giọng nói thành chữ' });
        return;
      default:
        res.status(404).json({ error: 'Không có đường dẫn này' });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) res.status(429).json({ error: 'Quá nhiều yêu cầu, thử lại sau' });
    else if (error instanceof Anthropic.APIError) res.status(502).json({ error: `Claude API ${error.status}` });
    else res.status(500).json({ error: 'Lỗi máy chủ' });
  }
});
