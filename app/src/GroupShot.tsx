import { useEffect, useId, useState, type ReactNode } from 'react';
import { api } from './api';
import { cityOf, SHOT_CUSTOM_MAX, SHOT_OCCASIONS, thumb, type Me, type Shot, type ShotOccasion, type ShotPart } from './shared';
import { FACE, partOf, seatFont, seatLayout, shortName, shoulders, todaySolar, upcomingOccasion, type Seat } from './shot';
import { cityName, usePlaceNames } from './placeName';
import { localTime } from './time';
import { fmtDayMonth, fmtTime, t } from './i18n';
import { tap } from './sound';
import { Avatar, Icon, toast } from './ui';
import './camera.css';
import './groupshot.css';

// Chụp chung dù ở xa (docs/chup-chung.md, mockup 6 màn): màn chụp chung bốn trạng thái, bảng chọn dịp,
// lớp vẽ đè lên khung ngắm của camera và hình nét tím của từng dịp. Màn luôn tối, dùng bảng màu --cam-* (camera.css).

/** Tên dịp ngắn trên chip: "mâm cơm", "Tết"...; tự viết thì là chữ người dùng viết. */
export const occasionName = (o: ShotOccasion, custom?: string | null) => (o === 'tu-viet' ? custom?.trim() || t('shot.occ.tu-viet') : t(`shot.occ.${o}`));
/** Tiêu đề của lượt chụp: "mâm cơm tối nay", "Tết cả nhà"... */
export const occasionTitle = (o: ShotOccasion, custom?: string | null) => (o === 'tu-viet' ? custom?.trim() || t('shot.occ.tu-viet') : t(`shot.title.${o}`));
/** Dòng viết tay dưới ảnh ghép: "mâm cơm tối 17/11". */
export function occasionCaption(s: Shot) {
  const d = new Date(s.createdAt);
  return t(`shot.caption.${s.occasion}`, { date: fmtDayMonth(d.getDate(), d.getMonth() + 1), text: s.custom?.trim() || t('shot.occ.tu-viet') });
}
export const memberName = (me: Me, id: string) => { const m = me.members.find((x) => x.id === id); return m ? shortName(m.name) : t('common.someone'); };

/** Tên nơi (kèm giờ bên đó) của những người trong lượt chụp, mình trước, mỗi nơi một lần, tối đa ba nơi. */
function places(me: Me, ids: string[], withTime: boolean) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [me.me.id, ...ids.filter((x) => x !== me.me.id)]) {
    const m = me.members.find((x) => x.id === id);
    const c = cityOf(m?.city);
    if (!m?.city || !c) continue;
    const name = cityName(m.city) ?? c.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(withTime ? `${name} ${localTime(m.city) ?? ''}`.trim() : name);
  }
  return out.slice(0, 3).join(' · ');
}

// ---------- Hình nét tím của từng dịp (bảng dịp, chip) ----------
const OCC_ICON: Record<ShotOccasion, ReactNode> = {
  'mam-com': <><path d="M5 20h30a15 13 0 01-30 0z" /><path d="M16 14l3-9M22 14l4-9" /></>,
  tet: <><path d="M20 6l-6 6 2 22h8l2-22z" /><path d="M14 12l-7 8M26 12l7 8" /><path d="M17 6q3 3 6 0" /></>,
  'trung-thu': <><path d="M20 8l3.5 7.5 8 1-6 5.5 1.6 8-7.1-4-7.1 4 1.6-8-6-5.5 8-1z" /><path d="M20 3v5M20 31v6" /></>,
  'sinh-nhat': <><rect x="8" y="20" width="24" height="14" rx="3" /><path d="M8 26q4 3 8 0t8 0 8 0" /><path d="M20 20v-7" /><path d="M20 8q2 2 0 4-2-2 0-4" /></>,
  chuseok: <><circle cx="27" cy="12" r="6" /><path d="M8 34q6-14 12-14t12 14z" /><path d="M14 27h12" /></>,
  'di-choi': <><path d="M6 30q7-6 14 0t14 0" /><path d="M6 24q7-6 14 0t14 0" /><circle cx="28" cy="11" r="4" /></>,
  'tu-viet': <><path d="M9 31l2.5-7.5L26 9l5 5-14.5 14.5z" /><path d="M23 12l5 5" /></>,
};
// Cành mai cho thẻ "sắp Tết rồi" (mockup màn 6).
const BRANCH = <><path d="M6 34C14 26 20 18 34 8" /><path d="M16 24c-4-2-6 1-4 4 3 2 6 0 4-4zM24 16c-4-2-6 1-4 4 3 2 6 0 4-4zM30 10c-3-2-5 1-3 3 2 2 5 0 3-3z" /></>;

export function OccasionIcon({ o, size = 36, branch = false }: { o: ShotOccasion; size?: number; branch?: boolean }) {
  // Cỡ nhỏ trên chip: áo dài trông như mũi tên, nên Tết dùng cành mai.
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={size < 24 ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {branch || (o === 'tet' && size < 24) ? BRANCH : OCC_ICON[o]}
    </svg>
  );
}

// ---------- Lớp vẽ đè lên khung ngắm (mockup màn 1 và 3) ----------
// Toạ độ theo khung 330 x 440 (3:4, đúng tỉ lệ khung ngắm). Khung mặt ở giữa, ghế hai bên, bàn và cảnh của dịp ở đáy.
function star(cx: number, cy: number, R: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + k * Math.cos(a)).toFixed(1)} ${(cy + k * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}
const TRAY = 'M12 404C60 382 270 382 318 404C330 416 324 440 324 440L6 440C6 440 0 416 12 404Z';
const cup = (x: number) => <path d={`M${x} 404c0 10 4 14 10 14s10-4 10-14z`} />;
const blossom = (x: number, y: number) => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="4.5" /><circle className="st-dot" cx={x} cy={y} r="1.2" /></g>;
const SCENE: Record<Exclude<ShotOccasion, 'di-choi'>, ReactNode> = {
  // Mâm cơm: ba bát, đôi đũa (đúng như mockup).
  'mam-com': <><path d="M82 404c2 16 34 16 36 0z" /><path d="M147 398c2 18 34 18 36 0z" /><path d="M212 404c2 16 34 16 36 0z" /><path d="M156 392l16-12M162 394l16-12" /></>,
  // Tết: bánh chưng giữa mâm, đĩa quả, chén trà, hai cành mai từ hai mép.
  tet: <>
    <rect className="st-solid" x="143" y="396" width="44" height="30" rx="2" /><path d="M157 396v30M173 396v30M143 406h44M143 416h44" />
    <path d="M74 420h48" /><circle cx="86" cy="412" r="7" /><circle cx="110" cy="412" r="7" /><circle className="st-solid" cx="98" cy="404" r="7" />
    {cup(218)}{cup(246)}
    <path d="M0 352c24 8 40 20 50 36M330 352c-24 8-40 20-50 36M22 357c2-10 8-16 16-18M308 357c-2-10-8-16-16-18" />
    {[blossom(16, 355), blossom(36, 366), blossom(48, 382), blossom(38, 339), blossom(314, 355), blossom(294, 366), blossom(282, 382), blossom(292, 339)]}
  </>,
  // Trung thu: bánh nướng, chén trà, đèn ông sao cầm tay bên trái.
  'trung-thu': <>
    <path className="st-solid" d="M141 404v10a24 8 0 0048 0v-10" /><ellipse className="st-solid" cx="165" cy="404" rx="24" ry="8" /><ellipse cx="165" cy="404" rx="13" ry="4" />
    <path className="st-solid" d="M90 410v7a16 6 0 0032 0v-7" /><ellipse className="st-solid" cx="106" cy="410" rx="16" ry="6" />
    {cup(226)}
    <path d="M14 440l26-78" /><path className="st-solid" d={star(44, 348, 15, 6.5)} /><path d="M44 363v9" />
  </>,
  // Sinh nhật: bánh kem ba nến, hộp quà, chén.
  'sinh-nhat': <>
    <path className="st-solid" d="M125 402v20a40 8 0 0080 0v-20" /><ellipse className="st-solid" cx="165" cy="402" rx="40" ry="8" />
    <path d="M125 411q5 5 10 0t10 0 10 0 10 0 10 0 10 0 10 0 10 0" />
    <path d="M150 398v-14M165 396v-16M180 398v-14" /><path d="M150 377q4 4 0 7-4-3 0-7zM165 373q4 4 0 7-4-3 0-7zM180 377q4 4 0 7-4-3 0-7z" />
    <rect className="st-solid" x="70" y="402" width="28" height="22" rx="2" /><path d="M84 402v22M70 410h28M84 402c-6-8-12-2 0 0 6-8 12-2 0 0" />
    {cup(238)}
  </>,
  // Chuseok: đĩa bánh songpyeon hình bán nguyệt, hai chén trà.
  chuseok: <>
    <ellipse cx="165" cy="416" rx="58" ry="12" />
    <path className="st-solid" d="M141 408a12 9 0 0124 0zM165 408a12 9 0 0124 0z" />
    <path className="st-solid" d="M129 416a12 9 0 0124 0zM153 416a12 9 0 0124 0zM177 416a12 9 0 0124 0z" />
    {cup(70)}{cup(240)}
  </>,
  // Tự viết: mâm trống, một ngôi sao nhỏ ở giữa.
  'tu-viet': <><path d="M165 394l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" />{cup(100)}{cup(210)}</>,
};
// Đi chơi: không có mâm, là sóng biển, thuyền buồm, mặt trời, chim.
const SEA = <>
  <path className="st-fill" d="M0 410q15-10 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0V440H0z" />
  <path d="M0 410q15-10 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0M0 426q15-10 30 0t30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0 30 0" />
  <path className="st-solid" d="M146 398h38l-7 9h-24z" /><path d="M165 398v-30M167 370l16 24h-16z" />
  <circle cx="290" cy="372" r="9" /><path d="M60 362q5-5 10 0 5-5 10 0M86 352q4-4 8 0 4-4 8 0" />
</>;

function Scene({ o }: { o: ShotOccasion }) {
  return <g className="st-scene">{o === 'di-choi' ? SEA : <><path className="st-fill" d={TRAY} />{SCENE[o]}</>}</g>;
}

function SeatMark({ seat, name, photo, clip }: { seat: Seat; name: string; photo?: string | null; clip: string }) {
  const sh = shoulders(seat);
  const fs = seatFont(name, seat.r);
  const { cx, cy, r } = seat;
  if (photo) {
    // Người đã chụp: ảnh của họ trong đầu tròn viền giấy, vai nét liền, tên trong vai.
    return (
      <g>
        <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
        <circle className="st-solid" cx={cx} cy={cy} r={r} />
        <image href={thumb(photo, 160)} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        <circle className="st-ring" cx={cx} cy={cy} r={r} />
        <path className="st-on" d={sh.d} />
        <text className="st-name on" x={cx} y={+(cy + r * 3.3).toFixed(1)} fontSize={fs}>{name}</text>
      </g>
    );
  }
  return (
    <g>
      <circle className="st-dash" cx={cx} cy={cy} r={r} />
      <path className="st-dash" d={sh.d} />
      <text className="st-name" x={cx} y={+(cy + fs * 0.33).toFixed(1)} fontSize={fs}>{name}</text>
    </g>
  );
}

export type StencilSeat = { name: string; photo?: string | null };
/** Lớp vẽ trên khung ngắm: khung mặt nét đứt ở giữa, ghế của từng người (1 đến 3), mâm hoặc cảnh theo dịp ở đáy. */
export function ShotStencil({ occasion, seats }: { occasion: ShotOccasion; seats: StencilSeat[] }) {
  const uid = useId().replace(/[^\w-]/g, '');
  const layout = seatLayout(seats.length);
  return (
    <svg className="shot-stencil" viewBox="0 0 330 440" aria-hidden="true">
      <ellipse className="st-face" cx={FACE.cx} cy={FACE.cy} rx={FACE.rx} ry={FACE.ry} />
      {layout.map((s, i) => <SeatMark key={i} seat={s} name={seats[i].name} photo={seats[i].photo} clip={`st${uid}${i}`} />)}
      <Scene o={occasion} />
    </svg>
  );
}

// ---------- Bảng chọn dịp (mockup màn 6) ----------
export function OccasionPicker({ me, value, custom, onPick, onClose }: {
  me: Me; value?: ShotOccasion; custom?: string | null; onPick: (o: ShotOccasion, custom?: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(value === 'tu-viet' ? custom ?? '' : '');
  const titleId = useId(), inputId = useId();
  // Đang ở Hàn thì rằm tháng 8 gợi ý Chuseok, ở nơi khác là Trung thu.
  const soon = upcomingOccasion(todaySolar(), cityOf(me.me.city)?.tz === 'Asia/Seoul');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const pick = (o: ShotOccasion, c?: string) => { tap(); onPick(o, c); };
  const soonName = soon ? t(`shot.occ.${soon.occasion}`) : '';

  return (
    <div className="cam-ui shot-pick-wrap" onClick={onClose}>
      <section className="shot-pick" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <span className="shot-grab" aria-hidden="true" />
        <div className="shot-pick-head">
          <h2 id={titleId}>{t('shot.picker.title')}</h2>
          <button className="gs-round" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
        {soon && (
          <button className="shot-soon" onClick={() => pick(soon.occasion)}>
            <OccasionIcon o={soon.occasion} size={34} branch={soon.occasion === 'tet'} />
            <span>
              <b>{t(soon.days ? 'shot.soon.title' : 'shot.soon.today', { name: soonName })}</b>
              <span className="hand">{soon.days ? t('shot.soon.days', { n: soon.days, name: soonName }) : t('shot.soon.now', { name: soonName })}</span>
            </span>
          </button>
        )}
        <div className="shot-grid">
          {SHOT_OCCASIONS.map((o) => (
            <button key={o} className={o === value ? 'on' : ''} aria-pressed={o === value} onClick={() => pick(o)}>
              <OccasionIcon o={o} size={36} />
              <span><b>{t(`shot.occ.${o}`)}</b><small>{t(`shot.sub.${o}`)}</small></span>
            </button>
          ))}
        </div>
        <form className="shot-custom" onSubmit={(e) => { e.preventDefault(); const s = text.trim(); if (s) pick('tu-viet', s); }}>
          <label htmlFor={inputId}>{t('shot.picker.custom')}</label>
          <div className="shot-custom-row">
            <input id={inputId} value={text} maxLength={SHOT_CUSTOM_MAX} onChange={(e) => setText(e.target.value)} placeholder={t('shot.picker.placeholder')} enterKeyHint="done" autoComplete="off" />
            {text.trim() && <button type="submit" className="shot-ok">{t('shot.picker.ok')}</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

// ---------- Màn chụp chung: chờ, đang rửa, xong, lỗi ----------
const ROT = [-4, 2, -1.5, 3];
const DROP = [0, 18, 4, 12];

function Pola({ part, name, tz, i }: { part: ShotPart; name: string; tz?: string; i: number }) {
  const when = part.at && Date.now() - new Date(part.at).getTime() < 120e3 ? t('time.justNow') : part.at ? fmtTime(new Date(part.at), tz) : '';
  return (
    <figure className={`gs-pola ${part.media ? '' : 'wait'}`} style={{ '--rot': `${ROT[i % 4]}deg`, marginTop: DROP[i % 4] } as React.CSSProperties}>
      {part.media ? <img src={thumb(part.media, 360)} alt={t('shot.photoOf', { name })} decoding="async" /> : <span className="gs-pola-empty"><Icon name="hourglass" /></span>}
      <figcaption><span className="hand">{name}</span><small>{part.media ? when : t('shot.waitingFor')}</small></figcaption>
    </figure>
  );
}

/** Tấm ảnh lấy liền đang rửa: bóng người mờ hiện dần (chỉ opacity). */
function DevArt({ n }: { n: number }) {
  const k = Math.max(2, Math.min(4, n));
  const s = k > 3 ? 24 / 28 : 1;
  return (
    <svg className="gs-dev-art" viewBox="0 0 268 300" aria-hidden="true">
      {Array.from({ length: k }, (_, i) => {
        const cx = (268 * (i + 1)) / (k + 1), cy = 124 + (i % 2 ? 8 : -2);
        const x = (d: number) => (cx + d * s).toFixed(1), y = (d: number) => (cy + d * s).toFixed(1);
        return (
          <g key={i} className={`gs-sil s${i}`}>
            <circle cx={cx.toFixed(1)} cy={cy} r={28 * s} />
            <path d={`M${x(-46)} 262C${x(-42)} ${y(70)} ${x(-22)} ${y(46)} ${x(0)} ${y(46)}C${x(22)} ${y(46)} ${x(42)} ${y(70)} ${x(46)} 262Z`} />
          </g>
        );
      })}
      <ellipse className="gs-sil-table" cx="134" cy="290" rx="150" ry="34" />
    </svg>
  );
}

/** Hàng ảnh thật của những người đã chụp. */
function RealRow({ me, parts }: { me: Me; parts: ShotPart[] }) {
  if (!parts.length) return null;
  return (
    <div className="gs-real">
      <span>{t('shot.real')}</span>
      {parts.map((p) => <img key={p.memberId} src={thumb(p.media, 160)} alt={t('shot.realOf', { name: memberName(me, p.memberId) })} decoding="async" />)}
    </div>
  );
}

/** Màn chụp chung. Hỏi lại máy chủ mỗi 3 giây khi đang chờ hoặc đang rửa. onJoin: mình chưa chụp, quay về camera để chụp phần mình. */
export function GroupShot({ me, shot: first, onClose, onChange, onJoin, onFeed }: {
  me: Me; shot: Shot; onClose: () => void; onChange: (s: Shot) => void; onJoin: (s: Shot) => void; onFeed: (postId: string) => void;
}) {
  usePlaceNames();
  const [shot, setShot] = useState(first);
  const [busy, setBusy] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);
  const [picking, setPicking] = useState(false);
  const [, tick] = useState(0);
  const titleId = useId();
  const live = shot.status === 'waiting' || shot.status === 'developing';

  const update = (s: Shot) => setShot((prev) => (JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
  useEffect(() => { onChange(shot); }, [shot]);
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => { if (!document.hidden) void api.shot(shot.id).then((r) => update(r.shot)).catch(() => {}); }, 3000);
    return () => clearInterval(iv);
  }, [shot.id, live]);
  // Giờ hai nơi chạy đúng: lúc đang chờ thì vẽ lại nửa phút một lần.
  useEffect(() => {
    if (shot.status !== 'waiting') return;
    const iv = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 30000);
    return () => clearInterval(iv);
  }, [shot.status]);

  async function act(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      // Lỗi máy chủ (lời báo đã đúng thứ tiếng). Vừa nhắc chưa đủ 10 phút (429) thì coi như đã nhắc; lượt đã đổi (409) thì hỏi lại ngay.
      const status = (e as { status?: number }).status;
      if (name === 'nudge' && status === 429) setNudged(true);
      if (status === 409) void api.shot(shot.id).then((r) => update(r.shot)).catch(() => {});
      toast((e as Error).message);
    } finally { setBusy(null); }
  }
  const nudge = () => act('nudge', async () => { await api.shotNudge(shot.id); tap(); setNudged(true); toast(t('shot.nudged')); });
  const develop = () => act('develop', async () => { tap(); update((await api.shotDevelop(shot.id)).shot); });
  const redo = (o?: ShotOccasion, custom?: string) => act('redo', async () => {
    tap();
    update((await api.shotRedo(shot.id, o ? { occasion: o, ...(o === 'tu-viet' ? { custom } : {}) } : {})).shot);
  });
  const post = () => act('post', async () => { const r = await api.shotPost(shot.id); tap(); toast(t('shot.posted')); update({ ...shot, postId: r.postId }); });

  const mine = partOf(shot, me.me.id);
  const others = shot.parts.filter((p) => p.memberId !== me.me.id);
  const shotParts = shot.parts.filter((p) => p.media);
  const late = others.filter((p) => !p.media);
  const lateNames = late.map((p) => memberName(me, p.memberId)).join(', ');
  const tzOf = (id: string) => cityOf(me.members.find((m) => m.id === id)?.city)?.tz;
  const ids = shot.parts.map((p) => p.memberId);
  const caption = occasionCaption(shot);

  let body: ReactNode;
  if (shot.status === 'waiting') {
    const where = places(me, ids, true);
    body = (
      <>
        <div className="gs-top"><button className="gs-round" onClick={onClose} aria-label={t('shot.back')}><Icon name="back" /></button></div>
        <div className="gs-head">
          <h1 id={titleId} className="gs-title">{occasionTitle(shot.occasion, shot.custom)}</h1>
          {where && <p className="hand">{where}</p>}
        </div>
        <div className="gs-polas">
          {shot.parts.map((p, i) => <Pola key={p.memberId} part={p} name={memberName(me, p.memberId)} tz={tzOf(p.memberId)} i={i} />)}
        </div>
        {others.length > 0 && (
          <ul className="gs-list">
            {others.map((p) => {
              const name = memberName(me, p.memberId);
              return (
                <li key={p.memberId}>
                  <Avatar m={me.members.find((m) => m.id === p.memberId)} size={32} />
                  <span>{p.media ? t('shot.didShoot', { name }) : t('shot.notYet', { name })}</span>
                  {p.media && <span className="gs-tick"><Icon name="check" /></span>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="hand gs-note">{t('shot.auto')}</p>
        <div className="gs-actions">
          {!mine?.media
            ? <button className="gs-main" onClick={() => onJoin(shot)}>{t('shot.joinMine')}</button>
            : late.length > 0 && (
              <button className="gs-main" onClick={nudge} disabled={!!busy || nudged}>
                <Icon name="bell" />{nudged ? t('shot.nudged') : t('shot.nudge', { names: lateNames })}
              </button>
            )}
          {shotParts.length >= 2 && late.length > 0 && (
            <button className="gs-link" onClick={develop} disabled={!!busy}>{t('shot.developNow', { names: lateNames })}</button>
          )}
        </div>
      </>
    );
  } else if (shot.status === 'developing') {
    body = (
      <>
        <div className="gs-top end"><button className="gs-round" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button></div>
        <div className="gs-dev">
          <div className="gs-faces">
            {shotParts.map((p) => <img key={p.memberId} src={thumb(p.media, 160)} alt={t('shot.photoOf', { name: memberName(me, p.memberId) })} decoding="async" />)}
          </div>
          <svg className="gs-flow" viewBox="0 0 120 34" aria-hidden="true"><path d="M22 2C30 18 48 26 58 30M60 2v28M98 2C90 18 72 26 62 30" /></svg>
          <figure className="gs-print">
            <div className="gs-print-img"><DevArt n={shotParts.length} /></div>
            <figcaption className="hand">{caption}</figcaption>
          </figure>
          <div className="gs-dev-txt">
            <h1 id={titleId}><Icon name="sparkle" />{t('shot.developing')}</h1>
            <p className="hand">{t('shot.developingSub')}</p>
          </div>
        </div>
      </>
    );
  } else if (shot.status === 'done' && shot.result) {
    body = (
      <>
        <div className="gs-top between">
          <h1 id={titleId} className="gs-title sm">{t('shot.done.title')}</h1>
          <button className="gs-round" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
        <div className="gs-result">
          <img src={thumb(shot.result, 1080)} alt={caption} decoding="async" />
          <span className="gs-ai"><Icon name="sparkle" />{t('shot.aiLabel')}</span>
        </div>
        <div className="gs-meta"><span className="hand">{caption}</span><small>{places(me, ids, false)}</small></div>
        <RealRow me={me} parts={shotParts} />
        <div className="gs-actions">
          {shot.postId
            ? <button className="gs-main" onClick={() => onFeed(shot.postId!)}>{t('shot.openFeed')}</button>
            : <button className="gs-main" onClick={post} disabled={!!busy}><Icon name="send" />{t('shot.post')}</button>}
          <div className="gs-pair">
            <button className="gs-ghost" onClick={() => redo()} disabled={!!busy}>{t('shot.redo')}</button>
            <button className="gs-ghost" onClick={() => setPicking(true)} disabled={!!busy}>{t('shot.change')}</button>
          </div>
        </div>
      </>
    );
  } else {
    // Lỗi (hoặc "xong" mà không có ảnh): câu ngắn theo lỗi, thử lại hoặc đổi dịp.
    body = (
      <>
        <div className="gs-top end"><button className="gs-round" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button></div>
        <div className={`gs-fail ${shot.result ? 'sm' : ''}`}>
          <h1 id={titleId} className="gs-title">{t(`shot.fail.${shot.error ?? 'error'}`)}</h1>
          <p className="hand">{caption}</p>
        </div>
        {/* Rửa lại mà lỗi thì máy chủ giữ ảnh ghép lần trước: vẫn cho xem. */}
        {shot.result && (
          <div className="gs-result is-old">
            <img src={thumb(shot.result, 1080)} alt={caption} decoding="async" />
            <span className="gs-ai"><Icon name="sparkle" />{t('shot.aiLabel')}</span>
          </div>
        )}
        <RealRow me={me} parts={shotParts} />
        <div className="gs-actions">
          <button className="gs-main" onClick={() => redo()} disabled={!!busy}>{t('shot.retry')}</button>
          <button className="gs-ghost" onClick={() => setPicking(true)} disabled={!!busy}>{t('shot.change')}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`cam-ui shot-screen is-${shot.status}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>{body}</div>
      {picking && <OccasionPicker me={me} value={shot.occasion} custom={shot.custom} onClose={() => setPicking(false)} onPick={(o, c) => { setPicking(false); void redo(o, c); }} />}
    </>
  );
}
