import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Avatar, Chip, Pill, T } from '@/components/ui';
import type { ChatMessage, ChatMode, Member } from '@/data/types';
import { duration } from '@/lib/format';
import { isElder } from '@/lib/family';
import { me, member, others } from '@/lib/selectors';
import { AI_MODE, interviewReply, softenMessage, structureStory } from '@/services/ai';
import { newId, useApp } from '@/store/AppContext';
import { colors, fonts, radius, shadow } from '@/theme';

export default function Chat() {
  const { state, dispatch } = useApp();
  const [mode, setMode] = useState<ChatMode>('story');
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [voice, setVoice] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const self = me(state);
  const elders = others(state).filter((m) => isElder(m.role));
  const [recipient, setRecipient] = useState<string>(elders[0]?.id ?? others(state)[0]?.id);
  const messages = state.chats[mode];
  const waiting = state.questions.filter((q) => q.toId === state.meId && q.status !== 'answered');

  const add = (m: Omit<ChatMessage, 'id' | 'createdAt'>, md: ChatMode = mode) => dispatch({ type: 'addChat', mode: md, message: m });

  async function send(body: string, voiceSec?: number) {
    if (!body.trim() && !voiceSec) return;
    const mine: ChatMessage = { id: newId('m'), from: 'me', text: body.trim(), createdAt: new Date().toISOString(), voiceSec };
    add(mine);
    setText('');
    setTyping(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    const reply = await interviewReply({
      mode, history: [...messages, mine], speakerName: self.name, speakerRole: self.roleLabel,
      familyNames: state.family.members.map((m) => m.roleLabel),
    });
    setTyping(false);
    add({ from: 'ai', text: reply.text, kind: reply.kind ?? 'text' });
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }

  function myRecentText(kinds: Array<ChatMessage['kind']>): string {
    const out: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from === 'ai' && m.kind && kinds.includes(m.kind) && out.length) break;
      if (m.from === 'me' && m.text) out.unshift(m.text);
    }
    return out.join(' ');
  }

  async function saveStory() {
    const transcript = myRecentText(['saved', 'relayed']);
    setTyping(true);
    const s = await structureStory(transcript || 'Một câu chuyện không lời.', self.name);
    const id = newId('s');
    dispatch({
      type: 'addStory',
      story: {
        id, tellerId: state.meId, title: s.title, chapterId: s.chapterId, year: s.year, createdAt: new Date().toISOString(),
        durationSec: Math.max(30, Math.round(transcript.length / 12)), transcript, quote: s.quote, people: s.people,
        places: s.places, emotion: s.emotion, emoji: s.emoji, photoEmojis: [s.emoji, '📷', '❤️'], privacy: 'family',
        reactions: {}, followUps: s.followUps, perspectives: [],
      },
    });
    const pending = waiting[0];
    if (pending) dispatch({ type: 'questionStatus', id: pending.id, status: 'answered', storyId: id });
    setTyping(false);
    add({ from: 'ai', kind: 'saved', storyId: id, text: `Đã lưu trang “${s.title}” vào chương ${state.chapters.find((c) => c.id === s.chapterId)?.title}. Cả nhà sẽ nhận được thông báo.` });
  }

  async function relay(how: 'verbatim' | 'soften' | 'keep') {
    const to = member(state, recipient);
    if (how === 'keep') return add({ from: 'ai', kind: 'saved', text: 'Thư giữ riêng chuyện này cho bạn. Khi nào sẵn sàng, bạn có thể quay lại đây.' });
    const body = myRecentText(['consent', 'relayed', 'saved']);
    const final = how === 'soften' ? await softenMessage(body, to?.roleLabel ?? 'Mẹ') : body;
    add({ from: 'ai', kind: 'relayed', text: `Thư sẽ chuyển tới ${to?.roleLabel.toLowerCase()} trong cuộc gọi tối nay:\n\n“${final}”` });
  }

  function askPending() {
    const q = waiting[0];
    if (!q) return;
    dispatch({ type: 'questionStatus', id: q.id, status: 'asked' });
    setMode('story');
    add({ from: 'ai', text: `${member(state, q.fromId)?.roleLabel} muốn hỏi bạn: “${q.text}” Bạn kể cho ${member(state, q.fromId)?.roleLabel.toLowerCase()} nghe nhé?` }, 'story');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={styles.header}>
        <Avatar name="Thư" emoji="🕊️" size={44} />
        <View style={{ flex: 1 }}>
          <T variant="h3" weight="bold">Thư</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.online} />
            <T variant="caption" color={colors.muted}>Trợ lý của {state.family.name.toLowerCase()}</T>
            {AI_MODE === 'demo' && <Pill label="Bản demo" bg={colors.amberSoft} color={colors.amber} />}
          </View>
        </View>
        <Pressable onPress={() => router.push('/call')} style={styles.callBtn}>
          <Ionicons name="call" size={18} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.segment}>
        {(['story', 'confide'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
            <T variant="small" weight="semibold" color={mode === m ? colors.white : colors.inkSoft}>
              {m === 'story' ? '📖 Kể chuyện' : '🔒 Tâm sự riêng'}
            </T>
          </Pressable>
        ))}
      </View>

      {mode === 'story' && waiting.length > 0 && (
        <Pressable onPress={askPending} style={styles.banner}>
          <T variant="small" weight="semibold" style={{ flex: 1 }}>
            💬 {member(state, waiting[0].fromId)?.roleLabel} đang chờ bạn trả lời: “{waiting[0].text}”
          </T>
          <T variant="caption" weight="bold" color={colors.primary}>Trả lời</T>
        </Pressable>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {messages.map((m) => (
            <Bubble key={m.id} m={m} elders={elders} recipient={recipient} setRecipient={setRecipient}
              onSave={saveStory} onRelay={relay} />
          ))}
          {typing && (
            <View style={[styles.bubble, styles.ai, { flexDirection: 'row', gap: 4 }]}>
              {[0, 1, 2].map((k) => <View key={k} style={styles.dot} />)}
            </View>
          )}
        </ScrollView>

        {voice ? (
          <View style={styles.voicePanel}>
            <VoiceRecorder size={58} hint="Kể bằng giọng nói, Thư sẽ chép lại"
              onDone={({ seconds }) => { setVoice(false); send(AI_MODE === 'demo' ? `(Tin nhắn thoại ${duration(seconds)})` : '', seconds); }} />
          </View>
        ) : (
          <View style={[styles.composer, { marginBottom: 96 }]}>
            <TextInput
              value={text} onChangeText={setText} placeholder={mode === 'story' ? 'Kể cho Thư nghe...' : 'Điều bạn muốn nói mà ngại...'}
              placeholderTextColor={colors.faint} style={styles.input} multiline
            />
            <Pressable onPress={() => setVoice(true)} style={styles.iconBtn}>
              <Ionicons name="mic" size={20} color={colors.ink} />
            </Pressable>
            <Pressable onPress={() => send(text)} style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="send" size={17} color={colors.white} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, elders, recipient, setRecipient, onSave, onRelay }: {
  m: ChatMessage; elders: Member[]; recipient: string; setRecipient: (id: string) => void;
  onSave: () => void; onRelay: (how: 'verbatim' | 'soften' | 'keep') => void;
}) {
  const mine = m.from === 'me';
  if (m.kind === 'crisis') {
    return (
      <View style={[styles.bubble, styles.crisis]}>
        <T variant="small" weight="medium" color={colors.primaryDark}>{m.text}</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable onPress={() => Linking.openURL('tel:109')} style={[styles.cta, { backgroundColor: colors.primaryDark }]}>
            <Ionicons name="call" size={14} color={colors.white} />
            <T variant="small" weight="semibold" color={colors.white}>Gọi 109</T>
          </Pressable>
          <Pressable onPress={() => router.push('/family')} style={[styles.cta, { backgroundColor: colors.white }]}>
            <T variant="small" weight="semibold">Báo người thân</T>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 8 }}>
      <View style={[styles.bubble, mine ? styles.me : styles.ai]}>
        {m.voiceSec ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="mic" size={14} color={mine ? colors.white : colors.ink} />
            <T variant="small" color={mine ? colors.white : colors.ink}>Tin nhắn thoại {duration(m.voiceSec)}</T>
          </View>
        ) : (
          <T variant="small" color={mine ? colors.white : colors.ink} style={{ lineHeight: 21 }}>{m.text}</T>
        )}
      </View>
      {m.kind === 'save-story' && (
        <Pressable onPress={onSave} style={[styles.cta, { backgroundColor: colors.black, alignSelf: 'flex-start' }]}>
          <Ionicons name="book" size={14} color={colors.white} />
          <T variant="small" weight="semibold" color={colors.white}>Lưu thành trang ký ức</T>
        </Pressable>
      )}
      {m.kind === 'saved' && m.storyId && (
        <Pressable onPress={() => router.push(`/story/${m.storyId}`)} style={[styles.cta, { backgroundColor: colors.primarySoft }]}>
          <T variant="small" weight="semibold" color={colors.primaryDark}>Xem trang ký ức →</T>
        </Pressable>
      )}
      {m.kind === 'consent' && (
        <View style={[styles.consent, shadow.soft]}>
          <T variant="caption" color={colors.muted}>Chuyển cho</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {elders.map((e) => <Chip key={e.id} label={e.roleLabel} active={recipient === e.id} onPress={() => setRecipient(e.id)} />)}
          </View>
          <Pressable onPress={() => onRelay('verbatim')} style={styles.option}><T variant="small" weight="semibold">📨 Chuyển nguyên văn</T></Pressable>
          <Pressable onPress={() => onRelay('soften')} style={styles.option}><T variant="small" weight="semibold">🌸 Nhờ Thư nói khéo giúp</T></Pressable>
          <Pressable onPress={() => onRelay('keep')} style={styles.option}><T variant="small" weight="semibold">🔒 Chỉ giữ riêng cho mình</T></Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  online: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  callBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.field, borderRadius: radius.pill, padding: 4, marginHorizontal: 20 },
  segItem: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: colors.black },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 12, padding: 12,
    borderRadius: radius.md, backgroundColor: colors.primaryTint,
  },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  ai: { backgroundColor: colors.field, borderTopLeftRadius: 6, alignSelf: 'flex-start' },
  me: { backgroundColor: colors.primary, borderTopRightRadius: 6 },
  crisis: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary, alignSelf: 'stretch', maxWidth: '100%' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.faint },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  consent: { backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 8, width: '86%' },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  input: {
    flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, backgroundColor: colors.field, paddingHorizontal: 18,
    paddingTop: 14, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 14, color: colors.ink,
  },
  iconBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  voicePanel: { backgroundColor: colors.primaryTint, margin: 16, marginBottom: 100, borderRadius: radius.xl, padding: 18 },
});
