import { Ionicons } from '@/components/Icon';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Button, PhotoTile, T } from '@/components/ui';
import { POST_TAGS } from '@/data/tags';
import { useApp } from '@/store/AppContext';
import { colors, familyTones, fonts, radius } from '@/theme';

const TAGS = POST_TAGS;

// Màn hình chụp nhanh: mở ra là camera, một chạm là chụp, chọn nhãn rồi gửi.
// Widget ngoài màn hình chính sẽ mở thẳng màn hình này.
// `kind=meal`: chụp bữa cơm cho mâm cơm chung. `kind=old`: gửi ảnh xưa, kèm năm chụp, vào kho nhà mình.
export default function Capture() {
  const { state, dispatch } = useApp();
  const { kind } = useLocalSearchParams<{ kind?: 'meal' | 'old' }>();
  const old = kind === 'old';
  const [year, setYear] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [photo, setPhoto] = useState<string | undefined>();
  // Không có camera (web, máy ảo): gửi một mẩu thư chữ để thử luồng.
  const [note, setNote] = useState(false);
  const [tag, setTag] = useState(TAGS[0]);
  const yearNum = Number(year);
  const validYear = yearNum >= 1900 && yearNum <= new Date().getFullYear() ? yearNum : undefined;
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
    setNote(true);
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  }

  function send() {
    dispatch(old
      ? { type: 'addPost', caption: caption.trim() || 'Ảnh ngày xưa của nhà mình', tag: 'xua', photoUri: photo, voiceSec, year: validYear }
      : { type: 'addPost', caption: caption.trim() || tag.caption, tag: tag.tag, photoUri: photo, voiceSec });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  const captured = !!photo || note;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.black }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Đóng" style={styles.round}>
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
        <T variant="h3" color={colors.white}>{old ? 'Gửi ảnh xưa' : kind === 'meal' ? 'Bữa cơm của bạn' : 'Gửi cả nhà'}</T>
        <Pressable onPress={() => setFacing(facing === 'back' ? 'front' : 'back')} accessibilityRole="button" accessibilityLabel="Đổi camera" style={styles.round}>
          <Ionicons name="camera-reverse" size={20} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.viewfinder}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
        ) : note ? (
          <PhotoTile seed="new" tone={familyTones[Math.max(0, state.family.members.findIndex((m) => m.id === state.meId)) % familyTones.length]} radiusSize={0} fill />
        ) : canUseCamera ? (
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
        ) : (
          <View style={styles.noCam}>
            <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.7)" />
            <T variant="body" color="rgba(255,255,255,0.85)" center>
              {Platform.OS === 'web'
                ? 'Bản web chưa mở được camera. Bấm nút chụp để gửi một mẩu thư bằng chữ, hoặc chọn ảnh trong máy.'
                : 'Cho phép camera để chụp nhanh'}
            </T>
            {Platform.OS !== 'web' && (
              <Pressable onPress={requestPermission} style={styles.allow}>
                <T variant="small" weight="semibold" color={colors.white}>Cho phép camera</T>
              </Pressable>
            )}
          </View>
        )}
        {captured && (
          <View style={photo ? styles.captionWrap : styles.noteWrap}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={old ? 'Ảnh này chụp ở đâu, có những ai?' : tag.caption}
              placeholderTextColor="rgba(255,255,255,0.75)"
              accessibilityLabel="Lời nhắn kèm ảnh"
              multiline={!photo}
              style={photo ? styles.caption : styles.noteText}
            />
          </View>
        )}
      </View>

      {old ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 6 }}>
          <View style={styles.yearRow}>
            <T variant="small" weight="semibold" color={colors.white}>Chụp năm nào?</T>
            <TextInput value={year} onChangeText={setYear} placeholder="1999" placeholderTextColor="rgba(255,255,255,0.5)" keyboardType="number-pad"
              maxLength={4} style={styles.year} accessibilityLabel="Năm chụp" />
          </View>
          <T variant="caption" weight="regular" color="rgba(255,255,255,0.7)">Homeletter sẽ hỏi chuyện về tấm ảnh này trong cuộc gọi tới, rồi xếp nó vào dòng đời nhà mình.</T>
        </View>
      ) : (
      <View style={{ paddingVertical: 14 }}>
        <View style={styles.tags}>
          {TAGS.map((t) => {
            const on = t.tag === tag.tag;
            return (
              <Pressable key={t.tag} onPress={() => setTag(t)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[styles.tag, { backgroundColor: on ? colors.white : 'rgba(255,255,255,0.12)' }]}>
                <T variant="small" weight="medium" color={on ? colors.black : colors.white}>{t.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
      )}

      {showVoice ? (
        <View style={styles.voicePanel}>
          <VoiceRecorder size={60} hint="Nói vài câu gửi kèm ảnh" onDone={({ seconds }) => { setVoiceSec(seconds); setShowVoice(false); }} />
        </View>
      ) : captured ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowVoice(true)} style={styles.secondary}>
              <Ionicons name="mic" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>{voiceSec ? `Đã ghi ${voiceSec} giây` : 'Thêm lời nhắn'}</T>
            </Pressable>
            <Pressable onPress={() => { setPhoto(undefined); setNote(false); setVoiceSec(undefined); }} style={styles.secondary}>
              <Ionicons name="refresh" size={18} color={colors.white} />
              <T variant="small" weight="semibold" color={colors.white}>Chụp lại</T>
            </Pressable>
          </View>
          <Button label={old ? 'Lưu vào kho nhà mình' : 'Gửi cho cả nhà'} icon="paper-plane" onPress={send} />
        </View>
      ) : (
        <View style={styles.shutterRow}>
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Chọn ảnh trong máy" style={styles.round}>
            <Ionicons name="images" size={22} color={colors.white} />
          </Pressable>
          <Pressable onPress={shoot} accessibilityRole="button" accessibilityLabel="Chụp" style={styles.shutter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={() => setShowVoice(true)} accessibilityRole="button" accessibilityLabel="Gửi lời nhắn thoại" style={styles.round}>
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
  viewfinder: { flex: 1, marginHorizontal: 14, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.tone },
  noCam: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  allow: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: 18, alignItems: 'center' },
  caption: {
    backgroundColor: 'rgba(0,0,0,0.5)', color: colors.white, fontFamily: fonts.semibold, fontSize: 16,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, textAlign: 'center', minWidth: 200,
  },
  noteWrap: { position: 'absolute', top: 24, left: 22, right: 22, bottom: 24 },
  noteText: { flex: 1, color: colors.white, fontFamily: fonts.serif, fontSize: 30, lineHeight: 40, textAlignVertical: 'top' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, justifyContent: 'center' },
  tag: { paddingHorizontal: 16, height: 40, borderRadius: 999, justifyContent: 'center' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 20 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary },
  secondary: {
    flex: 1, height: 44, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  year: {
    width: 84, height: 44, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', color: colors.white, textAlign: 'center',
    fontFamily: fonts.semibold, fontSize: 16,
  },
  voicePanel: { backgroundColor: colors.tone, marginHorizontal: 14, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
});
