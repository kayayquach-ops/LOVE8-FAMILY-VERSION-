import { Ionicons } from '@/components/Icon';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Avatar, BackHeader, Chip, ListRow, Screen, SectionHeader, T } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { localTimeFor } from '@/lib/format';
import { canUnderstand, me } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const DAYS = [['sun', 'Chủ nhật'], ['sat', 'Thứ Bảy'], ['wed', 'Thứ Tư']] as const;

export default function Family() {
  const { state, dispatch } = useApp();
  const self = me(state);
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'updateSettings', patch });

  function reset() {
    const go = () => { dispatch({ type: 'reset' }); router.replace('/'); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Đặt lại dữ liệu?', 'Dữ liệu sẽ quay về ban đầu.', [
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
          <View key={m.id} style={styles.member}>
            <Pressable disabled={!canUnderstand(self, m)} onPress={() => router.push(`/member/${m.id}`)} accessibilityRole="button"
              style={({ pressed }) => [styles.memberMain, pressed && { backgroundColor: colors.tone }]}>
              <Avatar name={m.name} uri={m.avatarUri} size={44} />
              <View style={{ flex: 1 }}>
                <T variant="body" weight="semibold">{m.id === state.meId ? `${m.roleLabel} (bạn)` : m.roleLabel}</T>
                <T variant="small" color={colors.muted}>{m.city}, bây giờ {localTimeFor(m.country)}</T>
              </View>
            </Pressable>
            {m.id !== state.meId && (
              <Pressable onPress={() => router.push({ pathname: '/room', params: { with: m.id } })} accessibilityRole="button"
                accessibilityLabel={`Gọi video ${m.roleLabel}`} style={styles.call}>
                <Ionicons name="videocam" size={20} color={colors.ink} />
              </Pressable>
            )}
          </View>
        ))}
        <View style={styles.code}>
          <T variant="small" color={colors.muted}>Mã nhà</T>
          <T variant="h3" style={{ letterSpacing: 2 }}>{state.family.inviteCode}</T>
        </View>

        {__DEV__ && <ListRow icon="swap-horizontal-outline" label="Đổi vai" value={self.roleLabel} onPress={() => router.push('/onboarding')} />}

        <SectionHeader title="Cài đặt" />
        <Toggle icon="text-outline" label="Chữ to" value={s.parentMode} onChange={(v) => set({ parentMode: v })} />
        <Toggle icon="notifications-outline" label="Thông báo" value={s.notifications} onChange={(v) => set({ notifications: v })} />
        <Toggle icon="call-outline" label="Homeletter gọi hỏi chuyện mỗi tuần" value={s.aiCalls} onChange={(v) => set({ aiCalls: v })} />
        <Toggle icon="calendar-outline" label="Hiện ngày lễ trên lịch" value={s.holidays} onChange={(v) => set({ holidays: v })} />
        <View style={{ gap: 8, marginVertical: 8 }}>
          <T variant="body" weight="medium">Ngày Homeletter gọi</T>
          <View style={styles.chips}>
            {DAYS.map(([k, label]) => <Chip key={k} label={label} active={s.aiCallDay === k} onPress={() => set({ aiCallDay: k })} />)}
          </View>
        </View>
        <ListRow icon="shield-checkmark-outline" label="Quyền riêng tư và dữ liệu" onPress={() => router.push('/privacy')} />
        {__DEV__ && <ListRow icon="refresh-outline" label="Đặt lại dữ liệu" onPress={reset} danger />}

        <ListRow icon="star" label="Gói Gia đình" value={s.premium ? 'Đang dùng' : undefined} onPress={() => router.push('/premium')} />
      </View>
    </Screen>
  );
}

function Toggle({ icon, label, value, onChange }: { icon: 'text-outline' | 'notifications-outline' | 'call-outline' | 'calendar-outline'; label: string; value: boolean; onChange: (v: boolean) => void }) {
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
  member: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radius.md },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  code: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.tone, borderRadius: radius.md, padding: 16, marginTop: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 4 },
});
