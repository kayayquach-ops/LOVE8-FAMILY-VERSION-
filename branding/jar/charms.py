# 10 hạt charm thủ công. Mỗi hạt dựng nằm trong mặt XY (mặt trước hướng +Z), rộng khoảng 1 đơn vị,
# gom vào một collection riêng "charm_<id>" với gốc là empty "<id>_Root". VIEW là góc xoay khi chụp sprite.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix

THREAD_CREAM = '#FFF4E4'


def root_for(cid):
    c = coll('charm_' + cid)
    r = bpy.data.objects.new(cid + '_Root', None)
    c.objects.link(r)
    return c, r


def parent_all(c, r):
    for o in c.objects:
        if o is not r and o.parent is None:
            o.parent = r


def heart_outline(n=260, chub=1.06):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    O = np.stack([x * chub, y + 2.5], -1) / 34.0
    return ccw(smooth_closed(O, 8, 0.5))


def star_outline(R=0.55, r=0.31, tip=0.11, inner=0.07, rot=90):
    V = []
    for i in range(10):
        a = math.radians(rot + i * 36)
        rr = R if i % 2 == 0 else r
        V.append((rr * math.cos(a), rr * math.sin(a)))
    return rounded_polygon(V, [tip if i % 2 == 0 else inner for i in range(10)])


# ---------- 1. tim đỏ nỉ ----------
def build_heart_red():
    c, r = root_for('heart_red')
    O = heart_outline()
    m = felt('Felt_Red', '#C8342E')
    o, O2, hf = pillow('heart_red_Body', O, (0, -0.02), 0.21, 0.30, c, m, edge=0.028, prof=0.55)
    cen = np.array([0, -0.02])
    lc = level_curve(O2, cen, 0.075)
    zf = lambda p: float(hf(p[None])[0])
    stitches('heart_red_Stitch', lc, 0, c, thread('Thread_Cream', THREAD_CREAM), spacing=0.072, dash=0.046, wid=0.02, hei=0.016, zfun=zf)
    parent_all(c, r)
    return c, r


# ---------- 2. hoa sen nỉ ----------
def petal_outline(L, W, n=90):
    u = np.linspace(0, 1, n)
    w = W * np.sin(np.pi * u ** 0.85) ** 0.75
    top = np.stack([u * L, w / 2], -1)
    bot = np.stack([u * L, -w / 2], -1)[::-1]
    return ccw(np.vstack([top, bot[1:-1]]))


def bend_petal(o, L, W, cup, curl, tilt, ang, r0, z0=0.0):
    me = o.data
    for v in me.vertices:
        x, y, z = v.co
        u = max(0.0, x / L)
        z += cup * (y / (W / 2)) ** 2 * (0.3 + 0.7 * math.sin(math.pi * min(u, 1)) ) + curl * u ** 2.5
        v.co = (x, y, z)
    M = Matrix.Translation((r0 * math.cos(ang), r0 * math.sin(ang), z0)) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(-tilt, 4, 'Y')
    me.transform(M)
    me.update()


def build_lotus():
    c, r = root_for('lotus')
    layers = [
        # (số cánh, dài, rộng, nghiêng, lệch góc, bán kính gốc, độ cao gốc, màu)
        (8, 0.50, 0.25, math.radians(14), 0.0, 0.07, 0.0, '#E07B98'),
        (8, 0.45, 0.235, math.radians(38), math.pi / 8, 0.06, 0.03, '#EC9DB3'),
        (6, 0.36, 0.205, math.radians(62), 0.25, 0.05, 0.06, '#F6C2D0'),
    ]
    for li, (cnt, L, W, tilt, off, r0, z0, col) in enumerate(layers):
        m = felt(f'Felt_Lotus{li}', col, shade=0.12, bump=0.45)
        for k in range(cnt):
            ang = off + 2 * math.pi * k / cnt
            o, O2, hf = pillow(f'lotus_P{li}_{k}', petal_outline(L, W), (L * 0.45, 0), 0.032, 0.06, c, m, edge=0.013, back=1.0, rings=14, n=120, prof=0.6)
            bend_petal(o, L, W, cup=0.05, curl=0.06 + li * 0.02, tilt=tilt, ang=ang, r0=r0, z0=z0)
    # đài sen ở giữa
    mp = felt('Felt_Pod', '#E9C552', bump=0.4)
    pod = lathe('lotus_Pod', [(0, 0.17), (0.07, 0.168), (0.11, 0.155), (0.125, 0.13), (0.115, 0.08), (0.09, 0.05), (0, 0.04)], 40, c, mp)
    subsurf(pod, 1)
    md = felt('Felt_PodDot', '#A87D22', bump=0.3)
    for k in range(7):
        a = 2 * math.pi * k / 6
        rr = 0 if k == 6 else 0.062
        lathe(f'lotus_Dot{k}', [(0, 0.176), (0.016, 0.174), (0.021, 0.168), (0.018, 0.16), (0, 0.158)], 16, c, md).location = (rr * math.cos(a), rr * math.sin(a), 0)
    parent_all(c, r)
    return c, r


# ---------- 3. ngôi sao nắng nỉ ----------
def build_sun():
    c, r = root_for('sun')
    O = star_outline(R=0.56, r=0.33, tip=0.13, inner=0.08)
    m = felt('Felt_Sun', '#F2A81F')
    o, O2, hf = pillow('sun_Body', O, (0, 0), 0.19, 0.24, c, m, edge=0.026, prof=0.55)
    lc = level_curve(O2, np.array([0.0, 0.0]), 0.065)
    zf = lambda p: float(hf(p[None])[0])
    stitches('sun_Stitch', lc, 0, c, thread('Thread_Cream2', THREAD_CREAM), spacing=0.066, dash=0.042, wid=0.019, hei=0.015, zfun=zf)
    parent_all(c, r)
    return c, r


# ---------- 4. lá nỉ gân thêu ----------
def build_leaf():
    c, r = root_for('leaf')
    L, W = 1.0, 0.46
    u = np.linspace(0, 1, 140)
    w = W * np.sin(np.pi * u ** 0.78) ** 0.8
    bend = 0.05 * np.sin(np.pi * u)
    xs = (u - 0.5) * L
    top = np.stack([xs, bend + w / 2], -1)
    bot = np.stack([xs, bend - w / 2], -1)[::-1]
    O = ccw(np.vstack([top, bot[1:-1]]))
    mid_u = np.linspace(0.03, 0.9, 40)
    mid = np.stack([(mid_u - 0.5) * L, 0.05 * np.sin(np.pi * mid_u)], -1)
    veins = [mid]
    for uk, sgn in [(0.2, 1), (0.25, -1), (0.38, 1), (0.43, -1), (0.56, 1), (0.61, -1), (0.73, 1), (0.77, -1)]:
        x0 = (uk - 0.5) * L
        y0 = 0.05 * np.sin(np.pi * uk)
        wk = W * np.sin(np.pi * uk ** 0.78) ** 0.8 / 2
        tt = np.linspace(0, 1, 12)
        vx = x0 + tt * wk * 0.75
        vy = y0 + sgn * wk * 0.72 * (tt ** 0.85)
        veins.append(np.stack([vx, vy], -1))
    m = felt('Felt_Leaf', '#5F9A4C')
    dents = [(v, 0.03, 0.03) for v in veins]
    o, O2, hf = pillow('leaf_Body', O, (-0.02, 0.03), 0.12, 0.17, c, m, edge=0.022, prof=0.55, dents=dents, rings=64, n=320)
    tm = thread('Thread_Leaf', '#F4F1D2')
    zf = lambda p: float(hf(p[None])[0])
    for i, v in enumerate(veins):
        vv = resample(v, 60, closed=False)
        stitches(f'leaf_Vein{i}', vv, 0, c, tm, spacing=0.05 if i == 0 else 0.046, dash=0.036, wid=0.019 if i == 0 else 0.016, hei=0.014, closed=False, zfun=lambda p: zf(p) + 0.006, sink=0.2)
    # cuống
    ms = felt('Felt_Stem', '#4E7F3D', bump=0.3)
    sx = -0.5 * L
    tube('leaf_Stem', [(sx + 0.05, 0.0, 0.01), (sx - 0.02, -0.01, 0.0), (sx - 0.09, -0.04, -0.005), (sx - 0.15, -0.09, -0.01)], 0.026, c, ms, taper=[1.0, 0.95, 0.85, 0.7])
    spin = bpy.data.objects.new('leaf_Spin', None)
    c.objects.link(spin)
    for o in c.objects:
        if o not in (r, spin) and o.parent is None:
            o.parent = spin
    spin.rotation_euler = (0, 0, math.radians(35))
    spin.parent = r
    return c, r


# ---------- 5. ngọc trai ----------
def build_pearl():
    c, r = root_for('pearl')
    m, nt, b = new_mat('Pearl')
    lw = node(nt, 'ShaderNodeLayerWeight', Blend=0.4)
    rp = ramp(nt, [(0.0, rgb('#F7EEE7')), (0.35, rgb('#F1E3DE'))])
    for p, h in ((0.6, '#E6D3D8'), (0.76, '#D5CCDF'), (0.88, '#B9CFCB'), (1.0, '#8B97A4')):
        e = rp.color_ramp.elements.new(p)
        e.color = rgb(h)
    nt.links.new(lw.outputs['Facing'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    setin(b, 'Roughness', 0.28)
    setin(b, 'Subsurface Weight', 0.08)
    setin(b, 'Subsurface Radius', (0.5, 0.35, 0.3))
    setin(b, 'Subsurface Scale', 0.03)
    setin(b, 'Coat Weight', 1.0)
    setin(b, 'Coat Roughness', 0.025)
    setin(b, 'Thin Film Thickness', 480.0)
    setin(b, 'Thin Film IOR', 1.6)
    setin(b, 'Specular IOR Level', 1.0)
    o = lathe('pearl_Body', [(0, -0.43)] + [(0.43 * math.sin(math.pi * k / 24), -0.43 * math.cos(math.pi * k / 24)) for k in range(1, 24)] + [(0, 0.43)], 64, c, m)
    subsurf(o, 1)
    # chụp vàng nhỏ và khoen trên đỉnh như mặt dây chuyền
    gm = gold_mat('Gold_Cap')
    cap = [(0, 0.505), (0.06, 0.5), (0.13, 0.48), (0.19, 0.445), (0.228, 0.402), (0.244, 0.366), (0.236, 0.352), (0.2, 0.36), (0, 0.38)]
    P = catmull(np.array(cap), 6)
    P[0, 0] = 0
    P[-1, 0] = 0
    co = lathe('pearl_Cap', [tuple(p) for p in P], 48, c, gm)
    subsurf(co, 1)
    for k in range(12):
        a = 2 * math.pi * k / 12
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.027, segments=12, ring_count=8, location=(0.24 * math.cos(a), 0.24 * math.sin(a), 0.356))
        bd = bpy.context.active_object
        bd.name = f'pearl_Bead{k}'
        for cc in bd.users_collection:
            cc.objects.unlink(bd)
        c.objects.link(bd)
        bd.data.materials.append(gm)
        for p in bd.data.polygons:
            p.use_smooth = True
    bpy.ops.mesh.primitive_torus_add(major_radius=0.072, minor_radius=0.02, major_segments=40, minor_segments=12, location=(0, 0, 0.575), rotation=(math.radians(90), 0, math.radians(35)))
    ring = bpy.context.active_object
    ring.name = 'pearl_Ring'
    for cc in ring.users_collection:
        cc.objects.unlink(ring)
    c.objects.link(ring)
    ring.data.materials.append(gm)
    for p in ring.data.polygons:
        p.use_smooth = True
    parent_all(c, r)
    return c, r


# ---------- 6. hoa anh đào ----------
def build_sakura():
    c, r = root_for('sakura')
    ctrl = [(0, 0.02), (0.12, 0.11), (0.205, 0.25), (0.2, 0.38), (0.13, 0.465), (0.045, 0.462), (0, 0.41),
            (-0.045, 0.462), (-0.13, 0.465), (-0.2, 0.38), (-0.205, 0.25), (-0.12, 0.11)]
    O = ccw(catmull(ctrl, 14, closed=True))
    m, nt, b = new_mat('Satin_Sakura')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ln = node(nt, 'ShaderNodeVectorMath', operation='LENGTH')
    nt.links.new(tc.outputs['Object'], ln.inputs[0])
    rp = ramp(nt, [(0.0, rgb('#D9577E')), (0.12, rgb('#EE8FAB')), (0.3, rgb('#F8C3D2')), (0.5, rgb('#FDEAF0'))])
    nt.links.new(ln.outputs['Value'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    setin(b, 'Roughness', 0.42)
    setin(b, 'Sheen Weight', 0.7)
    setin(b, 'Sheen Roughness', 0.3)
    setin(b, 'Subsurface Weight', 0.2)
    setin(b, 'Subsurface Radius', (0.5, 0.25, 0.3))
    setin(b, 'Subsurface Scale', 0.03)
    setin(b, 'Coat Weight', 0.15)
    for k in range(5):
        ang = math.pi / 2 + 2 * math.pi * k / 5
        o, O2, hf = pillow(f'sakura_P{k}', O, (0, 0.26), 0.045, 0.075, c, m, edge=0.012, back=1.0, rings=18, n=160, prof=0.6)
        me = o.data
        for v in me.vertices:
            x, y, z = v.co
            rr = math.hypot(x, y)
            v.co = (x, y, z + 0.18 * rr * rr + 0.04 * (x / 0.2) ** 2 * rr)
        me.transform(Matrix.Rotation(ang - math.pi / 2, 4, 'Z'))
        me.update()
        o.location.z = k * 0.002
    mc, ntc, bc = new_mat('Sakura_Center')
    setin(bc, 'Base Color', rgb('#C9446C'))
    setin(bc, 'Roughness', 0.55)
    setin(bc, 'Sheen Weight', 0.5)
    cen = lathe('sakura_Center', [(0, 0.075), (0.04, 0.07), (0.065, 0.055), (0.07, 0.035), (0, 0.03)], 32, c, mc)
    subsurf(cen, 1)
    mf, ntf, bf = new_mat('Stamen')
    setin(bf, 'Base Color', rgb('#F6B7C8'))
    setin(bf, 'Roughness', 0.5)
    ma, nta, ba = new_mat('Anther')
    setin(ba, 'Base Color', rgb('#E8B33C'))
    setin(ba, 'Roughness', 0.45)
    setin(ba, 'Sheen Weight', 0.4)
    rng = np.random.default_rng(4)
    for k in range(14):
        a = 2 * math.pi * k / 14 + rng.uniform(-0.1, 0.1)
        L = rng.uniform(0.12, 0.17)
        pts = [(0.03 * math.cos(a), 0.03 * math.sin(a), 0.06), (L * 0.55 * math.cos(a), L * 0.55 * math.sin(a), 0.1), (L * math.cos(a), L * math.sin(a), 0.115)]
        tube(f'sakura_Fil{k}', pts, 0.0055, c, mf)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.019, segments=14, ring_count=8, location=pts[-1])
        an = bpy.context.active_object
        an.name = f'sakura_Anth{k}'
        for cc in an.users_collection:
            cc.objects.unlink(an)
        c.objects.link(an)
        an.data.materials.append(ma)
        for p in an.data.polygons:
            p.use_smooth = True
    parent_all(c, r)
    return c, r


# ---------- 7. tim vàng satin ----------
def gold_mat(name='Gold_Satin'):
    m, nt, b = new_mat(name)
    setin(b, 'Base Color', rgb('#F7D27C'))
    setin(b, 'Metallic', 1.0)
    setin(b, 'Roughness', 0.34)
    setin(b, 'Specular Tint', rgb('#FFE3A6'))
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = node(nt, 'ShaderNodeTexNoise', Scale=900.0, Detail=4.0)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = node(nt, 'ShaderNodeBump', Strength=0.04, Distance=0.002)
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def build_gold():
    c, r = root_for('gold')
    O = heart_outline(chub=1.04)
    m = gold_mat()
    cen = np.array([0, -0.02])
    O2 = ccw(resample(O, 220))
    groove = level_curve(O2, cen, 0.085)
    groove = np.vstack([groove, groove[:1]])
    o, O3, hf = pillow('gold_Body', O, cen, 0.23, 0.33, c, m, edge=0.03, prof=0.6, dents=[(groove, 0.02, 0.017)])
    parent_all(c, r)
    return c, r


# ---------- 8. giọt pha lê ----------
def build_crystal():
    c, r = root_for('crystal')
    m, nt, b = new_mat('Crystal')
    setin(b, 'Base Color', rgb('#E6F7FF'))
    setin(b, 'Transmission Weight', 1.0)
    setin(b, 'Roughness', 0.0)
    setin(b, 'IOR', 1.55)
    setin(b, 'Specular Tint', rgb('#EAF7FF'))
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    va = node(nt, 'ShaderNodeVolumeAbsorption', Density=0.5)
    va.inputs['Color'].default_value = rgb('#9FD6F2')
    nt.links.new(va.outputs[0], out.inputs['Volume'])
    prof = [(0, -0.44), (0.24, -0.36), (0.36, -0.15), (0.355, 0.06), (0.25, 0.27), (0.12, 0.44), (0, 0.58)]
    lathe('crystal_Body', prof, 8, c, m, smooth=False, twist=0.5)
    parent_all(c, r)
    return c, r


# ---------- 9. ngôi sao cầu vồng ----------
def build_rainbow():
    c, r = root_for('rainbow')
    R, rr, hz = 0.57, 0.27, 0.19
    verts = [(0, 0, hz), (0, 0, -hz)]
    for i in range(10):
        a = math.radians(90 + i * 36)
        rad = R if i % 2 == 0 else rr
        verts.append((rad * math.cos(a), rad * math.sin(a), 0))
    faces = []
    for i in range(10):
        a, b_ = 2 + i, 2 + (i + 1) % 10
        faces.append((0, a, b_))
        faces.append((1, b_, a))
    m, nt, b = new_mat('Rainbow_Gem')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sp.inputs[0])
    at = node(nt, 'ShaderNodeMath', operation='ARCTAN2')
    nt.links.new(sp.outputs['Y'], at.inputs[0])
    nt.links.new(sp.outputs['X'], at.inputs[1])
    mr = node(nt, 'ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -math.pi
    mr.inputs['From Max'].default_value = math.pi
    nt.links.new(at.outputs[0], mr.inputs['Value'])
    cols = ['#C6A2F0', '#F4A7CB', '#F7B78F', '#F4DE8A', '#AEE3BE', '#A5CFF4', '#C6A2F0']
    rp = ramp(nt, [(i / 6, rgb(h)) for i, h in enumerate(cols[:2])])
    for i, h in enumerate(cols[2:], start=2):
        e = rp.color_ramp.elements.new(i / 6)
        e.color = rgb(h)
    nt.links.new(mr.outputs['Result'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    setin(b, 'Transmission Weight', 0.82)
    setin(b, 'Roughness', 0.06)
    setin(b, 'IOR', 1.55)
    setin(b, 'Coat Weight', 0.6)
    setin(b, 'Coat Roughness', 0.02)
    setin(b, 'Thin Film Thickness', 520.0)
    setin(b, 'Thin Film IOR', 1.38)
    o = mesh_from('rainbow_Body', verts, faces, c, m, smooth=False)
    bv = o.modifiers.new('Bevel', 'BEVEL')
    bv.width = 0.012
    bv.segments = 2
    bv.limit_method = 'ANGLE'
    parent_all(c, r)
    return c, r


# ---------- 10. giọt sương ngọc xanh ----------
def build_dew():
    c, r = root_for('dew')
    m, nt, b = new_mat('Dew_Jade')
    setin(b, 'Base Color', rgb('#D8F6EF'))
    setin(b, 'Transmission Weight', 1.0)
    setin(b, 'Roughness', 0.0)
    setin(b, 'IOR', 1.36)
    setin(b, 'Coat Weight', 0.5)
    setin(b, 'Coat Roughness', 0.02)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    va = node(nt, 'ShaderNodeVolumeAbsorption', Density=1.15)
    va.inputs['Color'].default_value = rgb('#5CCAB2')
    nt.links.new(va.outputs[0], out.inputs['Volume'])
    ctrl = [(0.0, -0.40), (0.2, -0.37), (0.335, -0.24), (0.38, -0.05), (0.335, 0.13), (0.22, 0.3), (0.095, 0.45), (0.0, 0.53)]
    P = catmull(np.array(ctrl), 8)
    P[0, 0] = 0.0
    P[-1, 0] = 0.0
    o = lathe('dew_Body', [tuple(p) for p in P], 48, c, m)
    subsurf(o, 1)
    parent_all(c, r)
    return c, r


BUILD = {
    'heart_red': build_heart_red, 'lotus': build_lotus, 'sun': build_sun, 'leaf': build_leaf, 'pearl': build_pearl,
    'sakura': build_sakura, 'gold': build_gold, 'crystal': build_crystal, 'rainbow': build_rainbow, 'dew': build_dew,
}
ORDER = list(BUILD)

# Góc chụp sprite (độ, Euler XYZ áp vào gốc hạt): 90 trên X là mặt hạt quay về máy quay.
VIEW = {
    'heart_red': (68, -6, 14), 'lotus': (40, 0, 8), 'sun': (66, 4, -12), 'leaf': (64, 0, 10), 'pearl': (-10, 10, 0),
    'sakura': (52, 0, 6), 'gold': (68, 6, -14), 'crystal': (-10, 0, 8), 'rainbow': (60, -8, 10), 'dew': (-12, 14, 0),
}
