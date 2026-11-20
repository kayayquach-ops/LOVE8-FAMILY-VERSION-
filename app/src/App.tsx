import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api, fromGoogle, isSignedOut, joinPending, joinWait, token, type JoinWaitInfo } from './api';
import { Camera } from './Camera';
import { Feed } from './Feed';
import { Hug } from './Hug';
import { MayTab } from './MayTab';
import { NotifyAsk } from './NotifyAsk';
import { Greeting, JoinWait, Onboarding, sendKept } from './Onboarding';
import type { Me, Shot } from './shared';
import { GroupShot } from './GroupShot';
import { isInviteFor, isPendingFor, shotIdFrom } from './shot';
import { Calendar } from './Calendar';
import { Jar } from './Jar';
import { Family } from './Sheets';
import { Home } from './Home';
import { Chat } from './Chat';
import { Incoming } from './Incoming';
import { connectLive, disconnectLive, livePost, onLive, type LiveRoom } from './live';
import { useLocationLive } from './location';
import { onPushOpen, syncPush } from './push';
import { resumeOutbox } from './outbox';
import { TabBar, type Tab } from './TabBar';
import { applyMascot } from './mascotStore';
import { Mesh, Toaster, toast } from './ui';
import { t, useLang } from './i18n';

// Màn ít dùng tải sau, để lần mở app đầu tiên nhẹ hơn. Rảnh thì tải sẵn, lúc bấm vào là có ngay.
const loadRecap = () => import('./Recap');
const loadLetters = () => import('./Letters');
const loadSettings = () => import('./Settings');
const loadMascotSheet = () => import('./MascotSheet');
const loadPodcast = () => import('./Podcast');
const loadCall = () => import('./Call');
const loadFaceTime = () => import('./FaceTime');
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })));
const MascotSheet = lazy(() => loadMascotSheet().then((m) => ({ default: m.MascotSheet })));
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
  const [me, setMe] = useState<Me | null>(() => { if (!token.get()) return null; try { const m: Me | null = JSON.parse(localStorage.getItem(ME_KEY) ?? 'null'); applyMascot(m?.family); return m; } catch { return null; } });
  // Tên và hình linh vật của nhà: chữ có {mascot} và mọi chỗ vẽ linh vật theo nhà đang ở.
  useEffect(() => { applyMascot(me?.family); }, [me?.family.mascotName, me?.family.mascotShape]);
  const [ready, setReady] = useState(() => !!me);
  // Liên kết Google từ Cài đặt xong, quay về thì mở lại Cài đặt để thấy kết quả.
  const [sheet, setSheet] = useState<'feed' | 'jar' | 'family' | 'calendar' | 'chat' | 'recap' | 'podcast' | 'letters' | 'settings' | 'mascot' | 'shot' | null>(() => (fromGoogle && token.get() ? 'settings' : null));
  // Mở app là vào camera như Locket; Trang chủ là một tab.
  const [tab, setTab] = useState<'home' | 'camera' | 'may'>('camera');
  const [chatUnread, setChatUnread] = useState(0);
  // Chạm thông báo tin riêng: mở thẳng luồng riêng với người gửi.
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [podcastId, setPodcastId] = useState<string | null>(null);
  const [feedPost, setFeedPost] = useState<string | null>(null);
  // Mở app mà chưa nối được máy chủ: giữ mã của máy, chỉ báo và cho thử lại.
  const [offline, setOffline] = useState(false);
  // Mã của máy là một lời xin vào nhà còn chờ: hiện màn chờ thay cho app. denied: lời xin đã mất, báo một câu rồi về màn đầu.
  const [waiting, setWaiting] = useState<(JoinWaitInfo & { denied?: boolean }) | null>(null);
  const [calling, setCalling] = useState(false);
  // Đến lịch gọi thì chỉ hiện thẻ mời trên Trang chủ; màn đổ chuông chỉ mở khi người dùng bấm Nghe máy.
  const [callDue, setCallDue] = useState(false);
  // Gọi video cả nhà: phòng đang mở, mình có đang trong cuộc gọi không, cuộc nào mình đã từ chối hoặc vừa rời.
  const [room, setRoom] = useState<LiveRoom>(null);
  const [facetime, setFacetime] = useState(false);
  const [callTo, setCallTo] = useState<string | null>(null);
  // audio: gọi thoại (không camera). Nút gọi ở đầu khung chat gọi startFaceTime(id, { audio: true }).
  const [callAudio, setCallAudio] = useState(false);
  const startFaceTime = (to?: string | null, opts?: { audio?: boolean }) => { setCallTo(to ?? null); setCallAudio(!!opts?.audio); setFacetime(true); };
  const inCall = useRef(false);
  inCall.current = facetime;
  const [skipRoom, setSkipRoom] = useState<string | null>(null);
  // Mở từ thông báo (?open=...) thì vào thẳng, không chờ màn chào: cuộc gọi chỉ đổ chuông vài chục giây.
  const [greet, setGreet] = useState(() => !new URLSearchParams(location.search).get('open') && !new URLSearchParams(location.search).get('shot') && !(fromGoogle && token.get()));
  // Màn "giữ để ôm" mỗi ngày đã bỏ theo yêu cầu: mở app là vào thẳng Trang chủ sau màn chào. Đặt lại thành kiểm HUG_KEY để bật lại.
  const [hug, setHug] = useState(false);

  const loadUnread = () => fetch('/api/chat/unread', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json()).then((d) => setChatUnread(d.n ?? 0)).catch(() => {});
  const checkCall = () => fetch('/api/call/due', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json())
    .then((d) => setCallDue(!!d.due)).catch(() => {});
  // Bản mới giống hệt bản đang có thì giữ nguyên đối tượng cũ: không vẽ lại cả app mỗi lần hỏi máy chủ (30 giây một lần).
  const meJson = useRef(me ? JSON.stringify(me) : '');
  const loadMe = () => api.me().then((m) => {
    setOffline(false);
    setWaiting(null);
    // Vừa được cho vào nhà (kể cả lúc app đang tắt): gửi câu thu âm, ngày sinh đã giữ trong máy lúc xin vào.
    if (joinWait.get()) { joinWait.clear(); void sendKept(); }
    const s = JSON.stringify(m);
    if (s === meJson.current) return;
    meJson.current = s;
    setMe(m);
    try { localStorage.setItem(ME_KEY, s); } catch {}
  });
  const load = () => {
    void loadUnread(); void checkCall();
    return loadMe().catch((e) => {
      // Lời xin vào nhà còn chờ (403 join_pending): giữ mã, hiện màn chờ.
      const p = joinPending(e);
      if (p) { joinWait.set(p); setWaiting(p); return; }
      // Chỉ bỏ mã khi máy chủ nói rõ mã không còn; mất mạng thì giữ nguyên để khỏi phải vào nhà lại.
      // Máy của người vừa bị xoá khỏi nhà cũng rơi vào đây: bỏ mã, đóng kênh gọi video của nhà cũ, đóng màn đang mở, về màn chào.
      // Máy đang chờ vào nhà mà lời xin mất (không được cho vào, hết hạn): báo một câu trước khi về màn đầu.
      if (isSignedOut(e)) {
        const w = joinWait.get();
        token.clear(); disconnectLive(); setSheet(null); setMe(null);
        setWaiting(w ? { ...w, denied: true } : null);
      } else setOffline(true);
    }).finally(() => setReady(true));
  };
  useEffect(() => {
    if (token.get()) void load(); else setReady(true);
    // Lần trước tắt app khi câu trả lời cuộc gọi chưa gửi xong: gửi tiếp.
    if (token.get()) void resumeOutbox();
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
  // Hỏi thẳng máy chủ xem nhà đang có cuộc gọi không: kênh sự kiện có thể đã chết khi app nằm nền.
  const syncRoom = () => fetch('/api/live/room', { headers: { authorization: `Bearer ${token.get()}` } }).then((r) => r.json())
    .then((d) => setRoom((prev) => (JSON.stringify(prev) === JSON.stringify(d.room ?? null) ? prev : (d.room ?? null)))).catch(() => {});
  useEffect(() => {
    if (!me) return;
    const iv = setInterval(() => { if (!document.hidden && !inCall.current) void syncRoom(); }, 4000);
    const onShow = () => { if (document.visibilityState === 'visible') { connectLive(); void syncRoom(); } };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onShow); };
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

  // Vị trí cả nhà (src/location.ts): gửi vị trí của mình khi đang bật chia sẻ và app đang mở; người khác đổi chỗ thì sửa đúng người đó.
  useLocationLive(me, setMe);

  // Chạm vào thông báo: mở đúng màn. Cuộc gọi video thì để chuông hiện lại cho mình bấm vào.
  useEffect(() => {
    if (!me) return;
    void syncPush();
    return onPushOpen((o) => {
      if (o === 'call') { setSkipRoom(null); setSheet(null); setTab('camera'); connectLive(); void syncRoom(); }
      // Có người xin vào nhà: thẻ cho vào nằm ở Trang chủ.
      else if (o === 'join') { setSheet(null); setTab('home'); void loadMe().catch(() => {}); }
      else if (o === 'weekly') setCalling(true);
      else if (o === 'chat' || o === 'calendar') setSheet(o);
      else if (o.startsWith('chat:')) { setChatWith(o.slice(5)); setSheet('chat'); }
      else if (o === 'letter') setSheet('letters');
      else if (o === 'post') setSheet('feed');
      else if (o === 'recap') setSheet('recap');
      else if (o.startsWith('shot')) { const id = shotIdFrom(o); if (id) void openShot(id); else void loadShots(); }
    });
  }, [!!me]);

  // Mở tin nhà, chat, gia đình thì lấy lại danh sách cả nhà: người mới vào nhà không hiện thành "?" hay "Ai đó".
  // Chỉ hỏi lại danh sách cả nhà, không kéo theo số tin chat và lịch gọi (đỡ hai yêu cầu mỗi lần mở).
  useEffect(() => { if (me && (sheet === 'feed' || sheet === 'chat' || sheet === 'family')) void loadMe().catch(() => {}); }, [sheet]);

  // Chụp chung dù ở xa (docs/chup-chung.md): các lượt có tên mình trong 48 giờ qua (máy chủ trả mọi trạng thái, mới nhất trước).
  // Lượt đang chờ mà mình chưa chụp là lời rủ: camera tự sang chụp chung. Lời rủ bấm x thì thôi trong phiên này.
  const [shots, setShots] = useState<Shot[]>([]);
  const [shot, setShot] = useState<Shot | null>(null);
  const [skipShots, setSkipShots] = useState<string[]>([]);
  const meRef = useRef(me);
  meRef.current = me;
  const loadShots = () => api.shotsOpen().then((d) => setShots((prev) => (JSON.stringify(prev) === JSON.stringify(d.shots) ? prev : d.shots))).catch(() => {});
  // Cập nhật một lượt (mới thì đặt lên đầu, để lời rủ vừa mở từ thông báo được chọn trước).
  const putShot = (s: Shot, front = false) => setShots((l) => {
    const i = l.findIndex((x) => x.id === s.id);
    if (i >= 0 && !front) { if (JSON.stringify(l[i]) === JSON.stringify(s)) return l; const n = [...l]; n[i] = s; return n; }
    return [s, ...l.filter((x) => x.id !== s.id)];
  });
  const viewShot = (s: Shot) => { putShot(s); setShot(s); setSheet('shot'); };
  // Mở một lượt theo id (thông báo, /?shot=<id>): mình chưa chụp thì về camera chụp phần mình, không thì mở màn chụp chung.
  const openShot = (id: string) => api.shot(id).then(({ shot: s }) => {
    const meId = meRef.current?.me.id ?? '';
    if (isInviteFor(s, meId)) { putShot(s, true); setSkipShots((k) => k.filter((x) => x !== s.id)); setShot(null); setSheet(null); setTab('camera'); }
    else viewShot(s);
  }).catch((e: Error) => toast(e.message));
  useEffect(() => {
    if (!me) return;
    const q = new URLSearchParams(location.search).get('shot');
    if (q) {
      const u = new URL(location.href);
      u.searchParams.delete('shot');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      void openShot(q);
    }
    void loadShots();
    const onShow = () => { if (document.visibilityState === 'visible') void loadShots(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [!!me]);
  const invite = me ? shots.find((s) => isInviteFor(s, me.me.id) && !skipShots.includes(s.id)) ?? null : null;
  const pending = me ? shots.find((s) => isPendingFor(s, me.me.id)) ?? null : null;

  const doneHug = () => { try { localStorage.setItem(HUG_KEY, today()); } catch {} setHug(false); };

  // Gọi thoại từ luồng tin riêng (Chat.tsx). TẠM THỜI mở cuộc gọi video như nút gọi video.
  // Khi FaceTime có chế độ chỉ tiếng, chỉ cần trỏ hàm này sang lối vào đó; Chat không phải sửa gì.
  const startVoiceCall = (memberId: string) => startFaceTime(memberId, { audio: true });
  // Đóng chat bằng bất kỳ đường nào thì lần mở sau về danh sách, không mở lại luồng cũ của thông báo.
  useEffect(() => { if (sheet !== 'chat') setChatWith(null); }, [sheet]);

  let body = null;
  if (!ready) body = null;
  else if (!me && waiting) body = (
    <JoinWait key={waiting.denied ? 'no' : 'wait'} info={waiting} denied={waiting.denied}
      onIn={() => void load()} onOut={() => { token.clear(); setWaiting(null); }} />
  );
  else if (!me && offline) body = (
    <div className="screen"><div className="center" style={{ alignItems: 'center', textAlign: 'center', gap: 18 }}>
      <div className="h1">{t('app.offline.title')}</div>
      <div className="muted">{t('app.offline.body')}</div>
      <button className="btn" style={{ maxWidth: 260 }} onClick={() => void load()}>{t('common.retry')}</button>
    </div></div>
  );
  else if (!me) body = <Onboarding onDone={(p) => { history.replaceState(null, '', '/'); if (p) return setWaiting(p); doneHug(); void load(); }} />;
  else if (greet) body = <Greeting onDone={() => setGreet(false)} />;
  else if (hug) body = <Hug name={me.me.name} onDone={doneHug} />;
  else body = (
    <>
      {tab === 'home'
        ? <Home me={me} callDue={callDue && !calling} onCall={() => setCalling(true)} onChanged={() => void loadMe().catch(() => {})} onOpen={(s, arg) => { if (s === 'camera') return setTab('camera'); if (s === 'podcast') setPodcastId(arg ?? null); if (s === 'feed') setFeedPost(arg ?? null); setSheet(s); }} />
        : tab === 'may'
        ? <MayTab me={me} callDue={callDue && !calling} onCall={() => setCalling(true)} onPodcast={() => { setPodcastId(null); setSheet('podcast'); }} onCustomize={() => setSheet('mascot')} />
        : <Camera me={me} active={!sheet && !facetime && !calling} onOpen={(s) => { if (s === 'feed') setFeedPost(null); setSheet(s); }} onSent={load}
            invite={invite} pending={pending} onShot={viewShot} onOpenShot={viewShot} onShotsStale={() => void loadShots()}
            onSkipInvite={(id) => setSkipShots((k) => [...k, id])} />}
      {!sheet && <TabBar active={tab} unread={chatUnread} ring={callDue && !calling} onSelect={(t: Tab) => {
        if (t === 'home' || t === 'camera' || t === 'may') { setSheet(null); setTab(t); } else setSheet(t);
      }} />}
      {sheet === 'feed' && <Feed me={me} start={feedPost} onClose={() => { setSheet(null); void load(); }} />}
      {sheet === 'jar' && <Jar me={me} onClose={() => setSheet(null)} onGo={(s) => { if (s === 'camera') { setSheet(null); setTab('camera'); } else setSheet(s); }} />}
      {sheet === 'calendar' && <Calendar me={me} onClose={() => setSheet(null)} onWish={() => setSheet('chat')} />}
      {sheet === 'shot' && shot && (
        <GroupShot key={shot.id} me={me} shot={shot} onChange={(s) => putShot(s)}
          onClose={() => { setSheet(null); setShot(null); void loadShots(); }}
          onJoin={(s) => { putShot(s, true); setSkipShots((k) => k.filter((x) => x !== s.id)); setSheet(null); setShot(null); setTab('camera'); }}
          onFeed={(postId) => { setShot(null); setFeedPost(postId); setSheet('feed'); }} />
      )}
      {sheet === 'chat' && <Chat me={me} live={!!room} start={chatWith} onClose={() => { setSheet(null); void loadUnread(); }} onVideo={startFaceTime} onVoice={startVoiceCall} />}
      <Suspense fallback={null}>
      {sheet === 'settings' && <Settings me={me} onClose={() => setSheet(null)} onProfile={() => setSheet('family')} onMascot={() => setSheet('mascot')} />}
      {sheet === 'mascot' && <MascotSheet me={me} onClose={() => setSheet(null)} onSaved={() => void loadMe().catch(() => {})} />}
      {sheet === 'letters' && <Letters me={me} onClose={() => setSheet(null)} />}
      {sheet === 'recap' && <Recap me={me} onClose={() => setSheet(null)} onCamera={() => { setSheet(null); setTab('camera'); }} />}
      {sheet === 'family' && <Family me={me} onClose={() => setSheet(null)} onChanged={load} onSettings={() => setSheet('settings')} onCallMember={(id) => { setSheet(null); startFaceTime(id); }} />}
      {sheet === 'podcast' && <Podcast me={me} start={podcastId} onClose={() => setSheet(null)} onCall={() => setCalling(true)} />}
      {facetime && <FaceTime me={me} to={callTo} audio={callAudio} onClose={() => { setFacetime(false); setSkipRoom(room?.id ?? null); }} />}
      {!facetime && !calling && room && !room.members.includes(me.me.id) && skipRoom !== room.id && (!room.to || room.to === me.me.id) && (
        <Incoming me={me} room={room} onAccept={() => startFaceTime(null, { audio: !!room.audio })} onDecline={() => setSkipRoom(room.id)} />
      )}
      {calling && <Call me={me} onClose={(done) => { setCalling(false); if (done) setCallDue(false); void checkCall(); if (done) { setPodcastId(null); setSheet('podcast'); } }} />}
      </Suspense>
    </>
  );

  return (
    <>
      <Mesh />
      {body}
      {me && !greet && !hug && <NotifyAsk />}
      <Toaster />
    </>
  );
}
