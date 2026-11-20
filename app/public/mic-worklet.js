// Micro hạ xuống PCM 16 kHz 16 bit, mỗi mẩu 40 ms; lấy trung bình từng bước để khỏi méo tiếng (aliasing).
// Nạp bởi src/CallLive.tsx bằng audioWorklet.addModule('/mic-worklet.js'). Chép từ gọi Nếp (topik-app/prototype/mic-worklet.js).
registerProcessor('sh-mic', class extends AudioWorkletProcessor {
  constructor() { super(); this.step = sampleRate / 16000; this.acc = 0; this.sum = 0; this.n = 0; this.out = []; }
  process([input]) {
    const ch = input[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.n++; this.acc++;
      if (this.acc >= this.step) {
        const s = Math.max(-1, Math.min(1, this.sum / this.n));
        this.out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
        this.acc -= this.step; this.sum = 0; this.n = 0;
      }
    }
    if (this.out.length >= 640) { const b = Int16Array.from(this.out).buffer; this.port.postMessage(b, [b]); this.out = []; }
    return true;
  }
});
