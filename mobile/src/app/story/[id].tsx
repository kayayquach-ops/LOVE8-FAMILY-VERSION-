import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { BRAND } from '@/brand';
import { Avatar, BackHeader, Button, Card, Chip, Empty, PhotoTile, Pill, Screen, SectionHeader, T, Waveform } from '@/components/ui';
import type { Privacy } from '@/data/types';
import { duration, relativeTime } from '@/lib/format';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

const PRIVACY: Array<{ key: Privacy; label: string }> = [
  { key: 'private', label: '🔒 Chỉ mình tôi' },
  { key: 'selected', label: '👥 Người được chọn' },
  { key: 'family', label: '🏠 Cả nhà' },
  { key: 'capsule', label: '⏳ Hẹn ngày mở' },
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
        <Pressable onPress={() => Share.share({ message: `“${story.quote}” – ${teller?.roleLabel} kể, trong Sổ ký ức trên app ${BRAND.name}` })}>
          <Ionicons name="share-outline" size={22} color={colors.ink} />
        </Pressable>
      } />
      <PhotoTile seed={story.id} emoji={story.emoji} height={230}>
        <View style={{ position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 8 }}>
          {story.year ? <Pill label={`${story.year}`} icon="calendar" /> : null}
          <Pill label={story.emotion} icon="heart" bg={colors.white} color={colors.ink} />
        </View>
      </PhotoTile>

      <Card style={styles.titleCard}>
        <View style={{ flex: 1 }}>
          <T variant="h2">{story.title}</T>
          <T variant="small" color={colors.muted}>
            {teller?.roleLabel} kể · {relativeTime(story.createdAt)}{asker ? ` · ${asker.roleLabel} hỏi` : ''}
          </T>
        </View>
        <Pressable onPress={toggle} style={styles.play}>
          <Ionicons name={playing ? 'pause' : 'play'} size={22} color={colors.white} />
        </Pressable>
      </Card>

      <View style={styles.player}>
        <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={34} />
        <Waveform bars={30} progress={pos / story.durationSec} color={colors.faint} />
        <T variant="caption" color={colors.muted}>{duration(pos)} / {duration(story.durationSec)}</T>
      </View>

      {story.question && (
        <T variant="small" color={colors.muted} style={{ marginTop: 18 }}>Câu hỏi: “{story.question}”</T>
      )}
      <View style={styles.quote}>
        <T variant="h3" weight="semibold" color={colors.primaryDark}>“{story.quote}”</T>
      </View>

      <SectionHeader title="Lời kể" />
      <T variant="body" color={colors.inkSoft} style={{ lineHeight: 26 }}>{story.transcript}</T>
      <T variant="caption" color={colors.faint} style={{ marginTop: 8 }}>
        Chép từ giọng kể gốc, chỉ sửa chính tả. Bấm nghe để kiểm chứng.
      </T>

      {(story.people.length > 0 || story.places.length > 0) && (
        <View style={styles.tags}>
          {story.people.map((p) => <Pill key={p} label={p} icon="person" bg={colors.field} color={colors.inkSoft} />)}
          {story.places.map((p) => <Pill key={p} label={p} icon="location" bg={colors.field} color={colors.inkSoft} />)}
        </View>
      )}

      <SectionHeader title="Ảnh trong chuyện" action="Gắn ảnh cũ" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {story.photoEmojis.map((e, i) => <PhotoTile key={i} seed={`${story.id}-${i}`} emoji={e} height={110} style={{ width: 110 }} />)}
      </ScrollView>
      <Button label="Tạo clip câu chuyện" icon="film" variant="dark" onPress={() => router.push(`/clip/${story.id}`)} style={{ marginTop: 16 }} />

      <SectionHeader title="Cả nhà nói gì" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {['❤️', '🥺', '😂', '🙏'].map((e) => (
          <Pressable key={e} onPress={() => dispatch({ type: 'reactStory', storyId: story.id, emoji: e })}
            style={[styles.react, story.reactions[state.meId] === e && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
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
              <T variant="small" color={colors.inkSoft}>{p.text}</T>
            </View>
          </View>
        );
      })}
      <View style={styles.inputRow}>
        <TextInput value={note} onChangeText={setNote} placeholder="Bạn nhớ chuyện này khác đi?" placeholderTextColor={colors.faint} style={styles.input} />
        <Pressable onPress={() => { if (note.trim()) { dispatch({ type: 'addPerspective', storyId: story.id, text: note.trim() }); setNote(''); } }} style={styles.send}>
          <Ionicons name="send" size={16} color={colors.white} />
        </Pressable>
      </View>

      {story.followUps.length > 0 && (
        <>
          <SectionHeader title="Hỏi tiếp" />
          {story.followUps.map((f) => (
            <Pressable key={f} disabled={asked.includes(f)} onPress={() => { dispatch({ type: 'addFollowUp', storyId: story.id, text: f }); setAsked([...asked, f]); }} style={styles.follow}>
              <T variant="small" style={{ flex: 1 }}>{f}</T>
              <T variant="caption" weight="semibold" color={asked.includes(f) ? colors.green : colors.primary}>
                {asked.includes(f) ? 'Đã gửi ✓' : 'Nhờ Thư hỏi'}
              </T>
            </Pressable>
          ))}
        </>
      )}

      {canEdit && (
        <>
          <SectionHeader title="Ai được xem" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PRIVACY.map((p) => (
              <Chip key={p.key} label={p.label} icon={undefined} active={story.privacy === p.key} tone="dark" onPress={() => dispatch({ type: 'setPrivacy', storyId: story.id, privacy: p.key })} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -30, marginHorizontal: 10 },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  player: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.field, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 16,
  },
  quote: { borderLeftWidth: 4, borderLeftColor: colors.primary, paddingLeft: 14, marginTop: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  react: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  perspective: { flexDirection: 'row', gap: 10, backgroundColor: colors.primaryTint, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: { flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.field, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 8 },
});
