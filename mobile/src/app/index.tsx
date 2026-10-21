import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Điểm vào: chuyển ngay tới đúng bước tiếp theo, không bắt chờ màn hình chào.
export default function Start() {
  const { state } = useApp();

  useEffect(() => {
    if (!state.onboarded) router.replace('/onboarding');
    else if (!state.signedIn) router.replace('/auth/phone');
    else router.replace('/home');
  }, [state.onboarded, state.signedIn]);

  return <View style={{ flex: 1, backgroundColor: colors.white }} />;
}
