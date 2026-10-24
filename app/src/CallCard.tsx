import './callcard.css';
import { tap } from './sound';
import { Icon } from './ui';
import { t } from './i18n';

/** Lời mời gọi nhẹ trên Trang chủ. Chỉ bấm "Nghe máy" mới vào màn gọi toàn màn hình. */
export function CallCard({ role, onAnswer, onLater }: { role: string; onAnswer: () => void; onLater: () => void }) {
  const text = t(role === 'bo' ? 'call.card.bo' : role === 'me' ? 'call.card.me' : 'call.card.con');
  return (
    <section className="callcard fade">
      <i className="callcard-ico"><Icon name="phone" size={20} /></i>
      <p>{text}</p>
      <div className="callcard-btns">
        <button className="callcard-yes" onClick={() => { tap(); onAnswer(); }}>{t('call.pickUp')}</button>
        <button className="callcard-later" onClick={() => { tap(); onLater(); }}>{t('common.later')}</button>
      </div>
    </section>
  );
}
