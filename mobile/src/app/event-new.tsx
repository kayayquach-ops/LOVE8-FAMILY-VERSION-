import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Chip, Field, Screen, T } from '@/components/ui';
import type { EventKind } from '@/data/types';
import { shortDate } from '@/lib/format';
import { nextSolarAnniversary, nextSolarForLunar } from '@/lib/lunar';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const KINDS: Array<{ kind: EventKind; label: string; lunar: boolean }> = [
  { kind: 'gio', label: '🕯️ Ngày giỗ', lunar: true },
  { kind: 'birthday', label: '🎂 Sinh nhật', lunar: false },
  { kind: 'anniversary', label: '💍 Kỷ niệm', lunar: false },
  { kind: 'custom', label: '🌕 Ngày khác', lunar: true },
];

export default function NewEvent() {
  const { dispatch } = useApp();
  const [kind, setKind] = useState(KINDS[0]);
  const [title, setTitle] = useState('');
  const [calendar, setCalendar] = useState<'lunar' | 'solar'>('lunar');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [remind, setRemind] = useState(7);
  const d = Number(day), m = Number(month);
  const ok = title.trim().length > 1 && d >= 1 && d <= 30 && m >= 1 && m <= 12;
  const next = ok ? (calendar === 'lunar' ? nextSolarForLunar(d, m, new Date()) : nextSolarAnniversary(d, m, new Date())) : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Thêm ngày quan trọng" />
      <View style={styles.wrap}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} icon={undefined} active={k.kind === kind.kind}
            onPress={() => { setKind(k); setCalendar(k.lunar ? 'lunar' : 'solar'); }} />
        ))}
      </View>
      <View style={{ gap: 16, marginTop: 20 }}>
        <Field label="Tên" value={title} onChangeText={setTitle} placeholder={kind.kind === 'gio' ? 'Ví dụ: Giỗ cụ ngoại' : 'Ví dụ: Sinh nhật bà nội'} />
        <View style={styles.segment}>
          {(['lunar', 'solar'] as const).map((c) => (
            <Pressable key={c} onPress={() => setCalendar(c)} style={[styles.segItem, calendar === c && styles.segActive]}>
              <T variant="small" weight="semibold" color={calendar === c ? colors.white : colors.inkSoft}>{c === 'lunar' ? '🌙 Âm lịch' : '☀️ Dương lịch'}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Ngày" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="15" /></View>
          <View style={{ flex: 1 }}><Field label="Tháng" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="11" /></View>
        </View>
        {next && (
          <View style={styles.preview}>
            <Ionicons name="calendar" size={18} color={colors.primary} />
            <T variant="small" weight="medium" style={{ flex: 1 }}>
              Lần tới rơi vào {shortDate(next)}/{next.getFullYear()} dương lịch. Lịch âm Việt Nam tính theo giờ Hà Nội, có thể lệch 1 ngày so với lịch âm Hàn.
            </T>
          </View>
        )}
        <T variant="small" weight="semibold">Nhắc trước</T>
        <View style={styles.wrap}>
          {[1, 3, 7, 14, 30].map((n) => <Chip key={n} label={`${n} ngày`} active={remind === n} onPress={() => setRemind(n)} />)}
        </View>
      </View>
      <Button
        label="Lưu" disabled={!ok} style={{ marginTop: 28 }}
        onPress={() => {
          dispatch({ type: 'addEvent', event: { title: title.trim(), kind: kind.kind, calendar, day: d, month: m, remindDaysBefore: remind } });
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.field, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.primary },
  preview: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.primaryTint, borderRadius: radius.md, padding: 12 },
});
