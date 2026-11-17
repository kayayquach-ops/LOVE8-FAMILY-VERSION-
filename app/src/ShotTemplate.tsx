import { useId, type ReactNode } from 'react';
import { thumb, type ShotOccasion } from './shared';
import { FACE, seatFont, seatLayout, shoulders, type Seat } from './shot';

// Khung mẫu của từng dịp cho chụp chung (18/11: người dùng thử trên iPhone, khung nét mờ cũ không ra "mẫu").
// Như khung chụp ảnh lấy liền: trang trí ở mép trên và đáy, giữa để trống cho mặt và ghế của từng người.
// Nét viền mực tím (--cam-hand), tô phẳng màu ấm như hình dán (stickers.tsx). Toạ độ theo khung 330 x 440 (3:4, đúng tỉ lệ khung ngắm):
// khung mặt chiếm x 91..239, y 104..288; ghế hai bên tới y 330; mép trên y < 90 và đáy y > 345 là chỗ của trang trí.
// Dùng ở ba nơi: đè lên khung ngắm (live), ô xem trước trong bảng dịp (mini), ảnh dự kiến ở màn chờ (card, ghế có ảnh thật).

function star(cx: number, cy: number, R: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + k * Math.cos(a)).toFixed(1)} ${(cy + k * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}
/** Hoa năm cánh: cánh tròn quanh nhuỵ (mai vàng, đào hồng). */
function flower(x: number, y: number, r: number, fill: string, core: string) {
  return (
    <g key={`f${x}-${y}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <circle key={i} className="st-thin" cx={(x + Math.cos(a) * r * 0.6).toFixed(1)} cy={(y + Math.sin(a) * r * 0.6).toFixed(1)} r={(r * 0.5).toFixed(1)} fill={fill} />;
      })}
      <circle className="st-nos" cx={x} cy={y} r={(r * 0.3).toFixed(1)} fill={core} />
    </g>
  );
}
/** Cành cây: nét mực tím to bên dưới, nét nâu bên trên. */
const wood = (d: string) => <><path className="st-ink-w" d={d} /><path className="st-wood" d={d} /></>;
/** Mây: đáy phẳng từ x tới x + w ở độ cao y, các bướu tròn ở trên. */
function cloud(x: number, y: number, w: number, fill: string) {
  const h = w * 0.42, f = (n: number) => n.toFixed(1);
  return <path d={`M${x} ${y}h${w}a${f(h * 0.5)} ${f(h * 0.5)} 0 0 0 ${f(-w * 0.22)} ${f(-h * 0.55)}a${f(h * 0.6)} ${f(h * 0.6)} 0 0 0 ${f(-w * 0.38)} ${f(-h * 0.25)}a${f(h * 0.45)} ${f(h * 0.45)} 0 0 0 ${f(-w * 0.3)} ${f(h * 0.35)}a${f(h * 0.35)} ${f(h * 0.35)} 0 0 0 ${f(-w * 0.1)} ${f(h * 0.45)}z`} fill={fill} />;
}
/** Sóng: đỉnh ở y, phía dưới tô kín tới đáy khung. */
const waves = (y: number, amp: number, fill: string) => <path d={`M-10 ${y}q20 ${-amp} 40 0${' t40 0'.repeat(9)}V440H-10z`} fill={fill} />;
/** Lấp lánh bốn cánh. */
const sparkle = (x: number, y: number, s: number, fill: string) => (
  <path key={`s${x}-${y}`} d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`} fill={fill} />
);
/** Đèn ông sao treo bằng dây từ mép trên. */
const lantern = (x: number, y: number, R: number, fill: string, inner: string) => (
  <g key={`l${x}`}>
    <path className="st-thin" d={`M${x} -2V${y - R}`} />
    <path d={star(x, y, R, R * 0.48)} fill={fill} />
    <path className="st-thin" d={star(x, y, R * 0.45, R * 0.22)} fill={inner} />
    <path className="st-tassel" d={`M${x} ${y + R * 0.45}v${R * 0.9}M${x - 3} ${y + R * 0.5}l-3 ${R * 0.75}M${x + 3} ${y + R * 0.5}l3 ${R * 0.75}`} stroke={fill} />
  </g>
);
/** Bánh hình trụ nhìn nghiêng (bánh nướng, bánh kem): thân rồi mặt trên. */
const cake = (cx: number, top: number, rx: number, ry: number, h: number, side: string, face: string) => (
  <><path d={`M${cx - rx} ${top}v${h}a${rx} ${ry} 0 0 0 ${rx * 2} 0v${-h}`} fill={side} /><ellipse cx={cx} cy={top} rx={rx} ry={ry} fill={face} /></>
);
const cup = (x: number, y: number) => <path d={`M${x} ${y}c0 12 6 16 14 16s14-4 14-16z`} fill="#F4EFE8" />;
const TRAY = 'M12 404C60 382 270 382 318 404C330 416 324 440 324 440L6 440C6 440 0 416 12 404Z';
const half = (x: number, y: number, w: number, fill: string) => <path key={`h${x}-${y}`} d={`M${x} ${y}a${w / 2} ${w * 0.4} 0 0 1 ${w} 0z`} fill={fill} />;

// Lá cờ dây sinh nhật: dây võng từ hai góc, chín lá cờ nhiều màu.
const BUNTING = (() => {
  const P = (t: number) => ({ x: 330 * t, y: 14 + 192 * t * (1 - t) });
  const colors = ['#E8837C', '#F6C453', '#8E9AC8', '#7FB59A', '#F2A0A0'];
  return (
    <>
      <path className="st-thin" d="M-2 14Q165 110 332 14" />
      {Array.from({ length: 9 }, (_, i) => {
        const t = 0.08 + i * 0.105, a = P(t - 0.036), b = P(t + 0.036), m = P(t);
        return <path key={i} d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}L${m.x.toFixed(1)} ${(m.y + 30).toFixed(1)}Z`} fill={colors[i % colors.length]} />;
      })}
    </>
  );
})();

/** Trang trí mép trên của từng dịp. */
const TOP: Record<ShotOccasion, ReactNode> = {
  // Đèn treo ấm giữa mâm cơm.
  'mam-com': <>
    <path className="st-thin" d="M165 -2V26" />
    <path className="st-ray" d="M146 76l-9 11M165 79v13M184 76l9 11" />
    <path d="M140 26h50l16 30H124z" fill="#F2B45B" />
    <circle cx="165" cy="63" r="8" fill="#FFF1C2" />
  </>,
  // Tết: cành mai vàng góc trái, cành đào hồng góc phải.
  tet: <>
    {wood('M-6 80C24 62 52 42 124 20M50 46C58 32 70 22 86 16')}
    {[flower(20, 66, 13, '#F6C453', '#B5652E'), flower(56, 44, 14, '#F6C453', '#B5652E'), flower(96, 28, 12, '#F6C453', '#B5652E'), flower(84, 12, 9, '#F6C453', '#B5652E')]}
    <circle cx="124" cy="20" r="5" fill="#F6C453" />
    {wood('M336 80C306 62 278 42 206 20M280 46C272 32 260 22 244 16')}
    {[flower(310, 66, 13, '#F4B6C2', '#C9566E'), flower(274, 44, 14, '#F4B6C2', '#C9566E'), flower(234, 28, 12, '#F4B6C2', '#C9566E'), flower(246, 12, 9, '#F4B6C2', '#C9566E')]}
    <circle cx="206" cy="20" r="5" fill="#F4B6C2" />
  </>,
  // Trung thu: trăng rằm, hai đèn ông sao đỏ vàng treo trên.
  'trung-thu': <>
    <circle cx="238" cy="50" r="30" fill="#F6E3A8" />
    <circle className="st-nos" cx="228" cy="42" r="6" fill="#EBD28A" /><circle className="st-nos" cx="248" cy="62" r="4" fill="#EBD28A" /><circle className="st-nos" cx="250" cy="38" r="3" fill="#EBD28A" />
    {lantern(78, 50, 18, '#D9534F', '#F6C453')}
    {lantern(132, 34, 14, '#F6C453', '#F2A65A')}
  </>,
  // Sinh nhật: dây cờ ngang mép trên.
  'sinh-nhat': BUNTING,
  // Chuseok: trăng rằm, mây mềm.
  chuseok: <>
    <circle cx="236" cy="48" r="32" fill="#F6E3A8" />
    <circle className="st-nos" cx="226" cy="40" r="6" fill="#EBD28A" /><circle className="st-nos" cx="246" cy="58" r="4" fill="#EBD28A" />
    {cloud(196, 86, 86, '#E9E4F5')}
    {cloud(62, 50, 78, '#E9E4F5')}
  </>,
  // Đi chơi: mặt trời, mây trắng.
  'di-choi': <>
    <path className="st-ray" d={Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `M${(244 + Math.cos(a) * 30).toFixed(1)} ${(48 + Math.sin(a) * 30).toFixed(1)}L${(244 + Math.cos(a) * 39).toFixed(1)} ${(48 + Math.sin(a) * 39).toFixed(1)}`; }).join('')} />
    <circle cx="244" cy="48" r="22" fill="#F6C453" />
    {cloud(56, 56, 84, '#F7F3EA')}
    {cloud(148, 34, 50, '#F7F3EA')}
  </>,
  // Tự viết: khung viền và vài ánh lấp lánh.
  'tu-viet': <>
    <rect className="st-frame" x="8" y="8" width="314" height="424" rx="28" />
    {[sparkle(92, 40, 12, '#F6C453'), sparkle(236, 34, 9, '#F4B6C2'), sparkle(122, 66, 6, '#F7F3EA')]}
  </>,
};

/** Trang trí đáy của từng dịp. */
const BOTTOM: Record<ShotOccasion, ReactNode> = {
  // Mâm gỗ, bát cơm trắng, bát canh, đĩa rau, đôi đũa.
  'mam-com': <>
    <path d={TRAY} fill="#9A6B4F" />
    <path d="M76 402c2 20 46 20 48 0z" fill="#E7E2F3" /><path d="M78 402c4-14 40-14 44 0z" fill="#FBF8F1" />
    <path d="M139 398c2 22 50 22 52 0z" fill="#C9886A" /><ellipse cx="165" cy="398" rx="26" ry="7" fill="#E8B04B" />
    <circle className="st-nos" cx="157" cy="397" r="2.6" fill="#6E9A5B" /><circle className="st-nos" cx="170" cy="399" r="2.6" fill="#6E9A5B" /><circle className="st-nos" cx="176" cy="396" r="2" fill="#6E9A5B" />
    <ellipse cx="232" cy="412" rx="30" ry="9" fill="#F4EFE8" /><path d="M212 410q8-16 20-6 8-12 20 4-16 6-40 2z" fill="#7FA36B" />
    {wood('M266 424L304 394M274 428L312 398')}
  </>,
  // Mâm đỏ: đĩa cam, bánh chưng xanh buộc lạt, phong bao lì xì.
  tet: <>
    <path d={TRAY} fill="#C8553D" />
    <ellipse cx="92" cy="414" rx="32" ry="8" fill="#F4EFE8" />
    <circle cx="79" cy="404" r="10" fill="#F2A65A" /><circle cx="103" cy="404" r="10" fill="#F2A65A" /><circle cx="91" cy="391" r="9" fill="#F2A65A" />
    <rect x="138" y="366" width="56" height="46" rx="4" fill="#6E9A5B" />
    <path d="M157 366v46M175 366v46M138 381h56M138 397h56" stroke="#EADBAE" strokeWidth="2.6" />
    <g transform="rotate(-10 238 398)">
      <rect x="222" y="374" width="32" height="44" rx="3" fill="#D9534F" />
      <path className="st-thin" d="M222 386l16 9 16-9" />
      <circle cx="238" cy="403" r="6" fill="#F6C453" />
    </g>
  </>,
  // Bàn gỗ, bánh nướng to nhỏ, chén trà.
  'trung-thu': <>
    <path d={TRAY} fill="#9A6B4F" />
    {cake(165, 396, 32, 10, 14, '#B97F45', '#D9A45B')}
    <ellipse className="st-thin" cx="165" cy="396" rx="16" ry="5" fill="#E8BF7A" />
    {cake(100, 408, 22, 7, 10, '#B97F45', '#D9A45B')}
    <ellipse className="st-thin" cx="100" cy="408" rx="10" ry="3" fill="#E8BF7A" />
    {cup(224, 402)}
  </>,
  // Khăn bàn kem, bánh kem hồng ba nến, hộp quà, giấy màu.
  'sinh-nhat': <>
    <path d={TRAY} fill="#F6E3C8" />
    <ellipse cx="165" cy="420" rx="66" ry="10" fill="#F4EFE8" />
    {cake(165, 386, 48, 10, 28, '#F4B6C2', '#FBF3EA')}
    <path className="st-thin" d="M117 392q6 10 12 2t12 2 12 0 12 2 12 0 12 2 12 0 12 2" />
    <rect x="147" y="358" width="7" height="26" rx="2" fill="#8E9AC8" /><rect x="162" y="354" width="7" height="30" rx="2" fill="#F6C453" /><rect x="177" y="358" width="7" height="26" rx="2" fill="#7FB59A" />
    <path d="M150.5 342q6 8 0 13-6-5 0-13zM165.5 338q6 8 0 13-6-5 0-13zM180.5 342q6 8 0 13-6-5 0-13z" fill="#F6C453" />
    <rect x="56" y="398" width="34" height="26" rx="2" fill="#8E9AC8" />
    <path d="M73 398v26M56 410h34" stroke="#F6C453" strokeWidth="3" />
    <path d="M73 398c-8-10-16-2 0 0 8-10 16-2 0 0z" fill="#F6C453" />
    <circle className="st-nos" cx="252" cy="400" r="3.5" fill="#E8837C" /><circle className="st-nos" cx="270" cy="392" r="3" fill="#F6C453" />
    <circle className="st-nos" cx="284" cy="408" r="3.5" fill="#8E9AC8" /><circle className="st-nos" cx="260" cy="416" r="3" fill="#7FB59A" />
  </>,
  // Bàn gỗ, đĩa songpyeon nhiều màu, quả hồng, chén trà.
  chuseok: <>
    <path d={TRAY} fill="#9A6B4F" />
    <ellipse cx="165" cy="410" rx="66" ry="16" fill="#F4EFE8" />
    {[half(136, 404, 28, '#F2A0A0'), half(166, 404, 28, '#9CC59A')]}
    {[half(118, 414, 30, '#FBF8F1'), half(150, 414, 30, '#F6D48A'), half(182, 414, 30, '#F4B6C2')]}
    <circle cx="246" cy="404" r="12" fill="#F2A65A" /><path d="M240 393q6-6 12 0-6 4-12 0z" fill="#7FA36B" />
    {cup(72, 402)}
  </>,
  // Biển: hai lớp sóng, thuyền buồm.
  'di-choi': <>
    {waves(388, 12, '#6FA3B8')}
    <path d="M214 378h42l-6 10h-30z" fill="#C9886A" /><path className="st-thin" d="M236 378v-32" /><path d="M238 348l18 26h-18z" fill="#F7F3EA" />
    {waves(412, 12, '#A9D2DE')}
  </>,
  // Tự viết: dải ruy băng trống, lấp lánh hai bên.
  'tu-viet': <>
    <path d="M95 400h140l-10 14 10 14H95l10-14z" fill="#F4B6C2" />
    {[sparkle(62, 410, 10, '#F6C453'), sparkle(270, 402, 8, '#F7F3EA')]}
  </>,
};

function SeatMark({ seat, name, photo, clip, label }: { seat: Seat; name?: string; photo?: string | null; clip: string; label: boolean }) {
  const sh = shoulders(seat);
  const fs = seatFont(name ?? '', seat.r);
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
        {name && label && <text className="st-name on" x={cx} y={+(cy + r * 3.3).toFixed(1)} fontSize={fs}>{name}</text>}
      </g>
    );
  }
  return (
    <g>
      <circle className="st-dash st-seat" cx={cx} cy={cy} r={r} />
      <path className="st-dash" d={sh.d} />
      {name && label && <text className="st-name" x={cx} y={+(cy + fs * 0.33).toFixed(1)} fontSize={fs}>{name}</text>}
    </g>
  );
}

export type FrameSeat = { name?: string; photo?: string | null };
/**
 * Khung mẫu chụp chung theo dịp: trang trí mép trên và đáy, khung mặt nét đứt ở giữa, ghế của từng người (1 đến 3) hai bên.
 * live: đè lên khung ngắm. mini: ô nhỏ trong bảng dịp. card: ảnh dự kiến ở màn chờ, center là ảnh của mình nếu đã chụp. Hai kiểu sau có nền tối, không ghi tên.
 * Đổi dịp thì trang trí hiện lại (key theo dịp), chỉ opacity và transform.
 */
export function ShotFrame({ occasion, seats, variant = 'live', center }: {
  occasion: ShotOccasion; seats: FrameSeat[]; variant?: 'live' | 'mini' | 'card'; center?: FrameSeat | null;
}) {
  const uid = useId().replace(/[^\w-]/g, '');
  const layout = seatLayout(seats.length);
  const bg = variant !== 'live';
  return (
    <svg className={`shot-frame is-${variant}`} viewBox="0 0 330 440" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {bg && (
        <>
          <clipPath id={`bg${uid}`}><rect width="330" height="440" rx={variant === 'mini' ? 30 : 26} /></clipPath>
          <rect className="st-bg" width="330" height="440" rx={variant === 'mini' ? 30 : 26} />
        </>
      )}
      <g clipPath={bg ? `url(#bg${uid})` : undefined}>
        <g key={`t-${occasion}`} className="st-top">{TOP[occasion]}</g>
        <g key={`b-${occasion}`} className="st-bottom">{BOTTOM[occasion]}</g>
        {center?.photo ? (
          <>
            <clipPath id={`me${uid}`}><ellipse cx={FACE.cx} cy={FACE.cy} rx={FACE.rx} ry={FACE.ry} /></clipPath>
            <image href={thumb(center.photo, 360)} x={FACE.cx - FACE.rx} y={FACE.cy - FACE.ry} width={FACE.rx * 2} height={FACE.ry * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#me${uid})`} />
            <ellipse className="st-ring" cx={FACE.cx} cy={FACE.cy} rx={FACE.rx} ry={FACE.ry} />
          </>
        ) : (
          <ellipse className="st-face" cx={FACE.cx} cy={FACE.cy} rx={FACE.rx} ry={FACE.ry} />
        )}
        {/* Tên chỉ hiện trên khung ngắm; ô nhỏ (bảng dịp, màn chờ) chữ quá bé nên bỏ, ảnh và tên đã có ở hàng ảnh lấy liền. */}
        {layout.map((s, i) => <SeatMark key={i} seat={s} name={seats[i].name} photo={seats[i].photo} clip={`st${uid}${i}`} label={variant === 'live'} />)}
      </g>
    </svg>
  );
}
