import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventRow } from '@/components/Feed';
import { Button, FadeIn, IconButton, PhotoTile, Screen, SectionHeader, T } from '@/components/ui';
import { inDaysLabel, lunarMonthName, weekday } from '@/lib/format';
import { canChiYear, daysBetween, lunarOf } from '@/lib/lunar';
import { nextOccurrence, upcoming } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, gradient, radius } from '@/theme';

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function CalendarTab() {
  const { state } = useApp();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Array<Date | null> = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  // Ngày nào trong tháng đang xem có sự kiện của gia đình.
  const eventDays = useMemo(() => {
    const map = new Map<string, string[]>();
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    for (const e of state.events) {
      const d = nextOccurrence(e, from);
      if (d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear()) {
        const key = d.toDateString();
        map.set(key, [...(map.get(key) ?? []), e.title]);
      }
    }
    return map;
  }, [cursor, state.events]);

  const sl = lunarOf(selected);
  const selectedEvents = eventDays.get(selected.toDateString()) ?? [];
  const list = upcoming(state);
  const firstLunar = lunarOf(cells.find(Boolean) as Date);
  const until = daysBetween(today, selected);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="display">Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}</T>
          <T variant="body" weight="medium" color={colors.lunar}>Năm {canChiYear(firstLunar.year)} theo âm lịch</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="chevron-back" label="Tháng trước" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <IconButton icon="chevron-forward" label="Tháng sau" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </View>
      </View>

      <View style={[styles.row, { marginTop: 20 }]}>
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
          const has = eventDays.has(d.toDateString());
          const sunday = d.getDay() === 0;
          const fg = isToday ? colors.white : sunday ? colors.holiday : colors.ink;
          return (
            <Pressable
              key={i}
              onPress={() => setSelected(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${d.getDate()} tháng ${d.getMonth() + 1}, ${l.day} tháng ${l.month} âm lịch${has ? ', có sự kiện' : ''}`}
              style={styles.cell}
            >
              <View style={[styles.cellInner, isSel && !isToday && { backgroundColor: colors.toneDeep }]}>
                {isToday && <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />}
                <T variant="body" weight="semibold" color={fg} style={{ lineHeight: 20 }}>{d.getDate()}</T>
                <T variant="caption" weight="regular" style={{ fontSize: 12, lineHeight: 14 }} color={isToday ? colors.white : colors.lunar}>
                  {l.day === 1 ? `1/${l.month}` : l.day}
                </T>
                <View style={[styles.dot, { backgroundColor: has ? (isToday ? colors.white : colors.ink) : 'transparent' }]} />
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
              <T variant="h3" color={colors.white}>
                {weekday(selected)}, {selected.getDate()} tháng {selected.getMonth() + 1}
              </T>
              <T variant="small" weight="medium" color={colors.white}>
                Ngày {sl.day} {lunarMonthName(sl.month, sl.leap)}, năm {canChiYear(sl.year)}
              </T>
              {until > 0 && <T variant="small" color="rgba(255,255,255,0.88)">{inDaysLabel(until)}</T>}
              {sl.day === 1 && <T variant="small" weight="semibold" color={colors.white}>Mùng một, nhắc cả nhà thắp hương</T>}
              {sl.day === 15 && <T variant="small" weight="semibold" color={colors.white}>Ngày rằm</T>}
              {selectedEvents.map((t) => <T key={t} variant="small" weight="semibold" color={colors.white}>{t}</T>)}
            </View>
          </View>
        </PhotoTile>
      </FadeIn>

      <SectionHeader title="Ngày của nhà mình" action="Thêm ngày" onAction={() => router.push('/event-new')} />
      {list.map((e) => <EventRow key={e.event.id} item={e} />)}
      <Button label="Thêm ngày giỗ, sinh nhật âm" icon="add" variant="ghost" onPress={() => router.push('/event-new')} style={{ marginTop: 16 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  row: { flexDirection: 'row', marginBottom: 4 },
  cellText: { width: `${100 / 7}%` },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 60, padding: 2 },
  cellInner: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22, overflow: 'hidden' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dayPanel: {
    flexDirection: 'row', gap: 16, alignItems: 'center',
    borderRadius: radius.lg, padding: 18,
  },
  dayNum: { fontSize: 56, lineHeight: 60, minWidth: 64 },
});
