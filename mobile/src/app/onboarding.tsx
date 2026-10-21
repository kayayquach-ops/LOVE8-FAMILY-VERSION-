import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { Avatar, Button, FadeIn, Logo, memberTone, PhotoTile, Screen, T, Tap, type IconName } from '@/components/ui';
import { inviteMessage, WHO } from '@/lib/family';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Vào app chỉ hỏi một câu: bạn là ai trong nhà. Trả lời xong, cả app đổi lời theo vai.
export default function Onboarding() {
  const { state, dispatch } = useApp();
  const [who, setWho] = useState<(typeof WHO)[number] | null>(null);

  if (!who) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={{ paddingTop: 20, alignItems: 'center' }}><Logo small /></View>
        <FadeIn style={{ marginTop: 36, gap: 8 }}>
          <T variant="display" center>Bạn là ai trong nhà?</T>
          <T variant="body" color={colors.muted} center>Chọn một ô để bắt đầu.</T>
        </FadeIn>
        <View style={styles.grid}>
          {WHO.map((w, i) => {
            const m = member(state, w.memberId);
            return (
              <FadeIn key={w.memberId} delay={80 + i * 70} style={styles.cell}>
                <Tap onPress={() => setWho(w)} label={w.label} scaleTo={0.95}>
                  <PhotoTile seed={`who-${w.memberId}`} tone={memberTone(state.family.members, w.memberId)} height={190}>
                    <View style={styles.cellInner}>
                      <Avatar name={m?.name ?? w.label} uri={m?.avatarUri} size={84} />
                      <T variant="h1" color={colors.white}>{w.label}</T>
                    </View>
                  </PhotoTile>
                </Tap>
              </FadeIn>
            );
          })}
        </View>
      </Screen>
    );
  }

  const POINTS: Array<{ icon: IconName; text: string }> = who.elder
    ? [
        { icon: 'camera', text: 'Mỗi tối, cả nhà gửi ảnh bữa cơm vào một mâm chung.' },
        { icon: 'call', text: 'Mỗi tuần Homeletter gọi bạn 10 phút, mang theo lời các con gửi gắm.' },
        { icon: 'sunny', text: 'Sáng ra, mở máy là nghe lời chào của con.' },
      ]
    : [
        { icon: 'camera', text: 'Mỗi tối, cả nhà gửi ảnh bữa cơm vào một mâm chung.' },
        { icon: 'lock-closed', text: 'Điều bạn ngại hỏi, Homeletter hỏi khéo giúp, không nói ai hỏi.' },
        { icon: 'mail-open', text: 'Mỗi tuần nhận lại một Homeletter: giọng thật của bố mẹ, và điều bạn mới hiểu.' },
      ];

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingTop: 20, alignItems: 'center' }}><Logo small /></View>
      <FadeIn style={{ marginTop: 40, gap: 10 }}>
        <T variant="display" style={{ fontSize: 40, lineHeight: 44 }}>{who.elder ? 'Hiểu con mình hơn' : 'Hiểu bố mẹ mình hơn'}</T>
        <T variant="body" color={colors.muted}>Mỗi ngày một chút, dù ở xa hay ở gần.</T>
      </FadeIn>
      <View style={{ gap: 12, marginTop: 28 }}>
        {POINTS.map((p, i) => (
          <FadeIn key={p.text} delay={100 + i * 80}>
            <View style={styles.point}>
              <View style={styles.pointIcon}><Ionicons name={p.icon} size={22} color={colors.white} /></View>
              <T variant="body" weight="medium" style={{ flex: 1 }}>{p.text}</T>
            </View>
          </FadeIn>
        ))}
      </View>
      <View style={{ flex: 1, minHeight: 32 }} />
      <Button label="Vào nhà" icon="home" onPress={() => {
        dispatch({ type: 'chooseMember', memberId: who.memberId, parentMode: who.elder });
        if (router.canDismiss()) router.dismissAll();
        router.replace('/home');
      }} />
      <Button label="Mời cả nhà vào" icon="share-outline" variant="ghost" style={{ marginTop: 10 }}
        onPress={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })} />
      <Tap onPress={() => setWho(null)} label="Chọn lại" scaleTo={0.95} style={{ alignSelf: 'center', marginTop: 8 }}>
        <View style={{ minHeight: 44, justifyContent: 'center' }}>
          <T variant="small" weight="semibold" color={colors.muted}>Chọn lại</T>
        </View>
      </Tap>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  cell: { width: '48.5%', flexGrow: 1 },
  cellInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16 },
  pointIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
});
