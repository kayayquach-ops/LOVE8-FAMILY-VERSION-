import { useState } from 'react';
import { canLocate, turnOff, turnOn, useSharing } from './location';
import { tap } from './sound';
import { toast } from './ui';
import { t } from './i18n';

const ASKED = 'hl-loc-asked';

/** Cài đặt: công tắc "chia sẻ vị trí với cả nhà". Lần đầu bật thì hỏi bằng một tấm nói rõ ai thấy, tắt lúc nào cũng được,
 *  đồng ý rồi mới xin quyền vị trí của máy (src/location.ts turnOn). */
export function LocationShare() {
  const state = useSharing();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const can = canLocate();
  const isOn = state !== 'off';

  async function enable() {
    setAsk(false);
    setBusy(true);
    try { localStorage.setItem(ASKED, '1'); } catch {}
    try {
      if ((await turnOn()) === 'denied') toast(t('loc.denied'));
      else { tap(); toast(t('loc.on')); }
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  }

  async function flip() {
    if (isOn) {
      setBusy(true);
      try { await turnOff(); tap(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
      return;
    }
    let asked = false;
    try { asked = localStorage.getItem(ASKED) === '1'; } catch {}
    if (asked) void enable(); else { tap(); setAsk(true); }
  }

  return (
    <>
      <div className="h2">{t('loc.title')}</div>
      <div className="panel">
        <button className="set-switch" role="switch" aria-checked={isOn} disabled={!can || busy} onClick={() => void flip()}>
          <span>{t('loc.switch')}</span>
          <i className={isOn ? 'on' : ''} aria-hidden><u /></i>
        </button>
        {!can && <div className="muted">{t('loc.unsupported')}</div>}
        {state === 'denied' && <div className="muted">{t('loc.denied')}</div>}
      </div>
      {ask && (
        <div className="nask" role="dialog" aria-modal="true" aria-label={t('loc.ask.title')}>
          <div className="nask-card">
            <h2 className="display">{t('loc.ask.title')}</h2>
            <p>{t('loc.ask.body')}</p>
            <button className="btn" onClick={() => void enable()}>{t('loc.ask.yes')}</button>
            <button className="link" onClick={() => setAsk(false)}>{t('common.later')}</button>
          </div>
        </div>
      )}
    </>
  );
}
