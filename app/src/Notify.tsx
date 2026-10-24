import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPrefs, pushState, setPrefs, type PushKind, type PushPrefs, type PushState } from './push';
import { tap } from './sound';
import { toast } from './ui';

const LABELS: Array<[PushKind, string]> = [
  ['call', 'Cả nhà gọi video'],
  ['chat', 'Tin nhắn'],
  ['post', 'Tin nhà và cái ôm'],
  ['calendar', 'Ngày đặc biệt'],
  ['weekly', 'Cuộc gọi tuần'],
];

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
      if (s === 'on') { tap(); toast('Đã bật thông báo'); }
    } catch (e: any) {
      toast(e?.message || 'Chưa bật được, thử lại nhé');
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
      <div className="h2">Thông báo</div>
      <div className="panel">
        {state === 'ios-browser' && <div className="muted">Thêm Sweet Home vào Màn hình chính rồi mở từ đó để nhận thông báo.</div>}
        {state === 'unsupported' && <div className="muted">Máy này chưa nhận được thông báo.</div>}
        {state === 'denied' && <div className="muted">Thông báo đang bị chặn. Mở cài đặt của máy, cho Sweet Home gửi thông báo là được.</div>}
        {state === 'off' && <button className="btn" disabled={busy} onClick={turnOn}>Bật thông báo</button>}
        {state === 'on' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {LABELS.map(([k, label]) => (
                <button key={k} className={`chip ${prefs?.[k] !== false ? 'on' : ''}`} onClick={() => flip(k)}>{label}</button>
              ))}
            </div>
            <button className="link" style={{ marginTop: 14 }} disabled={busy} onClick={turnOff}>Tắt trên máy này</button>
          </>
        )}
      </div>
    </>
  );
}
