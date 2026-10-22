import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Alert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { FACTS } from '@/components/Understand';
import { VoicePill } from '@/components/Voice';
import { Avatar, BackHeader, Button, Empty, FadeIn, memberTone, PhotoTile, Screen, SectionHeader, T, Tap } from '@/components/ui';
import { callName, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Homeletter tuần này: đoạn giọng thật hay nhất, tóm tắt, điều mới hiểu, và một việc nên làm cùng nhau.
export default function LetterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const letter = state.letters.find((l) => l.id === id);
  if (!letter) return <Screen><BackHeader /><Empty icon="mail-open-outline" title="Không tìm thấy thư" /></Screen>;
  const speaker = member(state, letter.speakerId);
  const mine = letter.speakerId === state.meId;
  const name = callName(speaker);
  const Name = name.charAt(0).toUpperCase() + name.slice(1);

  function remove() {
    const go = () => { dispatch({ type: 'deleteLetter', id: letter!.id }); router.back(); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Xoá đoạn này?', 'Người nhà sẽ không nghe được nữa.', [{ text: 'Huỷ', style: 'cancel' }, { text: 'Xoá', style: 'destructive', onPress: go }]);
  }

  return (
    <Screen>
      <BackHeader title="Homeletter" />
      <FadeIn>
        <PhotoTile seed={letter.id} tone={memberTone(state.family.members, letter.speakerId)} autoHeight>
          <View style={{ padding: 20, gap: 14 }}>
            <View style={styles.row}>
              <Avatar name={speaker?.name ?? '?'} uri={speaker?.avatarUri} size={48} />
              <View style={{ flex: 1 }}>
                <T variant="body" weight="semibold" color={colors.white}>{mine ? 'Bạn kể' : `${Name} kể`}</T>
              </View>
            </View>
            <T variant="display" color={colors.white} style={{ fontSize: 34, lineHeight: 38 }}>{letter.title}</T>
            <T variant="small" weight="semibold" color={colors.white}>Đoạn hay nhất, giọng thật của {mine ? 'bạn' : name}</T>
            <VoicePill sec={letter.highlightSec} onLight />
            <T variant="h3" weight="medium" color={colors.white}>“{letter.quote}”</T>
          </View>
        </PhotoTile>
      </FadeIn>

      {!mine && (
        <View style={{ gap: 10, marginTop: 14 }}>
          <Button label={`Trả lời ${name} bằng giọng nói`} icon="mic" variant="dark"
            onPress={() => router.push({ pathname: '/chat', params: { voice: '1', to: letter.speakerId, reply: letter.id } })} />
          <Button label={`Gọi video ${name}`} icon="videocam" variant="ghost" onPress={() => router.push({ pathname: '/room', params: { with: letter.speakerId } })} />
        </View>
      )}

      <T variant="body" color={colors.inkSoft} style={{ marginTop: 20, fontSize: 17, lineHeight: 27 }}>{letter.summary}</T>

      <SectionHeader title={mine ? 'Điều người nhà hiểu thêm về bạn' : `Điều bạn mới hiểu về ${name}`} />
      <View style={styles.card}>
        {letter.facts.map((f) => (
          <View key={f.text} style={styles.fact}>
            <Ionicons name={FACTS[f.kind].icon} size={18} color={colors.accentText} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T variant="caption" weight="semibold" color={colors.accentText}>{FACTS[f.kind].label(mine ? 'Bạn' : Name)}</T>
              <T variant="body">{f.text}</T>
            </View>
          </View>
        ))}
      </View>

      {!mine && letter.quiz?.length ? (
        <Tap onPress={() => router.push(`/quiz/${letter.speakerId}`)} label="Chơi đố vui" scaleTo={0.98} style={{ marginTop: 16 }}>
          <View style={[styles.card, styles.row]}>
            <Ionicons name="help-circle" size={28} color={colors.lunar} />
            <T variant="body" weight="semibold" style={{ flex: 1 }}>Đố cả nhà: bạn hiểu {name} đến đâu?</T>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </View>
        </Tap>
      ) : null}

      {letter.storyId && state.stories.some((st) => st.id === letter.storyId) && (
        <Button label="Đọc cả câu chuyện" icon="book-outline" variant="ghost" style={{ marginTop: 12 }} onPress={() => router.push(`/story/${letter.storyId}`)} />
      )}

      {mine && <Button label="Xoá đoạn này" icon="trash-outline" variant="ghost" style={{ marginTop: 16 }} onPress={remove} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18, gap: 14 },
  fact: { flexDirection: 'row', gap: 12 },
});
