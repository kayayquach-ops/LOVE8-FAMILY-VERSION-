import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '@/theme';
import { T, type IconName } from './ui';

const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  home: { on: 'home', off: 'home-outline', label: 'Nhà' },
  memories: { on: 'book', off: 'book-outline', label: 'Ký ức' },
  chat: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline', label: 'Thư' },
  calendar: { on: 'calendar', off: 'calendar-outline', label: 'Lịch' },
};

// Thanh menu dưới với nút "+" nổi ở giữa để chụp nhanh, giống bản thiết kế tham khảo.
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
        style={styles.item}
      >
        <Ionicons name={focused ? meta.on : meta.off} size={22} color={focused ? colors.ink : colors.faint} />
        <T variant="caption" weight={focused ? 'semibold' : 'medium'} color={focused ? colors.ink : colors.faint} style={{ fontSize: 10 }}>
          {meta.label}
        </T>
      </Pressable>
    );
  });
  return (
    <View style={[styles.bar, shadow.card, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.slice(0, 2)}
      <View style={styles.item}>
        <Pressable onPress={() => router.push('/capture')} style={styles.fab}>
          <Ionicons name="add" size={30} color={colors.white} />
        </Pressable>
      </View>
      {items.slice(2)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  fab: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginTop: -28, borderWidth: 5, borderColor: colors.white,
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
});
