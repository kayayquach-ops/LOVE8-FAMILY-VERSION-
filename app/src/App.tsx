import { useEffect, useState } from 'react';
import { api, token } from './api';
import { Camera } from './Camera';
import { Feed } from './Feed';
import { Hug } from './Hug';
import { Onboarding } from './Onboarding';
import type { Me } from './shared';
import { Calendar } from './Calendar';
import { Jar } from './Jar';
import { Family } from './Sheets';
import { Home } from './Home';
import { Chat } from './Chat';
import { Recap } from './Recap';
import { Podcast } from './Podcast';
import { Call, snoozed } from './Call';
import { TabBar, type Tab } from './TabBar';
import { Mesh, Toaster } from './ui';

const HUG_KEY = 'homeletter-hug-day';
const today = () => new Date().toDateString();

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'feed' | 'jar' | 'family' | 'calendar' | 'chat' | 'recap' | 'podcast' | null>(null);
  // Mở app là vào camera như Locket; Trang chủ là một tab.
  const [tab, setTab] = useState<'home' | 'camera'>('camera');
  const [chatUnread, setChatUnread] = useState(0);
  const [podcastId, setPodcastId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [hug, setHug] = useState(() => { try { return localStorage.getItem(HUG_KEY) !== today(); } catch { return false; } });

  const loadUnread = () => fetch('/api/chat/unread', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json()).then((d) => setChatUnread(d.n ?? 0)).catch(() => {});
  // Tới lịch gọi tuần mà chưa gọi thì đổ chuông (trừ khi vừa bấm Để sau).
  const checkCall = () => fetch('/api/call/due', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json())
    .then((d) => { if (d.due && !snoozed()) setCalling(true); }).catch(() => {});
  const load = () => { void loadUnread(); void checkCall(); return api.me().then(setMe).catch(() => { token.clear(); setMe(null); }).finally(() => setReady(true)); };
  useEffect(() => {
    if (token.get()) void load(); else setReady(true);
  }, []);
  useEffect(() => {
    if (!me) return;
    const t = setInterval(load, 30000);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [!!me]);

  const doneHug = () => { try { localStorage.setItem(HUG_KEY, today()); } catch {} setHug(false); };

  let body = null;
  if (!ready) body = null;
  else if (!me) body = <Onboarding onDone={() => { history.replaceState(null, '', '/'); doneHug(); void load(); }} />;
  else if (hug) body = <Hug name={me.me.name} onDone={doneHug} />;
  else body = (
    <>
      {tab === 'home'
        ? <Home me={me} onOpen={(s, arg) => { if (s === 'camera') return setTab('camera'); if (s === 'podcast') setPodcastId(arg ?? null); setSheet(s); }} />
        : <Camera me={me} onOpen={setSheet} onSent={load} />}
      {!sheet && <TabBar active={tab} unread={chatUnread} onSelect={(t: Tab) => {
        if (t === 'home' || t === 'camera') { setSheet(null); setTab(t); } else setSheet(t);
      }} />}
      {sheet === 'feed' && <Feed me={me} onClose={() => { setSheet(null); void load(); }} />}
      {sheet === 'jar' && <Jar me={me} onClose={() => setSheet(null)} />}
      {sheet === 'calendar' && <Calendar me={me} onClose={() => setSheet(null)} onWish={() => setSheet(null)} />}
      {sheet === 'chat' && <Chat me={me} onClose={() => { setSheet(null); void loadUnread(); }} />}
      {sheet === 'recap' && <Recap me={me} onClose={() => setSheet(null)} />}
      {sheet === 'family' && <Family me={me} onClose={() => setSheet(null)} onChanged={load} />}
      {sheet === 'podcast' && <Podcast me={me} start={podcastId} onClose={() => setSheet(null)} onCall={() => setCalling(true)} />}
      {calling && <Call me={me} onClose={(done) => { setCalling(false); if (done) { setPodcastId(null); setSheet('podcast'); } }} />}
    </>
  );

  return (
    <>
      <Mesh />
      {body}
      <Toaster />
    </>
  );
}
