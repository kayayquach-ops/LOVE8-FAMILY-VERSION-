import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { PostCard } from '@/components/Feed';
import { BackHeader, Chip, Empty, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';

// Toàn bộ ảnh của cả nhà, lọc theo người gửi. Giống album chung nhưng theo dòng thời gian.
export default function Feed() {
  const { state } = useApp();
  const [who, setWho] = useState<string | 'all'>('all');
  const posts = state.posts.filter((p) => who === 'all' || p.authorId === who);
  return (
    <Screen>
      <BackHeader title="Ảnh của cả nhà" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingBottom: 16, paddingHorizontal: 20 }}>
        <Chip label="Tất cả" active={who === 'all'} onPress={() => setWho('all')} />
        {state.family.members.map((m) => (
          <Chip key={m.id} label={m.id === state.meId ? 'Bạn' : m.roleLabel} active={who === m.id} onPress={() => setWho(m.id)} />
        ))}
      </ScrollView>
      <View style={{ gap: 18 }}>
        {posts.length === 0 && <Empty icon="images-outline" title="Chưa có ảnh nào" />}
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </View>
    </Screen>
  );
}
