import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Tiếng "tóc" gỗ trầm và một rung nhẹ mỗi lần chọn, để mỗi câu trả lời có cảm giác được đặt xuống.
let player: AudioPlayer | null = null;

export function tapSound() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  try {
    if (!player) {
      player = createAudioPlayer(require('../../assets/tap.wav'));
      player.volume = 0.5;
    }
    player.seekTo(0);
    player.play();
  } catch {
    // Máy không phát được tiếng thì vẫn chạy bình thường.
  }
}

// Tiếng gõ phím rất nhẹ cho chữ hiện dần từng ký tự. Không rung, để khỏi mệt tay.
let key: AudioPlayer | null = null;

export function keySound() {
  try {
    if (!key) {
      key = createAudioPlayer(require('../../assets/key.wav'));
      key.volume = 0.35;
    }
    key.seekTo(0);
    key.play();
  } catch {}
}
