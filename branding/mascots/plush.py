# Thú bông vải nỉ: ráp mảnh vải theo đường may rồi bơm phồng bằng Cloth có Pressure.
# Chạy sau mk.py, lib.py. Toạ độ theo glTF (x phải, y lên, z về phía người xem).
import bpy, bmesh, math
from mathutils import Vector, Matrix

def pattern(name, c, elems, voxel=0.035, res=0.03, material=None, lumpy=0.0, seed=1):
    """Dáng gốc của một món thú bông (metaball mềm) -> lưới ô đều để may và bơm. lumpy: độ lồi lõm do nhồi bông không đều."""
    o = metaball(f'mb{name.replace("_", "")}', c, elems, res=res)
    m = meta_to_mesh(o, name, c, material)
    add_mod(m, 'REMESH', mode='VOXEL', voxel_size=voxel, use_smooth_shade=True)
    apply_mods(m)
    if lumpy:
        from mathutils import noise
        off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
        for v in m.data.vertices:
            v.co += v.normal * lumpy * noise.noise(v.co * 2.2 + off)
    return m

def cut_seams(o, cuts, eps=1e-4):
    """cuts: [(điểm glTF, pháp tuyến glTF, hàm lọc p->bool hoặc None)]. Cắt lưới theo các mặt phẳng, trả chỉ số đỉnh nằm trên đường may
    (đỉnh trên mặt phẳng và qua bộ lọc). Ghi nhóm đỉnh 'seam'."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    seam = set()
    for co, no, keep in cuts:
        pc, pn = V(*co), V(*no).normalized()
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=pc, plane_no=pn, dist=eps)
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            if abs((v.co - pc).dot(pn)) < 1e-3:
                p = Vector((v.co.x, v.co.z, -v.co.y))
                if keep is None or keep(p):
                    seam.add(v)
    # tam giác hoá mặt n-giác do cắt để vải mô phỏng ổn định
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.verts.ensure_lookup_table()
    idx = [v.index for v in seam]
    bm.to_mesh(o.data)
    bm.free()
    g = o.vertex_groups.get('seam') or o.vertex_groups.new(name='seam')
    g.add(idx, 1.0, 'REPLACE')
    return idx

def grow_group(o, name, rings=1, falloff=0.5):
    """Nới nhóm đỉnh ra các đỉnh kề (trọng số giảm dần), cho rãnh may mềm hơn."""
    me = o.data
    g = o.vertex_groups[name]
    w = {}
    for v in me.vertices:
        for ge in v.groups:
            if ge.group == g.index:
                w[v.index] = ge.weight
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    cur = dict(w)
    for r in range(rings):
        nxt = dict(cur)
        for i, wt in cur.items():
            for j in nb[i]:
                nxt[j] = max(nxt.get(j, 0), wt * falloff)
        cur = nxt
    for i, wt in cur.items():
        g.add([i], wt, 'REPLACE')

def inflate(o, pressure=4.0, frames=30, pin='seam', tension=12.0, bending=0.3, shrink=0.0, quality=6, mass=0.25,
            pin_stiff=1.0, seam_shrink=0.0, shrink_group='seam'):
    """Bơm phồng: vải căng ra theo áp suất, đường may (nhóm pin) giữ lại nên lõm xuống thành rãnh. Áp dụng kết quả vào lưới."""
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = max(sc.frame_end, frames + 1)
    md = o.modifiers.new('Cloth', 'CLOTH')
    s = md.settings
    s.quality = quality
    s.mass = mass
    s.air_damping = 2.0
    s.tension_stiffness = tension
    s.compression_stiffness = tension
    s.shear_stiffness = tension * 0.5
    s.bending_stiffness = bending
    s.tension_damping = 5
    s.compression_damping = 5
    s.use_pressure = True
    s.uniform_pressure_force = pressure
    s.pressure_factor = 1.0
    s.shrink_min = shrink
    if seam_shrink:
        # đường may rút ngắn: vải nhăn nhẹ và thắt lõm dọc đường ráp
        s.vertex_group_shrink = shrink_group
        s.shrink_max = seam_shrink
    s.effector_weights.gravity = 0.0
    if pin:
        s.vertex_group_mass = pin
        s.pin_stiffness = pin_stiff
    md.point_cache.frame_start = 1
    md.point_cache.frame_end = frames + 1
    md.collision_settings.use_collision = False
    md.collision_settings.use_self_collision = False
    for f in range(1, frames + 2):
        sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    mats = list(old.materials)
    o.modifiers.clear()
    o.data = me
    me.name = old.name
    for m in mats:
        if m.name not in me.materials:
            me.materials.append(m)
    if old.users == 0:
        bpy.data.meshes.remove(old)
    for p in me.polygons:
        p.use_smooth = True
    sc.frame_set(1)
    return o

def box_uv(o, scale=2.0, name='UVMap'):
    """UV chiếu hộp theo pháp tuyến từng mặt (vân nỉ ngẫu nhiên nên không lộ đường nối). scale: số lần lặp vân trên 1 đơn vị."""
    me = o.data
    uv = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    mw = o.matrix_world
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u * scale, v * scale)

def felt_mat(name, hexs, normal_img=None, rough=0.9, sheen=1.0, strength=1.0):
    """Vải nỉ: nhám cao, tán xạ kiểu vải (diffuse roughness), sheen mạnh (lông tơ bắt sáng ở mép), normal map sợi nỉ."""
    m = mat(name, hexs, rough=rough, sheen=sheen, coat=0.0)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in (('Sheen Roughness', 0.35), ('Diffuse Roughness', 1.0), ('Specular IOR Level', 0.25)):
        if k in b.inputs:
            b.inputs[k].default_value = v
    if normal_img:
        img = bpy.data.images.get('felt-normal') or bpy.data.images.load(normal_img)
        img.name = 'felt-normal'
        img.colorspace_settings.name = 'Non-Color'
        tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nm = next((n for n in nt.nodes if n.type == 'NORMAL_MAP'), None) or nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        tex.location = (b.location.x - 600, b.location.y - 300)
        nm.location = (b.location.x - 300, b.location.y - 300)
    return m

def deepen_seams(o, idx, depth=0.022, width=0.03, protect=3.0):
    """Khoét rãnh dọc đường may (vải bị chỉ kéo thắt vào) và ghi nhóm 'keep' để giảm đa giác không làm mất rãnh."""
    from mathutils.kdtree import KDTree
    me = o.data
    kd = KDTree(len(idx))
    for i, vi in enumerate(idx):
        kd.insert(me.vertices[vi].co, i)
    kd.balance()
    dist = []
    for v in me.vertices:
        co, i, d = kd.find(v.co)
        dist.append(d)
    nrm = [v.normal.copy() for v in me.vertices]
    for v, d, n in zip(me.vertices, dist, nrm):
        v.co -= n * depth * math.exp(-(d / width) ** 2)
    me.update()
    g = o.vertex_groups.get('keep') or o.vertex_groups.new(name='keep')
    for v, d in zip(me.vertices, dist):
        g.add([v.index], math.exp(-(d / (width * protect)) ** 2), 'REPLACE')
    return dist

def decimate_keep(o, faces, group='keep'):
    n = len(o.data.polygons)
    if faces and n > faces:
        md = add_mod(o, 'DECIMATE', ratio=faces / n)
        if group and o.vertex_groups.get(group):
            md.vertex_group = group
            md.invert_vertex_group = True
            md.vertex_group_factor = 1.5
        apply_mods(o)
