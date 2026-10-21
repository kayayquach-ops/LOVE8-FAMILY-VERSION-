import { Ionicons } from '@/components/Icon';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SEPIA } from '@/components/Feed';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Avatar, BackHeader, Empty, memberTone, PhotoTile, Screen, T, Waveform } from '@/components/ui';
import { tagLabel } from '@/data/tags';
import { duration, relativeTime } from '@/lib/format';
import { member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

const EMOJIS = ['❤️', '🥺', '😍', '😂', '👏', '💪'];

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const post = state.posts.find((p) => p.id === id);
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(false);
  if (!post) return <Screen><BackHeader /><Empty icon="image-outline" title="Không tìm thấy ảnh" /></Screen>;
  const author = member(state, post.authorId);

  return (
    <Screen>
      <BackHeader title={author?.roleLabel} />
      <PhotoTile seed={post.id} tone={post.tag === 'xua' ? SEPIA : memberTone(state.family.members, post.authorId)} uri={post.photoUri} height={post.photoUri ? 400 : 340}>
        {!post.photoUri && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 22, gap: 10 }}>
            {tagLabel(post.tag) && <T variant="small" weight="medium" color="rgba(255,255,255,0.82)">{tagLabel(post.tag)}{post.year ? `, ${post.year}` : ''}</T>}
            <T variant="display" weight="regular" color={colors.white} style={{ fontSize: 30, lineHeight: 40 }}>{post.caption}</T>
          </View>
        )}
      </PhotoTile>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="body" weight="semibold">{author?.name}</T>
          <T variant="small" color={colors.muted}>Gửi từ {author?.city}, {relativeTime(post.createdAt)}</T>
        </View>
      </View>
      {post.photoUri && <T variant="h3" weight="medium" style={{ marginTop: 12 }}>{post.caption}</T>}
      {post.voiceSec ? (
        <View style={styles.voice}>
          <Ionicons name="play" size={18} color={colors.ink} />
          <Waveform />
          <T variant="small" color={colors.muted}>{duration(post.voiceSec)}</T>
        </View>
      ) : null}

      <View style={styles.emojis}>
        {EMOJIS.map((e) => (
          <Pressable key={e} onPress={() => dispatch({ type: 'react', postId: post.id, emoji: e })}
            accessibilityRole="button" style={[styles.emoji, post.reactions[state.meId] === e && { backgroundColor: colors.primarySoft }]}>
            <T variant="h3">{e}</T>
          </Pressable>
        ))}
      </View>
      {Object.keys(post.reactions).length > 0 && (
        <T variant="small" color={colors.muted} style={{ marginTop: 8 }}>
          {Object.entries(post.reactions).map(([mid, e]) => `${member(state, mid)?.roleLabel ?? ''} ${e}`).join(', ')}
        </T>
      )}

      <T variant="h2" style={{ marginTop: 32 }}>Trả lời</T>
      <T variant="small" color={colors.muted} style={{ marginTop: 4, marginBottom: 10 }}>Lời trả lời cũng hiện trong Chat của cả nhà.</T>
      {post.replies.map((r) => {
        const a = member(state, r.authorId);
        const mine = r.authorId === state.meId;
        return (
          <View key={r.id} style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
            <Avatar name={a?.name ?? '?'} uri={a?.avatarUri} size={28} />
            <View style={[styles.bubble, mine && { backgroundColor: colors.white }]}>
              {r.voiceSec ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 170 }}>
                  <Ionicons name="play" size={14} color={mine ? colors.black : colors.ink} />
                  <Waveform bars={16} color={mine ? colors.black : colors.ink} />
                  <T variant="caption" color={mine ? colors.black : colors.muted}>{duration(r.voiceSec)}</T>
                </View>
              ) : (
                <T variant="body" color={mine ? colors.black : colors.ink}>{r.text}</T>
              )}
            </View>
          </View>
        );
      })}

      {voice ? (
        <View style={{ marginTop: 16 }}>
          <VoiceRecorder size={56} hint="Gửi lời nhắn thoại" onDone={({ seconds }) => { dispatch({ type: 'reply', postId: post.id, voiceSec: seconds }); setVoice(false); }} />
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput value={text} onChangeText={setText} placeholder="Viết vài lời..." placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Trả lời" />
          <Pressable onPress={() => setVoice(true)} style={styles.send}>
            <Ionicons name="mic" size={18} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => { if (text.trim()) { dispatch({ type: 'reply', postId: post.id, text: text.trim() }); setText(''); } }}
            style={[styles.send, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="send" size={16} color={colors.white} />
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: 999, padding: 14, marginTop: 12 },
  emojis: { flexDirection: 'row', gap: 8, marginTop: 18 },
  emoji: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 5 },
  bubble: { backgroundColor: colors.tone, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '75%' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  input: {
    flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.tone, paddingHorizontal: 18,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
