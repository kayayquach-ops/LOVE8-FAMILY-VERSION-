import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '@/theme';
import { Ionicons } from './Icon';
import { GradientRing, T, Tap, type IconName } from './ui';

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  home: { label: 'Nhà', icon: 'home-outline', active: 'home' },
  chat: { label: 'Chat', icon: 'chatbubbles-outline', active: 'chatbubbles' },
  understand: { label: 'Hiểu nhau', icon: 'heart-outline', active: 'heart' },
  calendar: { label: 'Lịch', icon: 'calendar-outline', active: 'calendar' },
};

// Thanh menu nổi: nút "+" để chụp gửi cả nhà, rồi bốn tab có cả biểu tượng và chữ cho dễ nhận ra.
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        <Tap onPress={() => router.push('/capture')} label="Chụp và gửi ảnh cho cả nhà" scaleTo={0.88}>
          <GradientRing size={50}>
            <View style={styles.plus}>
              <Ionicons name="add" size={28} color={colors.ink} />
            </View>
          </GradientRing>
        </Tap>
        <View style={styles.tabs}>
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const focused = state.index === index;
            const color = focused ? colors.ink : colors.muted;
            return (
              <Tap key={route.key} role="tab" selected={focused} label={tab.label} scaleTo={0.9}
                onPress={() => { if (!focused) navigateToTab(route.key); }} style={styles.tab}>
                <Ionicons name={focused ? tab.active : tab.icon} size={22} color={color} />
                <T variant="caption" weight={focused ? 'semibold' : 'medium'} color={color} numberOfLines={1} style={{ fontSize: 12, lineHeight: 15 }}>
                  {tab.label}
                </T>
              </Tap>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 68, paddingHorizontal: 8, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1, borderColor: colors.line, ...shadow.float,
  },
  plus: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  tab: { alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 54, gap: 2 },
});
