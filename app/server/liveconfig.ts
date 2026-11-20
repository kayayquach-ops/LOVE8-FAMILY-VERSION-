// Cấu hình Mây Live (cuộc gọi nói thẳng với Gemini Live), đọc từ biến môi trường. Không import gì để may.ts, index.ts dùng nhẹ.
// MAY_LIVE=off (hay 0) là công tắc tắt cả máy chủ; thiếu GEMINI_API_KEY cũng là tắt. Chi tiết: docs/may-moi.md mục "Mây Live (thử)".

export type LiveConfig = { on: boolean; model: string; voice: string; silenceMs: number; ctxTrigger: number; ctxTarget: number; callMaxSec: number; dailyMin: number };

/** Số dương đọc từ biến; trống hay hỏng thì mặc định. */
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : d;
};

export function liveConfig(env: NodeJS.ProcessEnv = process.env): LiveConfig {
  const off = ['off', '0'].includes(String(env.MAY_LIVE ?? '').trim().toLowerCase());
  return {
    on: !off && !!String(env.GEMINI_API_KEY ?? '').trim(),
    model: 'models/' + (env.GEMINI_LIVE_MODEL || 'gemini-3.8-live'),
    voice: env.MAY_LIVE_VOICE || env.GEMINI_VOICE || 'Zephyr',
    // Im chừng này mili giây thì Gemini coi là người nghe nói xong.
    silenceMs: num(env.MAY_LIVE_SILENCE_MS, 1600),
    // Ngữ cảnh quá trigger token thì bỏ lượt cũ tới còn target (lời dặn luôn giữ): mỗi câu đáp tính tiền lại cả ngữ cảnh.
    ctxTrigger: num(env.MAY_LIVE_CTX_TRIGGER, 12000),
    ctxTarget: num(env.MAY_LIVE_CTX_TARGET, 7000),
    // Trần một cuộc gọi (giây) và trần cả máy chủ mỗi ngày giờ Việt Nam (phút). 540 vì Google đóng mỗi kết nối Live sau chừng 600 giây (goAway) và
    // chưa nối lại phiên: nhắc còn hai phút ở giây 420 và cúp ở 540, cả hai trước lúc ấy.
    callMaxSec: num(env.MAY_CALL_MAX_SEC, 540),
    dailyMin: num(env.MAY_LIVE_DAILY_MIN, 120),
  };
}
