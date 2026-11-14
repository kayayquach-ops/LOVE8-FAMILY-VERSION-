import './callcard.css';
import { tap } from './sound';
import { t } from './i18n';

/** Lời mời gọi nhẹ trên Trang chủ: một hàng đen, nút trắng "nghe máy", bên dưới là "để sau". Chỉ bấm nghe máy mới vào màn gọi. */
export function CallCard({ role, onAnswer, onLater }: { role: string; onAnswer: () => void; onLater: () => void }) {
  const text = t(role === 'bo' ? 'call.card.bo' : role === 'me' ? 'call.card.me' : 'call.card.con');
  return (
    <section className="callcard fade">
      <p>{text}<small>{t('call.card.len')}</small></p>
      <div className="callcard-btns">
        <button className="callcard-yes" onClick={() => { tap(); onAnswer(); }}>{t('call.card.pick')}</button>
        <button className="callcard-later" onClick={() => { tap(); onLater(); }}>{t('call.card.later')}</button>
      </div>
    </section>
  );
}
