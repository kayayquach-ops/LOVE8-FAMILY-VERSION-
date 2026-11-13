# Hàm chung cho lọ yêu thương và 10 hạt charm (Blender 5.2). Chạy qua run.py.
# Toạ độ Blender: Z lên trên, máy quay nhìn từ -Y sang +Y.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(h, a=1.0):
    h = h.lstrip('#')
    return (lin(int(h[0:2], 16)), lin(int(h[2:4], 16)), lin(int(h[4:6], 16)), a)


def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def mesh_from(name, verts, faces, c, material=None, smooth=True, recalc=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.validate()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    if material:
        me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = smooth
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    return o


def bm_obj(name, bm, c, material=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    if material:
        me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def subsurf(o, lv=2):
    m = o.modifiers.new('Sub', 'SUBSURF')
    m.levels = lv
    m.render_levels = lv
    return m


# ---------- vật liệu ----------

def new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    return m, nt, bsdf


def setin(node, name, val):
    if name in node.inputs:
        node.inputs[name].default_value = val


def node(nt, typ, **kw):
    n = nt.nodes.new(typ)
    for k, v in kw.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def ramp(nt, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    els = r.color_ramp.elements
    while len(els) > 2:
        els.remove(els[-1])
    for i, (p, col) in enumerate(stops):
        e = els[i] if i < 2 else els.new(p)
        e.position = p
        e.color = col if len(col) == 4 else (*col, 1.0)
    return r


def fiber_bump(nt, strength=0.6, scale=70.0, clump=0.2):
    """Vân sợi nỉ: nhiễu méo thành sợi + mảng dày mỏng. Trả về (nút Bump, nút nhiễu mảng)."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n1 = node(nt, 'ShaderNodeTexNoise', Scale=scale, Detail=15.0, Roughness=0.72, Distortion=2.2)
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    n3 = node(nt, 'ShaderNodeTexNoise', Scale=scale * 2.6, Detail=8.0, Roughness=0.8)
    nt.links.new(tc.outputs['Object'], n3.inputs['Vector'])
    n2 = node(nt, 'ShaderNodeTexNoise', Scale=scale * 0.12, Detail=4.0, Roughness=0.55)
    nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    a = node(nt, 'ShaderNodeMath', operation='ADD')
    nt.links.new(n1.outputs['Fac'], a.inputs[0])
    nt.links.new(n3.outputs['Fac'], a.inputs[1])
    mix = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD')
    nt.links.new(n2.outputs['Fac'], mix.inputs[0])
    mix.inputs[1].default_value = clump
    nt.links.new(a.outputs[0], mix.inputs[2])
    b = node(nt, 'ShaderNodeBump', Strength=strength, Distance=0.008)
    nt.links.new(mix.outputs[0], b.inputs['Height'])
    return b, n2, n1


def felt(name, hexs, shade=0.16, bump=0.6, sheen=0.55, scale=70.0):
    """Nỉ: nhám, sheen mềm ở rìa, màu loang nhẹ theo mảng sợi."""
    m, nt, b = new_mat(name)
    col = rgb(hexs)
    bmp, n2, n1 = fiber_bump(nt, bump, scale)
    nt.links.new(bmp.outputs['Normal'], b.inputs['Normal'])
    dark = tuple(c * (1 - shade) for c in col[:3]) + (1,)
    light = tuple(min(1, c * (1 + shade * 0.5)) for c in col[:3]) + (1,)
    r = ramp(nt, [(0.3, dark), (0.7, light)])
    mm = node(nt, 'ShaderNodeMix', data_type='FLOAT')
    mm.inputs[0].default_value = 0.35
    nt.links.new(n2.outputs['Fac'], mm.inputs[2])
    nt.links.new(n1.outputs['Fac'], mm.inputs[3])
    nt.links.new(mm.outputs[0], r.inputs['Fac'])
    nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    setin(b, 'Roughness', 0.95)
    setin(b, 'Sheen Weight', sheen)
    setin(b, 'Sheen Roughness', 0.4)
    setin(b, 'Sheen Tint', tuple(min(1.0, c * 1.25 + 0.04) for c in col[:3]) + (1,))
    setin(b, 'Specular IOR Level', 0.2)
    m.diffuse_color = col
    return m


def thread(name, hexs):
    m, nt, b = new_mat(name)
    setin(b, 'Base Color', rgb(hexs))
    setin(b, 'Roughness', 0.55)
    setin(b, 'Sheen Weight', 0.5)
    setin(b, 'Sheen Roughness', 0.35)
    setin(b, 'Specular IOR Level', 0.4)
    return m


# ---------- hình 2D ----------

def seg_dist(P, O, chunk=4096):
    """Khoảng cách từ các điểm P (M,2) tới đường gấp khúc kín O (N,2)."""
    A = O
    B = np.roll(O, -1, 0)
    AB = B - A
    L2 = np.maximum((AB * AB).sum(-1), 1e-12)
    out = np.empty(len(P))
    for s in range(0, len(P), chunk):
        p = P[s:s + chunk]
        AP = p[:, None, :] - A[None]
        t = np.clip((AP * AB[None]).sum(-1) / L2[None], 0, 1)
        d = AP - t[..., None] * AB[None]
        out[s:s + chunk] = np.sqrt((d * d).sum(-1)).min(1)
    return out


def poly_dist(P, Q, chunk=4096):
    """Khoảng cách tới đường gấp khúc hở Q."""
    A = Q[:-1]
    B = Q[1:]
    AB = B - A
    L2 = np.maximum((AB * AB).sum(-1), 1e-12)
    out = np.empty(len(P))
    for s in range(0, len(P), chunk):
        p = P[s:s + chunk]
        AP = p[:, None, :] - A[None]
        t = np.clip((AP * AB[None]).sum(-1) / L2[None], 0, 1)
        d = AP - t[..., None] * AB[None]
        out[s:s + chunk] = np.sqrt((d * d).sum(-1)).min(1)
    return out


def resample(O, n, closed=True):
    P = np.vstack([O, O[:1]]) if closed else O
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(-1))
    s = np.concatenate([[0], np.cumsum(seg)])
    tgt = np.linspace(0, s[-1], n + (0 if closed else 0), endpoint=not closed)
    x = np.interp(tgt, s, P[:, 0])
    y = np.interp(tgt, s, P[:, 1])
    return np.stack([x, y], -1)


def smooth_closed(O, it=3, k=0.5):
    for _ in range(it):
        O = O + k * ((np.roll(O, 1, 0) + np.roll(O, -1, 0)) / 2 - O)
    return O


def ccw(O):
    a = 0.5 * np.sum(O[:, 0] * np.roll(O[:, 1], -1) - np.roll(O[:, 0], -1) * O[:, 1])
    return O if a > 0 else O[::-1].copy()


def rounded_polygon(V, radii, n_arc=14):
    """Bo tròn từng góc của đa giác V (CCW) theo bán kính radii[i]."""
    V = np.asarray(V, float)
    n = len(V)
    out = []
    for i in range(n):
        p0, p1, p2 = V[i - 1], V[i], V[(i + 1) % n]
        a = p0 - p1
        b = p2 - p1
        la, lb = np.linalg.norm(a), np.linalg.norm(b)
        a /= la
        b /= lb
        ang = math.acos(max(-1, min(1, float(a @ b))))
        r = radii[i]
        d = r / math.tan(ang / 2)
        d = min(d, la * 0.48, lb * 0.48)
        r = d * math.tan(ang / 2)
        t1 = p1 + a * d
        t2 = p1 + b * d
        bis = a + b
        bis /= np.linalg.norm(bis)
        cdist = r / math.sin(ang / 2)
        cc = p1 + bis * cdist
        s1 = math.atan2(t1[1] - cc[1], t1[0] - cc[0])
        s2 = math.atan2(t2[1] - cc[1], t2[0] - cc[0])
        cross = a[0] * b[1] - a[1] * b[0]
        # đi theo chiều ngắn từ t1 tới t2
        ds = s2 - s1
        while ds > math.pi:
            ds -= 2 * math.pi
        while ds < -math.pi:
            ds += 2 * math.pi
        for k in range(n_arc + 1):
            th = s1 + ds * k / n_arc
            out.append(cc + r * np.array([math.cos(th), math.sin(th)]))
    return np.array(out)


def check_star(O, c):
    ang = np.unwrap(np.arctan2(O[:, 1] - c[1], O[:, 0] - c[0]))
    d = np.diff(ang)
    return bool(np.all(d > 0) or np.all(d < 0))


def level_curve(O, c, delta, steps=160):
    """Đường cách mép đúng delta (đi theo tia từ tâm c), trả về đa giác kín."""
    pts = []
    S = np.linspace(1.0, 0.0, steps)
    for p in O:
        ray = c[None] + S[:, None] * (p - c)[None]
        d = seg_dist(ray, O)
        k = np.argmax(d >= delta)
        if d[k] < delta:
            continue
        if k > 0:
            f = (delta - d[k - 1]) / max(d[k] - d[k - 1], 1e-9)
            q = ray[k - 1] + f * (ray[k] - ray[k - 1])
        else:
            q = ray[0]
        pts.append(q)
    return smooth_closed(np.array(pts), 4)


# ---------- gối nỉ phồng ----------

def pillow(name, O, c, H, D, col, material, edge=0.02, back=0.6, rings=30, n=220, dents=(), prof=0.5, sub=1):
    """Khối phồng như hai lớp nỉ khâu mép nhồi bông. O: viền CCW (bất kỳ số điểm, sẽ lấy mẫu lại n điểm),
    c: tâm nhìn thấy mọi điểm viền, H: độ phồng mặt trước, D: khoảng từ mép tới chỗ phồng hết,
    dents: [(polyline (M,2), sâu, rộng)] rãnh chần chỉ."""
    O = ccw(resample(np.asarray(O, float), n))
    c = np.asarray(c, float)
    if not check_star(O, c):
        print('WARN pillow not star-shaped', name)
    ts = np.linspace(0, 1, rings + 1)[1:]
    ss = 1 - (1 - ts) ** 1.8
    rings_xy = c[None, None] + ss[:, None, None] * (O[None] - c[None, None])
    flat = np.vstack([c[None], rings_xy.reshape(-1, 2)])
    d = seg_dist(flat, O)

    def hfun(P, dd):
        t = np.clip(dd / D, 0, 1)
        g = (1 - (1 - t) ** 2) ** prof
        h = edge + (H - edge) * g
        for (Q, depth, wid) in dents:
            dq = poly_dist(P, np.asarray(Q, float))
            h = h - depth * np.exp(-(dq / wid) ** 2) * np.clip(dd / (wid * 2.5), 0, 1)
        return h

    h = hfun(flat, d)
    K, N = rings, len(O)
    verts = []
    for (x, y), z in zip(flat, h):
        verts.append((x, y, z))
    nb = len(verts)
    for (x, y), z in zip(flat, h):
        verts.append((x, y, -(z - edge) * back - edge))
    faces = []
    idx = lambda i, j: 1 + i * N + (j % N)
    for j in range(N):
        faces.append((0, idx(0, j), idx(0, j + 1)))
        faces.append((nb, nb + idx(0, j + 1), nb + idx(0, j)))
    for i in range(K - 1):
        for j in range(N):
            a, b_, cc, dd_ = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            faces.append((a, b_, cc, dd_))
            faces.append((nb + a, nb + dd_, nb + cc, nb + b_))
    for j in range(N):
        t0, t1 = idx(K - 1, j), idx(K - 1, j + 1)
        faces.append((t0, nb + t0, nb + t1, t1))
    o = mesh_from(name, verts, faces, col, material)
    if sub:
        subsurf(o, sub)
    o['hfun_D'] = D
    return o, O, (lambda P: hfun(P, seg_dist(P, O)))


def capsule_bm(length, wid, hei, seg=10, rings=6):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=0.5)
    bmesh.ops.scale(bm, vec=(length, wid, hei), verts=bm.verts)
    return bm


def stitches(name, curve, hz, col, material, spacing=0.07, dash=0.045, wid=0.016, hei=0.012, sink=0.35, closed=True, phase=0.0, zfun=None):
    """Mũi chỉ chạy dọc curve (N,2); hz là độ cao mặt nỉ tại đường chỉ (số hoặc hàm của điểm)."""
    P = np.vstack([curve, curve[:1]]) if closed else curve
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(-1))
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    cnt = max(1, int(round(L / spacing)))
    sp = L / cnt
    bm = bmesh.new()
    for i in range(cnt if closed else cnt):
        a = phase * sp + i * sp
        b = a + dash
        if not closed and b > L:
            break
        pa = np.array([np.interp(a % L, s, P[:, 0]), np.interp(a % L, s, P[:, 1])])
        pb = np.array([np.interp(b % L, s, P[:, 0]), np.interp(b % L, s, P[:, 1])])
        za = zfun(pa) if zfun else hz
        zb = zfun(pb) if zfun else hz
        A = Vector((pa[0], pa[1], za))
        B = Vector((pb[0], pb[1], zb))
        mid = (A + B) / 2
        dvec = B - A
        ln = dvec.length
        if ln < 1e-6:
            continue
        cb = capsule_bm(ln + wid * 0.6, wid, hei)
        q = Vector((1, 0, 0)).rotation_difference(dvec.normalized())
        M = Matrix.Translation(mid + Vector((0, 0, -hei * sink))) @ q.to_matrix().to_4x4()
        bmesh.ops.transform(cb, matrix=M, verts=cb.verts)
        tmp = bpy.data.meshes.new('tmp')
        cb.to_mesh(tmp)
        cb.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    return bm_obj(name, bm, col, material)


def tube(name, pts, radius, col, material, res=8, taper=None):
    """Ống tròn mảnh theo đường cong 3D (sợi chỉ, cuống)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = res // 2
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1)
        if taper is not None:
            sp.points[i].radius = taper[i]
    o = bpy.data.objects.new(name, cu)
    col.objects.link(o)
    if material:
        cu.materials.append(material)
    return o


def lathe(name, prof, seg, col, material, smooth=True, twist=0.0):
    """Tiện tròn quanh Z: prof = [(r, z)], đầu/cuối r=0 thì khép cực. twist: lệch nửa ô xen kẽ mỗi vòng (mài giác)."""
    verts = []
    faces = []
    rings = []
    for k, (r, z) in enumerate(prof):
        if r < 1e-6:
            rings.append([len(verts)])
            verts.append((0, 0, z))
        else:
            off = (k % 2) * twist * (2 * math.pi / seg)
            ids = []
            for i in range(seg):
                a = 2 * math.pi * i / seg + off
                ids.append(len(verts))
                verts.append((r * math.cos(a), r * math.sin(a), z))
            rings.append(ids)
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) == 1:
            for i in range(seg):
                faces.append((A[0], B[i], B[(i + 1) % seg]))
        elif len(B) == 1:
            for i in range(seg):
                faces.append((A[i], A[(i + 1) % seg], B[0]))
        elif twist:
            for i in range(seg):
                if k % 2 == 0:
                    faces.append((A[i], A[(i + 1) % seg], B[i]))
                    faces.append((A[(i + 1) % seg], B[(i + 1) % seg], B[i]))
                else:
                    faces.append((A[i], B[(i + 1) % seg], B[i]))
                    faces.append((A[i], A[(i + 1) % seg], B[(i + 1) % seg]))
        else:
            for i in range(seg):
                faces.append((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i]))
    return mesh_from(name, verts, faces, col, material, smooth)


def catmull(P, n_per=12, closed=False):
    """Đường cong mượt qua các điểm (Catmull-Rom), P (N,d)."""
    P = np.asarray(P, float)
    if closed:
        Q = np.vstack([P[-1:], P, P[:2]])
    else:
        Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(Q[-2])
    return np.array(out)
