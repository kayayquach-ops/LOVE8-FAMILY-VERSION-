import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventRow } from '@/components/Feed';
import { Card, IconButton, Screen, SectionHeader, T } from '@/components/ui';
import { inDaysLabel } from '@/lib/format';
import { canChiYear, daysBetween, lunarOf, zodiacEmoji } from '@/lib/lunar';
import { nextOccurrence, upcoming } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';

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

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <T variant="caption" color={colors.muted}>Năm {canChiYear(firstLunar.year)} {zodiacEmoji(firstLunar.year)}</T>
          <T variant="h1">Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="chevron-back" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <IconButton icon="chevron-forward" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </View>
      </View>

      <Card style={{ marginTop: 16, paddingHorizontal: 8 }}>
        <View style={styles.row}>
          {WEEK.map((w) => (
            <T key={w} variant="caption" color={w === 'CN' ? colors.primary : colors.muted} style={styles.cellText} center>{w}</T>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const l = lunarOf(d);
            const isToday = daysBetween(d, today) === 0;
            const isSel = d.toDateString() === selected.toDateString();
            const has = eventDays.has(d.toDateString());
            const special = l.day === 1 || l.day === 15;
            return (
              <Pressable key={i} onPress={() => setSelected(d)} style={[styles.cell, isSel && styles.sel, isToday && !isSel && styles.today]}>
                <T variant="small" weight="semibold" color={isSel ? colors.white : colors.ink}>{d.getDate()}</T>
                <T variant="caption" style={{ fontSize: 9, lineHeight: 11 }} color={isSel ? colors.white : special ? colors.primary : colors.faint}>
                  {l.day === 1 ? `1/${l.month}` : l.day}
                </T>
                {has && <View style={[styles.dot, isSel && { backgroundColor: colors.white }]} />}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={[styles.dayCard, shadow.card]}>
        <View style={styles.lunarBadge}>
          <T variant="caption" color={colors.white}>Âm lịch</T>
          <T variant="h1" color={colors.white}>{sl.day}</T>
          <T variant="caption" color={colors.white}>tháng {sl.month}{sl.leap ? ' nhuận' : ''}</T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="body" weight="semibold">
            {selected.getDate()}/{selected.getMonth() + 1}/{selected.getFullYear()} · {inDaysLabel(Math.max(0, daysBetween(today, selected)))}
          </T>
          <T variant="small" color={colors.muted}>Ngày {sl.day} tháng {sl.month} năm {canChiYear(sl.year)}</T>
          {sl.day === 1 && <T variant="small" color={colors.primary}>Mùng một: nhắc cả nhà thắp hương</T>}
          {sl.day === 15 && <T variant="small" color={colors.primary}>Ngày rằm</T>}
          {selectedEvents.map((t) => <T key={t} variant="small" weight="semibold" color={colors.primaryDark}>• {t}</T>)}
        </View>
      </Card>

      <SectionHeader title="Ngày của nhà mình" action="+ Thêm ngày" onAction={() => router.push('/event-new')} />
      <Card style={{ paddingVertical: 4 }}>
        {list.map((e) => <EventRow key={e.event.id} item={e} />)}
      </Card>

      <Pressable onPress={() => router.push('/event-new')} style={styles.addCard}>
        <Ionicons name="add-circle" size={22} color={colors.primary} />
        <T variant="small" weight="semibold" color={colors.primaryDark}>Thêm ngày giỗ, sinh nhật âm, kỷ niệm</T>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
  row: { flexDirection: 'row', marginBottom: 6 },
  cellText: { width: `${100 / 7}%` },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  sel: { backgroundColor: colors.primary },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 2 },
  dayCard: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 16 },
  lunarBadge: { width: 78, height: 88, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary,
    borderRadius: radius.lg, padding: 16, marginTop: 14, justifyContent: 'center',
  },
});
