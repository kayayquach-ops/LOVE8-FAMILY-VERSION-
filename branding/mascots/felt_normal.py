# Tạo normal map sợi nỉ lặp liền (tileable) dùng chung cho mọi linh vật thú bông.
# python branding/mascots/felt_normal.py  ->  app/public/mascots/felt-normal.jpg
import os
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(11)
h = np.zeros((N, N), np.float64)

def splat(xs, ys, w):
    xi = np.mod(np.round(xs).astype(int), N)
    yi = np.mod(np.round(ys).astype(int), N)
    np.add.at(h, (yi, xi), w)

# Sợi ngắn cong nhẹ, hướng ngẫu nhiên (nỉ ép không có thớ).
for _ in range(9000):
    x, y = rng.uniform(0, N, 2)
    a = rng.uniform(0, np.pi * 2)
    ln = rng.uniform(6, 26)
    curl = rng.normal(0, 0.06)
    t = np.linspace(0, ln, int(ln * 1.5) + 2)
    ang = a + curl * t
    xs = x + np.cumsum(np.cos(ang)) * (ln / len(t))
    ys = y + np.cumsum(np.sin(ang)) * (ln / len(t))
    splat(xs, ys, rng.uniform(0.6, 1.0))

def blur(img, sigma):
    f = np.fft.fftfreq(N)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(img) * g))

fibers = blur(h, 0.9)
fibers /= fibers.std() + 1e-9
# Mảng lồi lõm to (nỉ dày mỏng không đều) cho mặt vải có "chất".
clump = blur(rng.normal(0, 1, (N, N)), 14)
clump /= clump.std() + 1e-9
height = fibers * 0.75 + clump * 0.3

dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
s = 1.25
nx, ny, nz = -dx * s, dy * s, np.ones_like(dx)
ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
rgb = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
out = os.path.join(os.path.dirname(__file__), '..', '..', 'app', 'public', 'mascots', 'felt-normal.jpg')
os.makedirs(os.path.dirname(out), exist_ok=True)
Image.fromarray((rgb * 255).clip(0, 255).astype(np.uint8)).save(out, quality=88)
print(os.path.abspath(out), os.path.getsize(out) // 1024, 'KB')
