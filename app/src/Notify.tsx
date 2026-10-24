import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPrefs, pushState, setPrefs, type PushKind, type PushPrefs, type PushState } from './push';
import { tap } from './sound';
import { toast } from './ui';
import { t } from './i18n';

const LABELS: PushKind[] = ['call', 'chat', 'post', 'calendar', 'weekly'];

export function Notify() {
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setP] = useState<PushPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void pushState().then(setState).catch(() => setState('unsupported')); }, []);
  useEffect(() => { if (state === 'on') void getPrefs().then(setP).catch(() => {}); }, [state]);

  async function turnOn() {
    setBusy(true);
    try {
      const s = await enablePush();
      setState(s);
      if (s === 'on') { tap(); toast(t('notify.on')); }
    } catch (e: any) {
      toast(e?.message || t('notify.failed'));
    } finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush().catch(() => {});
    setBusy(false);
    setState('off');
  }

  async function flip(k: PushKind) {
    if (!prefs) return;
    tap();
    setP({ ...prefs, [k]: !prefs[k] });
    setP(await setPrefs({ [k]: !prefs[k] }).catch(() => prefs));
  }

  if (!state) return null;
  return (
    <>
      <div className="h2">{t('notify.title')}</div>
      <div className="panel">
        {state === 'ios-browser' && <div className="muted">{t('notify.iosBrowser')}</div>}
        {state === 'unsupported' && <div className="muted">{t('notify.unsupported')}</div>}
        {state === 'denied' && <div className="muted">{t('notify.denied')}</div>}
        {state === 'off' && <button className="btn" disabled={busy} onClick={turnOn}>{t('notify.turnOn')}</button>}
        {state === 'on' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {LABELS.map((k) => (
                <button key={k} className={`chip ${prefs?.[k] !== false ? 'on' : ''}`} onClick={() => flip(k)}>{t(`notify.kind.${k}`)}</button>
              ))}
            </div>
            <button className="link" style={{ marginTop: 14 }} disabled={busy} onClick={turnOff}>{t('notify.turnOff')}</button>
          </>
        )}
      </div>
    </>
  );
}
