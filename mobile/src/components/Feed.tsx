import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { tagLabel } from '@/data/tags';
import type { Member, Post, Story } from '@/data/types';
import { clock, duration, inDaysLabel, relativeTime } from '@/lib/format';
import { lunarOf } from '@/lib/lunar';
import { isToday, member, type Nudge, type UpcomingEvent } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, gradient, radius } from '@/theme';
import { Ionicons } from './Icon';
import { Avatar, FadeIn, memberTone, PhotoTile, T, Tap } from './ui';

const QUICK = ['❤️', '🥺', '😍', '👏'];

function todayStatus(posts: Post[], memberId: string, isMe: boolean) {
  const mine = posts.filter((p) => p.authorId === memberId);
  const today = mine.filter((p) => isToday(p.createdAt));
  const text = today.length
    ? `Đã gửi lúc ${clock(today[0].createdAt)}`
    : isMe
      ? 'Chưa gửi gì hôm nay'
      : mine[0]
        ? `Lần cuối ${relativeTime(mine[0].createdAt)}`
        : 'Chưa gửi tin nào';
  return { today, text };
}

/**
 * Cả nhà hôm nay, xếp thành lưới thẻ màu so le như bản tham khảo: mỗi người một thẻ,
 * avatar ở trên, tên và lần gửi gần nhất ở dưới. Lẻ người thì thẻ cuối trải hết chiều ngang.
 */
export function FamilyGrid() {
  const { state } = useApp();
  const people = [...state.family.members].sort((a) => (a.id === state.meId ? -1 : 1));
  const odd = people.length % 2 === 1;
  const paired = odd ? people.slice(0, -1) : people;
  const left = paired.filter((_, i) => i % 2 === 0);
  const right = paired.filter((_, i) => i % 2 === 1);
  // Chiều cao so le nhưng mỗi cặp cộng lại bằng nhau, để hai cột kết thúc ngang nhau.
  const leftH = [204, 176];
  const rightH = [176, 204];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 10 }}>
          {left.map((m, i) => <MemberCard key={m.id} m={m} height={leftH[i % 2]} delay={i * 140} />)}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          {right.map((m, i) => <MemberCard key={m.id} m={m} height={rightH[i % 2]} delay={70 + i * 140} />)}
        </View>
      </View>
      {odd && <MemberCard m={people[people.length - 1]} height={132} wide delay={300} />}
    </View>
  );
}

function MemberCard({ m, height, wide, delay }: { m: Member; height: number; wide?: boolean; delay: number }) {
  const { state } = useApp();
  const isMe = m.id === state.meId;
  const { today, text } = todayStatus(state.posts, m.id, isMe);
  const onPress = isMe && !today.length
    ? () => router.push('/capture')
    : today.length
      ? () => router.push(`/post/${today[0].id}`)
      : () => router.push(`/member/${m.id}`);
  return (
    <FadeIn delay={delay}>
      <Tap onPress={onPress} label={`${isMe ? 'Bạn' : m.roleLabel}. ${text}`} scaleTo={0.97}>
        <PhotoTile seed={m.id} tone={memberTone(state.family.members, m.id)} height={height}>
          <View style={[styles.cardInner, wide && { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={styles.cardTop}>
              <Avatar name={m.name} uri={m.avatarUri} size={wide ? 64 : 58} />
              {!wide && <StatusDot done={today.length > 0} me={isMe} />}
            </View>
            <View style={wide ? { flex: 1 } : null}>
              <T variant="h2" color={colors.white} numberOfLines={1}>{isMe ? 'Bạn' : m.roleLabel}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Ionicons name={today.length ? 'checkmark-circle' : 'time-outline'} size={14} color="rgba(255,255,255,0.85)" />
                <T variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={1} style={{ flexShrink: 1 }}>{text}</T>
              </View>
            </View>
            {wide && <StatusDot done={today.length > 0} me={isMe} />}
          </View>
        </PhotoTile>
      </Tap>
    </FadeIn>
  );
}

function StatusDot({ done, me }: { done: boolean; me: boolean }) {
  return (
    <View style={styles.statusDot}>
      <Ionicons name={done ? 'checkmark' : me ? 'camera' : 'ellipsis-horizontal'} size={16} color={colors.white} />
    </View>
  );
}

/** Một tin của cả nhà: thẻ màu của người gửi, lời nhắn in to như tiêu đề, ảnh thật nếu có. */
export function PostCard({ post, width }: { post: Post; width?: number }) {
  const { state, dispatch } = useApp();
  const author = member(state, post.authorId);
  const mine = post.reactions[state.meId];
  const small = !!width && width < 280;
  const h = width ? Math.round(width * (small ? 1.38 : 1.32)) : 440;
  const label = tagLabel(post.tag);
  const loved = mine === '❤️';
  return (
    <View style={{ width }}>
      <Tap onPress={() => router.push(`/post/${post.id}`)} label={`Tin của ${author?.roleLabel}`} scaleTo={0.98}>
        <PhotoTile seed={post.id} tone={memberTone(state.family.members, post.authorId)} uri={post.photoUri} height={h}>
          <View style={styles.postInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={author?.name ?? '?'} uri={author?.avatarUri} size={40} />
              <View style={{ flex: 1 }}>
                <T variant="small" weight="semibold" color={colors.white}>{author?.roleLabel}</T>
                <T variant="caption" weight="regular" color="rgba(255,255,255,0.85)">{relativeTime(post.createdAt)}</T>
              </View>
            </View>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <T variant="display" color={colors.white} numberOfLines={small ? 4 : 5}
                style={{ fontSize: small ? 22 : 30, lineHeight: small ? 25 : 33, letterSpacing: small ? -0.6 : -1.2 }}>
                {post.caption}
              </T>
            </View>
            {/* Nhãn mờ và hàng nút ngay trong thẻ, như thẻ "Chasing sunsets" của mẫu friendlyhours. */}
            <View style={styles.chips}>
              {label && <Glass text={label} />}
              {post.voiceSec ? <Glass text={`Lời nhắn ${duration(post.voiceSec)}`} icon="mic" /> : null}
              {post.replies.length ? <Glass text={`${post.replies.length} trả lời`} /> : null}
            </View>
            <View style={styles.actions}>
              <Tap onPress={() => router.push(`/post/${post.id}`)} label="Trả lời" scaleTo={0.85}>
                <View style={styles.round}><Ionicons name="chatbubble-outline" size={19} color={colors.black} /></View>
              </Tap>
              {QUICK.slice(1, 3).map((e) => (
                <Tap key={e} onPress={() => dispatch({ type: 'react', postId: post.id, emoji: e })} selected={mine === e} label={`Thả ${e}`} scaleTo={0.85}>
                  <View style={[styles.round, mine === e && styles.roundOn]}><T variant="body">{e}</T></View>
                </Tap>
              ))}
              <Tap onPress={() => dispatch({ type: 'react', postId: post.id, emoji: '❤️' })} selected={loved} label="Thả tim" scaleTo={0.94} style={{ flex: 1 }}>
                <LinearGradient colors={loved ? ['#FFFFFF', '#FFFFFF'] : gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.love}>
                  <Ionicons name="heart" size={20} color={loved ? colors.primary : colors.white} />
                  {!small && <T variant="small" weight="semibold" color={loved ? colors.black : colors.white}>{loved ? 'Đã thả tim' : 'Thả tim'}</T>}
                </LinearGradient>
              </Tap>
            </View>
          </View>
        </PhotoTile>
      </Tap>
    </View>
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

export function NudgeCard({ nudge }: { nudge: Nudge }) {
  const { dispatch } = useApp();
  const m = nudge.member;
  return (
    <PhotoTile seed={`nudge-${m.id}`} tone="#A44A3B" autoHeight>
      <View style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={m.name} uri={m.avatarUri} size={52} />
          <T variant="h2" color={colors.white} style={{ flex: 1 }}>{nudge.days} ngày chưa gọi cho {m.roleLabel.toLowerCase()}</T>
        </View>
        <T variant="small" color="rgba(255,255,255,0.9)">Gợi ý mở lời: {nudge.starter}.</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tap onPress={() => router.push(`/member/${m.id}`)} style={{ flex: 1 }}>
            <View style={[styles.small, { backgroundColor: colors.white }]}>
              <Ionicons name="call" size={16} color={colors.black} />
              <T variant="small" weight="semibold" color={colors.black}>Gọi qua Zalo</T>
            </View>
          </Tap>
          <Tap onPress={() => dispatch({ type: 'markCalled', memberId: m.id })} style={{ flex: 1 }}>
            <View style={[styles.small, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
              <Ionicons name="checkmark" size={16} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Đã gọi rồi</T>
            </View>
          </Tap>
        </View>
      </View>
    </PhotoTile>
  );
}

/** Một ngày của nhà mình: ngày dương trong vòng tròn, tên sự kiện, ngày âm, còn bao lâu. */
export function EventRow({ item }: { item: UpcomingEvent }) {
  const { event, date, inDays } = item;
  const l = lunarOf(date);
  const soon = inDays <= 7;
  const red = event.kind === 'tet' || event.kind === 'gio' || date.getDay() === 0;
  return (
    <View style={styles.eventRow}>
      <View style={styles.dateBlock}>
        <T variant="h3" weight="semibold" color={red ? colors.holiday : colors.ink} style={{ fontSize: 20, lineHeight: 22 }}>{date.getDate()}</T>
        <T variant="caption" weight="regular" color={colors.muted} style={{ fontSize: 11, lineHeight: 13 }}>thg {date.getMonth() + 1}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>{event.title}</T>
        <T variant="small" color={colors.lunar}>{l.day}/{l.month}{l.leap ? ' nhuận' : ''} âm lịch</T>
      </View>
      <T variant="small" weight={soon ? 'semibold' : 'regular'} color={soon ? colors.accentText : colors.muted}>{inDaysLabel(inDays)}</T>
    </View>
  );
}

/** Trang ký ức: thẻ màu của người kể, năm in rất lớn, tên chuyện và một câu trích. */
export function StoryCard({ story, compact }: { story: Story; compact?: boolean }) {
  const { state } = useApp();
  const teller = member(state, story.tellerId);
  return (
    <Tap onPress={() => router.push(`/story/${story.id}`)} label={story.title} scaleTo={0.97}>
      <PhotoTile seed={story.id} tone={memberTone(state.family.members, story.tellerId)} autoHeight>
        <View style={{ padding: compact ? 16 : 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={compact ? 32 : 40} />
            <T variant="small" weight="semibold" color={colors.white} style={{ flex: 1 }}>{teller?.roleLabel} kể</T>
            <View style={styles.voice}>
              <Ionicons name="play" size={12} color={colors.white} />
              <T variant="caption" color={colors.white}>{duration(story.durationSec)}</T>
            </View>
          </View>
          <T variant="display" color={colors.white} style={{ fontSize: compact ? 40 : 56, lineHeight: compact ? 44 : 60, marginTop: compact ? 18 : 28, letterSpacing: -2 }}>
            {story.year ?? 'Lời dặn'}
          </T>
          <T variant={compact ? 'h3' : 'h2'} color={colors.white} numberOfLines={2}>{story.title}</T>
          <T variant="small" color="rgba(255,255,255,0.9)" numberOfLines={2} style={{ marginTop: 8 }}>“{story.quote}”</T>
        </View>
      </PhotoTile>
    </Tap>
  );
}

export function MemberMini({ m }: { m: Member }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Avatar name={m.name} uri={m.avatarUri} size={28} />
      <T variant="small" weight="medium">{m.roleLabel}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  cardInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 14, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusDot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  postInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 18 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  glass: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  roundOn: { borderWidth: 2.5, borderColor: colors.white, backgroundColor: 'rgba(255,255,255,0.6)' },
  love: { height: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  small: { height: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  dateBlock: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
});
