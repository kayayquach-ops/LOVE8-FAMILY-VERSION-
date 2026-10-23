import { CITIES } from './shared';

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

export function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600e3;
}

/** Giờ hiện tại ở thành phố của một người. */
export function localTime(city?: string | null) {
  const c = city ? CITIES[city] : undefined;
  if (!c) return null;
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: c.tz, hour12: false }).format(new Date());
}

const WEATHER: Array<[number[], string]> = [
  [[0], 'trời quang'], [[1, 2], 'ít mây'], [[3], 'nhiều mây'], [[45, 48], 'sương mù'],
  [[51, 53, 55, 56, 57], 'mưa phùn'], [[61, 63, 65, 66, 67, 80, 81, 82], 'mưa'], [[71, 73, 75, 77, 85, 86], 'tuyết'], [[95, 96, 99], 'giông'],
];

const weatherCache: Record<string, { at: number; text: string }> = {};

export async function weather(city?: string | null): Promise<string | null> {
  const c = city ? CITIES[city] : undefined;
  if (!c) return null;
  const hit = weatherCache[city!];
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit.text;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code`);
    const d = await r.json();
    const code = d.current.weather_code as number;
    const text = `${Math.round(d.current.temperature_2m)}°, ${WEATHER.find(([cs]) => cs.includes(code))?.[1] ?? ''}`;
    weatherCache[city!] = { at: Date.now(), text };
    return text;
  } catch {
    return null;
  }
}
