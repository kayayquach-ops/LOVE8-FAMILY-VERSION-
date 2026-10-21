import { Ionicons } from '@/components/Icon';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Chip, GradientButton, IconButton, LogoMark, T, type IconName } from '@/components/ui';
import type { ChatMessage, ChatMode, Member } from '@/data/types';
import { duration } from '@/lib/format';
import { isElder } from '@/lib/family';
import { me, member, others } from '@/lib/selectors';
import { AI_MODE, interviewReply, softenMessage, structureStory } from '@/services/ai';
import { newId, useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

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
        places: s.places, emotion: s.emotion, emoji: s.emoji, photoEmojis: [], privacy: 'family',
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <LogoMark size={44} />
        <View style={{ flex: 1 }}>
          <T variant="h2">Thư</T>
          <T variant="small" color={colors.muted}>
            Trợ lý của {state.family.name.toLowerCase()}{AI_MODE === 'demo' ? ', đang trả lời theo kịch bản mẫu' : ''}
          </T>
        </View>
        <IconButton icon="call-outline" label="Để Thư gọi điện hỏi chuyện" onPress={() => router.push('/call')} />
      </View>

      <View style={styles.segment}>
        {(['story', 'confide'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}
            style={[styles.segItem, mode === m && styles.segActive]}>
            <Ionicons name={m === 'story' ? 'book-outline' : 'lock-closed-outline'} size={16} color={mode === m ? colors.black : colors.inkSoft} />
            <T variant="small" weight="semibold" color={mode === m ? colors.black : colors.inkSoft}>
              {m === 'story' ? 'Kể chuyện' : 'Tâm sự riêng'}
            </T>
          </Pressable>
        ))}
      </View>

      {mode === 'story' && waiting.length > 0 && (
        <Pressable onPress={askPending} accessibilityRole="button" style={({ pressed }) => [styles.banner, pressed && { backgroundColor: colors.toneDeep }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="small" color={colors.inkSoft}>{member(state, waiting[0].fromId)?.roleLabel} đang chờ bạn trả lời</T>
            <T variant="h3" numberOfLines={2}>“{waiting[0].text}”</T>
          </View>
          <T variant="small" weight="semibold" color={colors.accentText}>Trả lời</T>
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
              placeholderTextColor={colors.placeholder} style={styles.input} multiline accessibilityLabel="Lời nhắn cho Thư"
            />
            <IconButton icon="mic-outline" size={48} label="Kể bằng giọng nói" onPress={() => setVoice(true)} />
            <GradientButton icon="arrow-up" label="Gửi" onPress={() => send(text)} />
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
        <T variant="small" weight="medium" color={colors.accentText}>{m.text}</T>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable onPress={() => Linking.openURL('tel:109')} style={[styles.cta, { backgroundColor: colors.primaryDark }]}>
            <Ionicons name="call" size={14} color={colors.white} />
            <T variant="small" weight="semibold" color={colors.white}>Gọi 109</T>
          </Pressable>
          <Pressable onPress={() => router.push('/family')} style={[styles.cta, { backgroundColor: colors.white }]}>
            <T variant="small" weight="semibold" color={colors.black}>Báo người thân</T>
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
            <Ionicons name="mic" size={14} color={mine ? colors.black : colors.ink} />
            <T variant="small" color={mine ? colors.black : colors.ink}>Tin nhắn thoại {duration(m.voiceSec)}</T>
          </View>
        ) : (
          <T variant="body" color={mine ? colors.black : colors.ink} style={{ lineHeight: 23 }}>{m.text}</T>
        )}
      </View>
      {m.kind === 'save-story' && (
        <Pressable onPress={onSave} style={[styles.cta, { backgroundColor: colors.white, alignSelf: 'flex-start' }]}>
          <Ionicons name="book-outline" size={16} color={colors.black} />
          <T variant="small" weight="semibold" color={colors.black}>Lưu thành trang ký ức</T>
        </Pressable>
      )}
      {m.kind === 'saved' && m.storyId && (
        <Pressable onPress={() => router.push(`/story/${m.storyId}`)} style={[styles.cta, { backgroundColor: colors.tone }]}>
          <T variant="small" weight="semibold">Xem trang ký ức</T>
          <Ionicons name="chevron-forward" size={15} color={colors.ink} />
        </Pressable>
      )}
      {m.kind === 'consent' && (
        <View style={styles.consent}>
          <T variant="small" weight="semibold" color={colors.inkSoft}>Chuyển lời cho</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {elders.map((e) => <Chip key={e.id} label={e.roleLabel} active={recipient === e.id} onPress={() => setRecipient(e.id)} />)}
          </View>
          <Option icon="paper-plane-outline" label="Chuyển nguyên văn" onPress={() => onRelay('verbatim')} />
          <Option icon="chatbubbles-outline" label="Nhờ Thư nói khéo giúp" onPress={() => onRelay('soften')} />
          <Option icon="lock-closed-outline" label="Chỉ giữ riêng cho mình" onPress={() => onRelay('keep')} />
        </View>
      )}
    </View>
  );
}

function Option({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.toneDeep }]}>
      <Ionicons name={icon} size={19} color={colors.inkSoft} />
      <T variant="body" weight="medium">{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  segment: { flexDirection: 'row', backgroundColor: colors.tone, borderRadius: radius.pill, padding: 4, marginHorizontal: 20 },
  segItem: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segActive: { backgroundColor: colors.white },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 12, padding: 14,
    borderRadius: radius.lg, backgroundColor: colors.tone,
  },
  bubble: { maxWidth: '84%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  ai: { backgroundColor: colors.tone, borderTopLeftRadius: 6, alignSelf: 'flex-start' },
  me: { backgroundColor: colors.white, borderTopRightRadius: 6 },
  crisis: { backgroundColor: colors.primarySoft, alignSelf: 'stretch', maxWidth: '100%' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.faint },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 44, borderRadius: 999 },
  consent: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 14, gap: 10, width: '88%' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.toneDeep, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 48 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  input: {
    flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, backgroundColor: colors.tone, paddingHorizontal: 18,
    paddingTop: 13, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  voicePanel: { backgroundColor: colors.tone, margin: 16, marginBottom: 100, borderRadius: radius.xl, padding: 18 },
});
