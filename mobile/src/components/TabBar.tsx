import { Ionicons } from '@/components/Icon';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { T, type IconName } from './ui';

const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  home: { on: 'home', off: 'home-outline', label: 'Nhà' },
  memories: { on: 'book', off: 'book-outline', label: 'Ký ức' },
  chat: { on: 'mail-open', off: 'mail-open-outline', label: 'Thư' },
  calendar: { on: 'calendar', off: 'calendar-outline', label: 'Lịch' },
};

// Thanh menu dưới. Nút chụp màu đỏ nằm giữa, ngang hàng các tab, để gửi ảnh chỉ cần một chạm.
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => {
    const meta = ICONS[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          if (!focused) navigateToTab(route.key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        style={styles.item}
      >
        <Ionicons name={focused ? meta.on : meta.off} size={24} color={focused ? colors.ink : colors.muted} />
        <T variant="caption" weight={focused ? 'semibold' : 'medium'} color={focused ? colors.ink : colors.muted} style={{ fontSize: 12, lineHeight: 16 }}>
          {meta.label}
        </T>
      </Pressable>
    );
  });
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.slice(0, 2)}
      <View style={styles.item}>
        <Pressable
          onPress={() => router.push('/capture')}
          accessibilityRole="button"
          accessibilityLabel="Chụp và gửi ảnh cho cả nhà"
          style={({ pressed }) => [styles.capture, pressed && { backgroundColor: colors.primaryDark }]}
        >
          <Ionicons name="camera" size={26} color={colors.white} />
        </Pressable>
      </View>
      {items.slice(2)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  capture: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
