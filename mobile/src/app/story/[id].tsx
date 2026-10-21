import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { BRAND } from '@/brand';
import { Avatar, BackHeader, Button, Chip, Empty, IconButton, Screen, SectionHeader, T, Waveform, type IconName } from '@/components/ui';
import type { Privacy } from '@/data/types';
import { duration, relativeTime } from '@/lib/format';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

const PRIVACY: Array<{ key: Privacy; label: string; icon: IconName }> = [
  { key: 'private', label: 'Chỉ mình tôi', icon: 'lock-closed-outline' },
  { key: 'selected', label: 'Người được chọn', icon: 'people-outline' },
  { key: 'family', label: 'Cả nhà', icon: 'home-outline' },
  { key: 'capsule', label: 'Hẹn ngày mở', icon: 'hourglass-outline' },
];

export default function StoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const story = state.stories.find((s) => s.id === id);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [note, setNote] = useState('');
  const [asked, setAsked] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  if (!story) return <Screen><BackHeader /><Empty icon="book-outline" title="Không tìm thấy câu chuyện" /></Screen>;

  const teller = member(state, story.tellerId);
  const asker = story.askedById ? member(state, story.askedById) : undefined;
  const chapter = state.chapters.find((c) => c.id === story.chapterId);
  const canEdit = story.tellerId === state.meId || story.askedById === state.meId;

  function toggle() {
    if (playing) {
      if (timer.current) clearInterval(timer.current);
      return setPlaying(false);
    }
    setPlaying(true);
    // Bản demo mô phỏng phát âm thanh. Khi có file ghi âm thật, dùng useAudioPlayer của expo-audio.
    timer.current = setInterval(() => {
      setPos((p) => {
        if (p + 1 >= story!.durationSec) {
          if (timer.current) clearInterval(timer.current);
          setPlaying(false);
          return 0;
        }
        return p + 1;
      });
    }, 250);
  }

  return (
    <Screen>
      <BackHeader title={chapter?.title} right={
        <IconButton icon="share-outline" label="Chia sẻ câu trích" bg={colors.white}
          onPress={() => Share.share({ message: `“${story.quote}” – ${teller?.roleLabel} kể, trong Sổ ký ức trên app ${BRAND.name}` })} />
      } />

      {story.year ? <T serif weight="bold" style={styles.year}>{story.year}</T> : null}
      <T variant="display" style={{ marginTop: story.year ? 0 : 12 }}>{story.title}</T>
      <T variant="body" color={colors.inkSoft} style={{ marginTop: 8 }}>
        {teller?.roleLabel} kể{asker ? ` khi ${asker.roleLabel.toLowerCase()} hỏi` : ''}, {relativeTime(story.createdAt)}.
      </T>

      <View style={styles.player}>
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Dừng' : 'Nghe giọng kể'}
          style={({ pressed }) => [styles.play, pressed && { backgroundColor: colors.primaryDark }]}>
          <Ionicons name={playing ? 'pause' : 'play'} size={22} color={colors.white} />
        </Pressable>
        <Waveform bars={26} progress={pos / story.durationSec} />
        <T variant="small" color={colors.muted}>{duration(playing || pos ? pos : story.durationSec)}</T>
      </View>

      {story.question && (
        <T variant="small" color={colors.muted} style={{ marginTop: 24 }}>{asker?.roleLabel ?? 'Câu'} hỏi: “{story.question}”</T>
      )}
      <T variant="h2" weight="regular" style={styles.quote}>“{story.quote}”</T>

      <T variant="body" serif style={styles.transcript}>{story.transcript}</T>
      <T variant="small" color={colors.muted} style={{ marginTop: 10 }}>
        Chép từ giọng kể gốc, chỉ sửa chính tả. Bấm nghe để kiểm chứng.
      </T>

      {(story.people.length > 0 || story.places.length > 0) && (
        <View style={{ gap: 6, marginTop: 20 }}>
          {story.people.length > 0 && <Fact icon="people-outline" text={`Người trong chuyện: ${story.people.join(', ')}`} />}
          {story.places.length > 0 && <Fact icon="location-outline" text={`Nơi chốn: ${story.places.join(', ')}`} />}
          <Fact icon="heart-outline" text={`Cảm xúc: ${story.emotion}`} />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        <Button label="Gắn ảnh cũ" icon="image-outline" variant="ghost" style={{ flex: 1 }} />
        <Button label="Làm clip" icon="film-outline" variant="dark" onPress={() => router.push(`/clip/${story.id}`)} style={{ flex: 1 }} />
      </View>

      <SectionHeader title="Cả nhà nói gì" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {['❤️', '🥺', '😂', '🙏'].map((e) => (
          <Pressable key={e} onPress={() => dispatch({ type: 'reactStory', storyId: story.id, emoji: e })} accessibilityRole="button"
            style={[styles.react, story.reactions[state.meId] === e && { backgroundColor: colors.primarySoft }]}>
            <T variant="h3">{e}</T>
          </Pressable>
        ))}
      </View>
      {story.perspectives.map((p, i) => {
        const a = member(state, p.authorId);
        return (
          <View key={i} style={styles.perspective}>
            <Avatar name={a?.name ?? '?'} uri={a?.avatarUri} size={30} />
            <View style={{ flex: 1 }}>
              <T variant="small" weight="semibold">{a?.roleLabel} nhớ thêm</T>
              <T variant="body" serif>{p.text}</T>
            </View>
          </View>
        );
      })}
      <View style={styles.inputRow}>
        <TextInput value={note} onChangeText={setNote} placeholder="Bạn nhớ chuyện này khác đi?" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Bạn nhớ chuyện này khác đi?" />
        <Pressable onPress={() => { if (note.trim()) { dispatch({ type: 'addPerspective', storyId: story.id, text: note.trim() }); setNote(''); } }} style={styles.send}>
          <Ionicons name="send" size={16} color={colors.white} />
        </Pressable>
      </View>

      {story.followUps.length > 0 && (
        <>
          <SectionHeader title="Hỏi tiếp" />
          {story.followUps.map((f) => (
            <Pressable key={f} disabled={asked.includes(f)} accessibilityRole="button"
              onPress={() => { dispatch({ type: 'addFollowUp', storyId: story.id, text: f }); setAsked([...asked, f]); }}
              style={({ pressed }) => [styles.follow, pressed && { backgroundColor: colors.toneDeep }]}>
              <T variant="body" style={{ flex: 1 }}>{f}</T>
              {asked.includes(f) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark" size={16} color={colors.green} />
                  <T variant="small" weight="semibold" color={colors.green}>Đã gửi</T>
                </View>
              ) : (
                <T variant="small" weight="semibold" color={colors.primary}>Nhờ Thư hỏi</T>
              )}
            </Pressable>
          ))}
        </>
      )}

      {canEdit && (
        <>
          <SectionHeader title="Ai được xem" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRIVACY.map((p) => (
              <Chip key={p.key} label={p.label} icon={p.icon} active={story.privacy === p.key} onPress={() => dispatch({ type: 'setPrivacy', storyId: story.id, privacy: p.key })} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={colors.muted} style={{ marginTop: 2 }} />
      <T variant="small" color={colors.inkSoft} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  year: { fontSize: 64, lineHeight: 68, letterSpacing: -2, marginTop: 8 },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  player: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.tone, borderRadius: radius.pill,
    padding: 8, paddingRight: 18, marginTop: 20,
  },
  quote: { fontSize: 24, lineHeight: 33, marginTop: 10 },
  transcript: { fontSize: 18, lineHeight: 30, marginTop: 20 },
  react: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  perspective: { flexDirection: 'row', gap: 12, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 14, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.tone, paddingHorizontal: 18, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: radius.md, padding: 14, minHeight: 52, marginBottom: 8 },
});
