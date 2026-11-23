// Ưu đãi của nhãn hàng (22/11/2026, ghi chú app/docs/uu-dai.md): coupon, mã giảm giá liên quan tới chăm sóc gia đình và bố mẹ.
// Bảng brand_coupons không trỏ tới nhà hay người nào: mọi người đã đăng nhập thấy cùng một danh sách.
// Không có màn quản trị: thêm, tắt bằng scripts/coupons.mjs hoặc SQL. Chưa có hợp tác thật thì không ghi tên nhãn hàng thật.
//
// GET /api/coupons (gắn sau auth, chỉ đọc): ưu đãi đang bật, còn hạn, đúng thứ tiếng người xem (lang trống là mọi thứ tiếng),
// hết hạn sớm nhất lên trước. Bảng chỉ vài chục dòng nên đọc hết rồi lọc ở pickCoupons (hàm thuần, có test).
// Quà mốc của lọ sao (23/11/2026, app/docs/lo-moc.md): min_stars > 0 thì chỉ hiện khi tổng sao của nhà người xem đã tới min_stars.
// Lọ sao (/api/jar) hỏi giftMilestones để chỉ nói "có quà nhỏ" khi kho thật sự có ưu đãi cho mốc đó.
import express from 'express';
import { pool } from './db.ts';
import { errorBody, reqLang, type Lang } from './i18n.ts';
import { familyStars } from './missions.ts';
import { COUPON_CATEGORIES, type Coupon, type CouponCategory } from '../src/shared.ts';

type Db = { query: (sql: string, args?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// audience: 'all' (mọi người) hoặc 'family' (chỉ gói gia đình). expires_at trống: không hết hạn. lang trống: mọi thứ tiếng.
// min_stars: 0 là ưu đãi thường; bằng một mốc lọ sao (JAR_MILESTONES) là quà của mốc đó. Cột thêm 23/11/2026 cho bảng đã có.
export async function migrateCoupons(db: Db = pool) {
  await db.query(`
    create table if not exists brand_coupons (
      id text primary key, brand text not null, category text not null, title text not null, discount text not null,
      code text, url text, expires_at timestamptz, audience text not null default 'all', lang text,
      active boolean not null default true, created_at timestamptz not null default now()
    );
    alter table brand_coupons add column if not exists min_stars int not null default 0;
  `);
}

export const COUPONS_SQL = 'select id, brand, category, title, discount, code, url, expires_at, audience, lang, active, created_at, min_stars from brand_coupons';

export type CouponRow = {
  id: string; brand: string; category: string; title: string; discount: string; code: string | null; url: string | null;
  expires_at: Date | string | null; audience: string; lang: string | null; active: boolean; created_at: Date | string; min_stars: number;
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
const minStars = (r: CouponRow) => Math.max(0, Number(r.min_stars) || 0);
/** Đang bật, còn hạn, đúng thứ tiếng (chưa xét sao). */
const usable = (r: CouponRow, lang: Lang, now: number) =>
  r.active && (r.expires_at == null || time(r.expires_at)! > now) && (!r.lang || r.lang === lang);

/** Ưu đãi cho người xem bằng thứ tiếng lang lúc now, nhà có stars sao: đang bật, còn hạn, đúng thứ tiếng, min_stars đã tới
 *  (không truyền stars thì như nhà 0 sao: quà mốc không hiện). Hết hạn sớm nhất trước, không hạn sau cùng, cùng hạn thì mới thêm trước. */
export function pickCoupons(rows: CouponRow[], lang: Lang, now = Date.now(), stars = 0): Coupon[] {
  return rows
    .filter((r) => usable(r, lang, now) && minStars(r) <= stars)
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
      milestone: minStars(r) || null,
    }));
}

/** Các mốc lọ sao đang có quà trong kho cho người xem bằng thứ tiếng lang (kể cả mốc nhà chưa tới), tăng dần, không trùng. */
export function giftMilestones(rows: CouponRow[], lang: Lang, now = Date.now()): number[] {
  const out = new Set(rows.filter((r) => minStars(r) > 0 && usable(r, lang, now)).map(minStars));
  return [...out].sort((a, b) => a - b);
}

const h = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => (req: express.Request, res: express.Response) =>
  fn(req, res).catch((err: Error) => {
    console.error(err);
    res.status(500).json(errorBody('server'));
  });

/** Gắn sau auth. */
export function couponsRouter(db: Db = pool) {
  const r = express.Router();
  r.get('/coupons', h(async (req, res) => {
    const [{ rows }, stars] = await Promise.all([db.query(COUPONS_SQL), familyStars((req as any).member.family_id, db)]);
    res.json({ coupons: pickCoupons(rows, reqLang(), Date.now(), stars) });
  }));
  return r;
}
