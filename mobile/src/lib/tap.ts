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
