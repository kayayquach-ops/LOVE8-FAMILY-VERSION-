import { useEffect, useState } from 'react';
import { enablePush, pushState } from './push';
import { tap } from './sound';
import { toast } from './ui';
import { t } from './i18n';

const KEY = 'hl-notify-ask';
const AGAIN_DAYS = 3;

/** Vào app là hỏi có bật thông báo không (chỉ khi máy hỗ trợ và chưa bật). Chọn "Để sau" thì ba ngày sau hỏi lại. */
export function NotifyAsk() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    let last = 0;
    try { last = Number(localStorage.getItem(KEY)) || 0; } catch {}
    if (Date.now() - last < AGAIN_DAYS * 86400e3) return;
    void pushState().then((s) => { if (live && s === 'off') setShow(true); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!show) return null;
  const later = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} setShow(false); };
  async function yes() {
    setBusy(true);
    try {
      const s = await enablePush();
      if (s === 'on') { tap(); toast(t('notify.on')); }
      else later();
    } catch (e: any) {
      toast(e?.message || t('notify.failed'));
      later();
    } finally { setBusy(false); setShow(false); }
  }

  return (
    <div className="nask" role="dialog" aria-modal="true" aria-label={t('notifyAsk.title')}>
      <div className="nask-card">
        <h2>{t('notifyAsk.title')}</h2>
        <p>{t('notifyAsk.body')}</p>
        <button className="btn" disabled={busy} onClick={yes}>{t('notifyAsk.yes')}</button>
        <button className="link" onClick={later}>{t('common.later')}</button>
      </div>
    </div>
  );
}
