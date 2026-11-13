// Giới hạn số lần gọi trong một khoảng thời gian, giữ trong bộ nhớ (Railway chạy 1 instance; khởi động lại thì đếm lại từ đầu).
// Mỗi giới hạn có trần theo từng khoá (IP hoặc thành viên) và có thể thêm trần chung cho tất cả, để đổi IP liên tục cũng không quét được.
import type express from 'express';
import { errorBody } from './i18n.ts';

type Bucket = { n: number; reset: number };

export class Limit {
  private buckets = new Map<string, Bucket>();
  private sweepAt = 0;
  constructor(readonly max: number, readonly windowMs: number) {}

  private get(key: string, now: number) {
    if (now > this.sweepAt) {
      for (const [k, b] of this.buckets) if (b.reset <= now) this.buckets.delete(k);
      this.sweepAt = now + this.windowMs;
    }
    const b = this.buckets.get(key);
    return b && b.reset > now ? b : null;
  }

  /** Số giây phải chờ nếu đã hết lượt, còn lượt thì 0. Không tính lượt. */
  wait(key: string, now = Date.now()) {
    const b = this.get(key, now);
    return b && b.n >= this.max ? Math.ceil((b.reset - now) / 1000) : 0;
  }

  /** Tính một lượt. */
  hit(key: string, now = Date.now()) {
    const b = this.get(key, now);
    if (b) b.n++;
    else this.buckets.set(key, { n: 1, reset: now + this.windowMs });
  }

  /** Trả lại một lượt đã tính. */
  refund(key: string, now = Date.now()) {
    const b = this.get(key, now);
    if (b && b.n > 0) b.n--;
  }

  /** Còn lượt thì tính luôn và trả true; hết thì trả false. */
  take(key: string, now = Date.now()) {
    if (this.wait(key, now)) return false;
    this.hit(key, now);
    return true;
  }
}

/** IP người gọi. `trust proxy` (server/index.ts) đặt đúng số tầng proxy của Railway nên req.ip là IP thật từ x-forwarded-for, người gọi không giả được. */
export const ipOf = (req: express.Request) => req.ip || req.socket.remoteAddress || '?';

/**
 * Middleware chặn khi hết lượt, trả 429 kèm Retry-After và mã lỗi `code` (tra bảng chữ máy chủ error.<code>).
 * onlyFailed: chỉ tính lần bị trả lỗi 4xx (ví dụ mã nhà sai), lần đúng được trả lại lượt.
 * Lượt luôn tính ngay khi yêu cầu tới (rồi mới trả lại), để gửi dồn cả trăm yêu cầu cùng lúc cũng không lọt qua.
 */
export function limitBy(opts: { name: string; per: Limit; total?: Limit; key?: (req: express.Request) => string; onlyFailed?: boolean; code?: string }): express.RequestHandler {
  const keyOf = opts.key ?? ipOf;
  return (req, res, next) => {
    const k = keyOf(req);
    const wait = Math.max(opts.per.wait(k), opts.total?.wait('*') ?? 0);
    if (wait) {
      console.warn(`[limit] ${opts.name}: chặn ${k} (${wait} giây)`);
      res.set('Retry-After', String(wait));
      return void res.status(429).json(errorBody(opts.code ?? 'slow_down'));
    }
    opts.per.hit(k);
    opts.total?.hit('*');
    if (opts.onlyFailed) res.on('finish', () => { if (res.statusCode < 400 || res.statusCode >= 500) { opts.per.refund(k); opts.total?.refund('*'); } });
    next();
  };
}
