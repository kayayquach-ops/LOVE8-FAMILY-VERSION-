import { Ionicons } from '@/components/Icon';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Chip, Field, initials, Screen, Steps, T } from '@/components/ui';
import type { Birthday } from '@/data/types';
import { ROLES } from '@/lib/family';
import { canChiYear, formatLunar, lunarToSolar, solarToLunar } from '@/lib/lunar';
import { colors, familyTones, radius, space } from '@/theme';

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
              <Pressable key={c} onPress={() => setCalendar(c)} accessibilityRole="tab" accessibilityState={{ selected: calendar === c }}
                style={[styles.segItem, calendar === c && styles.segActive]}>
                <T variant="small" weight="semibold" color={calendar === c ? colors.white : colors.inkSoft}>
                  {c === 'solar' ? 'Dương lịch' : 'Âm lịch'}
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
              <Ionicons name="moon-outline" size={18} color={colors.lunar} />
              <T variant="body" weight="medium" color={colors.lunar} style={{ flex: 1 }}>{conversion}</T>
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
              <View style={styles.photoEmpty}>
                <T serif weight="bold" color={colors.white} style={{ fontSize: 72, lineHeight: 80 }}>{initials(name || 'Bạn')}</T>
              </View>
            )}
            <View style={styles.change}>
              <Ionicons name="camera" size={16} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>{avatar ? 'Đổi ảnh' : 'Chọn ảnh'}</T>
            </View>
          </Pressable>
          <T variant="body" color={colors.inkSoft} center>Bố mẹ sẽ thấy ảnh này mỗi khi bạn gửi tin. Chưa có ảnh thì app dùng chữ cái đầu tên bạn.</T>
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
  segment: { flexDirection: 'row', backgroundColor: colors.tone, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.ink },
  convert: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.lunarSoft,
    padding: 14, borderRadius: radius.md,
  },
  photo: { width: 200, height: 200, borderRadius: 100 },
  photoEmpty: { width: 200, height: 200, borderRadius: 100, backgroundColor: familyTones[0], alignItems: 'center', justifyContent: 'center' },
  change: {
    position: 'absolute', bottom: 0, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: colors.ink, paddingHorizontal: 16, minHeight: 40, borderRadius: 999,
  },
});
