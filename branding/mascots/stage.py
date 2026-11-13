# Sân khấu chụp ảnh xem trước bằng Cycles: phông kem uốn cong, ánh sáng mềm (đèn chính trái trên, đèn phụ phải, đèn viền sau).
# Chạy sau mk.py. render_tile(shape, yaw, path) chụp một hình ở một góc, miệng ẩn như lúc nghỉ trong app.
import bpy, bmesh, math
from mathutils import Vector

def setup_stage(bg='#ECE6DC'):
    c = coll('stage')
    wipe_collection('stage')
    # phông cong: sàn + cung tròn + tường sau
    bm = bmesh.new()
    prof = []
    for i in range(12):
        prof.append((-8.0 + i * 0.85, 0.0))
    R = 2.2
    y0 = prof[-1][0] + 0.4
    for i in range(1, 13):
        a = (i / 12) * math.pi / 2
        prof.append((y0 + math.sin(a) * R, R - math.cos(a) * R))
    prof.append((y0 + R, 9.0))
    cols = []
    for x in (-10.0, 10.0):
        cols.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((cols[0][i], cols[1][i], cols[1][i + 1], cols[0][i + 1]))
    m = bpy.data.materials.get('StageBG') or bpy.data.materials.new('StageBG')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = rgba(bg)
    b.inputs['Roughness'].default_value = 1.0
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = 0.1
    o = mesh_obj('StageBackdrop', bm, c, m)
    o.location = (0, 0, 0)
    # máy quay
    cam = bpy.data.cameras.new('PreviewCam')
    cam.sensor_fit = 'VERTICAL'
    cam.sensor_height = 24
    cam.lens = 62
    co = bpy.data.objects.new('PreviewCam', cam)
    c.objects.link(co)
    co.location = (0, -7.2, 1.15)
    co.rotation_euler = (math.radians(89.2), 0, 0)
    bpy.context.scene.camera = co
    def area(name, loc, size, energy, color=(1, 1, 1)):
        L = bpy.data.lights.new(name, 'AREA')
        L.size = size
        L.energy = energy
        L.color = color
        lo = bpy.data.objects.new(name, L)
        c.objects.link(lo)
        lo.location = loc
        d = Vector((0, 0, 1.0)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return lo
    area('Key', (-3.2, -4.2, 4.6), 3.5, 900, (1.0, 0.97, 0.93))
    area('Fill', (4.2, -3.4, 2.2), 4.0, 280, (0.95, 0.96, 1.0))
    area('Rim', (2.6, 3.2, 3.8), 2.5, 600, (1.0, 0.98, 0.96))
    area('Top', (0, -1.0, 6.0), 4.0, 200)
    sc = bpy.context.scene
    w = sc.world
    w.use_nodes = True
    bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    # ánh sáng trời trung tính như RoomEnvironment của app (chỉ phông là màu kem)
    bgn.inputs[0].default_value = (0.8, 0.8, 0.8, 1)
    bgn.inputs[1].default_value = 0.4
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    sc.cycles.device = 'GPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    sc.cycles.samples = 160
    sc.cycles.use_denoising = True
    sc.render.film_transparent = False
    try:
        # cùng kiểu nén sáng với app (three.js NeutralToneMapping = Khronos PBR Neutral) để màu ảnh render giống trong app
        sc.view_settings.view_transform = 'Khronos PBR Neutral'
        sc.view_settings.look = 'None'
        sc.view_settings.exposure = -0.9
    except TypeError:
        pass
    return c

def render_tile(shape, yaw, path, w=900, h=1000, samples=160, mouth=0.0):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.cycles.samples = samples
    roots = {o.name[:-7]: o for o in bpy.data.objects if o.name.endswith('_Mascot')}
    saved = {}
    for s, r in roots.items():
        cc = bpy.data.collections.get(s)
        if cc:
            saved[s] = (cc.hide_render, r.location.copy(), r.rotation_euler.copy())
            cc.hide_render = s != shape
    r = roots[shape]
    r.location = (0, 0, 0)
    r.rotation_euler = (0, 0, math.radians(yaw))
    mo = bpy.data.objects.get(f'{shape}_Mouth')
    if mo:
        ms = mo.scale.copy()
        # trục glTF (x, y, z) của miệng = trục Blender (x, z, y)
        mo.scale = (0.9 + mouth * 0.5, max(0.1, mouth * 1.7), 1) if mouth else (0, 0, 0)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if mo:
        mo.scale = ms
    for s, (hr, loc, rot) in saved.items():
        bpy.data.collections[s].hide_render = hr
        roots[s].location = loc
        roots[s].rotation_euler = rot
    return path
