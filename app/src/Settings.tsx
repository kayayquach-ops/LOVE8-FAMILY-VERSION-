import { useState } from 'react';
import { token } from './api';
import { LANG_NAMES, LANGS, setLang, t, useLang } from './i18n';
import { Notify } from './Notify';
import type { Me } from './shared';
import { setUiSounds, tap, uiSoundsOn } from './sound';
import { Avatar, Icon } from './ui';

/** Cài đặt: hồ sơ, ngôn ngữ, thông báo, âm thanh, tải lại app, rời nhà. */
export function Settings({ me, onClose, onProfile }: { me: Me; onClose: () => void; onProfile: () => void }) {
  const lang = useLang();
  const [sound, setSound] = useState(uiSoundsOn());

  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="down" /></button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 500 }}>{t('settings.title')}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        <button className="panel set-profile" onClick={() => { tap(); onProfile(); }}>
          <Avatar m={me.me} size={48} />
          <span className="set-name"><b>{me.me.name}</b><small>{me.family.name}</small></span>
          <span className="chip">{t('settings.profileEdit')}</span>
        </button>

        <div className="h2">{t('family.language')}</div>
        <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGS.map((l) => (
            <button key={l} className={`chip ${lang === l ? 'on' : ''}`} style={{ minHeight: 44 }} lang={l} aria-pressed={lang === l} onClick={() => { tap(); setLang(l); }}>{LANG_NAMES[l]}</button>
          ))}
        </div>

        <Notify />

        <div className="h2">{t('settings.sound')}</div>
        <div className="panel">
          <button className="set-switch" role="switch" aria-checked={sound} onClick={() => { const v = !sound; setUiSounds(v); setSound(v); if (v) tap(); }}>
            <span>{t('settings.soundTap')}</span>
            <i className={sound ? 'on' : ''} aria-hidden><u /></i>
          </button>
        </div>

        <div className="h2">{t('settings.app')}</div>
        <div className="panel">
          <button className="btn ghost" onClick={() => { tap(); location.reload(); }}>{t('settings.reload')}</button>
          <div className="muted" style={{ marginTop: 8 }}>{t('settings.reloadHint')}</div>
        </div>

        <button className="link" style={{ marginTop: 24 }} onClick={() => { if (confirm(t('family.leaveConfirm'))) { token.clear(); location.reload(); } }}>{t('family.leave')}</button>
      </div>
    </div>
  );
}
