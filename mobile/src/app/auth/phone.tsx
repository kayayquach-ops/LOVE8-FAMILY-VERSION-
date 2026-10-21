import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keypad } from '@/components/Keypad';
import { BackHeader, Button, T } from '@/components/ui';
import { colors, radius, space } from '@/theme';

const COUNTRIES = [
  { flag: '🇰🇷', code: '+82', name: 'Hàn Quốc' },
  { flag: '🇻🇳', code: '+84', name: 'Việt Nam' },
  { flag: '🇯🇵', code: '+81', name: 'Nhật Bản' },
];

export default function Phone() {
  const [country, setCountry] = useState(0);
  const [digits, setDigits] = useState('');
  const c = COUNTRIES[country];
  const valid = digits.length >= 9;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1, paddingHorizontal: space.xl }}>
        <BackHeader />
        <T variant="h2" center style={{ marginTop: 28 }}>Nhập số điện thoại</T>
        <T variant="small" color={colors.muted} center style={{ marginTop: 6 }}>
          Bố mẹ cũng đăng nhập bằng số điện thoại, không cần nhớ mật khẩu.
        </T>
        <T variant="small" weight="semibold" style={{ marginTop: 28, marginBottom: 8 }}>Số điện thoại</T>
        <View style={styles.input}>
          <Pressable onPress={() => setCountry((country + 1) % COUNTRIES.length)} style={styles.country}>
            <T variant="body">{c.flag}</T>
            <T variant="small" weight="semibold">{c.code}</T>
            <T variant="caption" color={colors.muted}>▾</T>
          </Pressable>
          <View style={styles.divider} />
          <T variant="body" color={digits ? colors.ink : colors.faint}>{digits || '10 1234 5678'}</T>
        </View>
        <T variant="caption" color={colors.muted} style={{ marginTop: 8 }}>
          Đang ở {c.name}? Bấm vào cờ để đổi quốc gia.
        </T>
        <View style={{ flex: 1 }} />
        <Button
          label="Tiếp tục"
          disabled={!valid}
          onPress={() => router.push({ pathname: '/auth/otp', params: { phone: `${c.code} ${digits}` } })}
          style={{ marginBottom: space.lg }}
        />
      </View>
      <Keypad onKey={(k) => digits.length < 11 && setDigits(digits + k)} onDelete={() => setDigits(digits.slice(0, -1))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.field, borderRadius: radius.md,
    height: 54, paddingHorizontal: 14, gap: 12,
  },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider: { width: 1, height: 22, backgroundColor: colors.faint },
});
