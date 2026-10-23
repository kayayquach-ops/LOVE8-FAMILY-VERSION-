import { useEffect, useState } from 'react';
import { api, token } from './api';
import { CityPicker } from './CityPicker';
import { shareInvite } from './Onboarding';
import { cityOf, ROLE_LABEL, SILENT_HOURS, type Me, type Week } from './shared';
import { buzz, sfx, tap } from './sound';
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
    buzz(40); sfx('hug');
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
                <div className="info">{m.city ? `${cityOf(m.city)?.name ?? ''} ${t ?? ''}` : ROLE_LABEL[m.role]}{wx[m.id] ? ` · ${wx[m.id]}` : ''}</div>
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
          <CityPicker value={city} onChange={(v) => v && setCity(v)} />
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
