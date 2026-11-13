# Linh vật thú bông vải nỉ: Mây và thỏ. Chạy sau mk.py, lib.py, plush.py (qua run_plush.py).
# Mỗi món là mảnh vải ráp theo đường may rồi bơm phồng (Cloth + Pressure); mắt nút nhựa bóng, má và mặt là nỉ khâu đè có mũi chỉ.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

FELT_IMG = os.path.abspath(os.path.join(D, '..', '..', 'app', 'public', 'mascots', 'felt-normal.jpg'))

def felt(name, hexs, strength=1.0, rough=0.9):
    return felt_mat(name, hexs, normal_img=FELT_IMG, rough=rough, sheen=1.0, strength=strength)

def piece(name, c, elems, seams, material, pressure=200, seam_shrink=0.45, voxel=0.04, frames=30, bending=0.1,
          grow=1, faces=None, res=0.03, lumpy=0.0, seed=1, flat_bottom=None, depth=0.022, width=0.03, pin=False,
          puff=True, remesh=True):
    """Một mảnh thú bông: dáng gốc metaball -> cắt đường may -> bơm phồng -> giảm đa giác -> UV hộp.
    flat_bottom: bề dày lớp đáy (theo trục đứng) bị đè bẹt như thú bông ngồi trên bàn."""
    if isinstance(elems, bpy.types.Object):
        # dáng gốc là một lưới dựng sẵn (sao, cơm nắm...): đưa về lưới ô đều rồi may như thường
        o = elems
        o.name = name
        o.data.materials.clear()
        o.data.materials.append(material)
        if remesh:
            add_mod(o, 'REMESH', mode='VOXEL', voxel_size=voxel, use_smooth_shade=True)
            apply_mods(o)
    else:
        o = pattern(name, c, elems, voxel=voxel, res=res, material=material, lumpy=lumpy, seed=seed)
    idx = cut_seams(o, seams) if seams else []
    if grow and idx:
        grow_group(o, 'seam', rings=grow, falloff=0.5)
    if puff:
        inflate(o, pressure=pressure, frames=frames, pin='seam' if pin and idx else None,
                seam_shrink=seam_shrink if idx else 0.0, bending=bending, pin_stiff=0.6)
    if depth and idx:
        deepen_seams(o, idx, depth=depth, width=width)
    if flat_bottom:
        lo = min(v.co.z for v in o.data.vertices)
        cut = lo + flat_bottom
        for v in o.data.vertices:
            if v.co.z < cut:
                k = (cut - v.co.z) / flat_bottom
                v.co.z = cut - flat_bottom * 0.4 * (1 - (1 - k) ** 2)
                v.co.x *= 1 + 0.05 * k
                v.co.y *= 1 + 0.05 * k
    if faces:
        decimate_keep(o, faces)
    return o

def stitch_bm(bm, p, t, n, length, width, height):
    """Một mũi chỉ hình hạt thoi nằm trên mặt vải: p tâm, t hướng đường chỉ, n pháp tuyến (Vector Blender)."""
    b = n.cross(t).normalized()
    a = bm.verts.new(p - t * length / 2)
    z = bm.verts.new(p + t * length / 2)
    r = [bm.verts.new(p + b * width / 2), bm.verts.new(p + n * height), bm.verts.new(p - b * width / 2),
         bm.verts.new(p - n * height * 0.4)]
    for i in range(4):
        bm.faces.new((a, r[i], r[(i + 1) % 4]))
        bm.faces.new((z, r[(i + 1) % 4], r[i]))

def stitches(name, c, path, material, stitch=0.032, gap=0.02, width=0.011, height=0.006, closed=True):
    """Đường mũi chỉ chạy (running stitch) dọc path: [(p glTF, n glTF)]."""
    pts = [(V(*p), V(*n).normalized()) for p, n in path]
    if closed:
        pts.append(pts[0])
    bm = bmesh.new()
    acc, on = 0.0, True
    seg_start = None
    for i in range(len(pts) - 1):
        p0, n0 = pts[i]
        p1, n1 = pts[i + 1]
        L = (p1 - p0).length
        if L < 1e-9:
            continue
        d = 0.0
        while d < L:
            need = (stitch if on else gap) - acc
            if d + need <= L:
                d += need
                q = p0.lerp(p1, d / L)
                if on and seg_start is not None:
                    mid = (seg_start + q) / 2
                    t = (q - seg_start)
                    if t.length > 1e-6:
                        nn = n0.lerp(n1, d / L).normalized()
                        stitch_bm(bm, mid + nn * 0.002, t.normalized(), nn, t.length, width, height)
                    seg_start = None
                elif not on:
                    seg_start = q
                on = not on
                acc = 0.0
            else:
                acc += L - d
                d = L
    return mesh_obj(name, bm, c, material)

def outline_on(target, cx, cy, ax, ay, n=2.0, rho=0.86, samples=140, rot=0.0):
    """Các điểm (p, pháp tuyến) theo viền siêu elip trên mặt trước của target (bắn tia từ phía trước)."""
    cr, sr = math.cos(rot), math.sin(rot)
    out = []
    for j in range(samples):
        th = 2 * math.pi * j / samples
        co, si = math.cos(th), math.sin(th)
        ex = 2.0 / n
        u = ax * rho * math.copysign(abs(co) ** ex, co)
        v = ay * rho * math.copysign(abs(si) ** ex, si)
        x, y = cx + u * cr - v * sr, cy + u * sr + v * cr
        z, nr = surface(target, x, y)
        if z is not None:
            out.append(((x, y, z), nr))
    return out

def set_center_origin(o):
    upd()
    me = o.data
    cen = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    w = o.matrix_world @ cen
    set_origin(o, (w.x, w.z, -w.y))

def safety_eye(name, c, target, x, y, rx, ry, material, depth=0.05, inset=0.012):
    """Mắt nút nhựa (safety eye): vòm đen bóng gắn vào vải."""
    e = ellipsoid(name, c, (0, 0, 0), (rx, ry, depth), material, seg=20, rings=12)
    place_on(target, e, x, y, inset=-inset)
    e.rotation_euler.x *= 0.5
    return e

def felt_mouth(P, c, target, y, M, w=0.075, h=0.05):
    """Miệng nỉ tối (ẩn tới khi nói), có lưỡi nỉ hồng; trục z của nó dựng đứng để bộ chuyển động kéo mở dọc."""
    m = ellipsoid(f'{P}_Mouth', c, (0, 0, 0), (w, h, 0.02), M['mouth'], seg=16, rings=8)
    z, n = surface(target, 0, y)
    m.location = V(0, y, z - 0.006)
    t = ellipsoid(f'{P}_Tongue', c, (0, 0, 0), (w * 0.6, h * 0.48, 0.014), M['tongue'], seg=10, rings=6)
    t.location = V(0, y - h * 0.42, z + 0.006)
    zup(m)
    parent_keep(t, m)
    return m

def tag(P, c, body, y, zseam, side, roll, M, text='Sweet Home', out=0.06):
    """Nhãn vải nhỏ gài vào đường may hông (mặt phẳng z = zseam), thò ra ngoài, mặt in chữ Sweet Home hướng về trước."""
    w, h, t = 0.17, 0.058, 0.005
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, t, h), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges], offset=0.0018, segments=1, affect='EDGES')
    o = mesh_obj(f'{P}_Tag', bm, c, M['tag'], smooth=False)
    cu = bpy.data.curves.new(f'{P}TagTxt', 'FONT')
    cu.body = text
    cu.size = 0.022
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 2
    cu.extrude = 0.0006
    to = bpy.data.objects.new(f'{P}TagTxtTmp', cu)
    c.objects.link(to)
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(to.evaluated_get(dg))
    bpy.data.objects.remove(to, do_unlink=True)
    bpy.data.curves.remove(cu)
    txt = bpy.data.objects.new(f'{P}_TagText', me)
    c.objects.link(txt)
    me.materials.append(M['ink'])
    # chữ nằm trên mặt trước của nhãn (mặt -Y của Blender = hướng ra ngoài)
    me.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
    me.transform(Matrix.Translation((0, -t / 2 - 0.0008, 0)))
    p, n = cast(body, (side * 3, y, zseam), (-side, 0, 0))
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0, -math.radians(roll * side), 0)
    o.location = V(p.x + side * out, p.y - 0.012, zseam)
    # chữ quá nhỏ để đọc trong app (cỡ 2 px) nên không xuất vào GLB, chỉ hiện trong ảnh render
    txt.parent = o
    txt['noexport'] = True
    return o

def mats_plush():
    return dict(
        eye=mat('PlushEye', '#0B090C', rough=0.12, sheen=0.0, coat=0.0),
        mouth=felt('PlushMouth', '#5A2E3A'),
        tongue=felt('PlushTongue', '#E58E92'),
        tag=felt('PlushTag', '#FBF8F2', strength=0.25),
        ink=mat('PlushInk', '#5B566E', rough=0.7, sheen=0.0, coat=0.0),
    )

# ---------------------------------------------------------------- Mây thú bông
def build_cloud_plush():
    P = 'cloud'
    c, root = start(P)
    M = mats_plush()
    lilac = felt('cloud_Felt', '#B5A7D8')
    cream = felt('cloud_FaceFelt', '#F3E9DA', strength=0.7)
    pink = felt('cloud_CheekFelt', '#EFA7A8', strength=0.4)
    thread = mat('cloud_Thread', '#9C88CC', rough=0.55, sheen=0.4, coat=0.0)
    # Thân: mảnh trước to, hai mảnh lưng ráp giữa lưng, đế bầu dục; bơm phồng cho đường may thắt lõm.
    yb = 0.2
    zf = 0.27
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 1.02, 0), R=1, size=(0.72, 0.8, 0.6)),
        dict(t='ELLIPSOID', co=(0, 0.62, 0.0), R=1, size=(0.62, 0.42, 0.54)),
    ], [((0, 0, zf), (0, 0, 1), lambda p: p.y > yb),
        ((0, 0, 0), (1, 0, 0), lambda p: p.z < zf and p.y > yb),
        ((0.3, 1.5, 0), (1, 0, 0), lambda p: p.y > 1.42 and p.z < zf),
        ((-0.3, 1.5, 0), (1, 0, 0), lambda p: p.y > 1.42 and p.z < zf),
        ((0, yb, 0), (0, 1, 0), None)], lilac, pressure=260, seam_shrink=0.5, faces=2450, lumpy=0.018, seed=2,
        flat_bottom=0.08, depth=0.028, width=0.032, voxel=0.036)
    lo = min(v.co.z for v in body.data.vertices)
    # Hai bàn chân gối nhỏ dưới đáy.
    feet = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        f = piece(f'{P}_Foot{sd}', c, [dict(t='ELLIPSOID', co=(s * 0.3, lo + 0.12, 0.16), R=1, size=(0.2, 0.12, 0.24))],
                  [((s * 0.3, lo + 0.12, 0.16), (0, 1, 0), None)], lilac, pressure=120, seam_shrink=0.4, voxel=0.032, faces=230,
                  depth=0.012, width=0.018)
        feet.append(f)
    allp = [body] + feet
    lo = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in allp)
    for o in allp:
        o.data.transform(Matrix.Translation((0, 0, -lo)))
    # Mặt nỉ kem khâu đè, mũi chỉ tím chạy quanh mép.
    plate = decal(f'{P}_Face', c, body, 0, 1.02, 0.6, 0.5, 0.024, cream, n=2.15, edge=0.22, seg=52,
                  rings=[0.0, 0.3, 0.6, 0.8, 0.9, 0.96, 1.0], tuck=0.01)
    st = stitches(f'{P}_FaceStitch', c, outline_on(plate, 0, 1.02, 0.6, 0.5, n=2.15, rho=0.93, samples=180), thread,
                  stitch=0.038, gap=0.024)
    eyes = [safety_eye(f'{P}_Eye{sd}', c, plate, s * 0.24, 1.04, 0.088, 0.104, M['eye']) for s, sd in ((1, 'L'), (-1, 'R'))]
    cheeks = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch = decal(f'{P}_Cheek{sd}', c, plate, s * 0.4, 0.88, 0.085, 0.06, 0.01, pink, edge=0.25, seg=28,
                   rings=[0.0, 0.5, 0.8, 0.93, 1.0], tuck=0.004)
        set_center_origin(ch)
        cheeks.append(ch)
    felt_mouth(P, c, plate, 0.83, M)
    # Tay: găng nỉ hai lớp may viền, nhồi vừa, rủ xuống.
    arms = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        pv = (s * 0.8, 0.98, 0.1)
        a = piece(f'{P}_Arm{sd}', c, [
            dict(t='ELLIPSOID', co=(s * 0.9, 0.8, 0.12), R=1, size=(0.12, 0.23, 0.13), rot=(0, 0, s * 20)),
        ], [((s * 0.9, 0.8, 0.12), (1, 0, 0), None)], lilac, pressure=120, seam_shrink=0.22, voxel=0.03, faces=300,
            depth=0.012, width=0.018)
        set_origin(a, pv)
        arms.append(a)
    # Ăng-ten nỉ cuộn và quả bóng nỉ bốn múi (Ball sáng khi lắng nghe).
    top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
    stalk = tube(f'{P}_Stalk', c, [(0, top - 0.06, 0.02), (0.02, top + 0.12, 0.0), (0.06, top + 0.27, -0.03)], 0.032, lilac,
                 radii=[1.3, 1.0, 0.85], cap=False, res=6, bev=2)
    set_origin(stalk, (0, top - 0.02, 0.02))
    bc = (0.07, top + 0.37, -0.035)
    ball = piece(f'{P}_Ball', c, [dict(t='BALL', co=bc, R=0.12)],
                 [(bc, (1, 0, 0), None), (bc, (0, 0, 1), None)], felt('cloud_BallFelt', '#CDBEF0'),
                 pressure=60, seam_shrink=0.12, voxel=0.024, faces=240, depth=0.006, width=0.012)
    set_center_origin(ball)
    parent_keep(ball, stalk)
    tg = tag(P, c, body, 0.42, zf - 0.02, 1, -24, M)
    for o in [body, plate, ball, stalk, tg] + arms + feet + cheeks:
        if o.data.materials and 'Felt' in o.data.materials[0].name:
            pass
    for o in c.objects:
        if o.type == 'MESH':
            box_uv(o, scale=3.5)
    finish(P, c, root)
    return c

# ---------------------------------------------------------------- Thỏ thú bông
def build_bunny_plush():
    P = 'bunny'
    c, root = start(P)
    M = mats_plush()
    oat = felt('bunny_Felt', '#E7DAC8')
    pink = felt('bunny_PinkFelt', '#EDB5B2', strength=0.4)
    thread = mat('bunny_Thread', '#C98F96', rough=0.55, sheen=0.4, coat=0.0)
    nose_th = mat('bunny_NoseThread', '#D98C93', rough=0.5, sheen=0.3, coat=0.0)
    # Đầu: hai mảnh hông + dải giữa trán (gusset) chạy từ mũi qua đỉnh đầu ra sau gáy.
    hc = (0, 1.12, 0.0)
    head = piece(f'{P}_Head', c, [dict(t='ELLIPSOID', co=hc, R=1, size=(0.62, 0.56, 0.56))], [
        ((0.12, 1.0, 0), (1, -0.2, 0), lambda p: (p.y > 0.93) if p.z > 0 else (p.y > 0.66)),
        ((-0.12, 1.0, 0), (1, 0.2, 0), lambda p: (p.y > 0.93) if p.z > 0 else (p.y > 0.66)),
    ], oat, pressure=200, seam_shrink=0.45, faces=2050)
    # Thân ngồi hình quả lê, đế bầu dục.
    body = piece(f'{P}_Body', c, [
        dict(t='ELLIPSOID', co=(0, 0.42, -0.04), R=1, size=(0.5, 0.4, 0.44)),
        dict(t='ELLIPSOID', co=(0, 0.26, -0.02), R=1, size=(0.54, 0.26, 0.48)),
    ], [((0, 0, -0.08), (0, 0, 1), lambda p: p.y > 0.1), ((0, 0.1, 0), (0, 1, 0), None)], oat,
        pressure=180, seam_shrink=0.4, voxel=0.035, faces=820)
    # Hai chân duỗi ra trước, gan bàn chân nỉ hồng hướng về người xem.
    legs, pads = [], []
    for s, sd in ((1, 'L'), (-1, 'R')):
        lg = piece(f'{P}_Leg{sd}', c, [
            dict(t='ELLIPSOID', co=(s * 0.24, 0.14, 0.28), R=1, size=(0.17, 0.14, 0.27)),
        ], [((s * 0.24, 0.14, 0.28), (1, 0, 0), None)], oat, pressure=120, seam_shrink=0.35, voxel=0.028, faces=290,
            depth=0.012, width=0.018)
        legs.append(lg)
    allp = [head, body] + legs
    lo = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in allp)
    for o in allp:
        o.data.transform(Matrix.Translation((0, 0, -lo)))
    for s, sd in ((1, 'L'), (-1, 'R')):
        pads.append(decal(f'{P}_Pad{sd}', c, legs[0 if s > 0 else 1], s * 0.24, 0.145 - lo, 0.085, 0.08, 0.01, pink, edge=0.3,
                          seg=24, rings=[0.0, 0.5, 0.8, 0.93, 1.0], tuck=0.004))
    eyes = [safety_eye(f'{P}_Eye{sd}', c, head, s * 0.24, 1.08 - lo, 0.072, 0.082, M['eye'], depth=0.045)
            for s, sd in ((1, 'L'), (-1, 'R'))]
    cheeks = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch = decal(f'{P}_Cheek{sd}', c, head, s * 0.39, 0.94 - lo, 0.075, 0.052, 0.009, pink, edge=0.25, seg=24,
                   rings=[0.0, 0.5, 0.8, 0.93, 1.0], tuck=0.004)
        set_center_origin(ch)
        cheeks.append(ch)
    # Mũi thêu chỉ hồng: tam giác ngược từ các mũi chỉ ngang (satin stitch).
    zt, nt_ = surface(head, 0, 0.985 - lo)
    bm = bmesh.new()
    for i in range(7):
        yy = 0.985 - lo - i * 0.0085
        half = 0.045 * (1 - i / 7.5)
        z, n = surface(head, 0, yy)
        stitch_bm(bm, V(0, yy, z + 0.003), Vector((1, 0, 0)), V(*n).normalized(), half * 2, 0.011, 0.007)
    nose = mesh_obj(f'{P}_Nose', bm, c, nose_th)
    felt_mouth(P, c, head, 0.9 - lo, M, w=0.06, h=0.042)
    # Tay mềm rủ dọc thân.
    arms = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        pv = (s * 0.4, 0.6 - lo, 0.08)
        a = piece(f'{P}_Arm{sd}', c, [
            dict(t='ELLIPSOID', co=(s * 0.5, 0.4 - lo, 0.18), R=1, size=(0.12, 0.24, 0.13), rot=(-14, 0, s * 18)),
        ], [((s * 0.5, 0.4 - lo, 0.18), (1, 0, 0), None)], oat, pressure=120, seam_shrink=0.22, voxel=0.026, faces=290,
            depth=0.012, width=0.018)
        set_origin(a, pv)
        arms.append(a)
    # Tai (Stalk): hai lớp nỉ may viền, nhồi mỏng, lòng tai nỉ hồng khâu đè; tai trái màn hình gập mũi.
    stalk = empty(f'{P}_Stalk', c, (hc[0], hc[1] - lo, hc[2]), 0.08)
    htop = max((head.matrix_world @ v.co).z for v in head.data.vertices)
    for s, sd in ((1, 'L'), (-1, 'R')):
        ang = s * 10
        a = math.radians(ang)
        base = (s * 0.2, htop - 0.14, -0.06)
        mid = (base[0] + math.sin(a) * 0.32, base[1] + math.cos(a) * 0.32, base[2])
        ear = piece(f'{P}_Ear{sd}', c, [dict(t='ELLIPSOID', co=mid, R=1, size=(0.145, 0.39, 0.065), rot=(0, 0, -ang))],
                    [(mid, (0, 0, 1), None)], oat, pressure=90, seam_shrink=0.18, voxel=0.026, faces=340,
                    depth=0.01, width=0.016)
        inner = decal(f'{P}_EarIn{sd}', c, ear, mid[0], mid[1], 0.062, 0.21, 0.008,
                      pink, seg=32, rings=[0.0, 0.4, 0.75, 0.92, 1.0], edge=0.3, tuck=0.006, rot=-a)
        # mũi chỉ chạy quanh miếng nỉ hồng lòng tai
        est = stitches(f'{P}_EarSt{sd}', c, outline_on(inner, mid[0], mid[1], 0.062, 0.21, rho=0.8, samples=90, rot=-a),
                       thread, stitch=0.024, gap=0.016, width=0.008, height=0.004)
        if s < 0:
            hinge = Vector((base[0] + math.sin(a) * 0.5, base[1] + math.cos(a) * 0.5, base[2]))
            axis_dir = Vector((math.sin(a), math.cos(a), 0))
            def fold(p, hinge=hinge, axis_dir=axis_dir):
                t = (p - hinge).dot(axis_dir)
                k = smoothstep(-0.03, 0.12, t)
                q = rot_about(p, hinge, Vector((0, 0, 1)), math.radians(38) * k)
                return rot_about(q, hinge, Vector((1, 0, 0)), math.radians(16) * k)
            deform(ear, fold)
            deform(inner, fold)
            deform(est, fold)
        for o in (ear, inner, est):
            parent_keep(o, stalk)
    tail = piece(f'{P}_Tail', c, [dict(t='BALL', co=(0, 0.3 - lo, -0.5), R=0.13)], [((0, 0.3 - lo, -0.5), (1, 0, 0), None)], oat,
                 pressure=60, seam_shrink=0.3, voxel=0.024, faces=150)
    tg = tag(P, c, body, 0.24, -0.08, 1, -24, M)
    for o in c.objects:
        if o.type == 'MESH':
            box_uv(o, scale=3.5)
    finish(P, c, root)
    # thu nhỏ cả con cho mắt ngang tầm các con khác (y ≈ 1.1); nút con giữ tỉ lệ 1 nên bộ chuyển động vẫn đúng
    root.scale = (0.9, 0.9, 0.9)
    return c

PLUSH = {'cloud': build_cloud_plush, 'bunny': build_bunny_plush}
