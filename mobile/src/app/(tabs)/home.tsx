import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { MealTable, MissionCard, OldPhotoPrompt, SEPIA } from '@/components/Feed';
import { Avatar, AvatarStack, Button, FadeIn, memberTone, PhotoTile, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { isElder, me, member, missionFor } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, space } from '@/theme';

// Tab Nhà: việc của mỗi ngày. Chụp bữa cơm vào mâm chung, làm việc hẹn nhau tuần này, xem ảnh cả nhà gửi.
export default function Home() {
  const { state } = useApp();
  const self = me(state);
  const mission = missionFor(state);
  const { width } = useWindowDimensions();
  // Lưới ảnh vuông hai cột như lịch sử Locket; bấm một ảnh là mở xem từng ảnh.
  const cell = Math.floor((Math.min(width, 640) - space.lg * 2 - 10) / 2);
  const [count, setCount] = useState(6);
  const feed = state.posts.slice(0, count);

  return (
    <Screen>
      <View style={styles.header}>
        <Tap onPress={() => router.push('/family')} label="Gia đình và cài đặt" scaleTo={0.97} style={{ flex: 1 }}>
          <View style={{ gap: 8 }}>
            <AvatarStack people={state.family.members} max={4} size={34} />
            <T variant="h1" weight="medium">{state.family.name}</T>
          </View>
        </Tap>
        <Avatar name={self.name} uri={self.avatarUri} size={44} onPress={() => router.push('/family')} />
      </View>
      <T variant="body" color={colors.muted} style={{ marginTop: 6 }}>
        {isElder(self) ? 'Hôm nay các con thế nào, xem ảnh nhé.' : 'Hôm nay ở nhà có gì, xem ảnh nhé.'}
      </T>

      <FadeIn style={{ marginTop: 22 }}><MealTable /></FadeIn>
      {mission && <FadeIn delay={80} style={{ marginTop: 12 }}><MissionCard mission={mission} /></FadeIn>}

      <SectionHeader title="Ảnh của cả nhà" />
      <View style={styles.grid}>
        {feed.map((p, i) => {
          const a = member(state, p.authorId);
          return (
            <FadeIn key={p.id} delay={Math.min(i, 5) * 50}>
              <Tap onPress={() => router.push(`/post/${p.id}`)} label={`Ảnh của ${a?.roleLabel}`} scaleTo={0.97}>
                <PhotoTile seed={p.id} uri={p.photoUri} tone={p.tag === 'xua' ? SEPIA : memberTone(state.family.members, p.authorId)}
                  style={{ width: cell, height: cell }} radiusSize={22}>
                  <View style={styles.tileInner}>
                    {!p.photoUri && <T variant="small" weight="medium" color={colors.white} numberOfLines={4}>{p.caption}</T>}
                    <View style={{ flex: 1 }} />
                    <View style={styles.tileFoot}>
                      <Avatar name={a?.name ?? '?'} uri={a?.avatarUri} size={24} />
                      <T variant="caption" weight="regular" color="rgba(255,255,255,0.92)" numberOfLines={1} style={{ flex: 1 }}>
                        {p.tag === 'xua' && p.year ? `Năm ${p.year}` : relativeTime(p.createdAt)}
                      </T>
                    </View>
                  </View>
                </PhotoTile>
              </Tap>
            </FadeIn>
          );
        })}
      </View>
      {state.posts.length > count && (
        <Button label="Xem thêm ảnh" variant="ghost" style={{ marginTop: 12 }} onPress={() => setCount(count + 8)} />
      )}

      <View style={{ marginTop: 20 }}><OldPhotoPrompt /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 12 },
  tileFoot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
