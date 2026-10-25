import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api, isSignedOut, token } from './api';
import { Camera } from './Camera';
import { Feed } from './Feed';
import { Hug } from './Hug';
import { Greeting, Onboarding } from './Onboarding';
import type { Me } from './shared';
import { Calendar } from './Calendar';
import { Jar } from './Jar';
import { Family } from './Sheets';
import { Home } from './Home';
import { Chat } from './Chat';
import { Incoming } from './Incoming';
import { connectLive, livePost, onLive, type LiveRoom } from './live';
import { onPushOpen, syncPush } from './push';
import { TabBar, type Tab } from './TabBar';
import { Mesh, Toaster } from './ui';
import { t, useLang } from './i18n';

// Màn ít dùng tải sau, để lần mở app đầu tiên nhẹ hơn. Rảnh thì tải sẵn, lúc bấm vào là có ngay.
const loadRecap = () => import('./Recap');
const loadLetters = () => import('./Letters');
const loadSettings = () => import('./Settings');
const loadPodcast = () => import('./Podcast');
const loadCall = () => import('./Call');
const loadFaceTime = () => import('./FaceTime');
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })));
const Letters = lazy(() => loadLetters().then((m) => ({ default: m.Letters })));
const Recap = lazy(() => loadRecap().then((m) => ({ default: m.Recap })));
const Podcast = lazy(() => loadPodcast().then((m) => ({ default: m.Podcast })));
const Call = lazy(() => loadCall().then((m) => ({ default: m.Call })));
const FaceTime = lazy(() => loadFaceTime().then((m) => ({ default: m.FaceTime })));

const HUG_KEY = 'homeletter-hug-day';
const ME_KEY = 'homeletter-me';
const today = () => new Date().toDateString();

export function App() {
  // Đổi ngôn ngữ thì vẽ lại cả app một lần.
  useLang();
  // Mở app là hiện ngay bản lưu lần trước (tên nhà, cả nhà), máy chủ trả lời thì thay bằng bản mới. Không còn màn trống lúc chờ mạng.
  const [me, setMe] = useState<Me | null>(() => { if (!token.get()) return null; try { return JSON.parse(localStorage.getItem(ME_KEY) ?? 'null'); } catch { return null; } });
  const [ready, setReady] = useState(() => !!me);
  const [sheet, setSheet] = useState<'feed' | 'jar' | 'family' | 'calendar' | 'chat' | 'recap' | 'podcast' | 'letters' | 'settings' | null>(null);
  // Mở app là vào camera như Locket; Trang chủ là một tab.
  const [tab, setTab] = useState<'home' | 'camera'>('camera');
  const [chatUnread, setChatUnread] = useState(0);
  const [podcastId, setPodcastId] = useState<string | null>(null);
  const [feedPost, setFeedPost] = useState<string | null>(null);
  // Mở app mà chưa nối được máy chủ: giữ mã của máy, chỉ báo và cho thử lại.
  const [offline, setOffline] = useState(false);
  const [calling, setCalling] = useState(false);
  // Đến lịch gọi thì chỉ hiện thẻ mời trên Trang chủ; màn đổ chuông chỉ mở khi người dùng bấm Nghe máy.
  const [callDue, setCallDue] = useState(false);
  // Gọi video cả nhà: phòng đang mở, mình có đang trong cuộc gọi không, cuộc nào mình đã từ chối hoặc vừa rời.
  const [room, setRoom] = useState<LiveRoom>(null);
  const [facetime, setFacetime] = useState(false);
  const inCall = useRef(false);
  inCall.current = facetime;
  const [skipRoom, setSkipRoom] = useState<string | null>(null);
  const [greet, setGreet] = useState(true);
  // Màn "giữ để ôm" mỗi ngày đã bỏ theo yêu cầu: mở app là vào thẳng Trang chủ sau màn chào. Đặt lại thành kiểm HUG_KEY để bật lại.
  const [hug, setHug] = useState(false);

  const loadUnread = () => fetch('/api/chat/unread', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json()).then((d) => setChatUnread(d.n ?? 0)).catch(() => {});
  const checkCall = () => fetch('/api/call/due', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json())
    .then((d) => setCallDue(!!d.due)).catch(() => {});
  // Bản mới giống hệt bản đang có thì giữ nguyên đối tượng cũ: không vẽ lại cả app mỗi lần hỏi máy chủ (30 giây một lần).
  const meJson = useRef(me ? JSON.stringify(me) : '');
  const loadMe = () => api.me().then((m) => {
    setOffline(false);
    const s = JSON.stringify(m);
    if (s === meJson.current) return;
    meJson.current = s;
    setMe(m);
    try { localStorage.setItem(ME_KEY, s); } catch {}
  });
  const load = () => {
    void loadUnread(); void checkCall();
    return loadMe().catch((e) => {
      // Chỉ bỏ mã khi máy chủ nói rõ mã không còn; mất mạng thì giữ nguyên để khỏi phải vào nhà lại.
      if (isSignedOut(e)) { token.clear(); setMe(null); } else setOffline(true);
    }).finally(() => setReady(true));
  };
  useEffect(() => {
    if (token.get()) void load(); else setReady(true);
    // Màn gọi video tải sau cùng, lúc rảnh hẳn: chỉ là mã và khai báo chữ, tệp phông của phần chụp chung chỉ tải khi vẽ đến.
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const idle = (f: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 4000 }) : f());
    const warm = () => { void loadCall(); void loadPodcast(); void loadRecap(); void loadLetters(); void loadSettings(); idle(() => void loadFaceTime()); };
    const t = setTimeout(() => idle(warm), 2500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!me) return;
    // Ẩn app thì thôi hỏi máy chủ; mở lại là hỏi ngay một lần.
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [!!me]);
  useEffect(() => {
    if (!me) return;
    connectLive();
    return onLive((m) => {
      if (m.type !== 'hello' && m.type !== 'room') return;
      // Tải lại trang giữa cuộc gọi thì máy chủ còn giữ mình trong phòng: rời hẳn để chuông reo lại đúng.
      if (m.type === 'hello' && !inCall.current && m.room?.members.includes(me.me.id)) void livePost('leave').catch(() => {});
      setRoom(m.room);
    });
  }, [!!me]);

  // Chạm vào thông báo: mở đúng màn. Cuộc gọi video thì để chuông hiện lại cho mình bấm vào.
  useEffect(() => {
    if (!me) return;
    void syncPush();
    return onPushOpen((o) => {
      if (o === 'call') { setSkipRoom(null); setSheet(null); setTab('camera'); }
      else if (o === 'weekly') setCalling(true);
      else if (o === 'chat' || o === 'calendar') setSheet(o);
      else if (o === 'letter') setSheet('letters');
      else if (o === 'post') setSheet('feed');
    });
  }, [!!me]);

  // Mở tin nhà, chat, gia đình thì lấy lại danh sách cả nhà: người mới vào nhà không hiện thành "?" hay "Ai đó".
  // Chỉ hỏi lại danh sách cả nhà, không kéo theo số tin chat và lịch gọi (đỡ hai yêu cầu mỗi lần mở).
  useEffect(() => { if (me && (sheet === 'feed' || sheet === 'chat' || sheet === 'family')) void loadMe().catch(() => {}); }, [sheet]);

  const doneHug = () => { try { localStorage.setItem(HUG_KEY, today()); } catch {} setHug(false); };

  let body = null;
  if (!ready) body = null;
  else if (!me && offline) body = (
    <div className="screen"><div className="center" style={{ alignItems: 'center', textAlign: 'center', gap: 18 }}>
      <div className="h1">{t('app.offline.title')}</div>
      <div className="muted">{t('app.offline.body')}</div>
      <button className="btn" style={{ maxWidth: 260 }} onClick={() => void load()}>{t('common.retry')}</button>
    </div></div>
  );
  else if (!me) body = <Onboarding onDone={() => { history.replaceState(null, '', '/'); doneHug(); void load(); }} />;
  else if (greet) body = <Greeting onDone={() => setGreet(false)} />;
  else if (hug) body = <Hug name={me.me.name} onDone={doneHug} />;
  else body = (
    <>
      {tab === 'home'
        ? <Home me={me} callDue={callDue && !calling} onCall={() => setCalling(true)} onOpen={(s, arg) => { if (s === 'camera') return setTab('camera'); if (s === 'podcast') setPodcastId(arg ?? null); if (s === 'feed') setFeedPost(arg ?? null); setSheet(s); }} />
        : <Camera me={me} active={!sheet && !facetime && !calling} onOpen={(s) => { if (s === 'feed') setFeedPost(null); setSheet(s); }} onSent={load} />}
      {!sheet && <TabBar active={tab} unread={chatUnread} onSelect={(t: Tab) => {
        if (t === 'home' || t === 'camera') { setSheet(null); setTab(t); } else setSheet(t);
      }} />}
      {sheet === 'feed' && <Feed me={me} start={feedPost} onClose={() => { setSheet(null); void load(); }} />}
      {sheet === 'jar' && <Jar me={me} onClose={() => setSheet(null)} />}
      {sheet === 'calendar' && <Calendar me={me} onClose={() => setSheet(null)} onWish={() => setSheet('chat')} />}
      {sheet === 'chat' && <Chat me={me} live={!!room} onClose={() => { setSheet(null); void loadUnread(); }} onCall={() => setFacetime(true)} />}
      <Suspense fallback={null}>
      {sheet === 'settings' && <Settings me={me} onClose={() => setSheet(null)} onProfile={() => setSheet('family')} />}
      {sheet === 'letters' && <Letters me={me} onClose={() => setSheet(null)} />}
      {sheet === 'recap' && <Recap me={me} onClose={() => setSheet(null)} />}
      {sheet === 'family' && <Family me={me} onClose={() => setSheet(null)} onChanged={load} onSettings={() => setSheet('settings')} />}
      {sheet === 'podcast' && <Podcast me={me} start={podcastId} onClose={() => setSheet(null)} onCall={() => setCalling(true)} />}
      {facetime && <FaceTime me={me} onClose={() => { setFacetime(false); setSkipRoom(room?.id ?? null); }} />}
      {!facetime && !calling && room && !room.members.includes(me.me.id) && skipRoom !== room.id && (
        <Incoming me={me} room={room} onAccept={() => setFacetime(true)} onDecline={() => setSkipRoom(room.id)} />
      )}
      {calling && <Call me={me} onClose={(done) => { setCalling(false); if (done) setCallDue(false); void checkCall(); if (done) { setPodcastId(null); setSheet('podcast'); } }} />}
      </Suspense>
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
