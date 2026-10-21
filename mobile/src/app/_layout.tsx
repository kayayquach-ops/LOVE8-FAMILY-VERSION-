import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@/components/Icon';
import { TEXT_FONTS } from '@/lib/fonts';
import { AppProvider, useApp } from '@/store/AppContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const FONTS = { ...TEXT_FONTS, ...Ionicons.font };

// Mạng chậm thì không bắt người dùng nhìn màn hình trắng: quá thời gian này app hiện bằng font dự phòng.
const FONT_WAIT_MS = 2500;

export default function RootLayout() {
  const [loaded, error] = useFonts(FONTS);
  const [waited, setWaited] = useState(false);
  const ready = loaded || !!error || waited;

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), FONT_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    // Bản web: gỡ màn hình chờ trong public/index.html.
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const boot = document.getElementById('boot');
      if (boot) {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 250);
      }
    }
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready } = useApp();
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="capture" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="call" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="room" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="film/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}
