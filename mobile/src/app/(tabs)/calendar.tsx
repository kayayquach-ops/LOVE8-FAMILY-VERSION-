import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventRow } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { Avatar, Button, FadeIn, IconButton, PhotoTile, Screen, SectionHeader, T, Tap } from '@/components/ui';
import type { FamilyEvent } from '@/data/types';
import { inDaysLabel, lunarMonthName, weekday } from '@/lib/format';
import { canChiYear, daysBetween, lunarOf } from '@/lib/lunar';
import { calendarEvents, callName, nextOccurrence, timeline, upcoming, visibleLetters } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, gradient, radius } from '@/theme';

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Tab Lịch: ngày âm và ngày lễ, sinh nhật, ngày cưới, cột mốc của từng người, và dòng đời của cả nhà.
export default function CalendarTab() {
  const { state } = useApp();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [showAll, setShowAll] = useState(false);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Array<Date | null> = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  // Ngày nào trong tháng đang xem có sự kiện.
  const eventDays = useMemo(() => {
    const map = new Map<string, FamilyEvent[]>();
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    for (const e of calendarEvents(state)) {
      const d = nextOccurrence(e, from);
      if (d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear()) {
        map.set(d.toDateString(), [...(map.get(d.toDateString()) ?? []), e]);
      }
    }
    return map;
  }, [cursor, state.events, state.settings.holidays]);

  const sl = lunarOf(selected);
  const selectedEvents = eventDays.get(selected.toDateString()) ?? [];
  const coming = upcoming(state);
  const life = timeline(state);
  const firstLunar = lunarOf(cells.find(Boolean) as Date);
  const until = daysBetween(today, selected);

  function openStory(storyId?: string) {
    if (!storyId) return;
    const letter = visibleLetters(state).find((l) => l.storyId === storyId);
    router.push(letter ? `/letter/${letter.id}` : `/story/${storyId}`);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="display">Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}</T>
          <T variant="body" weight="medium" color={colors.lunar}>Năm {canChiYear(firstLunar.year)} theo âm lịch</T>
        </View>
        <IconButton icon="chevron-back" label="Tháng trước" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
        <IconButton icon="chevron-forward" label="Tháng sau" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
      </View>

      <View style={[styles.row7, { marginTop: 20 }]}>
        {WEEK.map((w) => (
          <T key={w} variant="caption" weight="semibold" color={w === 'CN' ? colors.holiday : colors.muted} style={styles.cellText} center>{w}</T>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const l = lunarOf(d);
          const isToday = daysBetween(d, today) === 0;
          const isSel = d.toDateString() === selected.toDateString();
          const evs = eventDays.get(d.toDateString()) ?? [];
          const holiday = evs.some((e) => e.kind === 'holiday' || e.kind === 'gio');
          const red = d.getDay() === 0 || holiday;
          const fg = isToday ? colors.white : red ? colors.holiday : colors.ink;
          return (
            <Pressable key={i} onPress={() => setSelected(d)} accessibilityRole="button" accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${d.getDate()} tháng ${d.getMonth() + 1}, ${l.day} tháng ${l.month} âm lịch${evs.length ? `, ${evs.map((e) => e.title).join(', ')}` : ''}`}
              style={styles.cell}>
              <View style={[styles.cellInner, isSel && !isToday && { backgroundColor: colors.toneDeep }]}>
                {isToday && <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />}
                <T variant="body" weight="semibold" color={fg} style={{ lineHeight: 20 }}>{d.getDate()}</T>
                <T variant="caption" weight="regular" style={{ fontSize: 12, lineHeight: 14 }} color={isToday ? colors.white : colors.lunar}>
                  {l.day === 1 ? `1/${l.month}` : l.day}
                </T>
                <View style={[styles.dot, { backgroundColor: evs.length ? (isToday ? colors.white : holiday ? colors.holiday : colors.ink) : 'transparent' }]} />
              </View>
            </Pressable>
          );
        })}
      </View>

      <FadeIn key={selected.toDateString()} style={{ marginTop: 20 }}>
        <PhotoTile seed={selected.toDateString()} tone={familyTones[4]} autoHeight>
          <View style={styles.dayPanel}>
            <T variant="display" color={colors.white} style={styles.dayNum}>{selected.getDate()}</T>
            <View style={{ flex: 1, gap: 4 }}>
              <T variant="h3" color={colors.white}>{weekday(selected)}, {selected.getDate()} tháng {selected.getMonth() + 1}</T>
              <T variant="small" weight="medium" color={colors.white}>Ngày {sl.day} {lunarMonthName(sl.month, sl.leap)}, năm {canChiYear(sl.year)}</T>
              {until > 0 && <T variant="small" color="rgba(255,255,255,0.88)">{inDaysLabel(until)}</T>}
              {sl.day === 1 && <T variant="small" weight="semibold" color={colors.white}>Mùng một, nhắc cả nhà thắp hương</T>}
              {sl.day === 15 && <T variant="small" weight="semibold" color={colors.white}>Ngày rằm</T>}
              {selectedEvents.map((e) => (
                <View key={e.id} style={{ gap: 2 }}>
                  <T variant="small" weight="semibold" color={colors.white}>{e.title}</T>
                  {e.idea && <T variant="small" color="rgba(255,255,255,0.9)">Gợi ý: {e.idea}</T>}
                </View>
              ))}
            </View>
          </View>
        </PhotoTile>
      </FadeIn>

      <SectionHeader title="Sắp tới" action="Thêm ngày" onAction={() => router.push('/event-new')} />
      {(showAll ? coming : coming.slice(0, 6)).map((e) => {
        const k = e.event.kind;
        const wish = e.inDays <= 14 && (k === 'birthday' || k === 'anniversary' || k === 'gio') && e.event.memberId !== state.meId;
        return (
          <View key={e.event.id}>
            <EventRow item={e} />
            {wish && (
              <Button label={k === 'gio' ? 'Gọi về' : 'Gửi lời chúc'} icon={k === 'gio' ? 'call' : 'mic'} variant="soft" style={{ marginBottom: 8 }}
                onPress={() => router.push(e.event.memberId ? { pathname: '/chat', params: { voice: '1', to: e.event.memberId } } : '/chat')} />
            )}
          </View>
        );
      })}
      {coming.length > 6 && (
        <Button label={showAll ? 'Thu gọn' : 'Xem hết'} variant="ghost" onPress={() => setShowAll(!showAll)} style={{ marginTop: 8 }} />
      )}

      <SectionHeader title="Dòng đời nhà mình" />
      <View style={{ gap: 0 }}>
        {life.map((item, i) => (
          <Tap key={`${item.year}-${item.title}`} onPress={() => openStory(item.storyId)} disabled={!item.storyId} label={item.title} scaleTo={0.98}>
            <View style={styles.lifeRow}>
              <T variant="h3" color={item.future ? colors.accentText : colors.lunar} style={styles.lifeYear}>{item.year}</T>
              <View style={styles.lifeTrack}>
                <View style={[styles.lifeLine, i === 0 && { top: 22 }, i === life.length - 1 && { bottom: '50%' }]} />
                <View style={[styles.lifeDot, item.future && { backgroundColor: colors.accentText }]} />
              </View>
              <View style={{ flex: 1, paddingVertical: 12, gap: 2 }}>
                <T variant="body" weight="semibold">{item.title}</T>
                {item.future && item.date ? (
                  <T variant="small" color={colors.accentText}>{inDaysLabel(daysBetween(new Date(), item.date))}</T>
                ) : item.storyId ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="mic" size={13} color={colors.muted} />
                    <T variant="small" color={colors.muted}>Nghe {callName(item.teller)} kể</T>
                  </View>
                ) : null}
              </View>
              {item.who && <Avatar name={item.who.name} uri={item.who.avatarUri} size={30} />}
            </View>
          </Tap>
        ))}
      </View>
      <Button label="Thêm cột mốc" icon="add" variant="ghost" onPress={() => router.push({ pathname: '/event-new', params: { kind: 'milestone' } })} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  row7: { flexDirection: 'row', marginBottom: 4 },
  cellText: { width: `${100 / 7}%` },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 60, padding: 2 },
  cellInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22, overflow: 'hidden' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dayPanel: { flexDirection: 'row', gap: 16, alignItems: 'center', borderRadius: radius.lg, padding: 18 },
  dayNum: { fontSize: 56, lineHeight: 60, minWidth: 64 },
  lifeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lifeYear: { width: 52 },
  lifeTrack: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  lifeLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.line },
  lifeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.lunar, borderWidth: 2, borderColor: colors.bg },
});
