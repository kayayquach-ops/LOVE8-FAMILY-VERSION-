import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { BRAND } from '@/brand';
import { Logo, T } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Màn hình chào: hiện logo một chút rồi chuyển tới đúng bước tiếp theo.
export default function Splash() {
  const { state } = useApp();

  useEffect(() => {
    const t = setTimeout(() => {
      if (!state.onboarded) router.replace('/onboarding');
      else if (!state.signedIn) router.replace('/auth/phone');
      else router.replace('/home');
    }, 1400);
    return () => clearTimeout(t);
  }, [state.onboarded, state.signedIn]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, gap: 18 }}>
      <Logo />
      <T variant="small" color={colors.muted}>{BRAND.taglineVi}</T>
    </View>
  );
}
