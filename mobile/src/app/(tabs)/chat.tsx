import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilmCard, LetterCard } from '@/components/Feed';
import { Ionicons } from '@/components/Icon';
import { VoicePill } from '@/components/Voice';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import {
  Avatar, AvatarStack, Button, Chip, GradientButton, HeaderBlock, IconButton, LogoMark, memberTone, PhotoTile, T, Tap,
} from '@/components/ui';
import type { FamilyMessage } from '@/data/types';
import { clock, dayLabel, inDaysLabel, localTimeFor, morningAt } from '@/lib/format';
import { callName, isScheduled, member, others, shownAt, upcoming, visibleMessages } from '@/lib/selectors';
import { onlineNow } from '@/services/ai';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

/** Lời chào buổi sáng dài tối đa 30 giây: iPhone chỉ cho âm báo dài chừng đó. */
const MORNING_MAX_SEC = 30;

const COUNTRY = { VN: 'Việt Nam', KR: 'Hàn Quốc', JP: 'Nhật Bản', TW: 'Đài Loan', US: 'Mỹ', OTHER: 'nơi đó' } as const;

// Chat chung của cả nhà. Thư tuần và video của Homeletter cũng gửi vào đây.
// Ghi âm xong có thể gửi ngay, hoặc hẹn 7 giờ sáng mai theo giờ người nhận: họ mở app là nghe.
export default function Chat() {
  const { state, dispatch } = useApp();
  const params = useLocalSearchParams<{ voice?: string; to?: string; reply?: string }>();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'type' | 'record' | 'draft'>('type');
  const [draftSec, setDraftSec] = useState(0);
  const [to, setTo] = useState<string | undefined>();
  const [replyTo, setReplyTo] = useState<string | undefined>();

  useEffect(() => {
    if (!params.voice) return;
    setMode('record');
    setTo(params.to);
    setReplyTo(params.reply);
  }, [params.voice, params.to, params.reply]);

  const messages = visibleMessages(state);
  const online = onlineNow(state);
  const next = upcoming(state).find((u) => u.inDays <= 30 && u.event.kind !== 'holiday') ?? upcoming(state)[0];
  const target = to ? member(state, to) : undefined;
  const morning = target ? morningAt(target.country, 'next') : undefined;

  function sendText() {
    if (!text.trim()) return;
    dispatch({ type: 'sendMessage', message: { text: text.trim() } });
    setText('');
  }

  function sendVoice(schedule: boolean) {
    dispatch({
      type: 'sendMessage',
      message: {
        voiceSec: draftSec, to: to ? [to] : undefined, replyToLetterId: replyTo,
        deliverAt: schedule && morning ? morning.toISOString() : undefined,
      },
    });
    setMode('type');
    setReplyTo(undefined);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HeaderBlock style={{ paddingTop: insets.top + 8, paddingBottom: 16 }}>
        <View style={styles.header}>
          <AvatarStack people={state.family.members} max={3} size={40} borderColor={colors.deep} />
          <View style={{ flex: 1 }}>
            <T variant="h2">{state.family.name}</T>
            <View style={styles.rowSmall}>
              <View style={styles.online} />
              <T variant="small" color={colors.inkSoft}>{online.length} đang online</T>
            </View>
          </View>
          <IconButton icon="videocam" size={48} light label="Gọi video cả nhà" onPress={() => router.push('/room')} />
        </View>
        {next && (
          <Tap onPress={() => router.push('/calendar')} label="Mở lịch" scaleTo={0.98}>
            <View style={styles.next}>
              <Ionicons name="calendar-outline" size={16} color={colors.lunar} />
              <T variant="small" weight="medium" style={{ flex: 1 }} numberOfLines={1}>{next.event.title}</T>
              <T variant="small" weight="semibold" color={colors.accentText}>{inDaysLabel(next.inDays)}</T>
            </View>
          </Tap>
        )}
      </HeaderBlock>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {messages.map((m, i) => {
            const day = dayLabel(shownAt(m));
            const newDay = i === 0 || dayLabel(shownAt(messages[i - 1])) !== day;
            return (
              <Fragment key={m.id}>
                {newDay && <T variant="caption" color={colors.muted} center style={{ marginTop: 6 }}>{day}</T>}
                <Message m={m} />
              </Fragment>
            );
          })}
        </ScrollView>

        <View style={{ marginBottom: Math.max(insets.bottom, 12) + 80 }}>
          {mode === 'record' && (
            <View style={styles.panel}>
              {target && <T variant="small" weight="semibold" center>Ghi âm gửi {callName(target)}</T>}
              <VoiceRecorder size={64} hint={`Nói tự nhiên thôi. Muốn hẹn gửi sáng mai thì dưới ${MORNING_MAX_SEC} giây.`}
                onDone={({ seconds }) => { setDraftSec(seconds); setMode('draft'); }} />
              <Button label="Huỷ" variant="ghost" onPress={() => setMode('type')} />
            </View>
          )}
          {mode === 'draft' && (
            <View style={styles.panel}>
              <VoicePill sec={draftSec} />
              <T variant="small" weight="semibold" color={colors.muted}>Gửi cho</T>
              <View style={styles.chips}>
                <Chip label="Cả nhà" active={!to} onPress={() => setTo(undefined)} />
                {others(state).map((o) => <Chip key={o.id} label={o.roleLabel} active={to === o.id} onPress={() => setTo(o.id)} />)}
              </View>
              {target && morning && draftSec <= MORNING_MAX_SEC ? (
                <Button label={`Hẹn ${localTimeFor(target.country, morning)} sáng mai`} icon="sunny" onPress={() => sendVoice(true)} />
              ) : null}
              <T variant="caption" weight="regular" color={colors.muted}>
                {!target
                  ? 'Chọn một người để hẹn gửi lời chào buổi sáng.'
                  : draftSec > MORNING_MAX_SEC
                    ? `Lời chào buổi sáng tối đa ${MORNING_MAX_SEC} giây. Đoạn này vẫn gửi ngay được.`
                    : `7 giờ sáng giờ ${COUNTRY[target.country]}: ${callName(target)} mở máy là nghe ngay.`}
              </T>
              <Button label="Gửi ngay" icon="paper-plane" variant="dark" onPress={() => sendVoice(false)} />
              <Button label="Ghi lại" variant="ghost" onPress={() => setMode('record')} />
            </View>
          )}
          {mode === 'type' && (
            <View style={styles.composer}>
              <IconButton icon="camera" size={50} label="Chụp ảnh gửi cả nhà" onPress={() => router.push('/capture')} />
              <View style={styles.inputWrap}>
                <TextInput value={text} onChangeText={setText} placeholder="Nhắn cả nhà..." placeholderTextColor={colors.placeholder}
                  style={styles.input} multiline accessibilityLabel="Tin nhắn" />
              </View>
              {text.trim() ? (
                <GradientButton icon="arrow-up" size={50} label="Gửi" onPress={sendText} />
              ) : (
                <GradientButton icon="mic" size={50} label="Ghi âm" onPress={() => setMode('record')} />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Message({ m }: { m: FamilyMessage }) {
  const { state, dispatch } = useApp();
  if (m.authorId === 'ai') {
    const letter = m.letterId ? state.letters.find((l) => l.id === m.letterId) : undefined;
    const film = m.filmId ? state.films.find((f) => f.id === m.filmId) : undefined;
    if (!letter && !film) return null;
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.rowSmall}>
          <LogoMark size={26} />
          <T variant="small" weight="semibold">Homeletter</T>
          <T variant="caption" weight="regular" color={colors.muted}>{letter ? 'gửi thư tuần' : 'làm video từ kho nhà mình'}, {clock(m.createdAt)}</T>
        </View>
        {letter && <LetterCard letter={letter} compact />}
        {film && <FilmCard film={film} />}
      </View>
    );
  }

  const author = member(state, m.authorId);
  const mine = m.authorId === state.meId;
  const scheduled = isScheduled(m);
  const post = m.postId ? state.posts.find((p) => p.id === m.postId) : undefined;
  const letter = m.replyToLetterId ? state.letters.find((l) => l.id === m.replyToLetterId) : undefined;
  const toNames = m.to?.map((id) => (id === state.meId ? 'bạn' : callName(member(state, id)))).join(', ');
  const fg = mine ? colors.black : colors.ink;

  const labels: Array<{ icon: 'sunny' | 'time-outline' | 'lock-closed' | 'mail-open-outline'; text: string }> = [];
  if (scheduled && m.deliverAt) {
    const r = member(state, m.to?.[0] ?? '');
    labels.push({ icon: 'time-outline', text: `Hẹn ${r ? localTimeFor(r.country, new Date(m.deliverAt)) : clock(m.deliverAt)} sáng mai: ${toNames} mở máy là nghe` });
  } else if (m.deliverAt) labels.push({ icon: 'sunny', text: `Lời chào buổi sáng gửi ${toNames}` });
  else if (m.to) labels.push({ icon: 'lock-closed', text: `Gửi riêng ${toNames}` });
  if (letter) labels.push({ icon: 'mail-open-outline', text: `Trả lời thư “${letter.title}”` });

  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {!mine && <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={34} />}
      <View style={{ maxWidth: '82%', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && <T variant="small" weight="semibold" color={colors.inkSoft}>{author?.roleLabel}</T>}
        {labels.map((l) => (
          <View key={l.text} style={styles.rowSmall}>
            <Ionicons name={l.icon} size={14} color={colors.accentText} />
            <T variant="caption" weight="medium" color={colors.accentText} style={{ flexShrink: 1 }}>{l.text}</T>
          </View>
        ))}
        {post && (
          <Tap onPress={() => router.push(`/post/${post.id}`)} label="Xem ảnh" scaleTo={0.96}>
            <View style={styles.quote}>
              <PhotoTile seed={post.id} tone={memberTone(state.family.members, post.authorId)} uri={post.photoUri} height={52} radiusSize={12} style={{ width: 52 }} scrim={false} />
              <T variant="caption" weight="regular" color={colors.inkSoft} numberOfLines={2} style={{ flex: 1 }}>
                Trả lời ảnh của {post.authorId === state.meId ? 'bạn' : callName(member(state, post.authorId))}: {post.caption}
              </T>
            </View>
          </Tap>
        )}
        {m.voiceSec ? (
          <View style={{ gap: 6, alignItems: mine ? 'flex-end' : 'flex-start', opacity: scheduled ? 0.75 : 1 }}>
            <VoicePill sec={m.voiceSec} />
            {m.text ? <T variant="small" color={colors.inkSoft} style={{ paddingHorizontal: 6 }}>{m.text}</T> : null}
          </View>
        ) : m.text ? (
          <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            <T variant="body" color={fg} style={{ lineHeight: 23 }}>{m.text}</T>
          </View>
        ) : null}
        <View style={styles.rowSmall}>
          <T variant="caption" weight="regular" color={colors.muted} style={{ fontSize: 12 }}>{clock(shownAt(m))}</T>
          {scheduled && mine && (
            <Tap onPress={() => dispatch({ type: 'cancelMessage', id: m.id })} label="Huỷ hẹn" scaleTo={0.9}>
              <T variant="caption" weight="semibold" color={colors.holiday}>Huỷ hẹn</T>
            </Tap>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowSmall: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  online: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.online },
  next: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, height: 40,
    borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  bubble: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11 },
  mine: { backgroundColor: colors.white, borderTopRightRadius: 6 },
  theirs: { backgroundColor: colors.tone, borderTopLeftRadius: 6 },
  quote: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tone, borderRadius: 16, padding: 6, paddingRight: 12, width: 250 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  inputWrap: { flex: 1, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.tone, justifyContent: 'center' },
  input: {
    minHeight: 50, maxHeight: 120, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
    fontFamily: fonts.regular, fontSize: 16, color: colors.ink,
  },
  panel: { backgroundColor: colors.tone, marginHorizontal: 16, borderRadius: radius.xl, padding: 18, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
