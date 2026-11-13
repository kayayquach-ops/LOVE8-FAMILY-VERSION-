# Hàm dựng hình dùng chung cho thú bông (gốc Mascot, ống, khối giọt, cơm nắm, ngôi sao...). Chạy sau mk.py.

import bpy, bmesh, math

from mathutils import Matrix, Vector


def start(shape):
    """Dọn collection của hình và tạo gốc Mascot ở (0,0,0)."""
    wipe_collection(shape)
    c = coll(shape)
    root = empty(f'{shape}_Mascot', c, (0, 0, 0), 0.3)
    return c, root


def zup(o):
    """Xoay khung vật để trục z (glTF) của nó dựng đứng, hình giữ nguyên: bộ chuyển động kéo trục z là miệng mở dọc."""
    o.data.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (math.radians(-90), 0, 0)


def join_into(target, others):
    """Gộp lưới các vật khác vào target (giữ vị trí thế giới), xoá vật kia."""
    import bmesh
    upd()
    bm = bmesh.new()
    bm.from_mesh(target.data)
    inv = target.matrix_world.inverted()
    for o in others:
        me = o.data.copy()
        me.transform(inv @ o.matrix_world)
        # vật liệu: dồn chỉ số theo bảng của target
        idx_map = {}
        for i, mt in enumerate(o.data.materials):
            if mt.name not in [x.name for x in target.data.materials]:
                target.data.materials.append(mt)
            idx_map[i] = [x.name for x in target.data.materials].index(mt.name)
        for p in me.polygons:
            p.material_index = idx_map.get(p.material_index, 0)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d.users == 0:
            bpy.data.meshes.remove(d)
    bm.to_mesh(target.data)
    bm.free()
    for p in target.data.polygons:
        p.use_smooth = True


def finish(P, c, root):
    """Gắn mọi vật chưa có cha vào gốc Mascot."""
    for o in c.objects:
        if o is not root and o.parent is None:
            parent_keep(o, root)


def tube(name, c, pts, radius, material, radii=None, res=10, bev=3, cap=True):
    """Ống cong mềm qua các điểm glTF; radii là hệ số bán kính từng điểm; cap: bo tròn đầu cuối bằng nửa khối cầu."""
    cu = bpy.data.curves.new(name + 'Cu', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = bev
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = V(*p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = radii[i] if radii else 1.0
    o = bpy.data.objects.new(name + 'Tmp', cu)
    c.objects.link(o)
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = name
    m = bpy.data.objects.new(name, me)
    c.objects.link(m)
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    if cap:
        r = radius * (radii[-1] if radii else 1.0)
        tip = ellipsoid(name + 'Tip', c, pts[-1], (r, r, r), material, seg=12, rings=8)
        join_into(m, [tip])
    return m


def top_of(o):
    upd()
    return max((o.matrix_world @ v.co).z for v in o.data.vertices)


def deform(o, fn):
    """fn(p glTF) -> p mới, áp lên mọi đỉnh (toạ độ thế giới)."""
    upd()
    mw = o.matrix_world
    inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        q = fn(Vector((w.x, w.z, -w.y)))
        v.co = inv @ V(q.x, q.y, q.z)
    o.data.update()


def petal(name, c, material, base, angle, length, width, thick=0.6, tip=0.3, power=1.4, bend=0.0, sway=0.0,
          tilt=0.0, level=3):
    """Khối giọt dài thon đầu (lông, tai, cánh sao): gốc ở `base`, trục nghiêng `angle` độ trong mặt phẳng trước
    (0 là thẳng lên, dương là ngả sang phải màn hình), ngả ra sau `tilt` độ. tip: độ rộng mũi so với gốc;
    bend: cong về trước theo chiều dài; sway: cong ngang."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2 ** level - 1, use_grid_fill=True)
    a, tl = math.radians(angle), math.radians(tilt)
    R = Matrix.Rotation(-a, 3, 'Z') @ Matrix.Rotation(-tl, 3, 'X')  # trong khung glTF: quanh z (trước), quanh x
    pts = []
    for v in bm.verts:
        q = v.co.normalized()
        x, y, z = q.x, q.z, -q.y
        t = (y + 1) / 2
        k = 1 - (1 - tip) * t ** power
        px = x * width / 2 * k
        pz = z * width / 2 * thick * k
        py = t * length
        px += sway * t * t * length
        pz += bend * t * t * length
        p = R @ Vector((px, py, pz))
        v.co = V(base[0] + p.x, base[1] + p.y, base[2] + p.z)
    return mesh_obj(name, bm, c, material)


def rot_about(p, pivot, axis, ang):
    return pivot + Matrix.Rotation(ang, 3, axis) @ (p - pivot)


def onigiri(name, c, material, W=0.9, H=0.86, depth=0.5, k=0.13, m=3.2, cy=0.84, level=4):
    """Cơm nắm tam giác bo tròn: khối cầu ô vuông đổi sang siêu elip (mặt trước phẳng, mép phồng) rồi điều biến bán kính
    theo góc cho ra ba góc tròn (một góc hướng lên)."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2 ** level - 1, use_grid_fill=True)
    for v in bm.verts:
        q = v.co.normalized()
        x, y, z = q.x, q.z, -q.y  # glTF
        rxy = math.sqrt(x * x + y * y)
        th = math.atan2(y, x)
        zz = math.copysign(abs(z) ** (2 / m), z)
        rr = rxy ** (2 / m)
        tri = 1 + k * math.cos(3 * (th - math.pi / 2))
        X = rr * tri * math.cos(th) * W
        Y = rr * tri * math.sin(th) * H
        if Y < 0:
            Y *= 0.92  # đáy hơi bằng
        v.co = V(X, Y + cy, zz * depth)
    o = mesh_obj(name, bm, c, material)
    lo = min(v.co.z for v in o.data.vertices)
    o.data.transform(Matrix.Translation((0, 0, -lo)))
    return o


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def star_radius(th, Rt=1.06, Rv=0.62, side=0.62, p=1.05):
    """Bán kính viền sao theo góc: năm mũi tròn, hai mũi ngang ngắn lại (để cánh tay rời phủ lên)."""
    s5 = (1 + math.cos(5 * (th - math.pi / 2))) / 2
    d = min(abs(wrap(th - math.radians(18))), abs(wrap(th - math.radians(162))))
    sm = math.cos(min(d, math.pi / 5) / (math.pi / 5) * math.pi / 2) ** 2
    amp = (Rt - Rv) * (1 - (1 - side) * sm)
    return Rv + amp * s5 ** p


def star_body(name, c, material, cy, depth=0.36, m=2.6, level=5):
    """Sao phồng như gối: viền sao theo star_radius, mặt trước phẳng mép phồng (siêu elip), mũi mỏng hơn thân."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2 ** level - 1, use_grid_fill=True)
    for v in bm.verts:
        q = v.co.normalized()
        x, y, z = q.x, q.z, -q.y
        rxy = math.sqrt(x * x + y * y)
        th = math.atan2(y, x)
        zz = math.copysign(abs(z) ** (2 / m), z)
        rr = rxy ** (2 / m)
        r = star_radius(th)
        dome = 1 + 0.18 * (1 - rr * rr)
        v.co = V(rr * r * math.cos(th), cy + rr * r * math.sin(th), zz * depth * (0.62 / r) ** 0.45 * dome)
    return mesh_obj(name, bm, c, material)

