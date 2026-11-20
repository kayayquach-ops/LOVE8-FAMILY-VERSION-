// Token Gemini Live của một cuộc gọi, cộng ở máy khách từ usageMetadata rồi gửi máy chủ ghi tiền (server/calllive.ts cleanUsage, callUsd).
// Live gửi usageMetadata mỗi lần sinh một câu đáp (mỗi câu đáp tính lại cả ngữ cảnh làm prompt). Chép từ gọi Nếp (topik-app/prototype/call.js addUsage).

export type LiveUsage = Record<'n' | 'prompt' | 'response' | 'total' | 'cached' | 'thoughts' | 'tool' | 'inText' | 'inAudio' | 'outText' | 'outAudio', number>;

export function emptyUsage(): LiveUsage {
  return { n: 0, prompt: 0, response: 0, total: 0, cached: 0, thoughts: 0, tool: 0, inText: 0, inAudio: 0, outText: 0, outAudio: 0 };
}

const FIELDS = [['prompt', 'promptTokenCount'], ['response', 'responseTokenCount'], ['total', 'totalTokenCount'],
  ['cached', 'cachedContentTokenCount'], ['thoughts', 'thoughtsTokenCount'], ['tool', 'toolUsePromptTokenCount']] as const;

/** Cộng một usageMetadata vào t: mỗi lần một lượt (n), tách chữ và tiếng theo hai chiều vào, ra. Số rác là 0. */
export function addUsage(t: LiveUsage, u: any): void {
  t.n++;
  for (const [k, f] of FIELDS) t[k] += +u?.[f] || 0;
  for (const [side, list] of [['in', u?.promptTokensDetails], ['out', u?.responseTokensDetails]] as const) {
    for (const d of Array.isArray(list) ? list : []) {
      if (d?.modality === 'TEXT' || d?.modality === 'AUDIO') t[`${side}${d.modality === 'TEXT' ? 'Text' : 'Audio'}` as keyof LiveUsage] += +d.tokenCount || 0;
    }
  }
}
