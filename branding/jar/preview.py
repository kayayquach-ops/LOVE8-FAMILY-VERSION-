# Ảnh duyệt: lọ đầy ~25 hạt (xếp bằng app/src/jarSim.ts, đúng như trong app) + 10 hạt cỡ lớn + lọ nhỏ như ở Trang chủ.
#   python branding/jar/preview.py <ảnh ra> [số hạt] [cỡ hạt px] [thứ tự trộn]
import sys, os, json, math, subprocess
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.abspath(os.path.join(HERE, '..', '..', 'app', 'public', 'jar'))
APP = os.path.abspath(os.path.join(HERE, '..', '..', 'app'))
DATA = os.path.join(APP, 'src', 'jarData.json')
FONT = os.path.abspath(os.path.join(HERE, '..', '..', 'app', 'server', 'fonts', 'sh-sans.ttf'))
VI = json.load(open(os.path.join(HERE, '..', '..', 'app', 'src', 'i18n', 'vi.json'), encoding='utf-8'))
IDS = ['heart_red', 'lotus', 'sun', 'leaf', 'pearl', 'sakura', 'gold', 'crystal', 'rainbow', 'dew']
# một nhà 5 người, mỗi người một loại hạt, thêm vài loại mua thêm cho đủ 10 loại
MIX = (['heart_red'] * 5 + ['sun'] * 3 + ['lotus'] * 3 + ['leaf'] * 3 + ['pearl'] * 2 + ['sakura'] * 2 + ['gold'] * 2 + ['crystal'] * 2 + ['rainbow'] * 2 + ['dew'] * 1)


def order(n, mix=3):
    import random
    r = random.Random(mix)
    base = MIX[:]
    while len(base) < n:
        base += MIX
    base = base[:n]
    r.shuffle(base)
    return base


def rot(im, deg):
    p = im.convert('RGBa').rotate(deg, resample=Image.BICUBIC, expand=True)
    return p.convert('RGBA')


def sprite(cid, px, small=False):
    im = Image.open(os.path.join(PUB, f'charm-{cid}{"-s" if small else ""}.webp')).convert('RGBA')
    return im.convert('RGBa').resize((px, px), Image.LANCZOS).convert('RGBA')


def jar_with_seeds(placed, size, scale=1.0, small=False):
    suf = '-s' if small else ''
    back = Image.open(os.path.join(PUB, f'jar-back{suf}.webp')).convert('RGBA')
    front = Image.open(os.path.join(PUB, f'jar-front{suf}.webp')).convert('RGBA')
    canvas = Image.new('RGBA', back.size, (0, 0, 0, 0))
    canvas.alpha_composite(back)
    px = max(4, round(size * scale))
    cache = {}
    for p in placed:
        if p['type'] not in cache:
            cache[p['type']] = sprite(p['type'], px, small)
        s = rot(cache[p['type']], -math.degrees(p['a']))
        x = round(p['x'] * scale - s.width / 2)
        y = round(p['y'] * scale - s.height / 2)
        canvas.alpha_composite(s, (x, y)) if x >= 0 and y >= 0 else canvas.paste(s, (x, y), s)
    canvas.alpha_composite(front)
    return canvas


def main():
    out = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 25
    size = float(sys.argv[3]) if len(sys.argv) > 3 else None
    lst = order(n, int(sys.argv[4]) if len(sys.argv) > 4 else 3)
    meta0 = json.load(open(DATA))
    size = size or meta0['jar']['seed'] * meta0['jar']['w']
    res = subprocess.run(['npx', 'tsx', os.path.join(HERE, 'layout-cli.ts'), ','.join(lst), str(size)],
                         capture_output=True, text=True, check=True, cwd=APP, shell=os.name == 'nt')
    sys.stderr.write(res.stderr)
    placed = json.loads(res.stdout)
    big = jar_with_seeds(placed, size)
    meta = json.load(open(DATA))
    sm_w = Image.open(os.path.join(PUB, 'jar-back-s.webp')).width
    small = jar_with_seeds(placed, size, sm_w / meta['jar']['w'], small=True)

    W, H = 2020, 1180
    bg = (0xEC, 0xEA, 0xE8)
    img = Image.new('RGBA', (W, H), bg + (255,))
    d = ImageDraw.Draw(img)
    img.alpha_composite(big, (30, (H - big.height) // 2))
    f = ImageFont.truetype(FONT, 26)
    fs = ImageFont.truetype(FONT, 22)
    x0, y0 = 920, 70
    cell = 214
    for i, cid in enumerate(IDS):
        cx = x0 + (i % 5) * cell
        cy = y0 + (i // 5) * (cell + 60)
        d.rounded_rectangle((cx, cy, cx + cell - 14, cy + cell - 14), 28, fill=(255, 255, 255, 150))
        sp = Image.open(os.path.join(PUB, f'charm-{cid}.webp')).convert('RGBA')
        img.alpha_composite(sp, (cx + (cell - 14 - sp.width) // 2, cy + (cell - 14 - sp.height) // 2))
        name = VI.get(f'jar.seed.{cid}', cid)
        tw = d.textlength(name, font=f)
        d.text((cx + (cell - 14 - tw) / 2, cy + cell - 6), name, font=f, fill=(0x5A, 0x53, 0x4B, 255))
    # khối lọ ở Trang chủ (ảnh nhỏ, đúng cỡ điểm ảnh của iPhone 3x)
    hx, hy = 920, 690
    hw, hh = 1060, small.height + 40
    d.rounded_rectangle((hx, hy, hx + hw, hy + hh), 84, fill=(0xF0, 0xE1, 0xD2, 255))
    img.alpha_composite(small, (hx + 30, hy + 20))
    d.text((hx + small.width + 80, hy + 60), 'Trang chủ (lọ 122 pt, ảnh @3x)', font=fs, fill=(0x9A, 0x5A, 0x44, 255))
    d.text((hx + small.width + 80, hy + 100), f'{n} hạt', font=ImageFont.truetype(FONT, 120), fill=(0x2B, 0x27, 0x23, 255))
    # cỡ thật trong lưới chọn hạt (32 pt @3x = 96 px) và danh sách (22 pt @3x = 66 px)
    sx, sy = hx + small.width + 80, hy + 270
    for i, cid in enumerate(IDS):
        sp = sprite(cid, 66, True)
        img.alpha_composite(sp, (sx + i * 58, sy))
    img.convert('RGB').save(out)
    print(out, img.size)


if __name__ == '__main__':
    main()
