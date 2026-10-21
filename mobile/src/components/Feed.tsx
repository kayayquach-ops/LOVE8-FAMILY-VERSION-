import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { tagLabel } from '@/data/tags';
import type { Member, Post, Story } from '@/data/types';
import { clock, duration, inDaysLabel, relativeTime } from '@/lib/format';
import { lunarOf } from '@/lib/lunar';
import { isToday, member, type Nudge, type UpcomingEvent } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';
import { Avatar, memberTone, PhotoTile, T } from './ui';

const QUICK = ['❤️', '🥺', '😍', '👏'];

/** Cả nhà hôm nay: ai đã gửi tin, lúc mấy giờ. Bấm vào người đã gửi để xem tin. */
export function FamilyToday() {
  const { state } = useApp();
  const meFirst = [...state.family.members].sort((a) => (a.id === state.meId ? -1 : 1));
  return (
    <View style={{ gap: 4 }}>
      {meFirst.map((m) => {
        const isMe = m.id === state.meId;
        const mine = state.posts.filter((p) => p.authorId === m.id);
        const today = mine.filter((p) => isToday(p.createdAt));
        const status = today.length
          ? `Đã gửi ${today.length > 1 ? `${today.length} tin, ` : ''}lúc ${clock(today[0].createdAt)}`
          : isMe
            ? 'Chưa gửi gì hôm nay'
            : mine[0]
              ? `Lần cuối gửi ${relativeTime(mine[0].createdAt)}`
              : 'Chưa gửi tin nào';
        const onPress = isMe && !today.length
          ? () => router.push('/capture')
          : today.length
            ? () => router.push(`/post/${today[0].id}`)
            : () => router.push(`/member/${m.id}`);
        return (
          <Pressable key={m.id} onPress={onPress} accessibilityRole="button"
            style={({ pressed }) => [styles.todayRow, pressed && { backgroundColor: colors.tone }]}>
            <Avatar name={m.name} uri={m.avatarUri} size={44} />
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold">{isMe ? 'Bạn' : m.roleLabel}</T>
              <T variant="small" color={today.length ? colors.ink : colors.muted}>{status}</T>
            </View>
            {isMe && !today.length ? (
              <View style={styles.sendNow}>
                <Ionicons name="camera" size={16} color={colors.white} />
                <T variant="small" weight="semibold" color={colors.white}>Gửi</T>
              </View>
            ) : today.length ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.green} accessibilityLabel="Đã gửi hôm nay" />
            ) : (
              <Ionicons name="ellipse-outline" size={22} color={colors.faint} accessibilityLabel="Chưa gửi hôm nay" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Một tin của cả nhà. Có ảnh thì hiện ảnh; chưa có ảnh thì là một mẩu thư:
 * lời nhắn in to trên nền màu của người gửi.
 */
export function PostCard({ post, width }: { post: Post; width?: number }) {
  const { state, dispatch } = useApp();
  const author = member(state, post.authorId);
  const mine = post.reactions[state.meId];
  const tone = memberTone(state.family.members, post.authorId);
  const h = width ? Math.round(width * 1.2) : 340;
  const label = tagLabel(post.tag);
  return (
    <View style={{ width }}>
      <Pressable onPress={() => router.push(`/post/${post.id}`)} accessibilityRole="button">
        <PhotoTile seed={post.id} tone={tone} uri={post.photoUri} height={h}>
          <View style={styles.noteInner}>
            {label && <T variant="small" weight="medium" color="rgba(255,255,255,0.82)">{label}</T>}
            <View style={{ flex: 1, justifyContent: post.photoUri ? 'flex-end' : 'flex-start' }}>
              <T
                variant={post.photoUri ? 'body' : 'h2'}
                serif={!post.photoUri}
                weight={post.photoUri ? 'medium' : 'regular'}
                color={colors.white}
                numberOfLines={post.photoUri ? 3 : 7}
                style={!post.photoUri && { fontSize: width && width < 280 ? 21 : 25, lineHeight: width && width < 280 ? 28 : 33, marginTop: 6 }}
              >
                {post.caption}
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T variant="small" weight="semibold" color={colors.white}>{author?.roleLabel}</T>
              <T variant="small" color="rgba(255,255,255,0.82)">{relativeTime(post.createdAt)}</T>
              {post.voiceSec ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                  <Ionicons name="mic" size={14} color={colors.white} />
                  <T variant="small" color={colors.white}>{duration(post.voiceSec)}</T>
                </View>
              ) : null}
            </View>
          </View>
        </PhotoTile>
      </Pressable>
      <View style={styles.reactions}>
        {QUICK.map((e) => (
          <Pressable
            key={e}
            onPress={() => dispatch({ type: 'react', postId: post.id, emoji: e })}
            accessibilityRole="button"
            accessibilityState={{ selected: mine === e }}
            style={[styles.react, mine === e && styles.reactOn]}
          >
            <T variant="body">{e}</T>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.muted} />
          <T variant="small" color={colors.muted}>{post.replies.length}</T>
        </View>
      </View>
    </View>
  );
}

export function NudgeCard({ nudge }: { nudge: Nudge }) {
  const { dispatch } = useApp();
  const m = nudge.member;
  return (
    <View style={styles.nudge}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={m.name} uri={m.avatarUri} size={44} />
        <T variant="body" weight="semibold" style={{ flex: 1 }}>{nudge.days} ngày chưa gọi cho {m.roleLabel.toLowerCase()}</T>
      </View>
      <T variant="small" color={colors.inkSoft}>Gợi ý mở lời: {nudge.starter}.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => router.push(`/member/${m.id}`)} accessibilityRole="button"
          style={({ pressed }) => [styles.small, { backgroundColor: pressed ? colors.primaryDark : colors.primary }]}>
          <Ionicons name="call" size={16} color={colors.white} />
          <T variant="small" weight="semibold" color={colors.white}>Gọi qua Zalo</T>
        </Pressable>
        <Pressable onPress={() => dispatch({ type: 'markCalled', memberId: m.id })} accessibilityRole="button"
          style={({ pressed }) => [styles.small, { backgroundColor: pressed ? colors.toneDeep : colors.white }]}>
          <Ionicons name="checkmark" size={16} color={colors.ink} />
          <T variant="small" weight="semibold">Đã gọi rồi</T>
        </Pressable>
      </View>
    </View>
  );
}

/** Một ngày của nhà mình: khối ngày như trên tờ lịch, tên sự kiện, ngày âm, còn bao lâu. */
export function EventRow({ item }: { item: UpcomingEvent }) {
  const { event, date, inDays } = item;
  const l = lunarOf(date);
  const soon = inDays <= 7;
  const red = event.kind === 'tet' || event.kind === 'gio' || date.getDay() === 0;
  return (
    <View style={styles.eventRow}>
      <View style={styles.dateBlock}>
        <T variant="h2" weight="bold" color={red ? colors.primary : colors.ink} style={{ fontSize: 24, lineHeight: 28 }}>{date.getDate()}</T>
        <T variant="caption" color={colors.muted}>thg {date.getMonth() + 1}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="body" weight="semibold" numberOfLines={2}>{event.title}</T>
        <T variant="small" color={colors.lunar}>{l.day}/{l.month}{l.leap ? ' nhuận' : ''} âm lịch</T>
      </View>
      <T variant="small" weight={soon ? 'semibold' : 'regular'} color={soon ? colors.primary : colors.muted}>{inDaysLabel(inDays)}</T>
    </View>
  );
}

/** Trang ký ức: năm in lớn như trên gáy album, tên chuyện, một câu trích, người kể. */
export function StoryCard({ story, compact }: { story: Story; compact?: boolean }) {
  const { state } = useApp();
  const teller = member(state, story.tellerId);
  return (
    <Pressable onPress={() => router.push(`/story/${story.id}`)} accessibilityRole="button"
      style={({ pressed }) => [styles.story, compact && { padding: 14 }, pressed && { backgroundColor: colors.toneDeep }]}>
      <T variant="display" weight="bold" color={colors.ink} style={{ fontSize: compact ? 30 : 44, lineHeight: compact ? 34 : 48 }}>
        {story.year ?? 'Lời dặn'}
      </T>
      <T variant={compact ? 'body' : 'h3'} weight="semibold" numberOfLines={2} style={{ marginTop: 6 }}>{story.title}</T>
      <T variant="small" serif color={colors.inkSoft} numberOfLines={compact ? 3 : 2} style={{ marginTop: 6, fontSize: compact ? 14 : 16, lineHeight: compact ? 21 : 24 }}>
        “{story.quote}”
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Avatar name={teller?.name ?? '?'} uri={teller?.avatarUri} size={26} />
        <T variant="small" color={colors.inkSoft} numberOfLines={1} style={{ flexShrink: 1 }}>
          {teller?.roleLabel} kể, {duration(story.durationSec)}
        </T>
      </View>
    </Pressable>
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
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radius.md },
  sendNow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 14, height: 36,
  },
  noteInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 16, gap: 8 },
  reactions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 },
  react: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tone },
  reactOn: { backgroundColor: colors.primarySoft },
  nudge: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 16, gap: 12 },
  small: {
    flex: 1, height: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  dateBlock: { width: 52, alignItems: 'center' },
  story: { backgroundColor: colors.tone, borderRadius: radius.lg, padding: 18 },
});

