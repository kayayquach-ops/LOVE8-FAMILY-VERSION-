import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@/components/Icon';
import { Avatar, FadeIn, HeaderBlock, IconButton, memberTone, PhotoTile, T, Tap, type IconName } from '@/components/ui';
import { inviteMessage } from '@/lib/family';
import { duration } from '@/lib/format';
import { callName, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

// Phòng gọi video: cả nhà, hoặc hai người khi Homeletter nối máy (`with`), hoặc cả nhà cùng xem một video (`film`).
// Lưới khuôn mặt từng người, biểu tượng đang nói hoặc tắt mic ở góc, hàng nút tròn và nút cúp máy màu cam.
// Bản demo: chưa nối cuộc gọi thật (sau này dùng WebRTC, ví dụ Agora hoặc LiveKit).
export default function Room() {
  const { state } = useApp();
  const params = useLocalSearchParams<{ with?: string; film?: string }>();
  const partner = params.with ? member(state, params.with) : undefined;
  const film = params.film ? state.films.find((f) => f.id === params.film) : undefined;
  const insets = useSafeAreaInsets();
  const [sec, setSec] = useState(0);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [speaker, setSpeaker] = useState(true);
  const everyone = [...state.family.members].sort((a) => (a.id === state.meId ? -1 : 1));
  const people = partner ? everyone.filter((m) => m.id === state.meId || m.id === partner.id) : everyone;

  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Trạng thái mẫu: một người đang nói, một người tắt mic, còn lại đang nghe.
  const talking = people[(Math.floor(sec / 4) % (people.length - 1)) + 1]?.id;
  const mutedId = partner ? undefined : people[people.length - 1]?.id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HeaderBlock style={{ paddingTop: insets.top + 8, paddingBottom: 18 }}>
        <View style={styles.header}>
          <IconButton icon="chevron-back" size={48} light label="Rời phòng" onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T variant="h2">{partner ? `Gọi ${callName(partner)}` : 'Gọi cả nhà'}</T>
            <T variant="small" color={colors.muted}>{duration(sec)}, {people.length} người</T>
          </View>
          <IconButton icon="chatbubbles-outline" size={48} light badge={2} label="Mở tin nhắn" onPress={() => router.push('/chat')} />
        </View>
      </HeaderBlock>

      {film && (
        <View style={styles.film}>
          <Ionicons name="film" size={20} color={colors.white} />
          <View style={{ flex: 1 }}>
            <T variant="small" color={colors.inkSoft}>Cả nhà đang cùng xem</T>
            <T variant="body" weight="semibold" numberOfLines={1}>{film.title}</T>
          </View>
          <T variant="small" color={colors.inkSoft}>{duration(Math.min(sec, film.durationSec))}</T>
        </View>
      )}
      <View style={styles.grid}>
        {people.map((m, i) => {
          const isMe = m.id === state.meId;
          const off = isMe ? !mic : m.id === mutedId;
          const icon: IconName = off ? 'mic-off' : m.id === talking ? 'pulse' : 'mic';
          return (
            <FadeIn key={m.id} delay={i * 70} style={[styles.cell, partner && { width: '100%', height: '48.6%' }]}>
              <PhotoTile seed={`room-${m.id}`} tone={memberTone(state.family.members, m.id)} fill radiusSize={26}>
                <View style={styles.tileInner}>
                  <View style={[styles.state, m.id === talking && !off && { backgroundColor: colors.white }]}>
                    <Ionicons name={icon} size={16} color={m.id === talking && !off ? colors.black : colors.white} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    {isMe && !cam ? (
                      <View style={styles.camOff}><Ionicons name="videocam-off" size={30} color={colors.white} /></View>
                    ) : (
                      <Avatar name={m.name} uri={m.avatarUri} size={88} />
                    )}
                  </View>
                  <T variant="small" weight="semibold" color={colors.white} numberOfLines={1}>{isMe ? 'Bạn' : m.roleLabel}</T>
                </View>
              </PhotoTile>
            </FadeIn>
          );
        })}
        {!partner && people.length % 2 === 1 && (
          <Tap style={styles.cell} label="Mời thêm người vào phòng" scaleTo={0.97}
            onPress={() => Share.share({ message: inviteMessage(state.family.name, state.family.inviteCode) })}>
            <View style={styles.invite}>
              <Ionicons name="person-add-outline" size={26} color={colors.ink} />
              <T variant="small" weight="semibold">Mời thêm</T>
            </View>
          </Tap>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}>
        <Control icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Tắt camera' : 'Bật camera'} on={cam} onPress={() => setCam(!cam)} />
        <Control icon="headset" label={speaker ? 'Chuyển sang tai nghe' : 'Bật loa ngoài'} on={speaker} onPress={() => setSpeaker(!speaker)} />
        <Control icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Tắt mic' : 'Bật mic'} on={mic} onPress={() => setMic(!mic)} />
        <Tap onPress={() => router.back()} label="Rời cuộc gọi" scaleTo={0.88}>
          <View style={[styles.control, { backgroundColor: colors.endCall }]}>
            <Ionicons name="call" size={26} color={colors.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </View>
        </Tap>
      </View>
      <T variant="caption" weight="regular" color={colors.muted} center style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 14) - 10 }}>
        Bản demo: chưa nối cuộc gọi thật
      </T>
    </View>
  );
}

function Control({ icon, label, on, onPress }: { icon: IconName; label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} label={label} selected={on} scaleTo={0.88}>
      <View style={[styles.control, { backgroundColor: on ? colors.toneDeep : colors.white }]}>
        <Ionicons name={icon} size={26} color={on ? colors.white : colors.black} />
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  film: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, marginTop: 8, padding: 14,
    borderRadius: radius.lg, backgroundColor: '#8C6A4F',
  },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 },
  cell: { width: '48.6%', flexGrow: 1, height: '31.5%' },
  tileInner: { flex: 1, padding: 12, justifyContent: 'space-between' },
  state: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  camOff: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  invite: {
    flex: 1, borderRadius: 26, borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tone,
  },
  controls: {
    flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 16, backgroundColor: colors.tone,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  control: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
});
