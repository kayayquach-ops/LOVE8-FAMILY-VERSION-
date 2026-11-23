import { useEffect, useState } from 'react';
import './coupons.css';
import { api } from './api';
import { cached, remember } from './cache';
import { copyText } from './Onboarding';
import { COUPON_CATEGORIES, type Coupon, type CouponCategory } from './shared';
import { fmtDayMonth, t, useLang } from './i18n';
import { tap } from './sound';
import { Doodle, Icon, toast } from './ui';

// Ưu đãi của nhãn hàng (22/11/2026, docs/uu-dai.md), theo trang cá nhân của Olive Young: ô đếm "Ưu đãi N" ở Cài đặt,
// băng rôn "ưu đãi cho gia đình tháng này" khi có ưu đãi, bấm vào là danh sách thẻ vé xé.

const ICON: Record<CouponCategory, string> = { massage: 'chair', health: 'pulse', pharmacy: 'pill', supplement: 'bottle', homecare: 'homecare', other: 'ticket' };

/** Ưu đãi đang dùng được: bản lưu lần trước hiện ngay, máy chủ trả lời thì thay. Ưu đãi có thể theo thứ tiếng nên lưu riêng từng thứ tiếng. null: chưa biết. */
export function useCoupons(): Coupon[] | null {
  const lang = useLang();
  const [list, setList] = useState<Coupon[] | null>(() => cached<Coupon[]>(`coupons:${lang}`));
  useEffect(() => {
    let live = true;
    setList(cached<Coupon[]>(`coupons:${lang}`));
    api.coupons().then((d) => { remember(`coupons:${lang}`, d.coupons); if (live) setList(d.coupons); }).catch(() => {});
    return () => { live = false; };
  }, [lang]);
  return list;
}

/** Ngày theo giờ Việt Nam: hạn dùng ghi "hết ngày đó theo giờ Việt Nam" (scripts/coupons.mjs), xem ở đâu cũng là ngày ấy. */
function vnDay(d: Date) {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d).split('-').map(Number);
  return { m, day, n: Date.UTC(y, m - 1, day) / 864e5 };
}

/** "Hết hạn hôm nay", "Còn 3 ngày" (sắp hết thì đổi màu), hay "Hạn đến 31/12". */
function expiry(iso: string | null): { text: string; soon: boolean } | null {
  if (!iso) return null;
  const end = vnDay(new Date(iso));
  const n = end.n - vnDay(new Date()).n;
  if (n <= 0) return { text: t('coupons.today'), soon: true };
  if (n <= 3) return { text: t('coupons.daysLeft', { n }), soon: true };
  return { text: t('coupons.until', { date: fmtDayMonth(end.day, end.m) }), soon: false };
}

/** Lối vào ở Cài đặt: ô đếm, và băng rôn khi có ưu đãi (nêu ưu đãi hết hạn sớm nhất). */
export function CouponsEntry({ list, onOpen }: { list: Coupon[] | null; onOpen: () => void }) {
  const top = list?.[0];
  return (
    <>
      <button className="panel cp-entry" onClick={onOpen}>
        <Doodle name="ticket" size={28} />
        <span className="cp-entry-name">{t('coupons.title')}</span>
        <b className={`cp-entry-n${list ? '' : ' wait'}`}>{list?.length ?? 0}</b>
        <span className="cp-go"><Icon name="back" size={18} /></span>
      </button>
      {top && (
        <button className="cp-banner fade-only" onClick={onOpen}>
          <span className="cp-banner-text">
            <b className="hand">{t('coupons.banner')}</b>
            <small>{top.brand} · {top.discount}</small>
          </span>
          <Doodle name={ICON[top.category]} size={30} />
        </button>
      )}
    </>
  );
}

function Ticket({ c }: { c: Coupon }) {
  const exp = expiry(c.expiresAt);
  async function copy() {
    tap();
    toast(await copyText(c.code!) ? t('coupons.copied') : t('coupons.code', { code: c.code! }));
  }
  return (
    <article className="cp">
      <div className="cp-body">
        <div className="cp-tags">
          <span className="cp-cat"><Doodle name={ICON[c.category]} size={20} />{t(`coupons.cat.${c.category}`)}</span>
          {c.family && <span className="cp-fam">{t('coupons.family')}</span>}
        </div>
        <div className="cp-main">
          <div className="cp-text">
            <b>{c.brand}</b>
            <p>{c.title}</p>
          </div>
          <div className={`cp-off${c.discount.length > 5 ? ' long' : ''}`}>
            <span>{c.discount}</span>
            <svg viewBox="0 0 64 8" preserveAspectRatio="none" aria-hidden><path d="M2 6C18 2.6 40 2.2 62 4.6" /></svg>
          </div>
        </div>
        {(exp || c.url) && (
          <div className="cp-meta">
            <span className={exp?.soon ? 'soon' : ''}>{exp?.text}</span>
            {c.url && <a className="cp-link" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => tap()}>{t('coupons.open')}<Icon name="back" size={14} /></a>}
          </div>
        )}
      </div>
      {c.code && (
        <>
          <div className="cp-cut" aria-hidden><i /><i /></div>
          <div className="cp-foot">
            <span className="cp-code">{c.code}</span>
            <button className="cp-copy" onClick={() => void copy()}>{t('coupons.copy')}</button>
          </div>
        </>
      )}
    </article>
  );
}

/** Màn danh sách ưu đãi: lọc theo nhóm khi có từ hai nhóm; chưa có ưu đãi thì một câu chờ. */
export function Coupons({ list, onClose }: { list: Coupon[] | null; onClose: () => void }) {
  const [cat, setCat] = useState<CouponCategory | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const all = list ?? [];
  const cats = COUPON_CATEGORIES.filter((k) => all.some((c) => c.category === k));
  // Nhóm đang chọn mà không còn ưu đãi nào (danh sách vừa đổi) thì về "Tất cả".
  const on = cat && cats.includes(cat) ? cat : null;
  const shown = on ? all.filter((c) => c.category === on) : all;
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="back" /></button>
        <div className="sheet-title">{t('coupons.title')}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        {cats.length > 1 && (
          <div className="cp-filter">
            {[null, ...cats].map((k) => (
              <button key={k ?? 'all'} className={`chip ${on === k ? 'on' : ''}`} aria-pressed={on === k}
                onClick={() => { tap(); setCat(k); }}>{k ? t(`coupons.cat.${k}`) : t('coupons.all')}</button>
            ))}
          </div>
        )}
        {list && !all.length && (
          <div className="cp-empty fade-only">
            <Doodle name="ticket" size={64} />
            <p>{t('coupons.empty')}</p>
            <span className="hand">{t('coupons.emptyHand')}</span>
          </div>
        )}
        <div className="cp-list">
          {shown.map((c) => <Ticket key={c.id} c={c} />)}
        </div>
      </div>
    </div>
  );
}
