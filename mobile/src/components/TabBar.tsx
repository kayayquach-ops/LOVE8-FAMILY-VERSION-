import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { me } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';
import { Ionicons } from './Icon';
import { Avatar, GradientRing, T, Tap } from './ui';

const LABELS: Record<string, string> = { home: 'Nhà', memories: 'Ký ức', chat: 'Thư', calendar: 'Lịch' };

// Thanh menu nổi hình viên thuốc như bản tham khảo: nút "+" viền chuyển màu để chụp gửi cả nhà,
// các tab bằng chữ, và avatar của mình ở cuối để mở phần gia đình và cài đặt.
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { state: app } = useApp();
  const self = me(app);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        <Tap onPress={() => router.push('/capture')} label="Chụp và gửi ảnh cho cả nhà" scaleTo={0.88}>
          <GradientRing size={48}>
            <View style={styles.plus}>
              <Ionicons name="add" size={26} color={colors.white} />
            </View>
          </GradientRing>
        </Tap>
        <View style={styles.tabs}>
          {state.routes.map((route, index) => {
            const label = LABELS[route.name];
            if (!label) return null;
            const focused = state.index === index;
            return (
              <Tap key={route.key} role="tab" selected={focused} label={label} scaleTo={0.9}
                onPress={() => { if (!focused) navigateToTab(route.key); }} style={styles.tab}>
                <T variant="small" weight={focused ? 'semibold' : 'medium'} color={focused ? colors.white : colors.muted}>{label}</T>
                <View style={[styles.dot, { opacity: focused ? 1 : 0 }]} />
              </Tap>
            );
          })}
        </View>
        <Avatar name={self.name} uri={self.avatarUri} size={44} onPress={() => router.push('/family')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 64, paddingHorizontal: 8, borderRadius: radius.pill,
    backgroundColor: 'rgba(16,16,18,0.96)', borderWidth: 1, borderColor: colors.line,
  },
  plus: { flex: 1, borderRadius: radius.pill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  tab: { alignItems: 'center', paddingHorizontal: 6, minHeight: 44, justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accentText, marginTop: 3 },
});
