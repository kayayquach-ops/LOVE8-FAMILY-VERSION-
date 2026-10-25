import { cityOf } from './shared';
import { fmtDate, fmtTime, shownLang, t } from './i18n';

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minutesAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hoursAgo', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('time.daysAgo', { n: Math.floor(s / 86400) });
  return fmtDate(new Date(iso));
}

export function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600e3;
}

/** Giờ hiện tại ở thành phố của một người. */
export function localTime(city?: string | null) {
  const c = cityOf(city);
  if (!c) return null;
  return fmtTime(new Date(), c.tz);
}

const WEATHER = [
  [[0], 'clear'], [[1, 2], 'fewClouds'], [[3], 'cloudy'], [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'], [[71, 73, 75, 77, 85, 86], 'snow'], [[95, 96, 99], 'storm'],
] as const;

const weatherCache: Record<string, { at: number; text: string }> = {};

export async function weather(city?: string | null): Promise<string | null> {
  const c = cityOf(city);
  if (!c) return null;
  // Khoá theo cả ngôn ngữ: đổi ngôn ngữ thì chữ thời tiết đã nhớ không còn đúng.
  const key = `${city}|${shownLang()}`;
  const hit = weatherCache[key];
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.text;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code`);
    const d = await r.json();
    const code = d.current.weather_code as number;
    const w = WEATHER.find(([cs]) => (cs as readonly number[]).includes(code))?.[1];
    const text = `${Math.round(d.current.temperature_2m)}°, ${w ? t(`weather.${w}`) : ''}`;
    weatherCache[key] = { at: Date.now(), text };
    return text;
  } catch {
    return null;
  }
}
