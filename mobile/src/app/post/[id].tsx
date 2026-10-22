import { Ionicons } from '@/components/Icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SEPIA } from '@/components/Feed';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Avatar, memberTone, PhotoTile, T } from '@/components/ui';
import type { Post } from '@/data/types';
import { duration, relativeTime } from '@/lib/format';
import { callName, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

const EMOJIS = ['❤️', '🥺', '😂', '🙏'];
const BAR = 132;

// Xem ảnh cả nhà kiểu Locket: mỗi trang một ảnh vuông, vuốt lên xem ảnh tiếp, trả lời ngay ở dưới.
export default function PostViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const { width, height } = useWindowDimensions();
  const start = Math.max(0, state.posts.findIndex((p) => p.id === id));
  const [index, setIndex] = useState(start);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(false);
  const [pageH, setPageH] = useState(height - BAR - 60);
  const post = state.posts[index];
  const side = Math.min(width - 32, pageH - 120, 520);
  const posts = useMemo(() => state.posts, [state.posts]);

  if (!post) return null;
  const author = member(state, post.authorId);
  const mine = post.authorId === state.meId;

  function reply() {
    if (!text.trim()) return;
    dispatch({ type: 'reply', postId: post.id, text: text.trim() });
    setText('');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} accessibilityRole="button" accessibilityLabel="Đóng" style={styles.round}>
          <Ionicons name="chevron-down" size={22} color={colors.ink} />
        </Pressable>
        <T variant="small" color={colors.muted}>{index + 1} / {posts.length}</T>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ flex: 1 }} onLayout={(e) => setPageH(e.nativeEvent.layout.height)}>
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: pageH, offset: pageH * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.y / pageH))}
          renderItem={({ item }) => <Page post={item} side={side} height={pageH} />}
        />
      </View>

      <View style={styles.bar}>
        {voice ? (
          <VoiceRecorder size={52} hint={`Nói với ${callName(author)}`} onDone={({ seconds }) => { dispatch({ type: 'reply', postId: post.id, voiceSec: seconds }); setVoice(false); }} />
        ) : (
          <>
            <View style={styles.emojis}>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => dispatch({ type: 'react', postId: post.id, emoji: e })} accessibilityRole="button" accessibilityLabel={`Thả ${e}`}
                  style={[styles.emoji, post.reactions[state.meId] === e && { backgroundColor: colors.primarySoft }]}>
                  <T variant="h3">{e}</T>
                </Pressable>
              ))}
            </View>
            <View style={styles.inputRow}>
              <TextInput value={text} onChangeText={setText} onSubmitEditing={reply} returnKeyType="send"
                placeholder={mine ? 'Viết thêm vài lời...' : `Trả lời ${callName(author)}...`} placeholderTextColor={colors.placeholder}
                style={styles.input} accessibilityLabel="Trả lời" />
              {text.trim() ? (
                <Pressable onPress={reply} accessibilityRole="button" accessibilityLabel="Gửi" style={[styles.send, { backgroundColor: colors.ink }]}>
                  <Ionicons name="arrow-up" size={20} color={colors.white} />
                </Pressable>
              ) : (
                <Pressable onPress={() => setVoice(true)} accessibilityRole="button" accessibilityLabel="Trả lời bằng giọng nói" style={styles.send}>
                  <Ionicons name="mic" size={20} color={colors.ink} />
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Page({ post, side, height }: { post: Post; side: number; height: number }) {
  const { state } = useApp();
  const author = member(state, post.authorId);
  const old = post.tag === 'xua';
  const reacted = Object.entries(post.reactions);
  const last = post.replies[post.replies.length - 1];
  const lastBy = last ? member(state, last.authorId) : undefined;
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
      <View style={styles.who}>
        <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={34} />
        <T variant="body" weight="semibold">{author?.id === state.meId ? 'Bạn' : author?.roleLabel}</T>
        <T variant="small" color={colors.muted}>{old && post.year ? `ảnh năm ${post.year}` : relativeTime(post.createdAt)}</T>
      </View>
      <PhotoTile seed={post.id} tone={old ? SEPIA : memberTone(state.family.members, post.authorId)} uri={post.photoUri}
        style={{ width: side, height: side }} radiusSize={radius.xl + 8} scrim={!!post.photoUri}>
        {post.photoUri ? (
          <View style={styles.captionWrap}><T variant="body" weight="medium" color={colors.white} center style={styles.caption}>{post.caption}</T></View>
        ) : (
          <View style={styles.note}><T variant="h1" weight="regular" color={colors.white} style={{ lineHeight: 38 }}>{post.caption}</T></View>
        )}
      </PhotoTile>
      <View style={{ minHeight: 48, marginTop: 14, alignItems: 'center', gap: 4 }}>
        {post.voiceSec ? <T variant="small" color={colors.muted}>Có lời nói kèm, {duration(post.voiceSec)}</T> : null}
        {last && (
          <T variant="small" color={colors.inkSoft} numberOfLines={1}>
            {lastBy?.id === state.meId ? 'Bạn' : lastBy?.roleLabel}: {last.text ?? `lời nói ${duration(last.voiceSec ?? 0)}`}
            {post.replies.length > 1 ? `  ·  ${post.replies.length} lời` : ''}
          </T>
        )}
        {reacted.length > 0 && <T variant="small" color={colors.muted}>{reacted.map(([, e]) => e).join(' ')}</T>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: 18, alignItems: 'center' },
  caption: { backgroundColor: 'rgba(0,0,0,0.42)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },
  note: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 26, justifyContent: 'center' },
  bar: { minHeight: BAR, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  emojis: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  emoji: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 50, borderRadius: radius.pill, backgroundColor: colors.tone, paddingHorizontal: 20, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
