// Cài đặt của Mây: công tắc "Mây nhắc mình liên lạc", công tắc "Thử Mây mới" (Mây Live, ẩn) và danh sách "Mây nhớ gì về mình" (xoá được từng dòng).
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { liveBeta } from './liveBeta';
import { mascotNameOf, type Me } from './shared';
import { tap } from './sound';
import { toast } from './ui';

type Fact = { id: string; text: string; kind: string; by: string; createdAt: string };

export function MaySettings({ me }: { me: Me }) {
  const mascot = mascotNameOf(me.family);
  const [nudges, setNudges] = useState(true);
  const [live, setLive] = useState(false);
  // Công tắc thử: hiện khi máy chủ đang mở Mây Live và máy này đã được mở cho thấy (liveBeta.ts),
  // hoặc khi mình đang bật sẵn (máy nào cũng tắt được).
  const [showLive, setShowLive] = useState(false);
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<Fact[] | null>(null);

  // Giá trị máy chủ đang giữ (lần đọc hay lần lưu được gần nhất): lưu lỗi thì công tắc về đúng giá trị ấy, không về giá trị tạm
  // của lần bấm trước (bấm nhanh hai lần mà cả hai lỗi thì công tắc vẫn khớp máy chủ).
  const saved = useRef(true);
  const savedLive = useRef(false);
  useEffect(() => {
    api.maySettings().then((s) => {
      saved.current = s.nudges; setNudges(s.nudges);
      savedLive.current = s.live; setLive(s.live);
      setShowLive(s.live || (s.liveAvail && liveBeta()));
    }).catch(() => {});
  }, []);

  const flip = () => {
    tap();
    const v = !nudges;
    setNudges(v);
    api.setMaySettings({ nudges: v }).then(() => { saved.current = v; }).catch((e) => { setNudges(saved.current); toast((e as Error).message); });
  };
  const flipLive = () => {
    tap();
    const v = !live;
    setLive(v);
    api.setMaySettings({ live: v }).then(() => { savedLive.current = v; }).catch((e) => { setLive(savedLive.current); toast((e as Error).message); });
  };
  const toggleList = () => {
    tap();
    const v = !open;
    setOpen(v);
    if (v) api.memory().then(setFacts).catch((e) => { setOpen(false); toast((e as Error).message); });
  };
  const forget = (id: string) => {
    tap();
    api.forget(id).then(() => { setFacts((fs) => fs?.filter((f) => f.id !== id) ?? fs); toast(t('may.memory.forgot')); }).catch((e) => toast((e as Error).message));
  };

  return (
    <div className="panel">
      <button className="set-switch" role="switch" aria-checked={nudges} onClick={flip}>
        <span>{t('may.settings.nudge', { mascot })}</span>
        <i className={nudges ? 'on' : ''} aria-hidden><u /></i>
      </button>
      {showLive && (
        <button className="set-switch" role="switch" aria-checked={live} onClick={flipLive}>
          <span>{t('may.settings.live', { mascot })}</span>
          <i className={live ? 'on' : ''} aria-hidden><u /></i>
        </button>
      )}
      <button className="set-switch" aria-expanded={open} onClick={toggleList}>
        <span>{t('may.memory.title', { mascot })}</span>
      </button>
      {open && facts && (
        <div className="fade">
          {facts.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>{t('may.memory.empty', { mascot })}</div>}
          {facts.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {f.text}
                {f.by && <small className="muted" style={{ display: 'block' }}>{t('may.memory.by', { name: f.by })}</small>}
              </span>
              <button className="link" onClick={() => forget(f.id)}>{t('may.memory.forget')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
