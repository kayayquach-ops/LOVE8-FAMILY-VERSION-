// Cổng giữ hạn mức Gemini TTS: tối đa N yêu cầu mỗi 60 giây (cửa sổ trượt, xếp ưu tiên), ngân sách mỗi ngày theo giờ Thái Bình Dương,
// và cờ "hết hạn mức" khi gặp 429. Không gọi mạng; nơi dùng đưa hàm gọi vào qua schedule().

export type Reason = 'budget' | 'cooldown' | 'nokey' | 'busy';
export class TtsLimited extends Error {
  constructor(public reason: Reason) { super(`tts ${reason}`); }
}

export type Saved = { day: string; used: number; until: number; why: Reason | null };
export type Store = { load(): Promise<Saved | null>; save(s: Saved): Promise<void> };

type Item = { prio: number; seq: number; fn: () => Promise<unknown>; res: (v: any) => void; rej: (e: unknown) => void; expires: number };

/** Ngày theo múi giờ Thái Bình Dương (đúng lúc Google đặt lại hạn mức theo ngày). */
export function pacificDay(t: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}
/** Thời điểm nửa đêm kế tiếp theo giờ Thái Bình Dương. */
export function nextPacificMidnight(t: number) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(t);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return t + ((23 - n('hour')) * 3600 + (59 - n('minute')) * 60 + (60 - n('second'))) * 1000;
}

/** Ngày theo giờ Việt Nam (UTC+7), dùng cho ngân sách OpenAI. */
export function vnDay(t: number) { return new Date(t + 7 * 3600e3).toISOString().slice(0, 10); }

export class TtsGate {
  now: () => number;
  dayOf: (t: number) => string;
  rpm: number;
  windowMs: number;
  maxWaitMs: number;
  concurrency: number;
  daily: () => number;
  store: Store | null;
  day = '';
  used = 0;
  until = 0;
  why: Reason | null = null;
  stats = { cache: 0, calls: 0, r429: 0, err: 0 };
  private sent: number[] = [];
  private q: Item[] = [];
  private seq = 0;
  private inflight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(o: { now?: () => number; rpm?: number; windowMs?: number; maxWaitMs?: number; concurrency?: number; daily?: () => number; store?: Store | null; dayOf?: (t: number) => string } = {}) {
    this.now = o.now ?? Date.now;
    this.dayOf = o.dayOf ?? pacificDay;
    this.rpm = o.rpm ?? 8;
    this.windowMs = o.windowMs ?? 60_000;
    this.maxWaitMs = o.maxWaitMs ?? 20_000;
    this.concurrency = o.concurrency ?? 2;
    this.daily = o.daily ?? (() => Number(process.env.GEMINI_TTS_DAILY) || 70);
    this.store = o.store ?? null;
  }

  async init() {
    try {
      const s = await this.store?.load();
      if (s) { this.day = s.day; this.used = s.used; this.until = s.until; this.why = s.why; }
    } catch {}
    this.roll();
  }

  private roll() {
    const d = this.dayOf(this.now());
    if (d !== this.day) { this.day = d; this.used = 0; }
    if (this.until && this.now() >= this.until) { this.until = 0; this.why = null; }
  }

  private persist() {
    void this.store?.save({ day: this.day, used: this.used, until: this.until, why: this.why }).catch(() => {});
  }

  limit() { return Math.max(0, Math.floor(this.daily())); }
  remaining() { this.roll(); return Math.max(0, this.limit() - this.used); }

  /** Lý do chưa gọi được ngay bây giờ, hoặc null nếu gọi được. optional: câu không bắt buộc (nạp sẵn, câu đáp) chỉ khi còn trên 30% ngân sách. */
  blocked(optional = false): Reason | null {
    this.roll();
    if (this.until > this.now()) return this.why ?? 'cooldown';
    const left = this.remaining();
    if (left <= 0) return 'budget';
    if (optional && left < this.limit() * 0.3) return 'budget';
    return null;
  }

  status() {
    const reason = this.blocked();
    return { ok: !reason, reason, used: this.used, limit: this.limit(), remaining: this.remaining(), until: this.until, ...this.stats };
  }

  /** Gặp 429: đặt cờ đến lúc đặt lại. Theo ngày thì đến nửa đêm Thái Bình Dương; có RetryInfo thì theo đó; còn lại 10 phút. */
  note429(body: string) {
    this.stats.r429++;
    const t = this.now();
    const perDay = /PerDay|per day|daily/i.test(body);
    const retry = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(body);
    if (perDay) { this.until = nextPacificMidnight(t); this.why = 'budget'; this.used = Math.max(this.used, this.limit()); }
    else {
      const ms = retry ? Math.min(10 * 60_000, Math.max(5_000, Math.ceil(Number(retry[1]) * 1000) + 2_000)) : 10 * 60_000;
      this.until = t + ms;
      this.why = 'cooldown';
    }
    this.persist();
    this.drain(new TtsLimited(this.why));
  }

  /** Chặn thẳng trong ms (nhà cung cấp báo key sai, hết tiền, hoặc giới hạn tốc độ). Các yêu cầu đang xếp hàng bị từ chối. */
  block(ms: number, why: Reason = 'cooldown') {
    this.until = this.now() + ms;
    this.why = why;
    this.persist();
    this.drain(new TtsLimited(why));
  }

  /** Xếp một yêu cầu vào hàng: prio nhỏ chạy trước (0 là cuộc gọi đang diễn ra, 1 là nạp sẵn). Mỗi lần fn chạy tính một lượt ngân sách. */
  schedule<T>(prio: number, fn: () => Promise<T>, optional = false): Promise<T> {
    const why = this.blocked(optional);
    if (why) return Promise.reject(new TtsLimited(why));
    return new Promise<T>((res, rej) => {
      this.q.push({ prio, seq: this.seq++, fn, res, rej, expires: prio === 0 ? this.now() + this.maxWaitMs : Infinity });
      this.pump();
    });
  }

  private drain(err: TtsLimited) {
    const items = this.q.splice(0);
    for (const it of items) it.rej(err);
  }

  private pump() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (;;) {
      const t = this.now();
      for (const it of this.q.filter((x) => x.expires <= t)) { this.q.splice(this.q.indexOf(it), 1); it.rej(new TtsLimited('busy')); }
      if (!this.q.length) return;
      this.sent = this.sent.filter((s) => t - s < this.windowMs);
      if (this.inflight >= this.concurrency) return;
      if (this.sent.length >= this.rpm) {
        const soonest = Math.min(this.sent[0] + this.windowMs + 5, ...this.q.map((x) => x.expires));
        this.timer = setTimeout(() => this.pump(), Math.max(5, soonest - t));
        return;
      }
      this.q.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      const it = this.q.shift()!;
      const why = this.blocked();
      if (why) { it.rej(new TtsLimited(why)); continue; }
      this.used++;
      this.stats.calls++;
      this.sent.push(t);
      this.persist();
      this.inflight++;
      it.fn().then(it.res, it.rej).finally(() => { this.inflight--; this.pump(); });
    }
  }
}
