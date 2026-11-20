import { useEffect, useRef, useState } from 'react';
import { api, autoTranslateOn, googlePending, isSignedOut, setAutoTranslate, startGoogle, token } from './api';
import { LANG_NAMES, LANGS, setLang, t, useLang, type Key } from './i18n';
import { setThemeMode, THEME_MODES, useThemeMode } from './theme';
import { Notify } from './Notify';
import { LocationShare } from './LocationShare';
import { GoogleMark } from './Onboarding';
import { mascotNameOf, type Me } from './shared';
import { setUiSounds, tap, uiSoundsOn } from './sound';
import { Avatar, Icon, toast } from './ui';

/** Cài đặt: hồ sơ, ngôn ngữ, thông báo, âm thanh, tài khoản Google, tải lại app, rời nhà. */
export function Settings({ me, onClose, onProfile, onMascot }: { me: Me; onClose: () => void; onProfile: () => void; onMascot: () => void }) {
  const lang = useLang();
  const theme = useThemeMode();
  const [sound, setSound] = useState(uiSoundsOn());
  const [autoTr, setAutoTr] = useState(autoTranslateOn());
  const google = useGoogleLink();

  // Rời nhà: hỏi lại bằng thẻ dưới đáy như "xoá khỏi nhà" (Sheets.tsx), vì máy chủ xoá hẳn mình cùng ảnh, tin nhắn, cuộc gọi.
  const [leaving, setLeaving] = useState(false);
  const [busyLeave, setBusyLeave] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyLeave) setLeaving(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leaving, busyLeave]);
  async function leave() {
    if (busyLeave) return;
    setBusyLeave(true);
    try {
      await api.leave();
    } catch (e) {
      // Lỗi thì báo và vẫn ở trong nhà. 401: mã đã hết (người khác đã xoá mình trước), coi như đã rời.
      if (!isSignedOut(e)) { toast((e as Error).message); setBusyLeave(false); return; }
    }
    // Bỏ mã rồi tải lại: không còn mã thì app mở màn đầu.
    token.clear();
    location.reload();
  }

  return (
    <div className="sheet">
      <div className="top" style={{ padding: 'calc(var(--safe-top) + 10px) 16px 6px' }}>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="back" /></button>
        <div className="sheet-title">{t('settings.title')}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="scroll" style={{ flex: 1, padding: '6px 20px calc(var(--safe-bottom) + 30px)' }}>
        <button className="panel set-profile" onClick={() => { tap(); onProfile(); }}>
          <Avatar m={me.me} size={48} />
          <span className="set-name"><b>{me.me.name}</b><small>{me.family.name}</small></span>
          <span className="chip">{t('settings.profileEdit')}</span>
        </button>

        <div className="h2">{t('settings.mascot')}</div>
        <button className="panel set-profile" onClick={() => { tap(); onMascot(); }}>
          <span className="set-name"><b>{mascotNameOf(me.family)}</b></span>
          <span className="chip">{t('may.customize')}</span>
        </button>

        <div className="h2">{t('family.language')}</div>
        <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGS.map((l) => (
            <button key={l} className={`chip ${lang === l ? 'on' : ''}`} style={{ minHeight: 44 }} lang={l} aria-pressed={lang === l} onClick={() => { tap(); setLang(l); }}>{LANG_NAMES[l]}</button>
          ))}
        </div>

        <div className="h2">{t('settings.theme')}</div>
        <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {THEME_MODES.map((m) => (
            <button key={m} className={`chip ${theme === m ? 'on' : ''}`} style={{ minHeight: 44 }} aria-pressed={theme === m} onClick={() => { tap(); setThemeMode(m); }}>{t(`settings.theme.${m}` as Key)}</button>
          ))}
        </div>

        <Notify />

        <LocationShare />

        <div className="h2">{t('settings.sound')}</div>
        <div className="panel">
          <button className="set-switch" role="switch" aria-checked={sound} onClick={() => { const v = !sound; setUiSounds(v); setSound(v); if (v) tap(); }}>
            <span>{t('settings.soundTap')}</span>
            <i className={sound ? 'on' : ''} aria-hidden><u /></i>
          </button>
          <button className="set-switch" role="switch" aria-checked={autoTr} onClick={() => { const v = !autoTr; setAutoTranslate(v); setAutoTr(v); tap(); }}>
            <span>{t('settings.autoTranslate')}</span>
            <i className={autoTr ? 'on' : ''} aria-hidden><u /></i>
          </button>
        </div>

        {google.state?.enabled && (
          <>
            <div className="h2">{t('settings.google')}</div>
            <div className="panel">
              {google.state.linked ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  <GoogleMark />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{google.state.email ?? t('settings.googleOn')}</span>
                  <button className="chip" disabled={google.busy} onClick={() => { tap(); void google.unlink(); }}>{t('settings.googleUnlink')}</button>
                </div>
              ) : (
                <>
                  <button className="btn ghost" disabled={google.busy} onClick={() => { tap(); google.link(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <GoogleMark /> {t('settings.googleLink')}
                  </button>
                  <div className="muted" style={{ marginTop: 8 }}>{t('settings.googleHint')}</div>
                </>
              )}
            </div>
          </>
        )}

        <div className="h2">{t('settings.app')}</div>
        <div className="panel">
          <button className="btn ghost" onClick={() => { tap(); location.reload(); }}>{t('settings.reload')}</button>
          <div className="muted" style={{ marginTop: 8 }}>{t('settings.reloadHint')}</div>
        </div>

        <button className="link" style={{ marginTop: 24 }} onClick={() => { tap(); setLeaving(true); }}>{t('family.leave')}</button>
      </div>

      {leaving && (
        <div className="nask" onClick={() => { if (!busyLeave) setLeaving(false); }}>
          <div className="nask-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-body" onClick={(e) => e.stopPropagation()}>
            <h2 id="leave-title" className="display">{t('family.leave.title')}</h2>
            <p id="leave-body">{t('family.leave.body')}</p>
            <button className="btn" disabled={busyLeave} onClick={() => void leave()}>{t('family.leave.yes')}</button>
            <button className="link" disabled={busyLeave} onClick={() => setLeaving(false)}>{t('family.leave.no')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Liên kết Google của chính mình. Vừa từ Google quay về (hoặc app hiện lại sau khi Google mở ở cửa sổ khác) thì hỏi máy chủ kết quả. */
function useGoogleLink() {
  const [state, setState] = useState<{ enabled: boolean; linked: boolean; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const resuming = useRef(false);
  const refresh = () => api.googleMe().then(setState).catch(() => {});

  useEffect(() => {
    const resume = async () => {
      const p = googlePending.get();
      if (p?.intent === 'link' && !resuming.current) {
        resuming.current = true;
        try {
          const r = await api.googleFinish(p);
          if (r.status !== 'pending') googlePending.clear();
          if (r.status === 'linked') toast(t('settings.googleLinked'));
        } catch (e) {
          googlePending.clear();
          if (Date.now() - p.at < 16 * 60e3) toast((e as Error).message);
        } finally {
          resuming.current = false;
        }
      }
      await refresh();
    };
    void resume();
    const onShow = () => { if (document.visibilityState === 'visible') void resume(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  return {
    state,
    busy,
    link: () => {
      setBusy(true);
      startGoogle('link').catch((e) => { toast((e as Error).message); setBusy(false); });
    },
    unlink: async () => {
      if (!confirm(t('settings.googleUnlinkConfirm'))) return;
      setBusy(true);
      try { await api.googleUnlink(); await refresh(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
    },
  };
}
