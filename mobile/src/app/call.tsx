import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@/components/Icon';
import { VoicePill } from '@/components/Voice';
import { Avatar, Button, FadeIn, LogoMark, T, Tap, Waveform, type IconName } from '@/components/ui';
import { duration } from '@/lib/format';
import { aiAddress, callName, isElder, me, member } from '@/lib/selectors';
import { onlineNow, planCall } from '@/services/ai';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

const DAY_LABEL = { sun: 'tối Chủ nhật', sat: 'tối Thứ Bảy', wed: 'tối Thứ Tư' } as const;

type Phase = 'ringing' | 'opener' | 'talking' | 'consent' | 'handoff' | 'done';

// Homeletter gọi mình qua app (gọi qua internet, không tốn cước quốc tế). Homeletter luôn nói rõ mình là AI.
// Câu hỏi giấu kín của người nhà được hỏi khéo, không nói ai hỏi. Cuối cuộc gọi: duyệt chia sẻ, rồi nối máy cho người thật.
export default function Call() {
  const { state, dispatch } = useApp();
  const self = me(state);
  const elder = isElder(self);
  const plan = useMemo(() => planCall(state, state.meId), []);
  const opener = plan.find((s) => s.kind === 'opener');
  const steps = plan.filter((s) => s.kind !== 'opener' && s.kind !== 'handoff');
  const openerBy = member(state, opener?.fromId ?? '');
  const partner = member(state, plan.find((s) => s.kind === 'handoff')?.fromId ?? '') ?? onlineNow(state)[0];
  const [phase, setPhase] = useState<Phase>('ringing');
  const [sec, setSec] = useState(0);
  const [qi, setQi] = useState(0);
  const [shared, setShared] = useState('');
  const finished = useRef(false);

  useEffect(() => {
    if (phase === 'ringing') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (phase !== 'opener' && phase !== 'talking') return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function finishTalk() {
    if (finished.current) return;
    finished.current = true;
    dispatch({ type: 'askedAll', toId: state.meId });
    setPhase('consent');
  }

  function consent(choice: string) {
    setShared(choice);
    setPhase(partner ? 'handoff' : 'done');
  }

  const step = steps[qi];
  const header = (
    <View style={{ alignItems: 'center', gap: 8, marginTop: 36 }}>
      <View style={styles.mark}><LogoMark size={64} /></View>
      <T variant="display">Homeletter</T>
      <T variant="body" color={colors.muted} center>
        {phase === 'ringing' ? `Trợ lý AI của ${state.family.name.toLowerCase()} đang gọi` : `Đang nói chuyện, ${duration(sec)}`}
      </T>
    </View>
  );

  if (phase === 'consent') {
    const options = elder
      ? [{ key: 'clip', icon: 'checkmark-circle' as IconName, label: 'Ừ, gửi các con' }, { key: 'keep', icon: 'lock-closed' as IconName, label: 'Thôi, giữ riêng' }]
      : [
          { key: 'clip', icon: 'mic' as IconName, label: 'Gửi đoạn hay nhất và tóm tắt' },
          { key: 'summary', icon: 'document-text' as IconName, label: 'Chỉ gửi tóm tắt' },
          { key: 'softened', icon: 'chatbubbles' as IconName, label: 'Nhờ Homeletter nói khéo lại' },
          { key: 'keep', icon: 'lock-closed' as IconName, label: 'Giữ riêng cho mình' },
        ];
    return (
      <SafeAreaView style={[styles.wrap, { padding: 20 }]}>
        <FadeIn style={{ marginTop: 24, gap: 12 }}>
          <T variant="display">{elder ? `Homeletter gửi các con nhé, ${aiAddress(self)}?` : 'Bạn muốn chia sẻ thế nào?'}</T>
          <T variant="body" color={colors.inkSoft}>
            {elder
              ? 'Homeletter vừa đọc lại tóm tắt. Chỉ cần nói "ừ" là gửi, hoặc bấm nút dưới đây.'
              : 'Không có gì được gửi đi nếu bạn chưa đồng ý. Bạn xem lại được và xoá bất cứ lúc nào.'}
          </T>
        </FadeIn>
        <View style={{ gap: 10, marginTop: 24 }}>
          {options.map((o) => (
            <Tap key={o.key} onPress={() => consent(o.key)} label={o.label} scaleTo={0.97}>
              <View style={[styles.option, elder && { minHeight: 72 }]}>
                <Ionicons name={o.icon} size={elder ? 26 : 22} color={colors.ink} />
                <T variant={elder ? 'h2' : 'body'} weight="semibold" style={{ flex: 1 }}>{o.label}</T>
              </View>
            </Tap>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'handoff' && partner) {
    return (
      <SafeAreaView style={[styles.wrap, { padding: 20, justifyContent: 'center', gap: 16 }]}>
        <FadeIn style={{ alignItems: 'center', gap: 14 }}>
          <View>
            <Avatar name={partner.name} uri={partner.avatarUri} size={112} />
            <View style={styles.onlineDot} />
          </View>
          <T variant="display" center>{partner.roleLabel} đang online</T>
          <T variant="body" color={colors.inkSoft} center>Nói chuyện với {callName(partner)} luôn nhé? Homeletter nối máy, rồi để hai người nói với nhau.</T>
        </FadeIn>
        <Button label={`Nối máy với ${callName(partner)}`} icon="call" variant="dark" style={{ marginTop: 16 }}
          onPress={() => router.replace({ pathname: '/room', params: { with: partner.id } })} />
        <Button label="Để sau" variant="ghost" onPress={() => setPhase('done')} />
      </SafeAreaView>
    );
  }

  if (phase === 'done') {
    return (
      <SafeAreaView style={[styles.wrap, { justifyContent: 'center', padding: 28, gap: 16 }]}>
        <View style={styles.doneIcon}><Ionicons name="checkmark" size={40} color={colors.white} /></View>
        <T variant="h1" center>Cảm ơn {elder ? aiAddress(self) : 'bạn'}</T>
        <T variant="body" color={colors.inkSoft} center>
          {shared === 'keep'
            ? 'Homeletter giữ riêng cuộc trò chuyện này. Không ai khác nghe được.'
            : `Homeletter tuần này sẽ tới ${elder ? 'các con' : 'bố mẹ'} vào ${DAY_LABEL[state.settings.aiCallDay]}. Bạn xem lại được trong mục "Những gì bạn đã kể".`}
        </T>
        {!partner && (
          <>
            <T variant="body" weight="medium" center>Giờ chưa có ai online. Gửi một lời nhắn nhé?</T>
            <Button label="Gửi lời nhắn bằng giọng" icon="mic" variant="dark"
              onPress={() => router.replace({ pathname: '/chat', params: { voice: '1' } })} />
          </>
        )}
        <Button label="Xong" onPress={() => router.back()} style={{ marginTop: 20, alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.wrap}>
      {header}

      {phase === 'opener' && opener && openerBy && (
        <FadeIn style={styles.caption}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={openerBy.name} uri={openerBy.avatarUri} size={40} />
            <T variant="small" color={colors.inkSoft} style={{ flex: 1 }}>Lời mở đầu, giọng thật của {callName(openerBy)}</T>
          </View>
          <VoicePill sec={6} autoPlay onEnd={() => setPhase('talking')} />
          <T variant="h3" weight="regular">“{opener.text}”</T>
          <Next label="Nghe Homeletter nói" onPress={() => setPhase('talking')} />
        </FadeIn>
      )}

      {phase === 'talking' && step && (
        <FadeIn key={qi} style={styles.caption}>
          <T variant="small" color={colors.inkSoft}>
            {step.kind === 'message' ? 'Homeletter chuyển lời' : 'Homeletter đang hỏi'}
          </T>
          <T variant="h2" weight="regular" style={{ fontSize: 22, lineHeight: 30 }}>{step.text}</T>
          <View style={{ height: 30, marginTop: 6 }}><Waveform bars={34} color={colors.muted} /></View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Next label={qi < steps.length - 1 ? 'Kể xong, tiếp' : 'Kết thúc'} onPress={() => (qi < steps.length - 1 ? setQi(qi + 1) : finishTalk())} />
            {step.kind !== 'message' && qi < steps.length - 1 && (
              <Pressable onPress={() => setQi(qi + 1)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <T variant="small" weight="semibold" color={colors.inkSoft}>Bỏ qua câu này</T>
              </Pressable>
            )}
          </View>
        </FadeIn>
      )}

      <View style={{ flex: 1 }} />
      {phase === 'ringing' ? (
        <View style={styles.row}>
          <Round icon="close" bg={colors.endCall} label="Để sau" onPress={() => router.back()} />
          <Round icon="call" bg={colors.green} label="Nghe máy" onPress={() => setPhase(opener ? 'opener' : 'talking')} />
        </View>
      ) : (
        <View style={styles.row}>
          <Round icon="call" bg={colors.endCall} label="Kết thúc" rotate onPress={finishTalk} />
        </View>
      )}
      {phase === 'ringing' && (
        <T variant="caption" color={colors.muted} center style={{ marginBottom: 16, paddingHorizontal: 24 }}>
          Homeletter là trợ lý AI. Chỉ gửi đi khi bạn đồng ý.
        </T>
      )}
    </SafeAreaView>
  );
}

function Next({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.next}>
      <T variant="small" weight="semibold" color={colors.white}>{label}</T>
      <Ionicons name="chevron-forward" size={15} color={colors.white} />
    </Pressable>
  );
}

function Round({ icon, bg, label, onPress, rotate }: { icon: IconName; bg: string; label: string; onPress: () => void; rotate?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 8 }}>
      <View style={[styles.round, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={30} color={colors.white} style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </View>
      <T variant="small">{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  mark: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  caption: { margin: 20, padding: 18, borderRadius: radius.lg, backgroundColor: colors.tone, gap: 12 },
  next: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.ink,
    borderRadius: 999, paddingHorizontal: 16, minHeight: 44,
  },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 24 },
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, borderRadius: radius.lg, paddingHorizontal: 18, backgroundColor: colors.tone },
  onlineDot: { position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.online, borderWidth: 3, borderColor: colors.bg },
  doneIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
