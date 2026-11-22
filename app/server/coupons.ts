// Ưu đãi của nhãn hàng (22/11/2026, ghi chú app/docs/uu-dai.md): coupon, mã giảm giá liên quan tới chăm sóc gia đình và bố mẹ.
// Bảng brand_coupons không trỏ tới nhà hay người nào: mọi người đã đăng nhập thấy cùng một danh sách.
// Không có màn quản trị: thêm, tắt bằng scripts/coupons.mjs hoặc SQL. Chưa có hợp tác thật thì không ghi tên nhãn hàng thật.
//
// GET /api/coupons (gắn sau auth, chỉ đọc): ưu đãi đang bật, còn hạn, đúng thứ tiếng người xem (lang trống là mọi thứ tiếng),
// hết hạn sớm nhất lên trước. Bảng chỉ vài chục dòng nên đọc hết rồi lọc ở pickCoupons (hàm thuần, có test).
import express from 'express';
import { pool } from './db.ts';
import { errorBody, reqLang, type Lang } from './i18n.ts';
import { COUPON_CATEGORIES, type Coupon, type CouponCategory } from '../src/shared.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// audience: 'all' (mọi người) hoặc 'family' (chỉ gói gia đình). expires_at trống: không hết hạn. lang trống: mọi thứ tiếng.
export async function migrateCoupons(db: Db = pool) {
  await db.query(`
    create table if not exists brand_coupons (
      id text primary key, brand text not null, category text not null, title text not null, discount text not null,
      code text, url text, expires_at timestamptz, audience text not null default 'all', lang text,
      active boolean not null default true, created_at timestamptz not null default now()
    );
  `);
}

export const COUPONS_SQL = 'select id, brand, category, title, discount, code, url, expires_at, audience, lang, active, created_at from brand_coupons';

export type CouponRow = {
  id: string; brand: string; category: string; title: string; discount: string; code: string | null; url: string | null;
  expires_at: Date | string | null; audience: string; lang: string | null; active: boolean; created_at: Date | string;
};

/** Chỉ link http, https: link khác (javascript:, tệp...) không đưa ra app. */
export function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch { return null; }
}

const time = (v: Date | string | null) => (v == null ? null : new Date(v).getTime());

/** Ưu đãi cho người xem bằng thứ tiếng lang lúc now: đang bật, còn hạn, đúng thứ tiếng; hết hạn sớm nhất trước, không hạn sau cùng, cùng hạn thì mới thêm trước. */
export function pickCoupons(rows: CouponRow[], lang: Lang, now = Date.now()): Coupon[] {
  return rows
    .filter((r) => r.active && (r.expires_at == null || time(r.expires_at)! > now) && (!r.lang || r.lang === lang))
    .sort((a, b) => (time(a.expires_at) ?? Infinity) - (time(b.expires_at) ?? Infinity) || time(b.created_at)! - time(a.created_at)!)
    .map((r) => ({
      id: r.id,
      brand: r.brand,
      category: (COUPON_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as CouponCategory) : 'other',
      title: r.title,
      discount: r.discount,
      code: r.code?.trim() || null,
      url: httpUrl(r.url),
      expiresAt: r.expires_at == null ? null : new Date(r.expires_at).toISOString(),
      family: r.audience === 'family',
    }));
}

const h = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => (req: express.Request, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

/** Gắn sau auth. */
export function couponsRouter(db: Db = pool) {
  const r = express.Router();
  r.get('/coupons', h(async (_req, res) => {
    const { rows } = await db.query(COUPONS_SQL);
    res.json({ coupons: pickCoupons(rows, reqLang()) });
  }));
  return r;
}
