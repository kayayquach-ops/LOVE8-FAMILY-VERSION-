import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Điểm vào: chưa chọn vai thì hỏi "Bạn là ai trong nhà?", rồi vào thẳng tab Nhà.
export default function Start() {
  const { state } = useApp();

  useEffect(() => {
    router.replace(state.onboarded ? '/home' : '/onboarding');
  }, [state.onboarded]);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
