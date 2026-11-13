# Tờ soát hạt: python branding/jar/sheet.py <thư mục render> <ảnh ra> [cỡ lớn]
# Hàng 1 cỡ lớn trên nền màn lọ, hàng 2 cỡ 64 trên nền Trang chủ, hàng 3 cỡ 32 (cỡ trong lưới).
import sys, os
from PIL import Image

d, out = sys.argv[1], sys.argv[2]
big = int(sys.argv[3]) if len(sys.argv) > 3 else 256
ids = ['heart_red', 'lotus', 'sun', 'leaf', 'pearl', 'sakura', 'gold', 'crystal', 'rainbow', 'dew']
imgs = [Image.open(os.path.join(d, f'charm_{i}.png')).convert('RGBA') for i in ids if os.path.exists(os.path.join(d, f'charm_{i}.png'))]
W = len(imgs) * (big + 16) + 16
rows = [((0xEC, 0xEA, 0xE8), big), ((0xF0, 0xE1, 0xD2), 64), ((0xEC, 0xEA, 0xE8), 32)]
H = sum(s + 24 for _, s in rows) + 16
sheet = Image.new('RGB', (W, H), (255, 255, 255))
y = 16
for bg, s in rows:
    sheet.paste(Image.new('RGB', (W, s + 16), bg), (0, y - 8))
    for k, im in enumerate(imgs):
        t = im.resize((s, s), Image.LANCZOS)
        sheet.paste(t, (16 + k * (big + 16) + (big - s) // 2, y), t)
    y += s + 24
sheet.save(out)
print(out, sheet.size)
