import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Avatar, BackHeader, Empty, PhotoTile, Pill, Screen, T, Waveform } from '@/components/ui';
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
      <PhotoTile seed={post.id} emoji={post.emoji} uri={post.photoUri} height={380}>
        <View style={{ position: 'absolute', top: 14, left: 14 }}>
          <Pill label={relativeTime(post.createdAt)} icon="time" />
        </View>
      </PhotoTile>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={40} />
        <View style={{ flex: 1 }}>
          <T variant="body" weight="semibold">{author?.name}</T>
          <T variant="small" color={colors.muted}>{author?.city}</T>
        </View>
      </View>
      <T variant="h3" weight="medium" style={{ marginTop: 12 }}>{post.caption}</T>
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
            style={[styles.emoji, post.reactions[state.meId] === e && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <T variant="h3">{e}</T>
          </Pressable>
        ))}
      </View>
      {Object.keys(post.reactions).length > 0 && (
        <T variant="small" color={colors.muted} style={{ marginTop: 8 }}>
          {Object.entries(post.reactions).map(([mid, e]) => `${member(state, mid)?.roleLabel ?? ''} ${e}`).join('  ·  ')}
        </T>
      )}

      <T variant="h3" style={{ marginTop: 24, marginBottom: 8 }}>Trả lời</T>
      {post.replies.map((r) => {
        const a = member(state, r.authorId);
        const mine = r.authorId === state.meId;
        return (
          <View key={r.id} style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
            <Avatar name={a?.name ?? '?'} uri={a?.avatarUri} size={28} />
            <View style={[styles.bubble, mine && { backgroundColor: colors.primary }]}>
              {r.voiceSec ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 170 }}>
                  <Ionicons name="play" size={14} color={mine ? colors.white : colors.ink} />
                  <Waveform bars={16} color={mine ? colors.white : colors.ink} />
                  <T variant="caption" color={mine ? colors.white : colors.muted}>{duration(r.voiceSec)}</T>
                </View>
              ) : (
                <T variant="small" color={mine ? colors.white : colors.ink}>{r.text}</T>
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
          <TextInput value={text} onChangeText={setText} placeholder="Viết vài lời..." placeholderTextColor={colors.faint} style={styles.input} />
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
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.field, borderRadius: 999, padding: 12, marginTop: 12 },
  emojis: { flexDirection: 'row', gap: 8, marginTop: 18 },
  emoji: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 5 },
  bubble: { backgroundColor: colors.field, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '75%' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  input: {
    flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.field, paddingHorizontal: 18,
    fontFamily: fonts.regular, fontSize: 14, color: colors.ink,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
});
