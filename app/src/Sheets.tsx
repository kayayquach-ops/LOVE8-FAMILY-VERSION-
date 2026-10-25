import { useEffect, useState } from 'react';
import { api } from './api';
import { CityPicker } from './CityPicker';
import { copyCode, shareInvite } from './Onboarding';
import { shrinkImage } from './media';
import { cityOf, SILENT_HOURS, type Me, type Week } from './shared';
import { t, useLang } from './i18n';
import { buzz, sfx, tap } from './sound';
import { ago, hoursSince, localTime, weather } from './time';
import { Avatar, Icon, toast } from './ui';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
    </div>
  );
}

// Gia đình: từng người với giờ, thời tiết bên đó, lần hoạt động cuối; mời người mới; sửa thông tin của mình.
export function Family({ me, onClose, onChanged, onSettings }: { me: Me; onClose: () => void; onChanged: () => void; onSettings: () => void }) {
  const lang = useLang();
  const [wx, setWx] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(me.me.name);
  const [city, setCity] = useState(me.me.city ?? '');
  const [phone, setPhone] = useState(me.me.phone ?? '');

  useEffect(() => {
    for (const m of me.members) weather(m.city).then((x) => x && setWx((w) => ({ ...w, [m.id]: x })));
  }, [me.members]);

  const [busy, setBusy] = useState(false);
  async function save(avatar?: File) {
    if (busy) return;
    if (!name.trim()) return toast(t('family.needName'));
    setBusy(true);
    try {
      const f = new FormData();
      f.set('name', name.trim()); f.set('city', city); f.set('phone', phone.trim());
      if (avatar) f.set('avatar', await shrinkImage(avatar, 800), 'avatar.jpg');
      await api.updateMe(f);
      tap(); toast(t('family.saved')); setEdit(false); onChanged();
    } catch (e) {
      // Lưu lỗi thì giữ nguyên ô đang sửa để bấm lưu lại.
      toast((e as Error).message);
    } finally { setBusy(false); }
  }

  const [hugged, setHugged] = useState(false);
  async function hug() {
    if (hugged) return;
    setHugged(true);
    buzz(40); sfx('hug');
    try { await api.hug(); toast(t('family.hugged')); } catch (e) { toast((e as Error).message); setHugged(false); }
  }

  return (
    <Sheet title={t('family.title')} onClose={onClose}>
      <div className="h1">{me.family.name}</div>
      <div className="panel" style={{ padding: '4px 18px', marginTop: 14 }}>
        {me.members.map((m) => {
          const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
          const lt = localTime(m.city);
          return (
            <div key={m.id} className="member">
              <Avatar m={m} size={48} />
              <div className="meta">
                <div className="name">{m.name}{m.id === me.me.id ? t('family.youSuffix') : ''}</div>
                <div className="info">{m.city ? `${cityOf(m.city)?.name ?? ''} ${lt ?? ''}` : t(`role.${m.role}`)}{wx[m.id] ? ` · ${wx[m.id]}` : ''}</div>
                <div className={`info ${quiet ? 'warn' : ''}`}>{m.id === me.me.id ? t('family.online') : quiet ? t('home.quietDays', { n: Math.floor(hoursSince(m.lastSeen) / 24) }) : t('family.active', { ago: ago(m.lastSeen) })}</div>
              </div>
              {m.id !== me.me.id && m.phone && <a className="round" href={`tel:${m.phone}`} aria-label={t('family.callAria', { name: m.name })}><Icon name="phone" /></a>}
            </div>
          );
        })}
      </div>

      <button className="btn ghost" style={{ marginTop: 14 }} onClick={hug}><Icon name="heart" size={20} /> {t('family.hug')}</button>

      <div className="h2">{t('home.invite.more')}</div>
      <div className="panel" style={{ textAlign: 'center' }}>
        <img className="invite-logo" src="/logo.svg" alt="" />
        <div className="muted">{t('family.code')}</div>
        <button className="code" onClick={() => void copyCode(me.family.code)} aria-label={t('invite.codeAria', { code: me.family.code })}>{me.family.code}</button>
        <div className="code-hint">{t('invite.codeHint')}</div>
        <button className="btn" onClick={() => void shareInvite(me.family.code, me.family.name)}><Icon name="share" size={20} /> {t('invite.send')}</button>
      </div>

      <div className="h2">{t('family.you')}</div>
      {edit ? (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="field" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('family.namePlaceholder')} />
          <input className="field" style={{ width: '100%' }} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder={t('family.phonePlaceholder')} />
          <CityPicker value={city} onChange={(v) => v && setCity(v)} />
          <button className="btn" disabled={busy} onClick={() => save()}>{busy ? t('family.saving') : t('common.save')}</button>
        </div>
      ) : (
        <div className="panel row">
          <label style={{ position: 'relative' }} aria-label={t('family.changePhoto')}>
            <Avatar m={me.me} size={56} />
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void save(f); }} />
          </label>
          <div style={{ flex: 1 }}>
            <div className="name" style={{ fontSize: 17 }}>{me.me.name}</div>
            <div className="muted">{me.me.phone || t('family.noPhone')}</div>
          </div>
          <button className="chip" onClick={() => setEdit(true)}>{t('family.edit')}</button>
        </div>
      )}
      <div className="muted" style={{ marginTop: 12 }}>{t('family.note', { n: SILENT_HOURS / 24 })}</div>

      <button className="link" style={{ marginTop: 24 }} onClick={onSettings}>{t('settings.title')}</button>
    </Sheet>
  );
}
