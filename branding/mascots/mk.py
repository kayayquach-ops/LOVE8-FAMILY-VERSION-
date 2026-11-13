# Hàm dựng linh vật Sweet Home trong Blender (chạy qua MCP Blender hoặc Text Editor).
# Toạ độ viết theo khung glTF (x sang phải, y lên trên, z hướng về người xem) rồi đổi sang Blender (x, -z, y).
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion

def V(x, y, z):
    return Vector((x, -z, y))

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgba(hexs):
    h = hexs.lstrip('#')
    return (lin(int(h[0:2], 16)), lin(int(h[2:4], 16)), lin(int(h[4:6], 16)), 1.0)

def mat(name, hexs, rough=0.6, sheen=0.5, coat=0.15, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col = rgba(hexs)
    # vật liệu trùng tên dựng lại: bỏ nối cũ vào Base Color để màu trơn có hiệu lực
    for l in list(bsdf.inputs['Base Color'].links):
        m.node_tree.links.remove(l)
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    for k, v in (('Sheen Weight', sheen), ('Sheen Roughness', 0.6), ('Coat Weight', coat), ('Coat Roughness', 0.35)):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    if 'Sheen Tint' in bsdf.inputs:
        bsdf.inputs['Sheen Tint'].default_value = tuple(min(1.0, c * 0.4 + 0.6) for c in col[:3]) + (1.0,)
    if emit > 0:
        bsdf.inputs['Emission Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = col
    return m

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))) if e1 != e0 else (1.0 if x >= e0 else 0.0)
    return t * t * (3 - 2 * t)

def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c

def wipe_collection(name):
    c = bpy.data.collections.get(name)
    if not c:
        return
    for o in list(c.objects):
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d is not None and getattr(d, 'users', 1) == 0:
            if isinstance(d, bpy.types.Mesh): bpy.data.meshes.remove(d)
            elif isinstance(d, bpy.types.MetaBall): bpy.data.metaballs.remove(d)
            elif isinstance(d, bpy.types.Curve): bpy.data.curves.remove(d)

def empty(name, c, at=(0, 0, 0), size=0.1):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size
    o.location = V(*at)
    c.objects.link(o)
    return o

def mesh_obj(name, bm, c, material=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    if material:
        me.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o

def sphere_bm(radii=(1, 1, 1), seg=32, rings=None):
    """Khối cầu UV, bán kính theo glTF (rx, ry, rz)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings or max(8, seg // 2), radius=1.0)
    rx, ry, rz = radii
    bmesh.ops.scale(bm, vec=(rx, rz, ry), verts=bm.verts)
    return bm

def ellipsoid(name, c, center, radii, material, seg=32, rings=None):
    o = mesh_obj(name, sphere_bm(radii, seg, rings), c, material)
    o.location = V(*center)
    return o

def set_origin(o, at):
    """Dời gốc của vật tới điểm glTF `at` (toạ độ thế giới), hình giữ nguyên chỗ."""
    upd()
    w = V(*at)
    mw = o.matrix_world.copy()
    local = mw.inverted() @ w
    o.data.transform(Matrix.Translation(-local))
    o.matrix_world = mw @ Matrix.Translation(local)

def upd():
    bpy.context.view_layer.update()

def parent_keep(child, par):
    upd()
    mw = child.matrix_world.copy()
    child.parent = par
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = mw

def surf_k(s=2.0, t=0.6):
    """Tỉ lệ bán kính mặt thấy được / bán kính ảnh hưởng của một quả metaball đứng riêng (trường s*(1-d²/r²)³)."""
    return math.sqrt(1 - (t / s) ** (1 / 3))

def metaball(name, c, elems, res=0.025, thresh=0.6):
    """elems: t (BALL/ELLIPSOID/CAPSULE), co (glTF), R (bán kính mặt khi đứng riêng) hoặc r, size (glTF sx,sy,sz),
    s (độ cứng: cao thì hoà vào nhau ít), neg, rot (độ, quanh trục glTF x, y, z)."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = thresh
    o = bpy.data.objects.new(name, mb)
    c.objects.link(o)
    for e in elems:
        el = mb.elements.new(type=e.get('t', 'BALL'))
        el.co = V(*e['co'])
        st = e.get('s', 2.0)
        el.radius = e['R'] / surf_k(st, thresh) if 'R' in e else e.get('r', 1.0)
        el.stiffness = st
        el.use_negative = e.get('neg', False)
        sx, sy, sz = e.get('size', (1, 1, 1))
        el.size_x, el.size_y, el.size_z = sx, sz, sy
        if 'rot' in e:
            rx, ry, rz = [math.radians(a) for a in e['rot']]
            q = Quaternion((1, 0, 0), rx)
            q = Quaternion((0, 0, 1), ry) @ q
            q = Quaternion((0, -1, 0), rz) @ q
            el.rotation = q
    return o

def meta_to_mesh(o, name, c, material=None):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    me.name = name
    mb = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    m = bpy.data.objects.new(name, me)
    c.objects.link(m)
    if material:
        me.materials.clear()
        me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    return m

def add_mod(o, kind, **kw):
    md = o.modifiers.new(kind.lower(), kind)
    for k, v in kw.items():
        setattr(md, k, v)
    return md

def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    mats = list(old.materials)
    o.modifiers.clear()
    o.data = me
    me.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    if not me.materials and mats:
        for m in mats:
            me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True

def bbox_gltf(objs):
    upd()
    xs, ys, zs = [], [], []
    for o in objs:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            xs.append(w.x); ys.append(w.z); zs.append(-w.y)
    return (round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)), (round(max(xs), 3), round(max(ys), 3), round(max(zs), 3))

def surface(o, x, y, zstart=3.0):
    """Bắn tia theo -z (glTF) vào vật o: trả z mặt trước tại (x, y) và pháp tuyến (glTF)."""
    upd()
    mw = o.matrix_world
    inv = mw.inverted()
    origin = inv @ V(x, y, zstart)
    direction = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
    ok, loc, nor, idx = o.ray_cast(origin, direction)
    if not ok:
        return None, None
    w = mw @ loc
    n = (mw.to_3x3().inverted().transposed() @ nor).normalized()
    return -w.y, (n.x, n.z, -n.y)

def cast(o, frm, d):
    """Bắn tia từ điểm frm theo hướng d (glTF) vào o: trả (điểm, pháp tuyến) theo glTF hoặc (None, None)."""
    upd()
    mw = o.matrix_world
    inv = mw.inverted()
    origin = inv @ V(*frm)
    direction = (inv.to_3x3() @ V(*d)).normalized()
    ok, loc, nor, idx = o.ray_cast(origin, direction)
    if not ok:
        return None, None
    w = mw @ loc
    n = (mw.to_3x3().inverted().transposed() @ nor).normalized()
    return Vector((w.x, w.z, -w.y)), Vector((n.x, n.z, -n.y))

def decal(name, c, target, cx, cy, ax, ay, height, material, n=2.0, seg=48, rings=None, edge=0.35,
          dome=0.0, tuck=0.014, rot=0.0):
    """Mảng nổi bám mặt trước của target (mặt nạ, mõm, rong biển...): viền siêu elip (n=2 là elip, n lớn là chữ nhật bo góc),
    mặt phẳng mép bo tròn (dome=0) hoặc vòm (dome>0 là số mũ của (1-ρ²)). Mép gài chìm vào thân `tuck`."""
    import bmesh
    if rings is None:
        rings = [0.0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.87, 0.93, 0.97, 0.99, 1.0]
    cr, sr = math.cos(rot), math.sin(rot)
    def outline(rho, th):
        co, si = math.cos(th), math.sin(th)
        ex = 2.0 / n
        u = ax * rho * math.copysign(abs(co) ** ex, co)
        v = ay * rho * math.copysign(abs(si) ** ex, si)
        return cx + u * cr - v * sr, cy + u * sr + v * cr
    def h(rho):
        if dome > 0:
            return height * max(0.0, 1 - rho * rho) ** dome
        s = max(0.0, (rho - (1 - edge)) / edge)
        return height * math.sqrt(max(0.0, 1 - s * s))
    bm = bmesh.new()
    grid = []
    for rho in rings:
        row = []
        for j in range(1 if rho == 0 else seg):
            th = 2 * math.pi * j / seg
            x, y = outline(rho, th)
            z, nr = surface(target, x, y)
            if z is None:
                raise RuntimeError(f'decal {name}: miss at {x:.3f},{y:.3f}')
            hh = h(rho)
            row.append(bm.verts.new(V(x + nr[0] * hh, y + nr[1] * hh, z + nr[2] * hh)))
        grid.append(row)
    row = []
    for j in range(seg):
        th = 2 * math.pi * j / seg
        x, y = outline(1.0, th)
        z, nr = surface(target, x, y)
        row.append(bm.verts.new(V(x - nr[0] * tuck, y - nr[1] * tuck, z - nr[2] * tuck)))
    grid.append(row)
    for j in range(seg):
        bm.faces.new((grid[0][0], grid[1][j], grid[1][(j + 1) % seg]))
    for i in range(1, len(grid) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][k], grid[i][k]))
    return mesh_obj(name, bm, c, material)

def place_on(target, obj, x, y, inset=0.0, orient=True, pitch=True):
    """Đặt gốc obj lên mặt trước của target tại (x, y), lùi `inset` theo pháp tuyến (âm là chìm vào)."""
    z, n = surface(target, x, y)
    if z is None:
        raise RuntimeError(f'no surface at {x},{y}')
    nx, ny, nz = n
    obj.location = V(x + nx * inset, y + ny * inset, z + nz * inset)
    if orient:
        yaw = math.atan2(nx, nz)
        pit = math.asin(max(-1, min(1, ny))) if pitch else 0.0
        obj.rotation_mode = 'XYZ'
        obj.rotation_euler = (pit, 0, yaw)
    return z, n
