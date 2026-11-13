# Lọ thuỷ tinh có cổ, đáy dày, nút bần, dây gai buộc nơ, thẻ giấy kraft.
# Lọ tách hai nửa theo mặt phẳng y=0 (máy quay nhìn từ -Y): nửa sau là lớp dưới hạt, nửa trước (cùng nút, dây, thẻ) là lớp trên hạt.
# Mỗi lớp chụp hai lần trên phông đen và phông trắng để tách độ trong (export.py), bóng đổ chụp riêng bằng shadow catcher.
import bpy, math, os, json
import numpy as np
from mathutils import Vector, Matrix

TILT = 9.0           # máy quay nhìn xuống (độ)
JAR_W, JAR_H = 840, 1050
ORTHO_H = 3.12       # chiều cao khung (đơn vị cảnh)
CAM_Z = 1.30         # tâm khung theo chiều cao lọ

OUTER = [(0.0, 0.0), (0.4, 0.0), (0.8, 0.0), (0.93, 0.022), (0.995, 0.085), (1.02, 0.2), (1.045, 0.55), (1.05, 0.95),
         (1.035, 1.3), (0.985, 1.58), (0.875, 1.84), (0.74, 2.0), (0.655, 2.1), (0.618, 2.19), (0.612, 2.3), (0.618, 2.35),
         (0.652, 2.375), (0.676, 2.41), (0.678, 2.45), (0.655, 2.485), (0.612, 2.5)]
INNER = [(0.565, 2.485), (0.553, 2.44), (0.552, 2.3), (0.56, 2.18), (0.6, 2.09), (0.69, 1.98), (0.815, 1.83),
         (0.925, 1.58), (0.975, 1.3), (0.99, 0.95), (0.985, 0.6), (0.968, 0.42), (0.925, 0.335), (0.84, 0.3),
         (0.6, 0.292), (0.3, 0.29), (0.0, 0.29)]
FLOOR_Z = 0.29


def jar_profile():
    P = catmull(np.array(OUTER + INNER), 10)
    P[0, 0] = 0.0
    P[-1, 0] = 0.0
    P[:, 0] = np.maximum(P[:, 0], 0.0)
    return P


def r_outer(z):
    P = catmull(np.array(OUTER), 10)
    k = np.argsort(P[:, 1])
    return float(np.interp(z, P[k, 1], P[k, 0]))


def spin(name, prof, a0, a1, nseg, c, material):
    verts, faces, rings = [], [], []
    angs = np.linspace(a0, a1, nseg + 1)
    for (r, z) in prof:
        if r < 1e-6:
            rings.append([len(verts)] * len(angs))
            verts.append((0, 0, z))
        else:
            ids = []
            for a in angs:
                ids.append(len(verts))
                verts.append((r * math.cos(a), r * math.sin(a), z))
            rings.append(ids)
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        for i in range(nseg):
            q = [A[i], A[i + 1], B[i + 1], B[i]]
            uq = []
            for v in q:
                if v not in uq:
                    uq.append(v)
            if len(uq) >= 3:
                faces.append(tuple(uq))
    return mesh_from(name, verts, faces, c, material, recalc=False)


def glass_mat():
    m, nt, b = new_mat('JarGlass')
    setin(b, 'Base Color', (0.985, 1.0, 0.99, 1))
    setin(b, 'Transmission Weight', 1.0)
    setin(b, 'Roughness', 0.0)
    setin(b, 'IOR', 1.5)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    lp = nt.nodes.new('ShaderNodeLightPath')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.86, 0.9, 0.88, 1)
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mx.inputs[0])
    nt.links.new(b.outputs[0], mx.inputs[1])
    nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    va = node(nt, 'ShaderNodeVolumeAbsorption', Density=0.55)
    va.inputs['Color'].default_value = rgb('#DDEFE6')
    nt.links.new(va.outputs[0], out.inputs['Volume'])
    return m


def cork_mat():
    m, nt, b = new_mat('Cork')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = node(nt, 'ShaderNodeTexVoronoi', Scale=130.0)
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    nz = node(nt, 'ShaderNodeTexNoise', Scale=140.0, Detail=8.0, Roughness=0.7)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nz2 = node(nt, 'ShaderNodeTexNoise', Scale=22.0, Detail=6.0)
    nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
    pits = ramp(nt, [(0.0, (0, 0, 0, 1)), (0.06, (1, 1, 1, 1))])
    nt.links.new(vo.outputs['Distance'], pits.inputs['Fac'])
    col = ramp(nt, [(0.3, rgb('#B98D5C')), (0.7, rgb('#D2AC7C'))])
    nt.links.new(nz2.outputs['Fac'], col.inputs['Fac'])
    dark = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    dark.inputs[0].default_value = 1.0
    nt.links.new(col.outputs['Color'], dark.inputs[6])
    sp = ramp(nt, [(0.0, rgb('#6E4A2C')), (1.0, (1, 1, 1, 1))])
    nt.links.new(pits.outputs['Color'], sp.inputs['Fac'])
    nt.links.new(sp.outputs['Color'], dark.inputs[7])
    nt.links.new(dark.outputs[2], b.inputs['Base Color'])
    h = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD')
    nt.links.new(pits.outputs['Color'], h.inputs[0])
    h.inputs[1].default_value = 0.7
    nt.links.new(nz.outputs['Fac'], h.inputs[2])
    bp = node(nt, 'ShaderNodeBump', Strength=0.6, Distance=0.004)
    nt.links.new(h.outputs[0], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    setin(b, 'Roughness', 0.86)
    setin(b, 'Sheen Weight', 0.3)
    setin(b, 'Specular IOR Level', 0.3)
    return m


def twine_mat():
    m = felt('Twine', '#AE8B5F', shade=0.2, bump=0.7, sheen=0.5, scale=160.0)
    return m


def paper_mat():
    m, nt, b = new_mat('Kraft')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = node(nt, 'ShaderNodeTexNoise', Scale=60.0, Detail=10.0, Roughness=0.65)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    col = ramp(nt, [(0.35, rgb('#BF9765')), (0.7, rgb('#D3AF80'))])
    nt.links.new(nz.outputs['Fac'], col.inputs['Fac'])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    bp = node(nt, 'ShaderNodeBump', Strength=0.25, Distance=0.002)
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    setin(b, 'Roughness', 0.9)
    setin(b, 'Sheen Weight', 0.2)
    return m


def ply_twine(name, path, radius, c, material, twist=70.0, closed=False):
    """Dây gai 3 sợi xoắn quanh đường path (N,3)."""
    P = np.asarray(path, float)
    if closed:
        P = np.vstack([P, P[:1]])
    seg = np.linalg.norm(P[1:] - P[:-1], axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    # khung song song (parallel transport)
    up = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
    N = [np.cross(np.cross(T[0], up), T[0])]
    N[0] /= np.linalg.norm(N[0])
    for i in range(1, len(P)):
        n = N[-1] - T[i] * (N[-1] @ T[i])
        N.append(n / np.linalg.norm(n))
    N = np.array(N)
    B = np.cross(T, N)
    objs = []
    rr = radius * 0.52
    for j in range(3):
        ph = s * twist + 2 * math.pi * j / 3
        Q = P + rr * (np.cos(ph)[:, None] * N + np.sin(ph)[:, None] * B)
        objs.append(tube(f'{name}_{j}', [tuple(q) for q in Q], radius * 0.56, c, material, res=8))
    return objs


def build_jar():
    c = coll('jar')
    cf = coll('jar_front')
    cb = coll('jar_back')
    gm = glass_mat()
    prof = jar_profile()
    ext = math.radians(6)
    spin('Glass_Front', prof, math.pi - ext, 2 * math.pi + ext, 220, cf, gm)
    spin('Glass_Back', prof, ext, math.pi - ext, 200, cb, gm)
    # nút bần: hơi loe trên, bo mép
    cm = cork_mat()
    cprof = [(0, 2.16), (0.47, 2.16), (0.535, 2.175), (0.548, 2.22), (0.552, 2.49), (0.575, 2.53), (0.585, 2.56),
             (0.588, 2.62), (0.578, 2.665), (0.55, 2.69), (0.45, 2.698), (0, 2.7)]
    cpp = catmull(np.array(cprof), 6)
    cpp[0, 0] = 0
    cpp[-1, 0] = 0
    lathe('Cork', [tuple(p) for p in cpp], 96, cf, cm)
    # dây gai quấn cổ 3 vòng
    tm = twine_mat()
    rad = 0.026
    pts = []
    turns = 2.6
    nn = 420
    for i in range(nn + 1):
        t = i / nn
        a = -math.pi / 2 + 0.25 + t * turns * 2 * math.pi
        z = 2.207 + 0.128 * t + 0.004 * math.sin(a * 3)
        r = r_outer(z) + rad * 0.9
        pts.append((r * math.cos(a), r * math.sin(a), z))
    ply_twine('Twine_Wrap', pts, rad, cf, tm)
    # nơ: hai quai, hai đuôi, nút thắt ở chính giữa phía trước
    ky = -(r_outer(2.26) + rad * 2.2)
    K = np.array([0.0, ky, 2.262])

    def front(pt):
        x, dz = pt
        z = K[2] + dz
        r = max(r_outer(z), 0.6) + rad * 2.6
        y = -math.sqrt(max(r * r - x * x, 0.0)) - 0.012
        return (x, y, z)

    for sgn in (-1, 1):
        loop = [(0.0, 0.0), (sgn * 0.08, 0.05), (sgn * 0.2, 0.095), (sgn * 0.29, 0.07), (sgn * 0.315, 0.0),
                (sgn * 0.27, -0.06), (sgn * 0.15, -0.055), (sgn * 0.055, -0.018)]
        L = catmull(np.array([front(p) for p in loop]), 10, closed=True)
        L = np.vstack([L, L[:1]])
        ply_twine(f'Bow_Loop{sgn}', L, rad * 0.92, cf, tm, twist=80)
        tail = [(sgn * 0.01, -0.01), (sgn * 0.045, -0.07), (sgn * 0.075, -0.14), (sgn * 0.095, -0.2), (sgn * (0.105 + 0.015 * (sgn > 0)), -0.24 - 0.025 * (sgn > 0))]
        T = catmull(np.array([front(p) for p in tail]), 10)
        ply_twine(f'Bow_Tail{sgn}', T, rad * 0.92, cf, tm, twist=80)
    kn = lathe('Bow_Knot', [(0, -0.045), (0.035, -0.04), (0.05, -0.01), (0.05, 0.015), (0.035, 0.04), (0, 0.045)], 20, cf, tm)
    kn.location = Vector(K) + Vector((0, -0.02, 0))
    kn.rotation_euler = (math.radians(90), 0, 0)
    kn.scale = (1.0, 0.75, 1.0)
    # thẻ kraft treo cao ở vai phải bằng dây ngắn từ nút thắt: lọ đầy 40 hạt vẫn không bị thẻ che
    pm = paper_mat()
    tw, th, cut = 0.36, 0.225, 0.068
    outline = [(-tw / 2 + cut, th / 2), (tw / 2, th / 2), (tw / 2, -th / 2), (-tw / 2 + cut, -th / 2), (-tw / 2, -th / 2 + cut), (-tw / 2, th / 2 - cut)]
    O = rounded_polygon(outline, [0.012] * 6, 4)
    hole = np.array([-tw / 2 + 0.05, 0.0])
    hp = [(hole[0] + 0.022 * math.cos(a), hole[1] + 0.022 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)]
    bm = bmesh.new()
    vt = [bm.verts.new((x, y, 0)) for x, y in O]
    vb = [bm.verts.new((x, y, 0)) for x, y in hp]
    edges = [bm.edges.new((vt[i], vt[(i + 1) % len(vt)])) for i in range(len(vt))]
    edges += [bm.edges.new((vb[i], vb[(i + 1) % len(vb)])) for i in range(len(vb))]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    res = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    for v in [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z -= 0.008
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tag = bm_obj('Tag', bm, cf, pm, smooth=False)
    # vòng gia cố quanh lỗ + chấm tim đỏ in mộc
    rm, ntr, br = new_mat('TagRing')
    setin(br, 'Base Color', rgb('#EFE6D6'))
    setin(br, 'Roughness', 0.7)
    ring = lathe('TagRing', [(0.02, 0.001), (0.036, 0.001), (0.036, 0.003), (0.02, 0.003)], 28, cf, rm)
    ring.location = (hole[0], hole[1], 0)
    ring.parent = tag
    ink, nti, bi = new_mat('TagInk')
    setin(bi, 'Base Color', rgb('#B24A35'))
    setin(bi, 'Roughness', 0.75)
    HO = (heart_outline(120) * 0.1)
    hm = mesh_from('TagHeart', [(x + 0.04, y - 0.005, 0.0012) for x, y in HO], [list(range(len(HO)))], cf, ink, smooth=False)
    hm.parent = tag
    # lỗ thẻ ở vai phải ngay dưới dây quấn, thân thẻ chéo xuống bên phải, mặt thẻ gần như nhìn thẳng máy quay
    tag.rotation_euler = (math.radians(90 - TILT), math.radians(24), math.radians(16))
    bpy.context.view_layer.update()
    H = Vector((0.47, -0.6, 2.12))
    R = tag.rotation_euler.to_matrix()
    tag.location = H - R @ Vector((hole[0], hole[1], 0.0))
    bpy.context.view_layer.update()
    hole_w = tag.matrix_world @ Vector((hole[0], hole[1], 0.0))
    s0 = Vector(K) + Vector((0.035, -0.03, -0.015))
    mid = (s0 + hole_w) / 2 + Vector((0.0, -0.02, -0.035))
    S = catmull(np.array([tuple(s0), tuple(mid), tuple(hole_w)]), 12)
    tube('Tag_String', [tuple(p) for p in S], 0.007, cf, tm)
    return c, cf, cb


def inner_outline_px(cam):
    """Đường viền lòng lọ (chiếu lên ảnh, toạ độ 0..1 từ góc trên trái): dùng cho mô phỏng xếp hạt."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    P = catmull(np.array(INNER[::-1]), 10)
    pts = []
    for (r, z) in P:
        if z > 2.12:
            continue
        for a in np.linspace(math.pi, 2 * math.pi, 73):
            v = world_to_camera_view(sc, cam, Vector((r * math.cos(a), r * math.sin(a), z)))
            pts.append((v.x, 1 - v.y))
    pts = np.array(pts)
    # bao lồi theo từng cột x: dưới cùng, và hai thành bên
    return pts


def build_and_render_jar(out, args):
    c, cf, cb = build_jar()
    world()
    lights(scale=2.0, target=(0, 0, 1.25))
    # kính: chỉ phản chiếu hộp sáng mềm, không thấy ô vuông của đèn
    for o in list(coll('studio').objects):
        if o.type == 'LIGHT':
            if o.name.startswith('Strip'):
                bpy.data.objects.remove(o)
            else:
                o.visible_glossy = False
    tgt = (0, 0, 1.25)
    card('CardL', (-5.6, -2.1, 1.6), 1.5, 9.0, 26.0, target=tgt)
    card('CardR', (5.7, 1.6, 1.6), 0.8, 9.0, 13.0, target=tgt)
    card('CardTop', (-0.6, -2.4, 7.0), 4.5, 2.2, 8.0, target=tgt, soft=1.0)
    cam = camera(ortho=ORTHO_H, loc=(0, -12, CAM_Z), tilt=TILT)
    cam.data.sensor_fit = 'VERTICAL'
    # dời máy theo hướng nhìn để tâm khung đúng CAM_Z
    d = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    cam.location = Vector((0, 0, CAM_Z)) - d * 12
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = JAR_W, JAR_H
    bpy.context.view_layer.update()
    pts = inner_outline_px(cam)
    meta = {'w': JAR_W, 'h': JAR_H, 'inner': pts.tolist()}
    json.dump(meta, open(os.path.join(out, 'jar_inner.json'), 'w'))
    if 'noshot' in args:
        return
    # phông đen/trắng chỉ máy quay và tia xuyên thấy, phản chiếu không thấy
    bd = bpy.data.meshes.new('Backdrop')
    bd.from_pydata([(-40, 0, -40), (40, 0, -40), (40, 0, 40), (-40, 0, 40)], [], [(0, 1, 2, 3)])
    bdo = bpy.data.objects.new('Backdrop', bd)
    coll('studio').objects.link(bdo)
    bdo.location = (0, 9, 0)
    bm_, ntb, bb = new_mat('BackdropMat')
    out_n = next(n for n in ntb.nodes if n.type == 'OUTPUT_MATERIAL')
    em = ntb.nodes.new('ShaderNodeEmission')
    ntb.links.new(em.outputs[0], out_n.inputs['Surface'])
    try:
        bm_.emission_sampling = 'NONE'
    except Exception:
        pass
    bd.materials.append(bm_)
    bdo.visible_diffuse = False
    bdo.visible_glossy = False
    bdo.visible_shadow = False
    bdo.visible_volume_scatter = False
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.image_settings.exr_codec = 'ZIP'
    sc.render.film_transparent = False
    passes = [('front', cf, cb), ('back', cb, cf)]
    which = [a for a in args if a in ('front', 'back', 'shadow')] or ['front', 'back', 'shadow']
    for name, show, hide in passes:
        if name not in which:
            continue
        show.hide_render = False
        hide.hide_render = True
        for val, tag in ((0.0, 'k'), (1.0, 'w')):
            em.inputs['Color'].default_value = (val, val, val, 1)
            em.inputs['Strength'].default_value = 1.0
            p = os.path.join(out, f'jar_{name}_{tag}.exr')
            render(p, JAR_W, JAR_H)
            to_npy(p)
    if 'shadow' in which:
        cf.hide_render = False
        cb.hide_render = False
        bdo.hide_render = True
        for o in list(cf.all_objects) + list(cb.all_objects):
            o.visible_camera = False
        g = bpy.data.meshes.new('Ground')
        g.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
        go = bpy.data.objects.new('Ground', g)
        coll('studio').objects.link(go)
        go.is_shadow_catcher = True
        sc.render.film_transparent = True
        p = os.path.join(out, 'jar_shadow.exr')
        render(p, JAR_W, JAR_H)
        to_npy(p)
        for o in list(cf.all_objects) + list(cb.all_objects):
            o.visible_camera = True
        bpy.data.objects.remove(go)
        bdo.hide_render = False


def to_npy(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]
    np.save(p[:-4] + '.npy', a.astype(np.float16))
    bpy.data.images.remove(im)
