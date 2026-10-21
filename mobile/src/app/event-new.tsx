import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Chip, Field, Screen, T } from '@/components/ui';
import type { EventKind } from '@/data/types';
import { shortDate } from '@/lib/format';
import { nextSolarAnniversary, nextSolarForLunar } from '@/lib/lunar';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const KINDS: Array<{ kind: EventKind; label: string; lunar: boolean; example: string }> = [
  { kind: 'birthday', label: 'Sinh nhật', lunar: false, example: 'Ví dụ: Sinh nhật bà nội' },
  { kind: 'milestone', label: 'Cột mốc', lunar: false, example: 'Ví dụ: Ngày Nam tốt nghiệp' },
  { kind: 'anniversary', label: 'Ngày cưới, kỷ niệm', lunar: false, example: 'Ví dụ: Ngày cưới ông bà' },
  { kind: 'gio', label: 'Ngày giỗ', lunar: true, example: 'Ví dụ: Giỗ cụ ngoại' },
];

// Thêm một ngày của nhà mình: sinh nhật, cột mốc (vào học, tốt nghiệp, đi xa), ngày cưới, ngày giỗ.
export default function NewEvent() {
  const { state, dispatch } = useApp();
  const params = useLocalSearchParams<{ kind?: EventKind }>();
  const [kind, setKind] = useState(KINDS.find((k) => k.kind === params.kind) ?? KINDS[0]);
  const [title, setTitle] = useState('');
  const [calendar, setCalendar] = useState<'lunar' | 'solar'>(kind.lunar ? 'lunar' : 'solar');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [who, setWho] = useState<string | undefined>();
  const [yearly, setYearly] = useState(kind.kind !== 'milestone');
  const d = Number(day), m = Number(month), y = Number(year) || undefined;
  const ok = title.trim().length > 1 && d >= 1 && d <= (calendar === 'lunar' ? 30 : 31) && m >= 1 && m <= 12 && (yearly || !!y);
  const once = !yearly && !!y;
  const next = ok && !once ? (calendar === 'lunar' ? nextSolarForLunar(d, m, new Date()) : nextSolarAnniversary(d, m, new Date())) : null;

  function pick(k: (typeof KINDS)[number]) {
    setKind(k);
    setCalendar(k.lunar ? 'lunar' : 'solar');
    setYearly(k.kind !== 'milestone');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Thêm ngày của nhà mình" />
      <View style={styles.wrap}>
        {KINDS.map((k) => <Chip key={k.kind} label={k.label} active={k.kind === kind.kind} onPress={() => pick(k)} />)}
      </View>
      <View style={{ gap: 16, marginTop: 20 }}>
        <Field label="Tên" value={title} onChangeText={setTitle} placeholder={kind.example} />
        <T variant="small" weight="medium" color={colors.muted}>Của ai</T>
        <View style={[styles.wrap, { marginTop: -8 }]}>
          <Chip label="Cả nhà" active={!who} onPress={() => setWho(undefined)} />
          {state.family.members.map((p) => <Chip key={p.id} label={p.roleLabel} active={who === p.id} onPress={() => setWho(p.id)} />)}
        </View>
        {!once && (
          <View style={styles.segment}>
            {(['solar', 'lunar'] as const).map((c) => (
              <Pressable key={c} onPress={() => setCalendar(c)} accessibilityRole="tab" accessibilityState={{ selected: calendar === c }}
                style={[styles.segItem, calendar === c && styles.segActive]}>
                <T variant="small" weight="semibold" color={calendar === c ? colors.black : colors.inkSoft}>{c === 'lunar' ? 'Âm lịch' : 'Dương lịch'}</T>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Ngày" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="15" /></View>
          <View style={{ flex: 1 }}><Field label="Tháng" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="6" /></View>
          <View style={{ flex: 1.3 }}><Field label={yearly ? 'Năm (nếu nhớ)' : 'Năm'} value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="2027" /></View>
        </View>
        <Pressable onPress={() => setYearly(!yearly)} accessibilityRole="checkbox" accessibilityState={{ checked: yearly }} style={styles.check}>
          <Ionicons name={yearly ? 'checkbox' : 'square-outline'} size={22} color={colors.ink} />
          <T variant="body" style={{ flex: 1 }}>Nhắc lại mỗi năm</T>
        </Pressable>
        {next && (
          <View style={styles.preview}>
            <Ionicons name="calendar-outline" size={20} color={colors.lunar} />
            <T variant="small" weight="medium" style={{ flex: 1 }}>
              Lần tới rơi vào {shortDate(next)}/{next.getFullYear()} dương lịch.{calendar === 'lunar' ? ' Lịch âm tính theo giờ Việt Nam, có thể lệch 1 ngày so với lịch âm Hàn.' : ''}
            </T>
          </View>
        )}
        {y && (
          <T variant="small" color={colors.muted}>Ngày có năm sẽ hiện trong Dòng đời nhà mình.</T>
        )}
      </View>
      <Button
        label="Lưu" disabled={!ok} style={{ marginTop: 28 }}
        onPress={() => {
          dispatch({
            type: 'addEvent',
            event: {
              title: title.trim(), kind: kind.kind, calendar: once ? 'solar' : calendar, day: d, month: m, year: y, once: once || undefined,
              memberId: who, remindDaysBefore: kind.kind === 'gio' ? 10 : 5,
            },
          });
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.tone, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.white },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  preview: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.lunarSoft, borderRadius: radius.md, padding: 14 },
});
