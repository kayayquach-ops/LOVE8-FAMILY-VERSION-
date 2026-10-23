import { useEffect, useState } from 'react';
import { api, token } from './api';
import { shareInvite } from './Onboarding';
import { CITIES, ROLE_LABEL, SILENT_HOURS, type Me, type Week } from './shared';
import { buzz, tap } from './sound';
import { ago, hoursSince, localTime, weather } from './time';
import { Avatar, Icon, toast } from './ui';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
    </div>
  );
}

const GIFTS = ['Sổ giọng nói của nhà mình', 'Tập podcast "Chuyện nhà mình"', 'Cuốn sách ảnh một năm', 'Thư tay in gửi về nhà'];

// Bình yêu thương: mỗi lần cả nhà gửi tin, ôm, trả lời hay làm xong nhiệm vụ là thêm hạt vào bình.
export function Jar({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState<Week | null>(null);
  const load = () => api.week().then(setW).catch((e) => toast(e.message));
  useEffect(() => { void load(); }, []);
  if (!w) return <Sheet title="Bình yêu thương" onClose={onClose}><div className="muted">Đang mở...</div></Sheet>;
  const fill = w.jar.level / w.jar.capacity;
  return (
    <Sheet title="Bình yêu thương" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10 }}>
        <JarArt fill={fill} />
        <div className="h1">{w.jar.level} / {w.jar.capacity} hạt thương</div>
        <div className="muted" style={{ textAlign: 'center' }}>Cả nhà cùng đổ đầy bình. Đầy bình thì mở một món quà.</div>
      </div>

      <div className="h2">Nhiệm vụ tuần này</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {w.missions.map((m) => (
          <div key={m.key} className="mission">
            <div>
              <div>{m.text}</div>
              <div className="pts">+{m.points} hạt{m.doneBy.length ? ` · ${m.doneBy.length} người đã làm` : ''}</div>
            </div>
            <button className={`done-btn ${m.done ? 'done' : ''}`} disabled={m.done}
              onClick={async () => { tap(); buzz(30); await api.mission(m.key); toast(`+${m.points} hạt vào bình`); void load(); }}>
              {m.done ? 'Đã làm' : 'Xong'}
            </button>
          </div>
        ))}
      </div>

      <div className="h2">Quà của nhà mình</div>
      <div className="panel" style={{ padding: '4px 18px' }}>
        {GIFTS.map((g, i) => (
          <div key={g} className="mission" style={{ opacity: i < w.jar.gifts ? 1 : 0.5 }}>
            <div>{g}</div>
            <div className="pts" style={{ marginLeft: 'auto' }}>{i < w.jar.gifts ? 'Đã mở' : `Đầy bình lần ${i + 1}`}</div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 14 }}>Gửi ảnh, video, lời nói, cái ôm hay trả lời người nhà: mỗi lần một hạt.</div>
    </Sheet>
  );
}

function JarArt({ fill }: { fill: number }) {
  const top = 40 + (1 - fill) * 130;
  return (
    <svg viewBox="0 0 160 200" width="170" height="212" aria-hidden>
      <defs><clipPath id="jar"><path d="M50 30h60v18c22 10 32 30 32 54v60a26 26 0 01-26 26H44a26 26 0 01-26-26v-60c0-24 10-44 32-54z" /></clipPath></defs>
      <g clipPath="url(#jar)">
        <rect x="0" y="0" width="160" height="200" fill="rgba(255,255,255,.55)" />
        <path d={`M0 ${top} Q40 ${top - 8} 80 ${top} T160 ${top} V200 H0Z`} fill="#D9A58A" style={{ transition: 'all .8s' }} />
        {Array.from({ length: Math.round(fill * 18) }, (_, i) => (
          <path key={i} transform={`translate(${30 + ((i * 37) % 95)} ${180 - ((i * 23) % Math.max(8, 150 * fill))}) scale(.55)`}
            d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="#9A5A44" opacity=".75" />
        ))}
      </g>
      <path d="M50 30h60v18c22 10 32 30 32 54v60a26 26 0 01-26 26H44a26 26 0 01-26-26v-60c0-24 10-44 32-54z" fill="none" stroke="#2B2723" strokeWidth="2" />
      <rect x="44" y="18" width="72" height="14" rx="5" fill="#E9DCCB" stroke="#2B2723" strokeWidth="2" />
    </svg>
  );
}

// Gia đình: từng người với giờ, thời tiết bên đó, lần hoạt động cuối; mời người mới; sửa thông tin của mình.
export function Family({ me, onClose, onChanged }: { me: Me; onClose: () => void; onChanged: () => void }) {
  const [wx, setWx] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(me.me.name);
  const [city, setCity] = useState(me.me.city ?? '');
  const [phone, setPhone] = useState(me.me.phone ?? '');

  useEffect(() => {
    for (const m of me.members) weather(m.city).then((t) => t && setWx((w) => ({ ...w, [m.id]: t })));
  }, [me.members]);

  async function save(avatar?: File) {
    const f = new FormData();
    f.set('name', name.trim()); f.set('city', city); f.set('phone', phone.trim());
    if (avatar) f.set('avatar', avatar);
    await api.updateMe(f).catch((e) => toast(e.message));
    tap(); toast('Đã lưu'); setEdit(false); onChanged();
  }

  async function hug() {
    buzz(40); tap();
    await api.hug();
    toast('Đã ôm cả nhà');
  }

  return (
    <Sheet title="Gia đình" onClose={onClose}>
      <div className="h1">{me.family.name}</div>
      <div className="panel" style={{ padding: '4px 18px', marginTop: 14 }}>
        {me.members.map((m) => {
          const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
          const t = localTime(m.city);
          return (
            <div key={m.id} className="member">
              <Avatar m={m} size={48} />
              <div className="meta">
                <div className="name">{m.name}{m.id === me.me.id ? ' (bạn)' : ''}</div>
                <div className="info">{m.city ? `${CITIES[m.city]?.name} ${t ?? ''}` : ROLE_LABEL[m.role]}{wx[m.id] ? ` · ${wx[m.id]}` : ''}</div>
                <div className={`info ${quiet ? 'warn' : ''}`}>{m.id === me.me.id ? 'Đang mở app' : quiet ? `${Math.floor(hoursSince(m.lastSeen) / 24)} ngày chưa mở app` : `Hoạt động ${ago(m.lastSeen)}`}</div>
              </div>
              {m.id !== me.me.id && m.phone && <a className="round" href={`tel:${m.phone}`} aria-label={`Gọi ${m.name}`}><Icon name="phone" /></a>}
            </div>
          );
        })}
      </div>

      <button className="btn ghost" style={{ marginTop: 14 }} onClick={hug}><Icon name="heart" size={20} /> Ôm cả nhà một cái</button>

      <div className="h2">Mời thêm người</div>
      <div className="panel" style={{ textAlign: 'center' }}>
        <div className="muted">Mã nhà</div>
        <div className="code">{me.family.code}</div>
        <button className="btn" onClick={() => shareInvite(me.family.code, me.family.name)}><Icon name="share" size={20} /> Gửi lời mời</button>
      </div>

      <div className="h2">Thông tin của bạn</div>
      {edit ? (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="field" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên mọi người gọi" />
          <input className="field" style={{ width: '100%' }} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại (để cả nhà bấm gọi)" />
          <div className="chips" style={{ marginTop: 0 }}>
            {Object.entries(CITIES).map(([k, c]) => <button key={k} className={`chip ${city === k ? 'on' : ''}`} onClick={() => setCity(k)}>{c.name}</button>)}
          </div>
          <button className="btn" onClick={() => save()}>Lưu</button>
        </div>
      ) : (
        <div className="panel row">
          <label style={{ position: 'relative' }} aria-label="Đổi ảnh">
            <Avatar m={me.me} size={56} />
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && save(e.target.files[0])} />
          </label>
          <div style={{ flex: 1 }}>
            <div className="name" style={{ fontSize: 17 }}>{me.me.name}</div>
            <div className="muted">{me.me.phone || 'Chưa có số điện thoại'}</div>
          </div>
          <button className="chip" onClick={() => setEdit(true)}>Sửa</button>
        </div>
      )}
      <div className="muted" style={{ marginTop: 12 }}>Chạm vào ảnh đại diện để đổi ảnh. Ai {SILENT_HOURS / 24} ngày chưa mở app, cả nhà sẽ được nhắc hỏi thăm.</div>

      <button className="link" style={{ marginTop: 24 }} onClick={() => { if (confirm('Rời nhà trên máy này?')) { token.clear(); location.reload(); } }}>Rời nhà trên máy này</button>
    </Sheet>
  );
}
