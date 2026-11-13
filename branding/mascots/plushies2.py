# Sáu linh vật thú bông vải nỉ còn lại: gà con, mèo, gấu, mầm, cơm nắm, ngôi sao. Chạy sau plushies.py.
# Mỗi con một kiểu may riêng: gà con thân bốn múi, mèo thân mochi bè ngang, gấu teddy đầu ghép dải giữa có mõm khâu nổi,
# mầm hạt giọt nước ba mảnh, cơm nắm và ngôi sao kiểu gối hai mặt có dải hông.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

def ground_all(objs):
    """Đưa cả nhóm lưới xuống cho điểm thấp nhất chạm y = 0; trả độ dời."""
    upd()
    lo = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in objs)
    for o in objs:
        o.data.transform(Matrix.Translation((0, 0, -lo)))
    return lo

def line_on(target, pts, samples=40):
    """Các điểm (p, pháp tuyến) dọc đường gấp khúc 2D trên mặt trước của target."""
    out = []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(2, int(samples * math.hypot(x1 - x0, y1 - y0) / 0.3))
        for k in range(n + (1 if i == len(pts) - 2 else 0)):
            t = k / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            z, nr = surface(target, x, y)
            if z is not None:
                out.append(((x, y, z), nr))
    return out

def satin(name, c, target, x, top, rows, width, material, step=0.0085, taper=7.5):
    """Hình tam giác ngược thêu kín (satin stitch): các mũi ngang ngắn dần từ trên xuống."""
    bm = bmesh.new()
    for i in range(rows):
        yy = top - i * step
        half = width / 2 * (1 - i / taper)
        z, n = surface(target, x, yy)
        if z is None:
            continue
        stitch_bm(bm, V(x, yy, z + 0.003), Vector((1, 0, 0)), V(*n).normalized(), half * 2, 0.011, 0.007)
    return mesh_obj(name, bm, c, material)

def single_stitches(name, c, target, spots, material, length=0.04, width=0.014, height=0.008, seed=4):
    """Các mũi chỉ rời (hạt cơm thêu, lấp lánh): spots = [(x, y, góc độ)] trên mặt trước."""
    bm = bmesh.new()
    for x, y, a in spots:
        z, n = surface(target, x, y)
        if z is None:
            continue
        r = math.radians(a)
        t = V(math.cos(r), math.sin(r), 0)
        nn = V(*n).normalized()
        t = (t - nn * t.dot(nn)).normalized()
        stitch_bm(bm, V(x, y, z + 0.002), t, nn, length, width, height)
    return mesh_obj(name, bm, c, material)

def sparkle_spots(x, y, big=0.07):
    return [(x, y, 90), (x, y, 0)], big

def eyes_cheeks(P, c, target, ex, ey, erx, ery, cx, cy, pink, M, depth=0.045, cheek=(0.078, 0.054)):
    eyes = [safety_eye(f'{P}_Eye{sd}', c, target, s * ex, ey, erx, ery, M['eye'], depth=depth) for s, sd in ((1, 'L'), (-1, 'R'))]
    cheeks = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch = decal(f'{P}_Cheek{sd}', c, target, s * cx, cy, cheek[0], cheek[1], 0.009, pink, edge=0.25, seg=24,
                   rings=[0.0, 0.5, 0.8, 0.93, 1.0], tuck=0.004)
        set_center_origin(ch)
        cheeks.append(ch)
    return eyes, cheeks

def side_x(body, y, z, side=1):
    """x của mặt hông thân tại độ cao y, độ sâu z (bắn tia từ ngoài vào)."""
    p, n = cast(body, (side * 3.0, y, z), (-side, 0, 0))
    return abs(p.x) if p is not None else 0.6

def finish_uv(c):
    for o in c.objects:
        if o.type == 'MESH':
            box_uv(o, scale=3.5)

# ---------------------------------------------------------------- Gà con: thân bốn múi, mỏ khâu hai mảnh, chân nỉ dẹt
def build_chick_plush():
    P = 'chick'
    c, root = start(P)
    M = mats_plush()
    yel = felt('chick_Felt', '#EED38F')
    wing = felt('chick_WingFelt', '#E7C474')
    org = felt('chick_Orange', '#E6A46C', strength=0.6)
    pink = felt('chick_CheekFelt', '#EFA7A8', strength=0.4)
    yb = 0.17
    def gore(deg):
        a = math.radians(deg)
        return ((0, 0, 0), (math.cos(a), 0, -math.sin(a)), lambda p: p.y > yb)
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 0.9, 0), R=1, size=(0.68, 0.74, 0.62)),
        dict(t='ELLIPSOID', co=(0, 0.55, 0.02), R=1, size=(0.62, 0.42, 0.57)),
    ], [gore(45), gore(-45), ((0, yb, 0), (0, 1, 0), None)], yel, pressure=240, seam_shrink=0.5, faces=2500,
        lumpy=0.015, seed=3, flat_bottom=0.07, depth=0.026, width=0.03, voxel=0.036)
    lob = min(v.co.z for v in body.data.vertices)
    feet = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        x = s * 0.22
        y = lob + 0.03
        el = [dict(t='ELLIPSOID', co=(x, y, 0.3), R=1, size=(0.1, 0.03, 0.1))]
        for a in (-35, 0, 35):
            r = math.radians(a)
            el.append(dict(t='ELLIPSOID', co=(x + math.sin(r) * 0.1, y, 0.36 + math.cos(r) * 0.1), R=1,
                           size=(0.042, 0.028, 0.08), rot=(0, a, 0), s=3))
        feet.append(piece(f'{P}_Foot{sd}', c, el, [((x, y, 0.36), (0, 1, 0), None)], org, pressure=50, seam_shrink=0.2,
                          voxel=0.018, faces=260, depth=0.004, width=0.008, res=0.012))
    lo = ground_all([body] + feet)
    # Mỏ: hai mảnh nỉ cam khâu ngang giữa.
    z, n = surface(body, 0, 0.86)
    beak = piece(f'{P}_Beak', c, [dict(t='ELLIPSOID', co=(0, 0.86, z + 0.015), R=1, size=(0.075, 0.055, 0.075), s=2.5),
                                  dict(t='ELLIPSOID', co=(0, 0.86, z + 0.065), R=1, size=(0.035, 0.03, 0.04), s=2.5)],
                 [((0, 0.86, 0), (0, 1, 0), None)], org, pressure=50, seam_shrink=0.25, voxel=0.014, faces=300,
                 depth=0.004, width=0.008, res=0.01)
    eyes_cheeks(P, c, body, 0.25, 1.02, 0.075, 0.09, 0.43, 0.86, pink, M)
    felt_mouth(P, c, body, 0.75, M, w=0.06, h=0.042)
    # Cánh là tay: nỉ hai lớp may viền, nhồi mỏng, xoè nhẹ.
    for s, sd in ((1, 'L'), (-1, 'R')):
        xs = side_x(body, 0.82, 0.06, s)
        pv = (s * (xs - 0.08), 0.98, 0.06)
        ac = (s * (xs + 0.03), 0.8, 0.08)
        a = piece(f'{P}_Arm{sd}', c, [dict(t='ELLIPSOID', co=ac, R=1, size=(0.09, 0.24, 0.15), rot=(0, -s * 25, s * 18))],
                  [(ac, (1, 0, 0), None)], wing, pressure=80, seam_shrink=0.22, voxel=0.024, faces=300,
                  depth=0.01, width=0.016)
        set_origin(a, pv)
    # Chỏm lông ba cánh nỉ (Stalk) và đuôi nỉ nhỏ sau lưng.
    top = top_of(body)
    el = []
    for a, h, w in ((-34, 0.2, 0.07), (0, 0.27, 0.085), (34, 0.2, 0.07)):
        r = math.radians(a)
        el.append(dict(t='ELLIPSOID', co=(math.sin(r) * h * 0.55, top - 0.05 + math.cos(r) * h * 0.55, 0.0), R=1,
                       size=(w, h * 0.6, 0.045), rot=(0, 0, -a), s=2.6))
    stalk = piece(f'{P}_Stalk', c, el, [((0, top, 0.0), (0, 0, 1), None)], wing, pressure=60, seam_shrink=0.25, voxel=0.016,
                  faces=420, depth=0.006, width=0.01, res=0.012)
    set_origin(stalk, (0, top - 0.03, 0))
    piece(f'{P}_Tail', c, [dict(t='ELLIPSOID', co=(0, 0.62, -0.62), R=1, size=(0.13, 0.08, 0.16), rot=(-35, 0, 0))],
          [((0, 0.62, -0.62), (1, 0, 0), None)], wing, pressure=50, seam_shrink=0.25, voxel=0.02, faces=200, depth=0.005,
          width=0.01, res=0.012)
    tag(P, c, body, 0.36, 0.0, 1, -24, M)
    finish_uv(c)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Mèo: thân mochi bè ngang, tai nỉ tam giác, ria thêu, đuôi vắt
def build_kitten_plush():
    P = 'kitten'
    c, root = start(P)
    M = mats_plush()
    blue = felt('kitten_Felt', '#AEB8CA')
    cream = felt('kitten_Cream', '#F2EBE0', strength=0.7)
    pink = felt('kitten_PinkFelt', '#EDB0AE', strength=0.4)
    stripe = felt('kitten_Stripe', '#8F9BB1', strength=0.6)
    thread = mat('kitten_Thread', '#6F7A90', rough=0.55, sheen=0.4, coat=0.0)
    nose_th = mat('kitten_NoseThread', '#D98C93', rough=0.5, sheen=0.3, coat=0.0)
    yb, zf = 0.16, -0.04
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 0.86, 0), R=1, size=(0.86, 0.66, 0.62)),
        dict(t='ELLIPSOID', co=(0, 0.48, 0.02), R=1, size=(0.8, 0.38, 0.58)),
    ], [((0, 0, zf), (0, 0, 1), lambda p: p.y > yb), ((0, yb, 0), (0, 1, 0), None)], blue, pressure=240, seam_shrink=0.5,
        faces=2500, lumpy=0.014, seed=5, flat_bottom=0.08, depth=0.026, width=0.03, voxel=0.036)
    ground_all([body])
    # Tai: tam giác bo tròn hai lớp nỉ may viền, lòng tai nỉ hồng.
    for s, sd in ((1, 'L'), (-1, 'R')):
        ang = s * 24
        a = math.radians(ang)
        d = (math.sin(a), math.cos(a))
        bx = s * 0.5
        p0, n0 = cast(body, (bx, 3.0, -0.04), (0, -1, 0))
        base = (bx, p0.y - 0.1, -0.04)
        el = [dict(t='ELLIPSOID', co=(base[0] + d[0] * dd, base[1] + d[1] * dd, base[2]), R=r, size=(1, 1, 0.42), s=2.4)
              for dd, r in ((0.07, 0.19), (0.2, 0.13), (0.31, 0.075))]
        ear = piece(f'{P}_Ear{sd}', c, el, [((0, 0, -0.04), (0, 0, 1), None)], blue, pressure=60, seam_shrink=0.22,
                    voxel=0.02, faces=300, depth=0.006, width=0.012, res=0.014)
        decal(f'{P}_EarIn{sd}', c, ear, base[0] + d[0] * 0.18, base[1] + d[1] * 0.18, 0.075, 0.11, 0.007, pink, n=1.8, seg=24,
              rings=[0.0, 0.45, 0.8, 0.93, 1.0], edge=0.3, tuck=0.005, rot=-a)
    muzzle = decal(f'{P}_Muzzle', c, body, 0, 0.8, 0.2, 0.125, 0.03, cream, dome=0.6, seg=36,
                   rings=[0.0, 0.3, 0.55, 0.75, 0.88, 0.96, 1.0], tuck=0.008)
    satin(f'{P}_Nose', c, muzzle, 0, 0.885, 6, 0.075, nose_th)
    eyes_cheeks(P, c, body, 0.29, 1.0, 0.078, 0.092, 0.5, 0.86, pink, M)
    felt_mouth(P, c, muzzle, 0.79, M, w=0.055, h=0.04)
    # Ria thêu: ba đường chỉ mỗi bên.
    wl = []
    for s in (1, -1):
        for dy in (0.035, 0.0, -0.035):
            wl += line_on(body, [(s * 0.22, 0.82 + dy * 0.6), (s * 0.42, 0.83 + dy * 1.6)], samples=30)[::1] + [None]
    segs, cur = [], []
    for p in wl:
        if p is None:
            segs.append(cur); cur = []
        else:
            cur.append(p)
    wh = [stitches(f'{P}_Wh{i}', c, sgm, thread, stitch=0.06, gap=0.016, width=0.008, height=0.004, closed=False)
          for i, sgm in enumerate(segs) if len(sgm) > 2]
    join_into(wh[0], wh[1:])
    wh[0].name = f'{P}_Whiskers'
    # Ba vằn nỉ trên trán.
    st = [decal(f'{P}_St{i}', c, body, x, y, 0.024, 0.075, 0.007, stripe, seg=16, rings=[0.0, 0.5, 0.85, 1.0], edge=0.3,
                tuck=0.004, rot=r) for i, (x, y, r) in enumerate(((-0.13, 1.3, 0.28), (0.0, 1.34, 0.0), (0.13, 1.3, -0.28)))]
    join_into(st[0], st[1:])
    st[0].name = f'{P}_Stripes'
    # Chân trước (tay) đặt trước bụng: vẫy lên như mèo thần tài.
    for s, sd in ((1, 'L'), (-1, 'R')):
        pv = (s * 0.36, 0.52, 0.42)
        a = piece(f'{P}_Arm{sd}', c, [dict(t='ELLIPSOID', co=(s * 0.38, 0.32, 0.5), R=1, size=(0.12, 0.16, 0.12))],
                  [((s * 0.38, 0.32, 0.5), (1, 0, 0), None)], blue, pressure=80, seam_shrink=0.22, voxel=0.022, faces=300,
                  depth=0.008, width=0.014)
        set_origin(a, pv)
    # Đuôi (Stalk): ống nỉ vắt lên bên trái, chóp kem.
    pts = [(-0.32, 0.3, -0.5), (-0.76, 0.33, -0.34), (-0.99, 0.56, -0.12), (-0.95, 0.86, 0.04)]
    tail = tube(f'{P}_Stalk', c, pts, 0.075, blue, radii=[1.1, 1.0, 0.95, 0.9], res=8, bev=3, cap=False)
    set_origin(tail, pts[0])
    tip = ellipsoid(f'{P}_TailTip', c, pts[-1], (0.072, 0.09, 0.072), cream, seg=16, rings=10)
    parent_keep(tip, tail)
    tag(P, c, body, 0.36, zf, 1, -24, M)
    finish_uv(c)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Gấu: teddy đầu ghép dải giữa, mõm khâu nổi, tai chén, bụng nỉ
def build_bear_plush():
    P = 'bear'
    c, root = start(P)
    M = mats_plush()
    honey = felt('bear_Felt', '#C49E7C')
    cream = felt('bear_Cream', '#EFE2CF', strength=0.7)
    inner = felt('bear_Inner', '#E2C4A4', strength=0.6)
    pink = felt('bear_CheekFelt', '#EDA8A4', strength=0.4)
    nose_th = mat('bear_NoseThread', '#4A3833', rough=0.45, sheen=0.2, coat=0.0)
    thread = mat('bear_Thread', '#A3815F', rough=0.55, sheen=0.4, coat=0.0)
    # đầu ngồi lún vào thân (teddy mập), mắt ngang tầm các con khác
    hc = (0, 0.92, 0.0)
    gy = hc[1] - 0.06
    head = piece(f'{P}_Head', c, [dict(t='ELLIPSOID', co=hc, R=1, size=(0.6, 0.52, 0.52))], [
        ((0.11, gy, 0), (1, -0.2, 0), lambda p: (p.y > hc[1] - 0.11) if p.z > 0 else (p.y > hc[1] - 0.44)),
        ((-0.11, gy, 0), (1, 0.2, 0), lambda p: (p.y > hc[1] - 0.11) if p.z > 0 else (p.y > hc[1] - 0.44)),
    ], honey, pressure=220, seam_shrink=0.45, faces=1750, voxel=0.034)
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 0.42, -0.02), R=1, size=(0.56, 0.42, 0.5)),
        dict(t='ELLIPSOID', co=(0, 0.25, 0.0), R=1, size=(0.6, 0.26, 0.52)),
    ], [((0, 0, -0.06), (0, 0, 1), lambda p: p.y > 0.1), ((0, 0.1, 0), (0, 1, 0), None)], honey, pressure=200,
        seam_shrink=0.42, voxel=0.034, faces=1000, flat_bottom=0.05)
    legs = [piece(f'{P}_Leg{sd}', c, [dict(t='ELLIPSOID', co=(s * 0.27, 0.15, 0.3), R=1, size=(0.17, 0.15, 0.25))],
                  [((s * 0.15, 0.15, 0.3), (1, 0, 0), None)], honey, pressure=120, seam_shrink=0.3, voxel=0.028, faces=300,
                  depth=0.012, width=0.018) for s, sd in ((1, 'L'), (-1, 'R'))]
    lo = ground_all([head, body] + legs)
    hy = hc[1] - lo
    # Mõm nỉ kem khâu nổi, đường may giữa mõm.
    zm, nm = surface(head, 0, hy - 0.13)
    muzzle = piece(f'{P}_Muzzle', c, [dict(t='ELLIPSOID', co=(0, hy - 0.13, zm - 0.06), R=1, size=(0.21, 0.15, 0.13))],
                   [], cream, pressure=60, voxel=0.02, faces=360)
    satin(f'{P}_Nose', c, muzzle, 0, hy - 0.06, 7, 0.1, nose_th, step=0.0095)
    felt_mouth(P, c, muzzle, hy - 0.17, M, w=0.055, h=0.04)
    eyes_cheeks(P, c, head, 0.23, hy + 0.04, 0.07, 0.082, 0.39, hy - 0.08, pink, M, depth=0.042)
    # Tai chén: nỉ hai lớp may viền, lòng tai nỉ sáng.
    for s, sd in ((1, 'L'), (-1, 'R')):
        ec = (s * 0.44, hy + 0.42, -0.06)
        ear = piece(f'{P}_Ear{sd}', c, [dict(t='ELLIPSOID', co=ec, R=1, size=(0.17, 0.155, 0.075), rot=(0, 0, -s * 22))],
                    [(ec, (0, 0, 1), None)], honey, pressure=70, seam_shrink=0.25, voxel=0.02, faces=320, depth=0.007,
                    width=0.012)
        decal(f'{P}_EarIn{sd}', c, ear, ec[0] + s * 0.01, ec[1] - 0.01, 0.09, 0.08, 0.008, inner, seg=24,
              rings=[0.0, 0.45, 0.8, 0.93, 1.0], edge=0.3, tuck=0.005)
    # Bụng nỉ kem khâu đè, gan bàn chân nỉ kem.
    belly = decal(f'{P}_Belly', c, body, 0, 0.36 - lo, 0.21, 0.16, 0.012, cream, edge=0.25, seg=40,
                  rings=[0.0, 0.35, 0.65, 0.85, 0.95, 1.0], tuck=0.006)
    stitches(f'{P}_BellySt', c, outline_on(belly, 0, 0.36 - lo, 0.21, 0.16, rho=0.86, samples=120), thread,
             stitch=0.03, gap=0.02)
    for s, sd in ((1, 'L'), (-1, 'R')):
        decal(f'{P}_Pad{sd}', c, legs[0 if s > 0 else 1], s * 0.27, 0.155 - lo, 0.085, 0.08, 0.01, cream, edge=0.3, seg=24,
              rings=[0.0, 0.5, 0.8, 0.93, 1.0], tuck=0.004)
    for s, sd in ((1, 'L'), (-1, 'R')):
        pv = (s * 0.46, 0.6 - lo, 0.06)
        a = piece(f'{P}_Arm{sd}', c, [dict(t='ELLIPSOID', co=(s * 0.56, 0.4 - lo, 0.14), R=1, size=(0.12, 0.22, 0.13),
                                           rot=(-10, 0, s * 18))],
                  [((s * 0.56, 0.4 - lo, 0.14), (1, 0, 0), None)], honey, pressure=120, seam_shrink=0.22, voxel=0.026,
                  faces=300, depth=0.012, width=0.018)
        set_origin(a, pv)
    empty(f'{P}_Stalk', c, (0, top_of(head) - 0.02, 0), 0.06)
    tag(P, c, body, 0.3 - lo, -0.06, 1, -24, M)
    finish_uv(c)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Mầm: hạt giọt nước ba mảnh, mầm nỉ hai lá có gân chỉ
def build_sprout_plush():
    P = 'sprout'
    c, root = start(P)
    M = mats_plush()
    sage = felt('sprout_Felt', '#C2D2A8')
    leafg = felt('sprout_Leaf', '#8BB772', strength=0.7)
    stemg = felt('sprout_Stem', '#9CC07F', strength=0.6)
    pink = felt('sprout_CheekFelt', '#EFA9A6', strength=0.4)
    vein = mat('sprout_Vein', '#E8F1D8', rough=0.55, sheen=0.4, coat=0.0)
    yb = 0.15
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 0.8, 0), R=1, size=(0.7, 0.66, 0.6)),
        dict(t='ELLIPSOID', co=(0, 1.2, 0), R=1, size=(0.42, 0.48, 0.38)),
        dict(t='ELLIPSOID', co=(0, 0.46, 0.02), R=1, size=(0.62, 0.36, 0.55)),
    ], [((0.34, 0, 0), (1, 0, 0), lambda p: p.z > -0.05 and p.y > yb),
        ((-0.34, 0, 0), (1, 0, 0), lambda p: p.z > -0.05 and p.y > yb),
        ((0, 0, 0), (1, 0, 0), lambda p: p.z < -0.05 and p.y > yb),
        ((0, yb, 0), (0, 1, 0), None)], sage, pressure=240, seam_shrink=0.5, faces=2500, lumpy=0.015, seed=7,
        flat_bottom=0.07, depth=0.026, width=0.03, voxel=0.036)
    lob = min(v.co.z for v in body.data.vertices)
    feet = [piece(f'{P}_Foot{sd}', c, [dict(t='ELLIPSOID', co=(s * 0.25, lob + 0.06, 0.32), R=1, size=(0.15, 0.09, 0.16))],
                  [((s * 0.25, lob + 0.06, 0.32), (0, 1, 0), None)], sage, pressure=80, seam_shrink=0.3, voxel=0.024,
                  faces=220, depth=0.008, width=0.014) for s, sd in ((1, 'L'), (-1, 'R'))]
    ground_all([body] + feet)
    eyes_cheeks(P, c, body, 0.24, 1.0, 0.075, 0.09, 0.42, 0.84, pink, M)
    felt_mouth(P, c, body, 0.78, M, w=0.058, h=0.042)
    for s, sd in ((1, 'L'), (-1, 'R')):
        xs = side_x(body, 0.7, 0.08, s)
        pv = (s * (xs - 0.07), 0.84, 0.08)
        ac = (s * (xs + 0.02), 0.68, 0.1)
        a = piece(f'{P}_Arm{sd}', c, [dict(t='ELLIPSOID', co=ac, R=1, size=(0.1, 0.17, 0.1), rot=(0, 0, s * 18))],
                  [(ac, (1, 0, 0), None)], sage, pressure=90, seam_shrink=0.22, voxel=0.022, faces=260,
                  depth=0.008, width=0.014)
        set_origin(a, pv)
    # Mầm (Stalk): thân nỉ cuộn và hai lá nỉ may viền, gân lá chỉ sáng.
    top = top_of(body)
    st_pts = [(0, top - 0.05, 0.0), (0.015, top + 0.1, 0.0), (0.0, top + 0.19, 0.01)]
    stem = tube(f'{P}_Stalk', c, st_pts, 0.032, stemg, radii=[1.25, 1.0, 0.9], res=6, bev=2, cap=True)
    set_origin(stem, (0, top - 0.03, 0.0))
    ty = top + 0.17
    for s, sd in ((1, 'L'), (-1, 'R')):
        ang = s * 62
        a = math.radians(ang)
        d = (math.sin(a), math.cos(a))
        # lá nỉ mỏng: dựng thẳng từ khối giọt (không qua voxel vì lá mỏng hơn ô voxel), rãnh may viền quanh mép
        b0 = (0.0, ty, 0.01)
        pt = petal(f'tmp_leaf{sd}', c, leafg, b0, ang, 0.36, 0.2, thick=0.28, tip=0.22, power=1.5, tilt=-18, bend=0.12, level=3)
        nrm = (Matrix.Rotation(-a, 3, 'Z') @ Matrix.Rotation(math.radians(18), 3, 'X')) @ Vector((0, 0, 1))
        mid = (b0[0] + d[0] * 0.18, b0[1] + d[1] * 0.18, b0[2])
        lf = piece(f'{P}_Leaf{sd}', c, pt, [(mid, tuple(nrm), None)], leafg, faces=None, depth=0.004, width=0.008,
                   puff=False, remesh=False)
        vl = stitches(f'{P}_Vein{sd}', c, line_on(lf, [(d[0] * 0.06, ty + d[1] * 0.06), (d[0] * 0.3, ty + d[1] * 0.3)],
                                                     samples=30), vein, stitch=0.03, gap=0.015, width=0.008,
                      height=0.004, closed=False)
        parent_keep(lf, stem)
        parent_keep(vl, stem)
    tag(P, c, body, 0.34, 0.0, 1, -24, M)
    finish_uv(c)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Cơm nắm: gối tam giác hai mặt + dải hông, rong biển nỉ, hạt cơm thêu
def build_riceball_plush():
    P = 'riceball'
    c, root = start(P)
    M = mats_plush()
    rice = felt('riceball_Felt', '#F1ECE2')
    nori = felt('riceball_Nori', '#3D4B41', strength=0.7)
    pink = felt('riceball_CheekFelt', '#EFA7A8', strength=0.4)
    nth = mat('riceball_NoriThread', '#93A596', rough=0.55, sheen=0.4, coat=0.0)
    gth = mat('riceball_Grain', '#FFFFFF', rough=0.5, sheen=0.4, coat=0.0)
    base = onigiri('tmp_onigiri', c, rice, W=0.92, H=0.86, depth=0.44, m=3.2, cy=0.84)
    zf = 0.25
    body = piece(f'{P}_Body', c, base, [((0, 0, zf), (0, 0, 1), None), ((0, 0, -zf), (0, 0, 1), None)], rice, pressure=220,
                 seam_shrink=0.45, faces=2600, voxel=0.034, depth=0.024, width=0.028, flat_bottom=0.06)
    ground_all([body])
    sheet = decal(f'{P}_Nori', c, body, 0, 0.3, 0.3, 0.27, 0.012, nori, n=6.0, edge=0.15, seg=48,
                  rings=[0.0, 0.35, 0.65, 0.85, 0.95, 1.0], tuck=0.006)
    stitches(f'{P}_NoriSt', c, outline_on(sheet, 0, 0.3, 0.3, 0.27, n=6.0, rho=0.86, samples=160), nth, stitch=0.03, gap=0.02)
    eyes_cheeks(P, c, body, 0.24, 1.0, 0.075, 0.09, 0.42, 0.84, pink, M)
    felt_mouth(P, c, body, 0.73, M, w=0.058, h=0.042)
    rnd = random.Random(9)
    spots = [(x, y, rnd.uniform(0, 180)) for x, y in ((-0.5, 0.82), (0.52, 0.86), (-0.22, 1.38), (0.2, 1.45), (0.62, 0.55),
                                                        (-0.64, 0.5), (0.36, 1.18), (-0.36, 1.12), (0.0, 1.55), (0.08, 1.24))]
    single_stitches(f'{P}_Grains', c, body, spots, gth, length=0.042, width=0.018, height=0.009)
    for s, sd in ((1, 'L'), (-1, 'R')):
        xs = side_x(body, 0.7, 0.06, s)
        pv = (s * (xs - 0.07), 0.84, 0.06)
        ac = (s * (xs + 0.02), 0.68, 0.08)
        a = piece(f'{P}_Arm{sd}', c, [dict(t='ELLIPSOID', co=ac, R=1, size=(0.11, 0.16, 0.11), rot=(0, 0, s * 18))],
                  [(ac, (1, 0, 0), None)], rice, pressure=90, seam_shrink=0.22, voxel=0.022, faces=260,
                  depth=0.008, width=0.014)
        set_origin(a, pv)
    empty(f'{P}_Stalk', c, (0, top_of(body) - 0.02, 0), 0.06)
    tag(P, c, body, 0.3, zf, 1, -24, M)
    finish_uv(c)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Ngôi sao: gối sao hai mặt + dải hông, cánh ngang là tay, lấp lánh thêu
def build_star_plush():
    P = 'star'
    c, root = start(P)
    M = mats_plush()
    gold = felt('star_Felt', '#EAC77F')
    pink = felt('star_CheekFelt', '#EFA7A8', strength=0.4)
    sth = mat('star_Thread', '#FFF6E2', rough=0.5, sheen=0.4, coat=0.0)
    base = star_body('tmp_star', c, gold, 0.0, depth=0.3, m=2.6, level=5)
    zf = 0.17
    body = piece(f'{P}_Body', c, base, [((0, 0, zf), (0, 0, 1), None), ((0, 0, -zf), (0, 0, 1), None)], gold, pressure=200,
                 seam_shrink=0.45, faces=2600, voxel=0.032, depth=0.022, width=0.026)
    lo = ground_all([body])
    cy = -lo
    eyes_cheeks(P, c, body, 0.21, cy + 0.1, 0.07, 0.085, 0.37, cy - 0.04, pink, M, depth=0.042)
    felt_mouth(P, c, body, cy - 0.1, M, w=0.055, h=0.04)
    for s, sd, ang in ((1, 'L', 18), (-1, 'R', 162)):
        r = math.radians(ang)
        b0 = (math.cos(r) * 0.3, cy + math.sin(r) * 0.3, 0)
        pt = petal(f'tmp_arm{sd}', c, gold, b0, s * (90 - 18), 0.76, 0.6, thick=0.55, tip=0.42, power=1.2, level=4)
        a = piece(f'{P}_Arm{sd}', c, pt, [((0, 0, 0), (0, 0, 1), None)], gold, pressure=90, seam_shrink=0.3, voxel=0.024,
                  faces=380, depth=0.01, width=0.016)
        set_origin(a, (math.cos(r) * 0.42, cy + math.sin(r) * 0.42, 0))
    # Hai ngôi sao nhỏ thêu chỉ kem.
    spots = []
    for x, y, L in ((0.0, cy + 0.6, 0.075), (-0.28, cy - 0.44, 0.055), (0.3, cy - 0.42, 0.045)):
        spots += [(x, y, 90), (x, y, 0), (x, y, 45), (x, y, 135)]
    single_stitches(f'{P}_Sparkle', c, body, spots[:4], sth, length=0.11, width=0.016, height=0.007)
    single_stitches(f'{P}_Sparkle2', c, body, spots[4:8], sth, length=0.08, width=0.014, height=0.007)
    empty(f'{P}_Stalk', c, (0, top_of(body) - 0.02, 0), 0.06)
    tag(P, c, body, cy - 0.3, zf, 1, -30, M)
    finish_uv(c)
    finish(P, c, root)
    return c

PLUSH.update({'chick': build_chick_plush, 'kitten': build_kitten_plush, 'bear': build_bear_plush,
              'sprout': build_sprout_plush, 'riceball': build_riceball_plush, 'star': build_star_plush})
