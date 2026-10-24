import { tap } from './sound';
import { Icon } from './ui';

export type Tab = 'home' | 'chat' | 'camera' | 'calendar' | 'jar';

const ITEMS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'home', label: 'Nhà', icon: 'home' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'camera', label: '', icon: '' },
  { id: 'calendar', label: 'Lịch', icon: 'calendar' },
  { id: 'jar', label: 'Lọ thương', icon: 'jar' },
];

/** Thanh dưới: Nhà, Chat, nút camera tròn ở giữa, Lịch, Lọ thương. */
export function TabBar({ active, unread, onSelect }: { active: string; unread?: number; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Các mục chính">
      {ITEMS.map((it) => it.id === 'camera' ? (
        <button key="camera" className={`tab-cam ${active === 'camera' ? 'on' : ''}`} aria-label="Camera, chụp gửi cả nhà" aria-current={active === 'camera' ? 'page' : undefined} onClick={() => { tap(); onSelect('camera'); }}><i /></button>
      ) : (
        <button key={it.id} className={`tab ${active === it.id ? 'on' : ''}`} aria-current={active === it.id ? 'page' : undefined} aria-label={it.id === 'chat' && unread ? `Chat, ${unread} tin mới` : undefined} onClick={() => { tap(); onSelect(it.id); }}>
          <Icon name={it.icon} size={24} />
          <span>{it.label}</span>
          {it.id === 'chat' && !!unread && <b className="badge">{unread}</b>}
        </button>
      ))}
    </nav>
  );
}
