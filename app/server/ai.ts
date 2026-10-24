// Gọi Claude từ máy chủ. Không có ANTHROPIC_API_KEY thì trả null, nơi gọi tự dùng bản soạn sẵn.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
let client: Anthropic | null = null;

export const hasAI = () => !!process.env.ANTHROPIC_API_KEY;

/** Câu ngắn cần nhanh (đáp lời trong cuộc gọi): model nhỏ, không thử lại, quá hạn thì trả null. */
export async function askQuick(system: string, user: string, timeoutMs = 1800): Promise<string | null> {
  if (!hasAI()) return null;
  try {
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

/** Hỏi Claude, nhận về JSON đúng schema. Lỗi gì cũng trả null để máy chủ không sập. */
export async function askJSON<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 4000): Promise<T | null> {
  if (!hasAI()) return null;
  try {
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
