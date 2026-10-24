// Gọi AI từ máy chủ: Gemini nếu có GEMINI_API_KEY, không thì Claude nếu có ANTHROPIC_API_KEY (đặt AI_PROVIDER=claude để ép dùng Claude).
// Không có key nào thì trả null, nơi gọi tự dùng bản soạn sẵn.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
let client: Anthropic | null = null;

const useGemini = () => !!process.env.GEMINI_API_KEY && process.env.AI_PROVIDER !== 'claude';
export const hasAI = () => useGemini() || !!process.env.ANTHROPIC_API_KEY;

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Gọi Gemini qua REST, trả về chữ. schema có thì ép đầu ra JSON theo schema. */
async function gemini(system: string, user: string, opts: { schema?: Record<string, unknown>; maxTokens: number; timeoutMs: number }): Promise<string | null> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
      ...(opts.schema ? { responseMimeType: 'application/json', responseJsonSchema: opts.schema } : {}),
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] };
  const c = data.candidates?.[0];
  if (c?.finishReason && !['STOP', 'MAX_TOKENS'].includes(c.finishReason)) throw new Error(`Gemini dừng vì ${c.finishReason}`);
  if (c?.finishReason === 'MAX_TOKENS' && opts.schema) throw new Error('Gemini hết chỗ trả lời');
  return (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim() || null;
}

/** Câu ngắn cần nhanh (đáp lời trong cuộc gọi): model nhỏ, không thử lại, quá hạn thì trả null. */
export async function askQuick(system: string, user: string, timeoutMs = 1800): Promise<string | null> {
  if (!hasAI()) return null;
  try {
    if (useGemini()) return await gemini(system, user, { maxTokens: 120, timeoutMs });
    client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 });
    const res = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 80,
      system,
      messages: [{ role: 'user', content: user }],
    }, { timeout: timeoutMs, maxRetries: 0 });
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return text || null;
  } catch (err) {
    console.error('[ai] đáp nhanh lỗi:', (err as Error).message);
    return null;
  }
}

/** Hỏi AI, nhận về JSON đúng schema. Lỗi gì cũng trả null để máy chủ không sập. */
export async function askJSON<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 4000): Promise<T | null> {
  if (!hasAI()) return null;
  try {
    if (useGemini()) {
      const text = await gemini(system, user, { schema, maxTokens, timeoutMs: 60_000 });
      return text ? JSON.parse(text) as T : null;
    }
    client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 });
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      console.error('[ai] không nhận được câu trả lời:', res.stop_reason);
      return null;
    }
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('[ai] lỗi:', (err as Error).message);
    return null;
  }
}
