import { Ionicons } from '@expo/vector-icons';
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
      <T variant="h1" weight="regular" style={{ marginTop: 12 }}>
        <T variant="h1">Ngôi nhà </T>chung của cả nhà
      </T>
      <T variant="small" color={colors.muted} style={{ marginTop: 6 }}>
        Mỗi gia đình là một "nhà" riêng tư. Chỉ người được mời mới vào được.
      </T>
      <View style={styles.options}>
        <Option active={mode === 'create'} icon="home" title="Tạo nhà mới" text="Mình mời bố mẹ, anh chị em vào" onPress={() => setMode('create')} />
        <Option active={mode === 'join'} icon="key" title="Vào nhà có sẵn" text="Có người nhà đã gửi mã mời" onPress={() => setMode('join')} />
      </View>
      {mode === 'create' ? (
        <View style={{ gap: space.lg }}>
          <Field label="Tên nhà" value={familyName} onChangeText={setFamilyName} placeholder="Ví dụ: Nhà mình ở Nam Định" />
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <T variant="caption" color={colors.muted}>MÃ MỜI</T>
                <T variant="h1" style={{ letterSpacing: 2 }}>{state.family.inviteCode}</T>
              </View>
              <View style={styles.qr}>
                <Ionicons name="qr-code" size={46} color={colors.ink} />
              </View>
            </View>
            <T variant="small" color={colors.muted}>
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
  active: boolean; icon: 'home' | 'key'; title: string; text: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.option, active && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]}>
      <Ionicons name={icon} size={22} color={active ? colors.primary : colors.inkSoft} />
      <T variant="body" weight="semibold">{title}</T>
      <T variant="caption" color={colors.muted}>{text}</T>
    </Pressable>
  );
}

function ShareBtn({ label, color, dark, onPress }: { label: string; color: string; dark?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.share, { backgroundColor: color }]}>
      <Ionicons name="paper-plane" size={15} color={dark ? colors.ink : colors.white} />
      <T variant="small" weight="semibold" color={dark ? colors.ink : colors.white}>Gửi qua {label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', gap: 12, marginVertical: space.xl },
  option: {
    flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 6,
  },
  qr: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  share: {
    flex: 1, height: 42, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
});
