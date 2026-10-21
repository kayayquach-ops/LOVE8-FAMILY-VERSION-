import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MealTable, MissionCard, OldPhotoPrompt, PostCard } from '@/components/Feed';
import { Avatar, AvatarStack, Button, FadeIn, IconButton, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { isElder, me, missionFor } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// Tab Nhà: việc của mỗi ngày. Chụp bữa cơm vào mâm chung, làm việc hẹn nhau tuần này, xem ảnh cả nhà gửi.
export default function Home() {
  const { state } = useApp();
  const self = me(state);
  const mission = missionFor(state);
  // Vẽ trước 4 ảnh cho trang mở nhanh; bấm "Xem thêm" mới vẽ tiếp.
  const [count, setCount] = useState(4);
  const feed = state.posts.slice(0, count);

  return (
    <Screen>
      <View style={styles.header}>
        <Tap onPress={() => router.push('/family')} label="Gia đình và cài đặt" scaleTo={0.96} style={{ flex: 1 }}>
          <View style={{ gap: 6 }}>
            <AvatarStack people={state.family.members} max={4} size={36} />
            <T variant="display">{state.family.name}</T>
          </View>
        </Tap>
        <IconButton icon="phone-portrait-outline" label="Widget màn hình chính" onPress={() => router.push('/widget')} />
        <Avatar name={self.name} uri={self.avatarUri} size={44} onPress={() => router.push('/family')} />
      </View>
      <T variant="body" color={colors.muted} style={{ marginTop: 4 }}>
        {isElder(self) ? 'Hiểu con mình hơn, mỗi ngày một chút' : 'Hiểu bố mẹ mình hơn, mỗi ngày một chút'}
      </T>

      <FadeIn style={{ marginTop: 20 }}><MealTable /></FadeIn>
      {mission && <FadeIn delay={80} style={{ marginTop: 12 }}><MissionCard mission={mission} /></FadeIn>}
      <FadeIn delay={140} style={{ marginTop: 12 }}><OldPhotoPrompt /></FadeIn>

      <SectionHeader title="Ảnh của cả nhà" />
      <View style={{ gap: 12 }}>
        {feed.map((p, i) => <FadeIn key={p.id} delay={Math.min(i, 3) * 70}><PostCard post={p} /></FadeIn>)}
      </View>
      {state.posts.length > count && (
        <Button label="Xem thêm ảnh" variant="ghost" style={{ marginTop: 12 }} onPress={() => setCount(count + 6)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
});
