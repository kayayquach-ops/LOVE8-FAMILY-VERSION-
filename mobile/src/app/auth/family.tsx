import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { BackHeader, Button, Card, Field, Screen, T } from '@/components/ui';
import type { Birthday, Role } from '@/data/types';
import { inviteMessage } from '@/lib/family';
import { useApp } from '@/store/AppContext';
import { colors, radius, space } from '@/theme';

export default function FamilySetup() {
  const p = useLocalSearchParams<{
    name: string; role: Role; roleLabel: string; city: string; phone: string; birthday: string; avatar: string;
  }>();
  const { state, dispatch } = useApp();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [familyName, setFamilyName] = useState(state.family.name);
  const [code, setCode] = useState('');

  function enter() {
    dispatch({
      type: 'signIn', name: p.name ?? '', role: (p.role as Role) ?? 'con', roleLabel: p.roleLabel ?? 'Con',
      birthday: p.birthday ? (JSON.parse(p.birthday) as Birthday) : undefined, avatarUri: p.avatar || undefined,
      phone: p.phone ?? '', city: p.city ?? '',
    });
    dispatch({ type: 'setFamily', name: mode === 'create' ? familyName : state.family.name });
    router.replace('/home');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader />
      <T variant="display" style={{ marginTop: 12 }}>Ngôi nhà chung của cả nhà</T>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 8 }}>
        Mỗi gia đình là một "nhà" riêng tư. Chỉ người được mời mới vào được.
      </T>
      <View style={styles.options}>
        <Option active={mode === 'create'} icon="home-outline" title="Tạo nhà mới" text="Mình mời bố mẹ, anh chị em vào" onPress={() => setMode('create')} />
        <Option active={mode === 'join'} icon="key-outline" title="Vào nhà có sẵn" text="Có người nhà đã gửi mã mời" onPress={() => setMode('join')} />
      </View>
      {mode === 'create' ? (
        <View style={{ gap: space.lg }}>
          <Field label="Tên nhà" value={familyName} onChangeText={setFamilyName} placeholder="Ví dụ: Nhà mình ở Nam Định" />
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <T variant="small" color={colors.muted}>Mã mời</T>
                <T variant="h1" style={{ letterSpacing: 2 }}>{state.family.inviteCode}</T>
              </View>
              <View style={styles.qr}>
                <Ionicons name="qr-code" size={46} color={colors.ink} />
              </View>
            </View>
            <T variant="small" color={colors.inkSoft}>
              Gửi qua Zalo hoặc KakaoTalk. Bố mẹ bấm link là vào thẳng, không cần tìm app.
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ShareBtn label="Zalo" color="#0068FF" onPress={() => Share.share({ message: inviteMessage(familyName, state.family.inviteCode) })} />
              <ShareBtn label="KakaoTalk" color="#FEE500" dark onPress={() => Share.share({ message: inviteMessage(familyName, state.family.inviteCode) })} />
            </View>
          </Card>
        </View>
      ) : (
        <Field label="Mã nhà" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="NHA-1234" autoCapitalize="characters" />
      )}
      <Button
        label={mode === 'create' ? 'Vào nhà' : 'Tham gia'}
        disabled={mode === 'join' && code.length < 6}
        onPress={enter}
        style={{ marginTop: 32 }}
      />
    </Screen>
  );
}

function Option({ active, icon, title, text, onPress }: {
  active: boolean; icon: 'home-outline' | 'key-outline'; title: string; text: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }}
      style={[styles.option, active && { backgroundColor: colors.ink }]}>
      <Ionicons name={icon} size={22} color={active ? colors.white : colors.inkSoft} />
      <T variant="body" weight="semibold" color={active ? colors.white : colors.ink}>{title}</T>
      <T variant="small" color={active ? 'rgba(255,255,255,0.82)' : colors.inkSoft}>{text}</T>
    </Pressable>
  );
}

function ShareBtn({ label, color, dark, onPress }: { label: string; color: string; dark?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.share, { backgroundColor: color }]}>
      <Ionicons name="paper-plane" size={15} color={dark ? colors.ink : colors.white} />
      <T variant="small" weight="semibold" color={dark ? colors.ink : colors.white}>Gửi qua {label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', gap: 12, marginVertical: space.xl },
  option: { flex: 1, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16, gap: 6 },
  qr: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  share: {
    flex: 1, height: 46, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
});
