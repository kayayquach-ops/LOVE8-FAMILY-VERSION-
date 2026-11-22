// Cài đặt của Mây: công tắc "Mây nhắc mình liên lạc". Từ 22/11 không còn màn "Mây nhớ gì về mình": sổ nhớ chỉ lớn dần, người dùng không xem hay xoá từng dòng.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { mascotNameOf, type Me } from './shared';
import { tap } from './sound';
import { toast } from './ui';

export function MaySettings({ me }: { me: Me }) {
  const mascot = mascotNameOf(me.family);
  const [nudges, setNudges] = useState(true);

  // Giá trị máy chủ đang giữ (lần đọc hay lần lưu được gần nhất): lưu lỗi thì công tắc về đúng giá trị ấy, không về giá trị tạm
  // của lần bấm trước (bấm nhanh hai lần mà cả hai lỗi thì công tắc vẫn khớp máy chủ).
  const saved = useRef(true);
  useEffect(() => {
    api.maySettings().then((s) => {
      saved.current = s.nudges; setNudges(s.nudges);
    }).catch(() => {});
  }, []);

  const flip = () => {
    tap();
    const v = !nudges;
    setNudges(v);
    api.setMaySettings({ nudges: v }).then(() => { saved.current = v; }).catch((e) => { setNudges(saved.current); toast((e as Error).message); });
  };
  return (
    <div className="panel">
      <button className="set-switch" role="switch" aria-checked={nudges} onClick={flip}>
        <span>{t('may.settings.nudge', { mascot })}</span>
        <i className={nudges ? 'on' : ''} aria-hidden><u /></i>
      </button>
    </div>
  );
}
