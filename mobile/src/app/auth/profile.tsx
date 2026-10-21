import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Chip, Field, PhotoTile, Screen, Steps, T } from '@/components/ui';
import type { Birthday } from '@/data/types';
import { ROLES } from '@/lib/family';
import { canChiYear, formatLunar, lunarToSolar, solarToLunar } from '@/lib/lunar';
import { colors, radius, space } from '@/theme';

export default function Profile() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [roleIdx, setRoleIdx] = useState(0);
  const [city, setCity] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>('solar');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>();

  const d = Number(day), m = Number(month), y = Number(year);
  const dateOk = d >= 1 && d <= 31 && m >= 1 && m <= 12 && y > 1900 && y < 2030;
  let conversion = '';
  if (dateOk) {
    if (calendar === 'solar') {
      const l = solarToLunar({ day: d, month: m, year: y });
      conversion = `Tức ngày ${formatLunar(l)}, năm ${canChiYear(l.year)}`;
    } else {
      const s = lunarToSolar({ day: d, month: m, year: y, leap: false });
      if (s) conversion = `Tức ngày ${s.day}/${s.month}/${s.year} dương lịch, năm ${canChiYear(y)}`;
    }
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!res.canceled) setAvatar(res.assets[0].uri);
  }

  function next() {
    if (step < 3) return setStep(step + 1);
    const birthday: Birthday | undefined = dateOk ? { calendar, day: d, month: m, year: y } : undefined;
    const r = ROLES[roleIdx];
    router.push({
      pathname: '/auth/family',
      params: {
        name, role: r.role, roleLabel: r.label, city, phone: phone ?? '',
        birthday: birthday ? JSON.stringify(birthday) : '', avatar: avatar ?? '',
      },
    });
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader />
      <Steps current={step} />
      {step === 1 && (
        <View style={{ gap: space.lg }}>
          <T variant="h2">Bạn là ai trong nhà?</T>
          <Field label="Họ và tên" placeholder="Ví dụ: Nguyễn Thu Lan" value={name} onChangeText={setName} />
          <View style={{ gap: 8 }}>
            <T variant="small" weight="semibold">Vai trò</T>
            <View style={styles.wrap}>
              {ROLES.map((r, i) => (
                <Chip key={r.label} label={r.label} active={i === roleIdx} onPress={() => setRoleIdx(i)} />
              ))}
            </View>
          </View>
          <Field label="Đang sống ở" placeholder="Ví dụ: Seoul" value={city} onChangeText={setCity} />
        </View>
      )}
      {step === 2 && (
        <View style={{ gap: space.lg }}>
          <T variant="h2">Ngày sinh</T>
          <T variant="small" color={colors.muted}>
            Nhiều ông bà, bố mẹ mừng sinh nhật theo âm lịch. Chọn đúng lịch để cả nhà được nhắc đúng ngày.
          </T>
          <View style={styles.segment}>
            {(['solar', 'lunar'] as const).map((c) => (
              <Pressable key={c} onPress={() => setCalendar(c)} style={[styles.segItem, calendar === c && styles.segActive]}>
                <T variant="small" weight="semibold" color={calendar === c ? colors.white : colors.inkSoft}>
                  {c === 'solar' ? '☀️ Dương lịch' : '🌙 Âm lịch'}
                </T>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="Ngày" placeholder="DD" keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} /></View>
            <View style={{ flex: 1 }}><Field label="Tháng" placeholder="MM" keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} /></View>
            <View style={{ flex: 1.4 }}><Field label="Năm" placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} /></View>
          </View>
          {conversion ? (
            <View style={styles.convert}>
              <Ionicons name="moon" size={16} color={colors.primary} />
              <T variant="small" weight="medium" style={{ flex: 1 }}>{conversion}</T>
            </View>
          ) : null}
        </View>
      )}
      {step === 3 && (
        <View style={{ alignItems: 'center', gap: space.lg }}>
          <T variant="h2">Thêm ảnh của bạn</T>
          <Pressable onPress={pickPhoto}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.photo} />
            ) : (
              <PhotoTile seed={name || 'me'} emoji="🙂" height={200} style={{ width: 180 }} />
            )}
            <View style={styles.change}>
              <Ionicons name="camera" size={14} color={colors.white} />
              <T variant="caption" color={colors.white}>{avatar ? 'Đổi ảnh' : 'Chọn ảnh'}</T>
            </View>
          </Pressable>
          <View style={styles.line} />
          <View style={{ flexDirection: 'row', gap: 14, marginTop: -16 }}>
            {['👵', '👨', '👩'].map((e) => (
              <View key={e} style={{ alignItems: 'center' }}>
                <View style={styles.peg} />
                <View style={styles.polaroid}><T variant="h2">{e}</T></View>
              </View>
            ))}
          </View>
          <T variant="small" color={colors.muted} center>Bố mẹ sẽ thấy ảnh này mỗi khi bạn gửi tin.</T>
        </View>
      )}
      <Button
        label={step < 3 ? 'Tiếp tục' : 'Xong'}
        disabled={step === 1 && name.trim().length < 2}
        onPress={next}
        style={{ marginTop: 36 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.field, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.primary },
  convert: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryTint,
    padding: 12, borderRadius: radius.md,
  },
  photo: { width: 180, height: 200, borderRadius: radius.lg },
  change: {
    position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  line: { height: 1.5, width: '110%', backgroundColor: colors.ink, opacity: 0.6, marginTop: 8 },
  peg: { width: 4, height: 18, backgroundColor: colors.ink, borderRadius: 2 },
  polaroid: {
    width: 70, height: 70, backgroundColor: colors.white, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
});
