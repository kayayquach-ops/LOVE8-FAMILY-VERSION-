import './callcard.css';
import { tap } from './sound';
import { Icon } from './ui';

/** Lời mời gọi nhẹ trên Trang chủ. Chỉ bấm "Nghe máy" mới vào màn gọi toàn màn hình. */
export function CallCard({ role, onAnswer, onLater }: { role: string; onAnswer: () => void; onLater: () => void }) {
  const text = role === 'bo' ? 'Con muốn nói chuyện với Bố một chút. Nghe máy nhé?'
    : role === 'me' ? 'Con muốn nói chuyện với Mẹ một chút. Nghe máy nhé?'
      : 'Mình muốn nói chuyện với bạn một chút. Nghe máy nhé?';
  return (
    <section className="callcard fade">
      <i className="callcard-ico"><Icon name="phone" size={20} /></i>
      <p>{text}</p>
      <div className="callcard-btns">
        <button className="callcard-yes" onClick={() => { tap(); onAnswer(); }}>Nghe máy</button>
        <button className="callcard-later" onClick={() => { tap(); onLater(); }}>Để sau</button>
      </div>
    </section>
  );
}
