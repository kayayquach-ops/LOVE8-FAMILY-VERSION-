import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@/components/Icon';
import { Keypad } from '@/components/Keypad';
import { Button, LogoMark, T, Tap } from '@/components/ui';
import { SIGNIN_CURVE } from '@/data/avatars';
import { colors, radius, space } from '@/theme';

const COUNTRIES = [
  { flag: '🇰🇷', code: '+82', name: 'Hàn Quốc' },
  { flag: '🇻🇳', code: '+84', name: 'Việt Nam' },
  { flag: '🇯🇵', code: '+81', name: 'Nhật Bản' },
];

// Đăng nhập theo bố cục màn hình "Sign In" của bản tham khảo: tiêu đề lớn với đường cong chuyển màu,
// ô nhập hình viên thuốc, nút viền chuyển màu, các nút đăng nhập nhanh hình tròn.
export default function Phone() {
  const [country, setCountry] = useState(0);
  const [digits, setDigits] = useState('');
  const c = COUNTRIES[country];
  const valid = digits.length >= 9;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        <View style={styles.top}>
          <LogoMark size={40} />
          <Pressable onPress={() => router.push('/auth/profile')} accessibilityRole="button" hitSlop={8} style={styles.signup}>
            <Ionicons name="person-circle-outline" size={20} color={colors.ink} />
            <T variant="small" weight="medium">Tạo tài khoản</T>
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <Image source={SIGNIN_CURVE} style={styles.curve} resizeMode="stretch" accessibilityIgnoresInvertColors />
          <T variant="display" center style={{ fontSize: 44, lineHeight: 50 }}>Đăng nhập</T>
        </View>

        <T variant="small" color={colors.muted} center style={{ marginTop: 18, marginBottom: 8 }}>Số điện thoại</T>
        <View style={styles.input}>
          <Tap onPress={() => setCountry((country + 1) % COUNTRIES.length)} label={`Mã quốc gia ${c.code}, bấm để đổi`} scaleTo={0.92}>
            <View style={styles.country}>
              <T variant="body">{c.flag}</T>
              <T variant="body" weight="semibold">{c.code}</T>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </View>
          </Tap>
          <T variant="h3" weight="medium" color={digits ? colors.ink : colors.placeholder} style={{ flex: 1, textAlign: 'center', marginRight: 40 }}>
            {digits || '10 1234 5678'}
          </T>
        </View>
        <T variant="caption" weight="regular" color={colors.muted} center style={{ marginTop: 8 }}>
          Bố mẹ cũng đăng nhập bằng số điện thoại, không cần nhớ mật khẩu.
        </T>

        <Button label="Tiếp tục" icon="log-in-outline" disabled={!valid} style={{ marginTop: 18 }}
          onPress={() => router.push({ pathname: '/auth/otp', params: { phone: `${c.code} ${digits}` } })} />

        <T variant="caption" weight="regular" color={colors.muted} center style={{ marginTop: 18 }}>hoặc vào nhanh bằng</T>
        <View style={styles.socials}>
          <Social label="Zalo" text="Z" />
          <Social label="KakaoTalk" text="K" />
          <Social label="Google" icon="logo-google" />
          <Social label="Apple" icon="logo-apple" />
        </View>
        <View style={{ flex: 1 }} />
      </View>
      <Keypad onKey={(k) => digits.length < 11 && setDigits(digits + k)} onDelete={() => setDigits(digits.slice(0, -1))} />
    </SafeAreaView>
  );
}

// Bản demo: các nút đăng nhập nhanh đưa thẳng tới bước tạo hồ sơ.
function Social({ label, text, icon }: { label: string; text?: string; icon?: 'logo-google' | 'logo-apple' }) {
  return (
    <Tap onPress={() => router.push('/auth/profile')} label={`Đăng nhập bằng ${label}`} scaleTo={0.88}>
      <View style={styles.social}>
        {icon ? <Ionicons name={icon} size={20} color={colors.ink} /> : <T variant="body" weight="bold">{text}</T>}
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  signup: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  titleWrap: { marginTop: 20, height: 110, justifyContent: 'center' },
  curve: { position: 'absolute', left: -16, right: -16, top: 18, height: 100 },
  input: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.tone, borderRadius: radius.pill,
    height: 56, paddingHorizontal: 8, gap: 8,
  },
  country: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: colors.toneDeep,
  },
  socials: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 },
  social: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
