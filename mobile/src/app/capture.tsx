import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Button, Chip, PhotoTile, T } from '@/components/ui';
import type { PostTag } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

const TAGS: Array<{ tag: PostTag; label: string; emoji: string; caption: string }> = [
  { tag: 'an-com', label: 'Ăn cơm chưa?', emoji: '🍚', caption: 'Con ăn cơm rồi nè!' },
  { tag: 'binh-an', label: 'Bình an', emoji: '🌤️', caption: 'Hôm nay con vẫn ổn ạ' },
  { tag: 'nho-nha', label: 'Nhớ nhà', emoji: '🏠', caption: 'Nhớ nhà quá' },
  { tag: 'di-hoc', label: 'Đi học', emoji: '📚', caption: 'Đang ở trường' },
  { tag: 'di-lam', label: 'Đi làm', emoji: '💼', caption: 'Đi làm thôi' },
  { tag: 'khoe', label: 'Khoe nè', emoji: '✨', caption: 'Khoe cả nhà cái này' },
];

// Màn hình chụp nhanh: mở ra là camera, một chạm là chụp, chọn nhãn rồi gửi.
// Widget ngoài màn hình chính sẽ mở thẳng màn hình này.
export default function Capture() {
  const { dispatch } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [photo, setPhoto] = useState<string | undefined>();
  const [demoEmoji, setDemoEmoji] = useState<string | undefined>();
  const [tag, setTag] = useState(TAGS[0]);
  const [caption, setCaption] = useState('');
  const [voiceSec, setVoiceSec] = useState<number | undefined>();
  const [showVoice, setShowVoice] = useState(false);
  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  async function shoot() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (canUseCamera && camera.current) {
      const pic = await camera.current.takePictureAsync({ quality: 0.7 });
      if (pic?.uri) return setPhoto(pic.uri);
    }
    // Không có camera (web, máy ảo): dùng ảnh minh hoạ để thử luồng.
    setDemoEmoji(tag.emoji);
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  }

  function send() {
    dispatch({
      type: 'addPost', caption: caption.trim() || tag.caption, tag: tag.tag, photoUri: photo,
      emoji: photo ? undefined : demoEmoji ?? tag.emoji, voiceSec,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  const captured = !!photo || !!demoEmoji;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.black }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.round}>
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
        <T variant="h3" color={colors.white}>Gửi cả nhà</T>
        <Pressable onPress={() => setFacing(facing === 'back' ? 'front' : 'back')} style={styles.round}>
          <Ionicons name="camera-reverse" size={20} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.viewfinder}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
        ) : demoEmoji ? (
          <PhotoTile seed={`new-${tag.tag}`} emoji={demoEmoji} height={420} radiusSize={0} fill />
        ) : canUseCamera ? (
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
        ) : (
          <View style={styles.noCam}>
            <Ionicons name="camera-outline" size={40} color={colors.faint} />
            <T variant="small" color={colors.faint} center>
              {Platform.OS === 'web' ? 'Bản web dùng ảnh minh hoạ. Trên điện thoại sẽ mở camera thật.' : 'Cho phép camera để chụp nhanh'}
            </T>
            {Platform.OS !== 'web' && (
              <Pressable onPress={requestPermission} style={styles.allow}>
                <T variant="small" weight="semibold" color={colors.white}>Cho phép camera</T>
              </Pressable>
            )}
          </View>
        )}
        {captured && (
          <View style={styles.captionWrap}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={tag.caption}
              placeholderTextColor="rgba(255,255,255,0.8)"
              style={styles.caption}
            />
          </View>
        )}
      </View>

      <View style={{ paddingVertical: 14 }}>
        <View style={styles.tags}>
          {TAGS.map((t) => (
            <Chip key={t.tag} label={`${t.emoji} ${t.label}`} active={t.tag === tag.tag} tone="primary" icon={undefined} onPress={() => setTag(t)} />
          ))}
        </View>
      </View>

      {showVoice ? (
        <View style={styles.voicePanel}>
          <VoiceRecorder size={60} hint="Nói vài câu gửi kèm ảnh" onDone={({ seconds }) => { setVoiceSec(seconds); setShowVoice(false); }} />
        </View>
      ) : captured ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowVoice(true)} style={styles.secondary}>
              <Ionicons name="mic" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>{voiceSec ? `Đã ghi ${voiceSec}s` : 'Thêm lời nhắn'}</T>
            </Pressable>
            <Pressable onPress={() => { setPhoto(undefined); setDemoEmoji(undefined); setVoiceSec(undefined); }} style={styles.secondary}>
              <Ionicons name="refresh" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Chụp lại</T>
            </Pressable>
          </View>
          <Button label="Gửi cho cả nhà" icon="paper-plane" onPress={send} />
        </View>
      ) : (
        <View style={styles.shutterRow}>
          <Pressable onPress={pick} style={styles.round}>
            <Ionicons name="images" size={22} color={colors.white} />
          </Pressable>
          <Pressable onPress={shoot} style={styles.shutter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={() => setShowVoice(true)} style={styles.round}>
            <Ionicons name="mic" size={22} color={colors.white} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viewfinder: { flex: 1, marginHorizontal: 14, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#222' },
  noCam: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  allow: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: 18, alignItems: 'center' },
  caption: {
    backgroundColor: 'rgba(0,0,0,0.4)', color: colors.white, fontFamily: fonts.semibold, fontSize: 16,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, textAlign: 'center', minWidth: 200,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, justifyContent: 'center' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 20 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary },
  secondary: {
    flex: 1, height: 44, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  voicePanel: { backgroundColor: colors.white, marginHorizontal: 14, borderRadius: radius.xl, padding: 18, marginBottom: 14 },
});
