"""Tạo bộ âm thanh Homeletter: kalimba gỗ, hộp nhạc, ngòi bút trên giấy, gió nhẹ, nhịp tim.
Mọi nốt nằm trong gam Đô trưởng ngũ cung để các tiếng nghe liền nhau.
Chạy: python branding/sfx/make_sfx.py  (cần numpy, scipy, ffmpeg) -> app/public/sfx/*.mp3
"""
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parents[2] / 'app' / 'public' / 'sfx'
rng = np.random.default_rng(7)

C4, C5, D5, E5, G5, A5, C6, E6, G6, C7 = 261.63, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5, 1568.0, 2093.0


def t(sec):
    return np.arange(int(SR * sec)) / SR


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, 'low', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def kalimba(f, dur=0.6, decay=0.32):
    """Thanh gỗ gảy: tiếng gốc ấm, hoạ âm cao tắt nhanh, một tiếng 'tách' nhỏ lúc gảy."""
    x = t(dur)
    env = np.exp(-x / decay) * np.minimum(1, x / 0.003)
    tone = np.sin(2 * np.pi * f * x) + 0.22 * np.sin(2 * np.pi * 2.01 * f * x) * np.exp(-x / 0.08) \
        + 0.08 * np.sin(2 * np.pi * 5.4 * f * x) * np.exp(-x / 0.03)
    click = lowpass(rng.standard_normal(len(x)), 3000) * np.exp(-x / 0.004) * 0.15
    return tone * env + click


def musicbox(f, dur=1.4, decay=0.7):
    x = t(dur)
    env = np.exp(-x / decay) * np.minimum(1, x / 0.002)
    tone = np.sin(2 * np.pi * f * x) + 0.18 * np.sin(2 * np.pi * 4 * f * x) * np.exp(-x / 0.25) \
        + 0.06 * np.sin(2 * np.pi * 5.9 * f * x) * np.exp(-x / 0.12)
    return tone * env


def reverb(x, wet=0.2, length=1.1):
    ir_t = t(length)
    ir = lowpass(rng.standard_normal(len(ir_t)), 4500) * np.exp(-ir_t / (length / 4))
    ir /= np.abs(ir).sum() / 6
    y = np.concatenate([x, np.zeros(len(ir_t))])
    wetsig = np.zeros(len(y))
    conv = fftconvolve(x, ir)[: len(y)]
    wetsig[: len(conv)] = conv
    return (1 - wet) * y + wet * wetsig


def place(parts, dur):
    out = np.zeros(int(SR * dur))
    for at, sig, gain in parts:
        i = int(SR * at)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n] * gain
    return out


def save(name, x, peak=0.7):
    x = x / (np.abs(x).max() + 1e-9) * peak
    fade = int(SR * 0.02)
    x[-fade:] *= np.linspace(1, 0, fade)
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / f'{name}.wav'
        wavfile.write(wav, SR, (x * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '1', '-b:a', '96k', str(OUT / f'{name}.mp3')], check=True)


OUT.mkdir(parents=True, exist_ok=True)

# Ngòi bút chạm giấy, cho chữ hiện từng ký tự: rất ngắn và khẽ.
x = t(0.05)
save('key', bandpass(rng.standard_normal(len(x)), 1800, 6000) * np.exp(-x / 0.006), peak=0.5)

# Bấm chọn: một nốt kalimba ngắn.
save('tap', reverb(kalimba(E5, 0.45, 0.18), 0.12))

# Đáp án hiện lần lượt: bốn nốt đi lên như một giai điệu nhỏ.
for i, f in enumerate([C5, D5, E5, G5]):
    save(f'pop{i}', reverb(kalimba(f, 0.5, 0.22), 0.15), peak=0.55)

# Nút Tiếp: nốt trầm ấm, có nốt quãng tám mờ phía trên.
save('button', reverb(kalimba(C4, 0.8, 0.35) + 0.35 * kalimba(C5, 0.8, 0.25), 0.15))

# Chụp ảnh: hai tiếng tách mềm như máy ảnh phim.
x = t(0.03)
tick = lowpass(rng.standard_normal(len(x)), 3500) * np.exp(-x / 0.005)
save('shutter', reverb(place([(0, tick, 1), (0.07, tick, 0.7), (0.02, kalimba(G5, 0.4, 0.12), 0.25)], 0.5), 0.1))

# Bắt đầu và dừng ghi: một tiếng "bíp" tròn, rất khẽ.
x = t(0.12)
save('rec', np.sin(2 * np.pi * (A5 + 120 * x) * x) * np.exp(-x / 0.035) * np.minimum(1, x / 0.004), peak=0.45)

# Gửi đi: gió nhẹ thổi lên, ba nốt đi lên theo lá thư.
x = t(0.9)
noise = rng.standard_normal(len(x))
sweep = np.concatenate([bandpass(noise[i:i + 2205], 300 + 2600 * (i / len(x)) ** 1.5, 900 + 3600 * (i / len(x)) ** 1.5) for i in range(0, len(x), 2205)])[: len(x)]
air = sweep * np.sin(np.pi * x / 0.9) ** 2 * 0.5
save('send', reverb(place([(0, air, 1), (0.18, kalimba(C5), 0.5), (0.32, kalimba(E5), 0.5), (0.46, kalimba(G5), 0.55)], 1.4), 0.2))

# Thư tới nơi: hai nốt hộp nhạc, ngân dài.
save('arrive', reverb(place([(0, musicbox(G5), 0.8), (0.2, musicbox(C6, 1.8, 0.9), 1)], 2.2), 0.28))

# Ôm: hai nhịp tim trầm, nền hợp âm ấm phía sau.
x = t(0.22)
beat = (np.sin(2 * np.pi * 58 * x) + 0.5 * np.sin(2 * np.pi * 116 * x)) * np.sin(np.pi * np.minimum(x / 0.22, 1)) ** 2
pad_t = t(1.6)
pad = sum(np.sin(2 * np.pi * f * pad_t) for f in (C4, 329.63, 392.0)) * np.minimum(1, pad_t / 0.35) * np.exp(-pad_t / 0.6) * 0.12
save('hug', reverb(place([(0, beat, 1), (0.3, beat, 0.75), (0.1, pad, 1), (0.55, musicbox(C6, 1.2, 0.5), 0.25)], 1.9), 0.22))

# Thêm hạt vào bình: bốn nốt hộp nhạc lấp lánh.
save('sparkle', reverb(place([(i * 0.07, musicbox(f, 1.0, 0.45), 0.7) for i, f in enumerate([C6, E6, G6, C7])], 1.6), 0.3), peak=0.6)

print('done:', sorted(p.name for p in OUT.glob('*.mp3')))
