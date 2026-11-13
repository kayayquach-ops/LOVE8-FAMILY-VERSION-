# Ảnh render -> asset cho app (Python thường, cần numpy + Pillow):
#   python branding/jar/export.py <thư mục render> [charms] [jar]
# Hạt: cắt viền, chuẩn hoá cỡ nhìn thấy, ra charm-<id>.webp (192 px) và charm-<id>-s.webp (72 px).
# Lọ: tách độ trong từ cặp ảnh phông đen/trắng (EXR -> npy do run.py ghi), nén sáng kiểu Khronos PBR Neutral
#     như sprite hạt, ra jar-back / jar-front (840 px) và bản -s (372 px).
# Số liệu cho mô phỏng xếp hạt (lòng lọ, cỡ hạt, vòng va chạm của hạt) ghi vào app/src/jarData.json.
import sys, os, json, math
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'app', 'public', 'jar'))
IDS = ['heart_red', 'lotus', 'sun', 'leaf', 'pearl', 'sakura', 'gold', 'crystal', 'rainbow', 'dew']
SPRITE = 192
SPRITE_S = 72
EXPOSURE = -0.6
JAR_S = 372
SEED = 128 / 840   # cạnh sprite hạt trong lọ, theo bề ngang ảnh lọ (39 hạt thì đầy tới dưới vai, chưa chạm thẻ)
FLOOR = 0.03       # đáy lọ nhìn qua thành kính dày cao hơn đáy thật: nâng mặt đáy khi xếp hạt


def srgb_enc(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def srgb_dec(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def pbr_neutral(c):
    c = c.copy()
    x = c.min(-1, keepdims=True)
    off = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - off
    peak = c.max(-1, keepdims=True)
    sc = 0.8 - 0.04
    d = 1 - sc
    newp = 1 - d * d / (peak + d - sc)
    hi = peak >= sc
    c2 = c * np.where(hi, newp / np.maximum(peak, 1e-6), 1)
    g = 1 - 1 / (0.15 * (peak - newp) + 1)
    c2 = np.where(hi, c2 * (1 - g) + newp * g, c2)
    return c2


def premul_resize(im, size):
    a = np.asarray(im, np.float32) / 255
    p = a.copy()
    p[..., :3] *= p[..., 3:]
    chans = [Image.fromarray(p[..., i]).resize(size, Image.LANCZOS) for i in range(4)]
    q = np.stack([np.asarray(c) for c in chans], -1)
    q = np.clip(q, 0, 1)
    al = q[..., 3:]
    q[..., :3] = np.where(al > 1e-4, q[..., :3] / np.maximum(al, 1e-4), 0)
    return Image.fromarray((np.clip(q, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def save_webp(im, path, q=88, aq=95):
    im.save(path, 'WEBP', quality=q, alpha_quality=aq, method=6, exact=False)
    return os.path.getsize(path)


def circles_for(mask, most=9, cover=0.94):
    """Phủ hình hạt bằng vài vòng tròn nội tiếp (tham lam theo khoảng cách tới mép). Toạ độ px sprite."""
    m = mask.astype(bool)
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    ey, ex = np.nonzero(edge)
    E = np.stack([ex, ey], -1).astype(np.float32)
    iy, ix = np.nonzero(m)
    I = np.stack([ix, iy], -1).astype(np.float32)
    D = np.empty(len(I), np.float32)
    for s0 in range(0, len(I), 2048):
        d = I[s0:s0 + 2048, None, :] - E[None]
        D[s0:s0 + 2048] = np.sqrt((d * d).sum(-1)).min(1)
    covered = np.zeros(len(I), bool)
    out = []
    rmin = D.max() * 0.17
    for _ in range(most):
        cand = np.where(~covered, D, -1)
        k = int(np.argmax(cand))
        if cand[k] < rmin:
            break
        c, r = I[k], float(D[k])
        out.append([float(c[0]), float(c[1]), r * 1.05])
        covered |= ((I - c) ** 2).sum(-1) <= r * r
        if covered.mean() >= cover:
            break
    ys, xs = np.nonzero(m)
    pts = np.stack([xs, ys], -1).astype(np.float64)
    ev = np.linalg.eigvalsh(np.cov((pts - pts.mean(0)).T))
    return out, math.sqrt(ev[1] / max(ev[0], 1e-9))


def halo(im, blur=0.035, op=0.42, dy=0.025):
    """Bóng mềm sát dưới hạt (nằm trong sprite): hạt chồng lên nhau trong lọ có chiều sâu, ở lưới chọn hạt thì như đặt trên giấy."""
    a = im.split()[3]
    sh = Image.new('RGBA', im.size, (0x3B, 0x2C, 0x22, 0))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(im.width * blur)).point(lambda v: int(v * op)))
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(sh, (0, round(im.width * dy)))
    out.alpha_composite(im)
    return out


def export_charms(src):
    meta = {}
    total = 0
    for cid in IDS:
        p = os.path.join(src, f'charm_{cid}.png')
        im = Image.open(p).convert('RGBA')
        a = np.asarray(im)[..., 3]
        ys, xs = np.nonzero(a > 8)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        crop = im.crop(box)
        w, h = crop.size
        # cỡ nhìn thấy: căn theo diện tích phủ, nhưng không cho cạnh dài vượt khung
        area = (np.asarray(crop)[..., 3] > 128).sum()
        target_area = (SPRITE * 0.72) ** 2 * 0.62
        s = math.sqrt(target_area / max(area, 1))
        s = min(s, SPRITE * 0.86 / max(w, h))
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
        big = premul_resize(crop, (nw, nh))
        canvas = Image.new('RGBA', (SPRITE, SPRITE), (0, 0, 0, 0))
        canvas.paste(big, ((SPRITE - nw) // 2, (SPRITE - nh) // 2))
        mask = np.asarray(canvas)[..., 3] > 110
        canvas = halo(canvas)
        total += save_webp(canvas, os.path.join(OUT, f'charm-{cid}.webp'))
        small = premul_resize(canvas, (SPRITE_S, SPRITE_S))
        total += save_webp(small, os.path.join(OUT, f'charm-{cid}-s.webp'), 90)
        circ, ratio = circles_for(mask)
        meta[cid] = {'c': [[round((x - SPRITE / 2) / SPRITE, 4), round((y - SPRITE / 2) / SPRITE, 4), round(r / SPRITE, 4)] for x, y, r in circ]}
        print(cid, (nw, nh), 'ratio %.2f' % ratio, len(circ), 'circles')
    print('charms total', total // 1024, 'KB')
    return meta, total


def matte(src, name, exposure=EXPOSURE):
    """Tách lớp kính: trả về RGBA thẳng (0..1) trong không gian hiển thị."""
    K = np.load(os.path.join(src, f'jar_{name}_k.npy')).astype(np.float32)[..., :3]
    W = np.load(os.path.join(src, f'jar_{name}_w.npy')).astype(np.float32)[..., :3]
    T = np.clip(W - K, 0, 1)
    F = np.clip(K, 0, None) * (2 ** exposure)
    tmF = np.clip(pbr_neutral(F), 0, 1)
    refs = (0.18, 0.92)
    Ys = [srgb_enc(tmF + T * srgb_dec(np.float32(x))) for x in refs]
    trans = (Ys[1] - Ys[0]) / (refs[1] - refs[0])
    trans = np.clip(trans.mean(-1, keepdims=True), 0, 1)
    a = 1 - trans
    Ca = ((Ys[0] - refs[0] * trans) + (Ys[1] - refs[1] * trans)) / 2
    C = np.where(a > 1e-3, Ca / np.maximum(a, 1e-3), 0)
    return np.concatenate([np.clip(C, 0, 1), np.clip(a, 0, 1)], -1)


def over(top, bot):
    at, ab = top[..., 3:], bot[..., 3:]
    ao = at + ab * (1 - at)
    co = (top[..., :3] * at + bot[..., :3] * ab * (1 - at)) / np.maximum(ao, 1e-5)
    return np.concatenate([co, ao], -1)


def to_img(x):
    x = x.copy()
    x[..., 3] = np.where(x[..., 3] < 2.5 / 255, 0, x[..., 3])
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def inner_poly(pts, w, h, n=96):
    """Đường bao lòng lọ trên ảnh: bao lồi các điểm chiếu của lòng lọ (thân lọ lồi), bỏ cạnh trên (miệng),
    đi từ góc trên trái xuống thành trái, qua đáy, lên thành phải. Toạ độ 0..1."""
    P = np.asarray(pts) * [w, h]
    P = P[np.lexsort((P[:, 1], P[:, 0]))]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in P:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(tuple(p))
    for p in P[::-1]:
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(tuple(p))
    hull = np.array(lower[:-1] + upper[:-1])
    # hull theo chiều nào cũng được: xoay để bắt đầu ở điểm trên cùng bên trái, đi xuống thành trái
    top = hull[:, 1].min()
    tops = np.nonzero(hull[:, 1] < top + 2)[0]
    i0 = tops[np.argmin(hull[tops, 0])]
    i1 = tops[np.argmax(hull[tops, 0])]
    H = np.roll(hull, -i0, 0)
    if H[1, 0] > H[0, 0] + 1 and H[1, 1] < H[0, 1] + 2:
        H = np.roll(H[::-1], 1, 0)
    k = int(np.argmin(np.abs(H[:, 0] - hull[i1, 0]) + np.abs(H[:, 1] - hull[i1, 1])))
    path = H[:k + 1]
    path = resample(path, n)
    return [[round(x / w, 4), round(y / h, 4)] for x, y in path]


def resample(Pth, n):
    seg = np.sqrt(((Pth[1:] - Pth[:-1]) ** 2).sum(-1))
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, Pth[:, 0]), np.interp(t, s, Pth[:, 1])], -1)


def export_jar(src):
    front = matte(src, 'front')
    back = matte(src, 'back')
    sh = np.load(os.path.join(src, 'jar_shadow.npy')).astype(np.float32)
    shadow = np.zeros_like(front)
    shadow[..., :3] = np.array([0x3B, 0x2C, 0x22]) / 255
    shadow[..., 3] = np.clip(sh[..., 3], 0, 1) * 0.85
    back = over(back, shadow)
    sizes = {}
    for nm, arr in (('back', back), ('front', front)):
        im = to_img(arr)
        sizes[f'jar-{nm}.webp'] = save_webp(im, os.path.join(OUT, f'jar-{nm}.webp'), 78, 72)
        sm = premul_resize(im, (JAR_S, round(JAR_S * im.height / im.width)))
        sizes[f'jar-{nm}-s.webp'] = save_webp(sm, os.path.join(OUT, f'jar-{nm}-s.webp'), 82, 80)
    info = json.load(open(os.path.join(src, 'jar_inner.json')))
    poly = inner_poly(info['inner'], info['w'], info['h'])
    for k, v in sizes.items():
        print(k, v // 1024, 'KB')
    return {'w': info['w'], 'h': info['h'], 'seed': round(SEED, 4), 'floor': FLOOR, 'inner': poly}, sum(sizes.values())


if __name__ == '__main__':
    src = sys.argv[1]
    what = sys.argv[2:] or ['charms', 'jar']
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.abspath(os.path.join(HERE, '..', '..', 'app', 'src', 'jarData.json'))
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    if 'charms' in what:
        meta['charms'], _ = export_charms(src)
    if 'jar' in what:
        meta['jar'], _ = export_jar(src)
    json.dump(meta, open(mp, 'w'), separators=(',', ':'))
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('public/jar total', tot // 1024, 'KB')
