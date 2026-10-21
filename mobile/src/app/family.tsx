import { Ionicons } from '@/components/Icon';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Avatar, BackHeader, ListRow, Screen, SectionHeader, T } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { localTimeFor } from '@/lib/format';
import { canUnderstand, me } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const DAY_LABEL = { sun: 'Chủ nhật', sat: 'Thứ Bảy', wed: 'Thứ Tư' } as const;

export default function Family() {
  const { state, dispatch } = useApp();
  const self = me(state);
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'updateSettings', patch });

  function reset() {
    const go = () => { dispatch({ type: 'reset' }); router.replace('/'); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Đặt lại dữ liệu demo?', 'Toàn bộ dữ liệu mẫu sẽ quay về ban đầu.', [
      { text: 'Huỷ', style: 'cancel' }, { text: 'Đặt lại', style: 'destructive', onPress: go },
    ]);
  }

  return (
    <Screen>
      <BackHeader title="Gia đình và cài đặt" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <Avatar name={self.name} uri={self.avatarUri} size={72} />
        <View style={{ flex: 1 }}>
          <T variant="h1">{self.name}</T>
          <T variant="body" color={colors.inkSoft}>{self.roleLabel}, đang ở {self.city}</T>
        </View>
      </View>

      <View>
        <SectionHeader title={state.family.name} action="Mời thêm" onAction={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })} />
        {state.family.members.map((m) => (
          <Pressable key={m.id} disabled={!canUnderstand(self, m)} onPress={() => router.push(`/member/${m.id}`)} accessibilityRole="button"
            style={({ pressed }) => [styles.member, pressed && { backgroundColor: colors.tone }]}>
            <Avatar name={m.name} uri={m.avatarUri} size={44} />
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold">{m.id === state.meId ? `${m.roleLabel} (bạn)` : m.roleLabel}</T>
              <T variant="small" color={colors.muted}>{m.city}, bây giờ {localTimeFor(m.country)}</T>
            </View>
            {canUnderstand(self, m) && <Ionicons name="chevron-forward" size={17} color={colors.faint} />}
          </Pressable>
        ))}
        <View style={styles.code}>
          <T variant="small" color={colors.muted}>Mã nhà</T>
          <T variant="h3" style={{ letterSpacing: 2 }}>{state.family.inviteCode}</T>
        </View>

        <ListRow icon="swap-horizontal-outline" label="Đổi vai (bản demo)" value={self.roleLabel} onPress={() => router.push('/onboarding')} />

        <SectionHeader title="Cài đặt" />
        <Toggle icon="text-outline" label="Chữ to" value={s.parentMode} onChange={(v) => set({ parentMode: v })} />
        <Toggle icon="notifications-outline" label="Thông báo" value={s.notifications} onChange={(v) => set({ notifications: v })} />
        <Toggle icon="call-outline" label="Homeletter gọi hỏi chuyện mỗi tuần" value={s.aiCalls} onChange={(v) => set({ aiCalls: v })} />
        <ListRow icon="calendar-outline" label="Ngày Homeletter gọi" value={DAY_LABEL[s.aiCallDay]}
          onPress={() => set({ aiCallDay: s.aiCallDay === 'sun' ? 'sat' : s.aiCallDay === 'sat' ? 'wed' : 'sun' })} />
        <ListRow icon="phone-portrait-outline" label="Widget màn hình chính" onPress={() => router.push('/widget')} />
        <ListRow icon="shield-checkmark-outline" label="Quyền riêng tư và dữ liệu" onPress={() => router.push('/privacy')} />
        <ListRow icon="refresh-outline" label="Đặt lại dữ liệu demo" onPress={reset} danger />

        <Pressable onPress={() => router.push('/premium')} accessibilityRole="button"
          style={({ pressed }) => [styles.premium, pressed && { backgroundColor: colors.toneDeep }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="h2">{s.premium ? 'Bạn đang dùng Gói Gia đình' : 'Gói Gia đình'}</T>
            <T variant="small" color={colors.inkSoft}>Homeletter gọi mỗi tuần, kho ảnh và giọng nói không giới hạn, video mọi dịp.</T>
          </View>
          <T variant="small" weight="semibold" color={colors.accentText}>{s.premium ? 'Quản lý' : 'Nâng cấp'}</T>
        </Pressable>
      </View>
    </Screen>
  );
}

function Toggle({ icon, label, value, onChange }: { icon: 'text-outline' | 'notifications-outline' | 'call-outline'; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Ionicons name={icon} size={22} color={colors.inkSoft} />
      <T variant="body" weight="medium" style={{ flex: 1 }}>{label}</T>
      <Switch
        value={value} onValueChange={onChange} trackColor={{ true: colors.ink, false: colors.toneDeep }} thumbColor={colors.white}
        accessibilityLabel={label}
        {...({ activeThumbColor: colors.white } as object)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radius.md },
  code: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.tone, borderRadius: radius.md, padding: 16, marginTop: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 4 },
  premium: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, marginTop: 28 },
});
