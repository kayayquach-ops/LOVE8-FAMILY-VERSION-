import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Keypad } from '@/components/Keypad';
import { BackHeader, Button, T } from '@/components/ui';
import { colors, radius, space } from '@/theme';

// Bản demo chấp nhận mọi mã 6 số. Khi nối Firebase Auth, mã sẽ gửi qua SMS.
export default function Otp() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1, paddingHorizontal: space.xl }}>
        <BackHeader />
        <T variant="display" style={{ marginTop: 20 }}>Nhập mã xác nhận</T>
        <T variant="body" color={colors.inkSoft} style={{ marginTop: 8 }}>
          Mã 6 số đã gửi tới {phone ?? 'số của bạn'}
        </T>
        <View style={styles.row}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={[styles.box, i === code.length && styles.boxActive]}>
              <T variant="h1" serif={false}>{code[i] ?? ''}</T>
            </View>
          ))}
        </View>
        <T variant="small" color={colors.inkSoft}>
          Chưa nhận được mã? Gửi lại sau 0:42.
        </T>
        <T variant="small" color={colors.muted} style={{ marginTop: 6 }}>Bản demo: nhập 6 số bất kỳ.</T>
        <View style={{ flex: 1 }} />
        <Button
          label="Xác nhận"
          disabled={code.length < 6}
          onPress={() => router.push({ pathname: '/auth/profile', params: { phone: phone ?? '' } })}
          style={{ marginBottom: space.lg }}
        />
      </View>
      <Keypad onKey={(k) => code.length < 6 && setCode(code + k)} onDelete={() => setCode(code.slice(0, -1))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32, marginBottom: 20 },
  box: {
    width: 48, height: 60, borderRadius: radius.md, backgroundColor: colors.tone,
    alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white },
});
