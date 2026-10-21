import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Avatar, BackHeader, ListRow, Screen, SectionHeader, T } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { localTimeFor } from '@/lib/format';
import { me } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius, shadow } from '@/theme';

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
    <Screen padded={false} bg={colors.white}>
      <View style={styles.hero}>
        <View style={{ paddingHorizontal: 20 }}><BackHeader title=" " /></View>
      </View>
      <View style={{ alignItems: 'center', marginTop: -70 }}>
        <View style={styles.avatarWrap}><Avatar name={self.name} uri={self.avatarUri} size={110} /></View>
        <T variant="h2" style={{ marginTop: 10 }}>{self.name}</T>
        <T variant="small" color={colors.muted}>{self.roleLabel} · {self.city}</T>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <SectionHeader title={state.family.name} action="+ Mời thêm" onAction={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })} />
        {state.family.members.map((m) => (
          <Pressable key={m.id} onPress={() => m.id !== state.meId && router.push(`/member/${m.id}`)} style={styles.member}>
            <Avatar name={m.name} uri={m.avatarUri} size={42} />
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold">{m.id === state.meId ? `${m.name} (bạn)` : m.name}</T>
              <T variant="caption" color={colors.muted}>{m.roleLabel} · {m.city} · {localTimeFor(m.country)}</T>
            </View>
            {m.id !== state.meId && <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
          </Pressable>
        ))}
        <View style={styles.code}>
          <T variant="small" color={colors.muted}>Mã nhà</T>
          <T variant="h3" style={{ letterSpacing: 2 }}>{state.family.inviteCode}</T>
        </View>

        <SectionHeader title="Cài đặt" />
        <Toggle icon="accessibility" label="Chế độ bố mẹ (chữ to, ít nút)" value={s.parentMode} onChange={(v) => { set({ parentMode: v }); if (v) router.replace('/home'); }} />
        <Toggle icon="notifications" label="Thông báo" value={s.notifications} onChange={(v) => set({ notifications: v })} />
        <Toggle icon="call" label="Thư gọi hỏi chuyện mỗi tuần" value={s.aiCalls} onChange={(v) => set({ aiCalls: v })} />
        <ListRow icon="calendar" label="Ngày Thư gọi" value={DAY_LABEL[s.aiCallDay]}
          onPress={() => set({ aiCallDay: s.aiCallDay === 'sun' ? 'sat' : s.aiCallDay === 'sat' ? 'wed' : 'sun' })} />
        <ListRow icon="alarm" label="Nhắc khi chưa gọi về" value={`sau ${s.nudgeAfterDays} ngày`}
          onPress={() => set({ nudgeAfterDays: s.nudgeAfterDays >= 7 ? 2 : s.nudgeAfterDays + 1 })} />
        <ListRow icon="language" label="Ngôn ngữ" value={s.language === 'vi' ? 'Tiếng Việt' : '한국어'} onPress={() => set({ language: s.language === 'vi' ? 'ko' : 'vi' })} />
        <ListRow icon="phone-portrait" label="Widget màn hình chính" onPress={() => router.push('/widget')} />
        <ListRow icon="shield-checkmark" label="Quyền riêng tư và dữ liệu" onPress={() => router.push('/privacy')} />
        <ListRow icon="refresh" label="Đặt lại dữ liệu demo" onPress={reset} danger />

        <Pressable onPress={() => router.push('/premium')} style={[styles.premium, shadow.card]}>
          <Ionicons name="star" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T variant="body" weight="semibold">{s.premium ? 'Bạn đang dùng Gói Gia đình' : 'Gói Gia đình'}</T>
            <T variant="caption" color={colors.muted}>Không giới hạn câu chuyện, clip, Thư gọi mỗi tuần</T>
          </View>
          <T variant="small" weight="semibold" color={colors.primary}>{s.premium ? 'Quản lý' : 'Nâng cấp ›'}</T>
        </Pressable>
      </View>
    </Screen>
  );
}

function Toggle({ icon, label, value, onChange }: { icon: 'accessibility' | 'notifications' | 'call'; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.icon}><Ionicons name={icon} size={18} color={colors.ink} /></View>
      <T variant="body" weight="medium" style={{ flex: 1 }}>{label}</T>
      <Switch
        value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.white}
        {...({ activeThumbColor: colors.white } as object)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 170, backgroundColor: colors.primary, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  avatarWrap: { padding: 5, backgroundColor: colors.white, borderRadius: 70 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  code: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.field, borderRadius: radius.md, padding: 14, marginTop: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  premium: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginTop: 24 },
});
