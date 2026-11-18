import { useEffect, useState } from 'react';
import { api } from './api';
import { CityPicker } from './CityPicker';
import { copyCode, shareInvite } from './Onboarding';
import { shrinkImage } from './media';
import { SILENT_HOURS, type JoinRequest, type Me, type Member, type Week } from './shared';
import { cityName, usePlaceNames } from './placeName';
import { t, useLang } from './i18n';
import { buzz, sfx, tap } from './sound';
import { ago, hoursSince, localTime, weather } from './time';
import { Avatar, Icon, toast } from './ui';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="back" /></button>
        <div className="sheet-title">{title}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>{children}</div>
    </div>
  );
}

/** Lời xin vào nhà, chỉ người lập nhà (người duyệt) nhận được: tên, vai, nơi ở, nút cho vào và không.
 *  Dùng ở Trang chủ và mục Gia đình. Bấm xong ẩn ngay, danh sách mới về sau (onChanged). */
export function JoinAsks({ me, onChanged }: { me: Me; onChanged: () => void }) {
  usePlaceNames();
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const list = (me.requests ?? []).filter((r) => !done.includes(r.id));
  if (!list.length) return null;
  async function decide(r: JoinRequest, yes: boolean) {
    if (busy) return;
    setBusy(r.id);
    try {
      await api.joinDecide(r.id, yes);
      tap();
      if (yes) toast(t('join.ask.done', { name: r.name }));
      setDone((d) => [...d, r.id]);
      onChanged();
    } catch (e) {
      toast((e as Error).message);
      // Lời xin đã hết (hết hạn, đã bấm ở máy khác) hay mình không còn là người duyệt: bỏ thẻ, lấy danh sách mới.
      const st = (e as { status?: number }).status;
      if (st === 403 || st === 404) { setDone((d) => [...d, r.id]); onChanged(); }
    } finally {
      setBusy(null);
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {list.map((r) => (
        <div key={r.id} className="fade" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 14px', borderRadius: 22, boxShadow: 'inset 0 0 0 1.5px var(--ink)', background: 'var(--paper)' }}>
          <div className="row">
            <Avatar m={{ id: r.id, name: r.name, role: r.role, city: r.city, lastSeen: r.createdAt }} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{t('join.ask.title', { name: r.name })}</div>
              <div className="muted">{[t(`role.${r.role}`), cityName(r.city)].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" style={{ flex: 1, height: 48, fontSize: 16 }} disabled={busy === r.id} onClick={() => void decide(r, true)}>{t('join.ask.yes')}</button>
            <button className="btn ghost" style={{ flex: 1, height: 48, fontSize: 16 }} disabled={busy === r.id} onClick={() => void decide(r, false)}>{t('join.ask.no')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Gia đình: từng người với giờ, thời tiết bên đó, lần hoạt động cuối; mời người mới; sửa thông tin của mình.
export function Family({ me, onClose, onChanged, onSettings, onCallMember }: { me: Me; onClose: () => void; onChanged: () => void; onSettings: () => void; onCallMember: (id: string) => void }) {
  usePlaceNames();
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

  // Chạm vào một người khác: mở thêm dòng "xoá khỏi nhà" (người dùng xin để dọn tài khoản thử). Bấm thì hỏi lại bằng thẻ dưới đáy.
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busyRm, setBusyRm] = useState(false);
  useEffect(() => {
    if (!removing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRm) setRemoving(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removing, busyRm]);
  async function removeMember() {
    const m = removing;
    if (!m || busyRm) return;
    setBusyRm(true);
    try {
      await api.removeMember(m.id);
      tap(); toast(t('family.remove.done', { name: m.name }));
      setRemoving(null); setOpen(null); onChanged();
    } catch (e) {
      // Lời báo của máy chủ đã đúng thứ tiếng. Người đó đã bị xoá từ máy khác (404) thì cũng đóng lại và lấy danh sách mới.
      toast((e as Error).message);
      if ((e as { status?: number }).status === 404) { setRemoving(null); setOpen(null); onChanged(); }
    } finally { setBusyRm(false); }
  }

  const approver = me.members.find((m) => m.id === me.approverId);
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
      {!!me.requests?.length && <div style={{ marginTop: 14 }}><JoinAsks me={me} onChanged={onChanged} /></div>}
      <div className="panel" style={{ padding: '4px 18px', marginTop: 14 }}>
        {me.members.map((m) => {
          const quiet = m.id !== me.me.id && hoursSince(m.lastSeen) > SILENT_HOURS;
          const lt = localTime(m.city);
          const mine = m.id === me.me.id;
          const info = (
            <>
              <div className="name">{m.name}{mine ? t('family.youSuffix') : <span className="member-chev" aria-hidden="true"><Icon name="down" size={14} /></span>}</div>
              <div className="info">{m.city ? `${cityName(m.city) ?? ''} ${lt ?? ''}` : t(`role.${m.role}`)}{wx[m.id] ? ` · ${wx[m.id]}` : ''}</div>
              <div className={`info ${quiet ? 'warn' : ''}`}>{mine ? t('family.online') : quiet ? t('home.quietDays', { n: Math.floor(hoursSince(m.lastSeen) / 24) }) : t('family.active', { ago: ago(m.lastSeen) })}</div>
            </>
          );
          return (
            <div key={m.id} className={`member ${open === m.id ? 'open' : ''}`}>
              <Avatar m={m} size={48} />
              {mine
                ? <div className="meta">{info}</div>
                : <button className="meta member-toggle" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{info}</button>}
              {!mine && <button className="round" onClick={() => { tap(); onCallMember(m.id); }} aria-label={t('family.callVideo', { name: m.name })}><Icon name="video" /></button>}
              {!mine && m.phone && <a className="round" href={`tel:${m.phone}`} aria-label={t('family.callAria', { name: m.name })}><Icon name="phone" /></a>}
              {!mine && open === m.id && (
                <div className="member-more">
                  <button className="member-rm" onClick={() => setRemoving(m)}>{t('family.remove')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Người khác trong nhà chỉ thấy một dòng nhỏ, không thấy ai đang xin vào. */}
      {!!me.waiting && approver && <div className="muted" style={{ marginTop: 10 }}>{t('join.waiting', { name: approver.name })}</div>}

      <button className="btn ghost" style={{ marginTop: 14 }} onClick={hug}><Icon name="heart" size={20} /> {t('family.hug')}</button>

      <div className="h2">{t('home.invite.more')}</div>
      <div className="panel" style={{ textAlign: 'center' }}>
        <img className="invite-logo" src="/logo-mark.png" alt="" />
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

      {removing && (
        <div className="nask" onClick={() => { if (!busyRm) setRemoving(null); }}>
          <div className="nask-card" role="alertdialog" aria-modal="true" aria-labelledby="rm-title" aria-describedby="rm-body" onClick={(e) => e.stopPropagation()}>
            <h2 id="rm-title" className="display">{t('family.remove.title', { name: removing.name })}</h2>
            <p id="rm-body">{t('family.remove.body', { name: removing.name })}</p>
            <button className="btn" disabled={busyRm} onClick={() => void removeMember()}>{t('family.remove.yes')}</button>
            <button className="link" disabled={busyRm} onClick={() => setRemoving(null)}>{t('family.remove.no')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
