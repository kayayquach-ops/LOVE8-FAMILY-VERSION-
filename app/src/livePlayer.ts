// Giọng Mây trong cuộc gọi Live (src/CallLive.tsx): từng mẩu PCM 24 kHz 16 bit Gemini gửi về xếp nối đuôi nhau, bị ngắt lời thì bỏ hết phần còn chờ.
// Chép từ voicePlayer của gọi Nếp (topik-app/prototype/call.js), bỏ phần đọc câu tiếng Hàn (stream, clip, hold, stopVoice).

export type LivePlayer = {
  /** Xếp một mẩu tiếng (base64) sau phần đang phát. */
  play(b64: string): void;
  /** Dừng ngay, bỏ mọi mẩu đang chờ. */
  stop(): void;
  /** Lúc phần đã xếp phát hết (giây theo đồng hồ AudioContext). */
  mark(): number;
  /** Còn tiếng đang phát hay đang chờ. */
  readonly talking: boolean;
  /** Âm lượng đang phát (RMS, khoảng 0 tới 0,3) để linh vật mở miệng theo. */
  level(): number;
};

export function livePlayer(ctx: AudioContext): LivePlayer {
  const out = ctx.createGain(), meter = ctx.createAnalyser();
  meter.fftSize = 512;
  out.connect(meter);
  meter.connect(ctx.destination);
  const live = new Set<AudioBufferSourceNode>(), wave = new Uint8Array(512);
  let at = 0;
  const queue = (d: Float32Array) => {
    const buf = ctx.createBuffer(1, d.length, 24000);
    buf.getChannelData(0).set(d);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    at = Math.max(at, ctx.currentTime + 0.05);
    src.start(at);
    at += buf.duration;
    live.add(src);
    src.onended = () => { live.delete(src); };
  };
  return {
    play(b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      queue(Float32Array.from(pcm, (v) => v / 32768));
    },
    stop() {
      for (const s of live) { try { s.stop(); } catch { /* đã dừng */ } }
      live.clear();
      at = 0;
    },
    mark() { return Math.max(at, ctx.currentTime); },
    get talking() { return live.size > 0; },
    level() {
      meter.getByteTimeDomainData(wave);
      let sum = 0;
      for (const v of wave) sum += ((v - 128) / 128) ** 2;
      return Math.sqrt(sum / wave.length);
    },
  };
}
