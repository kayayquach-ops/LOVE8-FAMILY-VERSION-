import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Avatar, BackHeader, Card, PhotoTile, Pill, Screen, T } from '@/components/ui';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

// "Món của mẹ": công thức mẹ kể bằng giọng nói, Thư biến thành các bước, kèm cách thay nguyên liệu ở Hàn.
export default function Recipes() {
  const { state } = useApp();
  return (
    <Screen>
      <BackHeader title="Món của mẹ" />
      <T variant="small" color={colors.muted} style={{ marginBottom: 16 }}>
        Mẹ kể cách nấu, Thư chép thành từng bước. Ở Hàn khó mua nguyên liệu? Mỗi món có gợi ý thay thế.
      </T>
      <View style={{ gap: 16 }}>
        {state.recipes.map((r) => {
          const teller = member(state, r.tellerId);
          return (
            <Card key={r.id} onPress={() => router.push(`/recipe/${r.id}`)} style={{ padding: 0, overflow: 'hidden' }}>
              <PhotoTile seed={r.id} emoji={r.emoji} height={160} radiusSize={0}>
                <View style={styles.pills}>
                  <Pill label={`${r.minutes} phút`} icon="time" />
                  <Pill label={`${r.serves} người`} icon="people" bg={colors.white} color={colors.ink} />
                </View>
              </PhotoTile>
              <View style={{ padding: 14, gap: 6 }}>
                <T variant="h3" weight="bold">{r.title}</T>
                <T variant="small" color={colors.muted} numberOfLines={1}>“{r.tip}”</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={22} />
                  <T variant="caption" color={colors.inkSoft}>
                    Công thức của {teller?.roleLabel.toLowerCase()}{r.cookedBy.length ? ` · ${r.cookedBy.length} người đã nấu theo` : ''}
                  </T>
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 },
});
