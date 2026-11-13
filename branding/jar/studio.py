# Sân khấu chụp: máy quay trực giao nhìn từ -Y, đèn hộp mềm (chính trái trên, phụ phải, viền sau, dải dọc cho thuỷ tinh),
# môi trường dải màu kem ấm để kim loại và thuỷ tinh có thứ mà phản chiếu.
import bpy, math
from mathutils import Vector


def gpu_on(sc):
    try:
        sc.render.engine = 'CYCLES'
    except TypeError as e:
        print(e)
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for typ in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = typ
            prefs.get_devices()
            devs = [d for d in prefs.devices if d.type == typ]
            if devs:
                for d in prefs.devices:
                    d.use = d.type == typ
                sc.cycles.device = 'GPU'
                print('GPU', typ, [d.name for d in devs])
                return
        except TypeError:
            continue
    sc.cycles.device = 'CPU'


def world(strength=0.55, through=None):
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_WORLD':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_WORLD')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1
    mr.inputs['From Max'].default_value = 1
    nt.links.new(sp.outputs['Z'], mr.inputs['Value'])
    rp = ramp(nt, [(0.0, rgb('#6E6056')), (0.40, rgb('#B4A596'))])
    for p, h in ((0.49, '#D9CCBC'), (0.53, '#F4EEE5'), (0.75, '#FFFDF9'), (1.0, '#EEF0F2')):
        e = rp.color_ramp.elements.new(p)
        e.color = rgb(h)
    nt.links.new(mr.outputs['Result'], rp.inputs['Fac'])
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    nt.links.new(rp.outputs['Color'], bg.inputs['Color'])
    if through is None:
        nt.links.new(bg.outputs[0], out.inputs['Surface'])
        return
    # nhìn xuyên đá trong (pha lê, giọt sương) thấy nền sáng như chụp sản phẩm trên nền kem
    lp = nt.nodes.new('ShaderNodeLightPath')
    bt = nt.nodes.new('ShaderNodeBackground')
    bt.inputs['Color'].default_value = rgb('#F6F2EC')
    bt.inputs['Strength'].default_value = through
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Transmission Ray'], mx.inputs[0])
    nt.links.new(bg.outputs[0], mx.inputs[1])
    nt.links.new(bt.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


def area(c, name, loc, size, energy, color=(1, 1, 1), size_y=None, target=(0, 0, 0)):
    L = bpy.data.lights.new(name, 'AREA')
    if size_y:
        L.shape = 'RECTANGLE'
        L.size = size
        L.size_y = size_y
    else:
        L.size = size
    L.energy = energy
    L.color = color
    o = bpy.data.objects.new(name, L)
    c.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


def lights(scale=1.0, target=(0, 0, 0)):
    c = coll('studio')
    k = scale * scale
    t = Vector(target)
    area(c, 'Key', t + Vector((-3.4, -4.4, 4.2)) * scale, 3.0 * scale, 900 * k, (1.0, 0.965, 0.92), target=t)
    area(c, 'Fill', t + Vector((4.4, -3.6, 1.2)) * scale, 4.0 * scale, 260 * k, (0.95, 0.965, 1.0), target=t)
    area(c, 'Rim', t + Vector((2.8, 3.6, 3.6)) * scale, 2.5 * scale, 650 * k, (1.0, 0.98, 0.95), target=t)
    area(c, 'Top', t + Vector((0, -1.0, 6.0)) * scale, 4.0 * scale, 220 * k, target=t)
    # dải sáng dọc: vệt phản chiếu dài trên thuỷ tinh và kim loại
    area(c, 'StripL', t + Vector((-2.6, -3.0, 0.6)) * scale, 0.45 * scale, 260 * k, (1, 0.98, 0.96), size_y=4.5 * scale, target=t)
    area(c, 'StripR', t + Vector((3.0, -2.2, 0.8)) * scale, 0.3 * scale, 120 * k, (0.97, 0.98, 1.0), size_y=4.0 * scale, target=t)
    return c


def card(name, loc, w, h, strength, target=(0, 0, 0), soft=1.6):
    """Hộp sáng mềm chỉ hiện trong phản chiếu/khúc xạ: sáng giữa, mờ dần ra mép (vệt sáng trên kính không bị cứng)."""
    c = coll('studio')
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    m = bpy.data.materials.new(name + 'Mat')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
    def bell(sock, p):
        a = node(nt, 'ShaderNodeMath', operation='MULTIPLY_ADD')
        nt.links.new(sock, a.inputs[0])
        a.inputs[1].default_value = 2.0
        a.inputs[2].default_value = -1.0
        q = node(nt, 'ShaderNodeMath', operation='POWER')
        nt.links.new(a.outputs[0], q.inputs[0])
        q.inputs[1].default_value = 2.0
        r = node(nt, 'ShaderNodeMath', operation='SUBTRACT')
        r.inputs[0].default_value = 1.0
        nt.links.new(q.outputs[0], r.inputs[1])
        t = node(nt, 'ShaderNodeMath', operation='POWER')
        nt.links.new(r.outputs[0], t.inputs[0])
        t.inputs[1].default_value = p
        return t.outputs[0]
    bx = bell(sp.outputs['X'], soft)
    by = bell(sp.outputs['Y'], 0.35)
    mul = node(nt, 'ShaderNodeMath', operation='MULTIPLY')
    nt.links.new(bx, mul.inputs[0])
    nt.links.new(by, mul.inputs[1])
    mul2 = node(nt, 'ShaderNodeMath', operation='MULTIPLY')
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    mul2.inputs[1].default_value = strength
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 0.985, 0.965, 1)
    nt.links.new(mul2.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    try:
        m.emission_sampling = 'NONE'
    except Exception:
        pass
    me.materials.append(m)
    o.visible_camera = False
    o.visible_diffuse = False
    o.visible_shadow = False
    o.visible_volume_scatter = False
    return o


def camera(ortho=2.0, loc=(0, -10, 0), tilt=0.0):
    c = coll('studio')
    cam = bpy.data.cameras.new('Cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = ortho
    cam.clip_end = 100
    o = bpy.data.objects.new('Cam', cam)
    c.objects.link(o)
    o.location = loc
    o.rotation_euler = (math.radians(90 - tilt), 0, 0)
    bpy.context.scene.camera = o
    return o


def setup(samples=256, exposure=0.0):
    sc = bpy.context.scene
    gpu_on(sc)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    sc.cycles.max_bounces = 16
    sc.cycles.transmission_bounces = 16
    sc.cycles.glossy_bounces = 8
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.caustics_reflective = True
    sc.cycles.caustics_refractive = True
    sc.cycles.blur_glossy = 0.5
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '16'
    sc.render.resolution_percentage = 100
    try:
        sc.view_settings.view_transform = 'Khronos PBR Neutral'
    except TypeError as e:
        print(e)
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = exposure


def frame_objects(cam, objs, margin=1.12):
    """Đặt máy quay trực giao ôm vừa các vật (đã tính modifier)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    M = cam.matrix_world.inverted()
    for o in objs:
        if o.type not in ('MESH', 'CURVE'):
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = oe.matrix_world
        for v in me.vertices:
            p = M @ (mw @ v.co)
            xs.append(p.x)
            zs.append(p.y)
        oe.to_mesh_clear()
    cx, cy = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    w, h = max(xs) - min(xs), max(zs) - min(zs)
    rx = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    ry = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    cam.location = cam.location + rx * cx + ry * cy
    cam.data.ortho_scale = max(w, h) * margin
    return w, h


def render(path, w, h):
    sc = bpy.context.scene
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
