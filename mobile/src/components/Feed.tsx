import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { tagLabel } from '@/data/tags';
import type { Film, Letter, Mission, Post } from '@/data/types';
import { duration, inDaysLabel, relativeTime } from '@/lib/format';
import { lunarOf } from '@/lib/lunar';
import { callName, mealToday, member, photoPrompt, streak, yearsAt, type UpcomingEvent } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, gradient, radius } from '@/theme';
import { Ionicons } from './Icon';
import { Avatar, AvatarStack, FadeIn, GradientButton, GradientRing, memberTone, PhotoTile, T, Tap } from './ui';

/** Màu nâu cũ cho ảnh xưa. */
export const SEPIA = '#8C6A4F';

/** Một tấm ảnh của cả nhà: thẻ màu của người gửi, lời nhắn in to, ảnh thật nếu có. */
export function PostCard({ post, width }: { post: Post; width?: number }) {
  const { state, dispatch } = useApp();
  const author = member(state, post.authorId);
  const loved = !!post.reactions[state.meId];
  const h = width ? Math.round(width * 1.1) : 380;
  const old = post.tag === 'xua';
  const label = old && post.year ? `Ảnh xưa, ${post.year}` : tagLabel(post.tag);
  const hearts = Object.keys(post.reactions).length;
  return (
    <Tap onPress={() => router.push(`/post/${post.id}`)} label={`Ảnh của ${author?.roleLabel}`} scaleTo={0.98} style={{ width }}>
      <PhotoTile seed={post.id} tone={old ? SEPIA : memberTone(state.family.members, post.authorId)} uri={post.photoUri} height={h}>
        <View style={styles.postInner}>
          <View style={styles.row}>
            <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={40} />
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold" color={colors.white}>{author?.id === state.meId ? 'Bạn' : author?.roleLabel}</T>
              <T variant="caption" weight="regular" color="rgba(255,255,255,0.85)">{relativeTime(post.createdAt)}</T>
            </View>
            {label && <Glass text={label} />}
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <T variant="display" color={colors.white} numberOfLines={5} style={{ fontSize: 28, lineHeight: 32, letterSpacing: -1 }}>
              {post.caption}
            </T>
          </View>
          <View style={[styles.row, { marginTop: 14 }]}>
            <Tap onPress={() => router.push(`/post/${post.id}`)} label="Trả lời" scaleTo={0.9} style={{ flex: 1 }}>
              <View style={styles.reply}>
                <Ionicons name="chatbubble-outline" size={18} color={colors.black} />
                <T variant="small" weight="semibold" color={colors.black}>Trả lời</T>
              </View>
            </Tap>
            <Tap onPress={() => dispatch({ type: 'react', postId: post.id, emoji: '❤️' })} selected={loved} label="Thả tim" scaleTo={0.88}>
              <LinearGradient colors={loved ? ['#FFFFFF', '#FFFFFF'] : gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heart}>
                <Ionicons name="heart" size={20} color={loved ? colors.primary : colors.white} />
                {hearts > 0 && <T variant="small" weight="semibold" color={loved ? colors.black : colors.white}>{hearts}</T>}
              </LinearGradient>
            </Tap>
          </View>
        </View>
      </PhotoTile>
    </Tap>
  );
}

function Glass({ text, icon }: { text: string; icon?: 'mic' }) {
  return (
    <View style={styles.glass}>
      {icon && <Ionicons name={icon} size={12} color={colors.white} />}
      <T variant="caption" weight="medium" color={colors.white}>{text}</T>
    </View>
  );
}

/**
 * Mâm cơm chung: mỗi tối ai cũng chụp bữa cơm của mình, app ghép lại thành một mâm,
 * dù người ở Seoul, người ở Nam Định. Ô của mình còn trống thì là nút chụp.
 */
export function MealTable() {
  const { state } = useApp();
  const meals = mealToday(state);
  const people = [...state.family.members].sort((a) => (a.id === state.meId ? -1 : 1));
  const done = people.filter((m) => meals[m.id]).length;
  const days = streak(state);
  return (
    <View style={styles.table}>
      <View style={[styles.row, { marginBottom: 14 }]}>
        <View style={{ flex: 1 }}>
          <T variant="h2">Mâm cơm chung</T>
          <T variant="small" color={colors.muted}>{done}/{people.length} người đã gửi bữa tối nay</T>
        </View>
        {days > 1 && (
          <View style={styles.streak}>
            <Ionicons name="flame" size={16} color={colors.white} />
            <T variant="small" weight="semibold" color={colors.white}>{days} ngày</T>
          </View>
        )}
      </View>
      <View style={styles.grid}>
        {people.map((m, i) => {
          const post = meals[m.id];
          const isMe = m.id === state.meId;
          return (
            <FadeIn key={m.id} delay={i * 60} style={styles.cell}>
              {post ? (
                <Tap onPress={() => router.push(`/post/${post.id}`)} label={`Bữa cơm của ${m.roleLabel}`} scaleTo={0.95}>
                  <PhotoTile seed={post.id} tone={memberTone(state.family.members, m.id)} uri={post.photoUri} style={styles.plate} radiusSize={22}>
                    <View style={styles.plateInner}>
                      <Avatar name={m.name} uri={m.avatarUri} size={30} />
                      <T variant="caption" weight="medium" color={colors.white} numberOfLines={3}>{post.caption}</T>
                    </View>
                  </PhotoTile>
                </Tap>
              ) : isMe ? (
                <Tap onPress={() => router.push({ pathname: '/capture', params: { kind: 'meal' } })} label="Chụp bữa cơm của bạn" scaleTo={0.95}>
                  <GradientRing width={2} style={{ borderRadius: 22 }}>
                    <View style={[styles.plate, styles.mine]}>
                      <Ionicons name="camera" size={30} color={colors.white} />
                      <T variant="small" weight="semibold" center>Chụp bữa của bạn</T>
                    </View>
                  </GradientRing>
                </Tap>
              ) : (
                <View style={[styles.plate, styles.empty]}>
                  <View style={{ opacity: 0.5 }}><Avatar name={m.name} uri={m.avatarUri} size={40} /></View>
                  <T variant="caption" weight="regular" color={colors.muted} numberOfLines={1}>{m.roleLabel} chưa gửi</T>
                </View>
              )}
            </FadeIn>
          );
        })}
      </View>
    </View>
  );
}

/** Hẹn nhau tuần này: một việc nhỏ cho hai người, gợi ý từ những gì Homeletter đã hiểu về cả nhà. */
export function MissionCard({ mission }: { mission: Mission }) {
  const { state, dispatch } = useApp();
  const pair = mission.ids.map((id) => member(state, id)).filter((m) => !!m);
  const other = pair.find((m) => m.id !== state.meId) ?? pair[0];
  const action = {
    voice: { icon: 'mic' as const, label: `Ghi âm gửi ${callName(other)}`, go: () => router.push({ pathname: '/chat', params: { voice: '1', to: other.id } }) },
    call: { icon: 'videocam' as const, label: `Gọi video ${callName(other)}`, go: () => router.push({ pathname: '/room', params: { with: other.id } }) },
    photo: { icon: 'images' as const, label: 'Gửi ảnh xưa', go: () => router.push({ pathname: '/capture', params: { kind: 'old' } }) },
  }[mission.action];
  return (
    <PhotoTile seed={mission.id} tone="#5E8C78" autoHeight>
      <View style={{ padding: 20, gap: 12 }}>
        <View style={styles.row}>
          <AvatarStack people={pair} size={40} borderColor="#5E8C78" />
          <T variant="small" weight="semibold" color={colors.white} style={{ flex: 1 }}>Hẹn nhau tuần này</T>
        </View>
        <T variant="h2" color={colors.white}>{mission.text}</T>
        <T variant="small" color="rgba(255,255,255,0.9)">Vì sao: {mission.why}</T>
        <View style={[styles.row, { marginTop: 4 }]}>
          <Tap onPress={action.go} label={action.label} scaleTo={0.95} style={{ flex: 1 }}>
            <View style={[styles.button, { backgroundColor: colors.white }]}>
              <Ionicons name={action.icon} size={18} color={colors.black} />
              <T variant="small" weight="semibold" color={colors.black} numberOfLines={1}>{action.label}</T>
            </View>
          </Tap>
          <Tap onPress={() => dispatch({ type: 'missionDone', id: mission.id })} label="Đánh dấu đã làm" scaleTo={0.92}>
            <View style={[styles.button, { backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: 18 }]}>
              <Ionicons name="checkmark" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Xong</T>
            </View>
          </Tap>
        </View>
      </View>
    </PhotoTile>
  );
}

/** Lời nhắc gửi ảnh xưa, theo dịp sắp tới trong lịch. Ảnh gửi lên thành chủ đề cho cuộc gọi tới. */
export function OldPhotoPrompt() {
  const { state } = useApp();
  const p = photoPrompt(state);
  return (
    <Tap onPress={() => router.push({ pathname: '/capture', params: { kind: 'old' } })} label="Gửi ảnh xưa" scaleTo={0.98}>
      <View style={styles.prompt}>
        <View style={[styles.promptIcon, { backgroundColor: SEPIA }]}>
          <Ionicons name="images" size={22} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {p.occasion && <T variant="small" color={colors.muted}>{p.occasion}</T>}
          <T variant="body" weight="semibold">{p.text}</T>
          <T variant="small" color={colors.accentText}>Gửi ảnh xưa</T>
        </View>
      </View>
    </Tap>
  );
}

/** Homeletter tuần này: thẻ màu của người kể, tên chuyện, câu trích, đoạn giọng hay nhất. */
export function LetterCard({ letter, compact }: { letter: Letter; compact?: boolean }) {
  const { state } = useApp();
  const speaker = member(state, letter.speakerId);
  const mine = letter.speakerId === state.meId;
  return (
    <Tap onPress={() => router.push(`/letter/${letter.id}`)} label={letter.title} scaleTo={0.98}>
      <PhotoTile seed={letter.id} tone={memberTone(state.family.members, letter.speakerId)} autoHeight>
        <View style={{ padding: compact ? 16 : 20, gap: 10 }}>
          <View style={styles.row}>
            <Avatar name={speaker?.name ?? '?'} uri={speaker?.avatarUri} size={36} />
            <View style={{ flex: 1 }}>
              <T variant="small" weight="semibold" color={colors.white}>{mine ? 'Bạn đã kể' : `Homeletter từ ${callName(speaker)}`}</T>
              <T variant="caption" weight="regular" color="rgba(255,255,255,0.85)">{relativeTime(letter.createdAt)}</T>
            </View>
            <Glass text={duration(letter.highlightSec)} icon="mic" />
          </View>
          <T variant={compact ? 'h2' : 'display'} color={colors.white} style={compact ? null : { fontSize: 30, lineHeight: 34 }}>{letter.title}</T>
          <T variant="small" color="rgba(255,255,255,0.92)" numberOfLines={2}>“{letter.quote}”</T>
        </View>
      </PhotoTile>
    </Tap>
  );
}

/** Video Homeletter ghép từ ảnh xưa và giọng thật, có phụ đề. */
export function FilmCard({ film }: { film: Film }) {
  const { state } = useApp();
  const speaker = member(state, film.speakerId);
  return (
    <Tap onPress={() => router.push(`/film/${film.id}`)} label={`Xem video ${film.title}`} scaleTo={0.98}>
      <PhotoTile seed={film.id} tone={SEPIA} height={210}>
        <View style={styles.filmInner}>
          <View style={styles.row}>
            <Glass text={film.occasion} />
            <View style={{ flex: 1 }} />
            <Glass text={duration(film.durationSec)} />
          </View>
          <View style={{ alignItems: 'center' }} pointerEvents="none">
            <GradientButton icon="play" size={58} label="Xem" />
          </View>
          <View>
            <T variant="h2" color={colors.white} numberOfLines={2}>{film.title}</T>
            <T variant="small" color="rgba(255,255,255,0.9)">Giọng {callName(speaker)}, phụ đề Việt, Hàn, Anh</T>
          </View>
        </View>
      </PhotoTile>
    </Tap>
  );
}

/** Một ngày trong lịch nhà mình: ngày dương trong vòng tròn, tên, ngày âm, còn bao lâu. */
export function EventRow({ item, onPress }: { item: UpcomingEvent; onPress?: () => void }) {
  const { event, date, inDays } = item;
  const l = lunarOf(date);
  const soon = inDays <= 7;
  const red = event.kind === 'holiday' || event.kind === 'gio' || date.getDay() === 0;
  const years = yearsAt(event, date);
  const extra = event.kind === 'birthday' && years ? `, tròn ${years} tuổi` : years ? `, ${years} năm` : '';
  const body = (
    <View style={styles.eventRow}>
      <View style={styles.dateBlock}>
        <T variant="h3" weight="semibold" color={red ? colors.holiday : colors.ink} style={{ fontSize: 20, lineHeight: 22 }}>{date.getDate()}</T>
        <T variant="caption" weight="regular" color={colors.muted} style={{ fontSize: 11, lineHeight: 13 }}>thg {date.getMonth() + 1}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>{event.title}</T>
        <T variant="small" color={colors.lunar}>{l.day}/{l.month}{l.leap ? ' nhuận' : ''} âm lịch{extra}</T>
      </View>
      <T variant="small" weight={soon ? 'semibold' : 'regular'} color={soon ? colors.accentText : colors.muted}>{inDaysLabel(inDays)}</T>
    </View>
  );
  return onPress ? <Tap onPress={onPress} scaleTo={0.98} label={event.title}>{body}</Tap> : body;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 18 },
  glass: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  reply: { height: 48, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.94)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heart: { height: 48, minWidth: 64, paddingHorizontal: 18, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  table: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingHorizontal: 12, height: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.3%' },
  plate: { aspectRatio: 1, borderRadius: 22, overflow: 'hidden' },
  plateInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 10, justifyContent: 'space-between' },
  mine: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: 20 },
  empty: { backgroundColor: colors.toneDeep, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  button: { height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16 },
  promptIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  filmInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 16, justifyContent: 'space-between' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  dateBlock: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
