import { Ionicons } from '@/components/Icon';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Button, T } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors, fonts, radius } from '@/theme';

// Chụp gửi cả nhà kiểu Locket: khung vuông, một nút chụp, viết một dòng lên ảnh rồi gửi.
// `kind=meal`: bữa cơm cho mâm cơm chung. `kind=old`: ảnh xưa, kèm năm chụp, vào kho nhà mình.
export default function Capture() {
  const { dispatch } = useApp();
  const { kind } = useLocalSearchParams<{ kind?: 'meal' | 'old' }>();
  const old = kind === 'old';
  const { width } = useWindowDimensions();
  const side = Math.min(width - 32, 520);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [photo, setPhoto] = useState<string | undefined>();
  // Không có camera (bản web, máy ảo): viết vài dòng thay cho ảnh.
  const [note, setNote] = useState(false);
  const [caption, setCaption] = useState('');
  const [year, setYear] = useState('');
  const [voiceSec, setVoiceSec] = useState<number | undefined>();
  const [showVoice, setShowVoice] = useState(false);
  const canUseCamera = Platform.OS !== 'web' && permission?.granted;
  const captured = !!photo || note;
  const yearNum = Number(year);
  const validYear = yearNum >= 1900 && yearNum <= new Date().getFullYear() ? yearNum : undefined;

  async function shoot() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const pic = await camera.current?.takePictureAsync({ quality: 0.7 });
    if (pic?.uri) setPhoto(pic.uri);
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  }

  function send() {
    const fallback = old ? 'Ảnh ngày xưa của nhà mình' : kind === 'meal' ? 'Bữa cơm hôm nay' : 'Gửi cả nhà';
    dispatch({
      type: 'addPost', caption: caption.trim() || fallback, photoUri: photo, voiceSec,
      tag: old ? 'xua' : kind === 'meal' ? 'an-com' : undefined, year: old ? validYear : undefined,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  function reset() {
    setPhoto(undefined); setNote(false); setVoiceSec(undefined); setCaption('');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Đóng" style={styles.round}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <T variant="h3">{old ? 'Ảnh ngày xưa' : kind === 'meal' ? 'Bữa cơm của bạn' : 'Gửi cả nhà'}</T>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={[styles.frame, { width: side, height: side }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
          ) : note ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink }]} />
          ) : canUseCamera ? (
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
          ) : (
            <View style={styles.noCam}>
              {Platform.OS === 'web' ? (
                <>
                  <Button label="Chọn ảnh trong máy" icon="images" onPress={pick} style={{ alignSelf: 'stretch' }} />
                  <Button label="Viết vài dòng" icon="text-outline" variant="ghost" onPress={() => setNote(true)} style={{ alignSelf: 'stretch' }} />
                </>
              ) : (
                <>
                  <Ionicons name="camera-outline" size={36} color={colors.muted} />
                  <Button label="Cho phép camera" onPress={requestPermission} />
                </>
              )}
            </View>
          )}
          {captured && (
            <View style={photo ? styles.captionWrap : styles.noteWrap}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder={old ? 'Ảnh này chụp ở đâu?' : photo ? 'Viết một dòng...' : 'Hôm nay của bạn thế nào?'}
                placeholderTextColor="rgba(255,255,255,0.7)"
                accessibilityLabel="Lời nhắn kèm ảnh"
                multiline={!photo}
                maxLength={photo ? 60 : 240}
                style={photo ? styles.caption : styles.noteText}
              />
            </View>
          )}
          {canUseCamera && !captured && (
            <Pressable onPress={() => setFacing(facing === 'back' ? 'front' : 'back')} accessibilityRole="button" accessibilityLabel="Đổi camera" style={styles.flip}>
              <Ionicons name="camera-reverse" size={20} color={colors.white} />
            </Pressable>
          )}
        </View>

        {old && captured && (
          <View style={styles.yearRow}>
            <T variant="body" color={colors.muted}>Chụp năm</T>
            <TextInput value={year} onChangeText={(v) => setYear(v.replace(/\D/g, ''))} placeholder="1999" placeholderTextColor={colors.faint}
              keyboardType="number-pad" maxLength={4} style={styles.year} accessibilityLabel="Năm chụp" />
          </View>
        )}
      </View>

      {showVoice ? (
        <View style={styles.voicePanel}>
          <VoiceRecorder size={60} hint="Nói vài câu gửi kèm" onDone={({ seconds }) => { setVoiceSec(seconds); setShowVoice(false); }} />
        </View>
      ) : captured ? (
        <View style={styles.bottom}>
          <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Chụp lại" style={styles.round}>
            <Ionicons name="refresh" size={20} color={colors.ink} />
          </Pressable>
          <Button label={old ? 'Cất vào kho nhà mình' : 'Gửi'} icon="arrow-up" onPress={send} style={{ flex: 1 }} />
          <Pressable onPress={() => setShowVoice(true)} accessibilityRole="button" accessibilityLabel="Thêm lời nói" style={[styles.round, voiceSec ? { backgroundColor: colors.primarySoft } : null]}>
            <Ionicons name="mic" size={20} color={voiceSec ? colors.primary : colors.ink} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.bottom}>
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Chọn ảnh trong máy" style={styles.round}>
            <Ionicons name="images" size={22} color={colors.ink} />
          </Pressable>
          <Pressable onPress={canUseCamera ? shoot : pick} accessibilityRole="button" accessibilityLabel="Chụp" style={styles.shutter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={{ width: 44 }} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.tone, alignItems: 'center', justifyContent: 'center' },
  frame: { alignSelf: 'center', borderRadius: radius.xl + 8, overflow: 'hidden', backgroundColor: colors.tone },
  noCam: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  flip: { position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  captionWrap: { position: 'absolute', left: 16, right: 16, bottom: 18, alignItems: 'center' },
  caption: {
    backgroundColor: 'rgba(0,0,0,0.45)', color: colors.white, fontFamily: fonts.medium, fontSize: 16,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, textAlign: 'center', minWidth: 180,
  },
  noteWrap: { position: 'absolute', top: 28, left: 26, right: 26, bottom: 28 },
  noteText: { flex: 1, color: colors.white, fontFamily: fonts.regular, fontSize: 26, lineHeight: 36, textAlignVertical: 'top' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  year: { width: 90, height: 44, borderRadius: 999, backgroundColor: colors.tone, color: colors.ink, textAlign: 'center', fontFamily: fonts.medium, fontSize: 16 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8, minHeight: 110 },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary },
  voicePanel: { backgroundColor: colors.tone, marginHorizontal: 16, borderRadius: radius.lg, padding: 18, marginBottom: 20 },
});
