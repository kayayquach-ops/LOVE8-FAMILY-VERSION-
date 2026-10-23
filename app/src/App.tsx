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
import { Mesh, Toaster } from './ui';

const HUG_KEY = 'homeletter-hug-day';
const today = () => new Date().toDateString();

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<'feed' | 'jar' | 'family' | 'calendar' | null>(null);
  const [hug, setHug] = useState(() => { try { return localStorage.getItem(HUG_KEY) !== today(); } catch { return false; } });

  const load = () => api.me().then(setMe).catch(() => { token.clear(); setMe(null); }).finally(() => setReady(true));
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
      <Camera me={me} onOpen={setSheet} onSent={load} />
      {sheet === 'feed' && <Feed me={me} onClose={() => { setSheet(null); void load(); }} />}
      {sheet === 'jar' && <Jar me={me} onClose={() => setSheet(null)} />}
      {sheet === 'calendar' && <Calendar me={me} onClose={() => setSheet(null)} onWish={() => setSheet(null)} />}
      {sheet === 'family' && <Family me={me} onClose={() => setSheet(null)} onChanged={load} />}
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
