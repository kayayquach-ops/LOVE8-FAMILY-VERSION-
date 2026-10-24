import { tap } from './sound';
import { Icon } from './ui';
import { t } from './i18n';

export type Tab = 'home' | 'chat' | 'camera' | 'calendar' | 'jar';

const ITEMS: Array<{ id: Tab; icon: string }> = [
  { id: 'home', icon: 'home' },
  { id: 'chat', icon: 'chat' },
  { id: 'camera', icon: '' },
  { id: 'calendar', icon: 'calendar' },
  { id: 'jar', icon: 'jar' },
];

/** Thanh dưới: Nhà, Chat, nút camera tròn ở giữa, Lịch, Lọ thương. */
export function TabBar({ active, unread, onSelect }: { active: string; unread?: number; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={t('tab.nav')}>
      {ITEMS.map((it) => it.id === 'camera' ? (
        <button key="camera" className={`tab-cam ${active === 'camera' ? 'on' : ''}`} aria-label={t('tab.cameraAria')} aria-current={active === 'camera' ? 'page' : undefined} onClick={() => { tap(); onSelect('camera'); }}><i /></button>
      ) : (
        <button key={it.id} className={`tab ${active === it.id ? 'on' : ''}`} aria-current={active === it.id ? 'page' : undefined} aria-label={it.id === 'chat' && unread ? t('tab.chatUnread', { n: unread }) : undefined} onClick={() => { tap(); onSelect(it.id); }}>
          <Icon name={it.icon} size={24} />
          <span>{t(`tab.${it.id as 'home' | 'chat' | 'calendar' | 'jar'}`)}</span>
          {it.id === 'chat' && !!unread && <b className="badge">{unread}</b>}
        </button>
      ))}
    </nav>
  );
}
