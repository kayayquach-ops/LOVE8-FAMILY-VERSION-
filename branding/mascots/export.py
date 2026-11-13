# Xuất một hình ra GLB gọn: bỏ tiền tố "<shape>_" khỏi tên vật (EyeL, Mouth, Stalk...), gốc về (0,0,0),
# tắt sheen/coat lúc xuất để GLB không kèm phần mở rộng KHR (app tự phủ chất liệu mềm), không UV, không hoạt ảnh.
import bpy

def export_shape(shape, outdir):
    c = bpy.data.collections[shape]
    root = bpy.data.objects[f'{shape}_Mascot']
    old_loc = root.location.copy()
    root.location = (0, 0, 0)
    pre = shape + '_'
    renamed = []
    for o in c.objects:
        if o.name.startswith(pre):
            renamed.append((o, o.name))
    for o, n in renamed:
        o.name = n[len(pre):]
        if o.data is not None:
            o.data.name = o.name
    saved = []
    mats = {m for o in c.objects if o.type == 'MESH' for m in o.data.materials if m}
    for m in mats:
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        # Giá trị mặc định của Blender thì bộ xuất không ghi phần mở rộng KHR_materials_*.
        for k, v in (('Sheen Weight', 0.0), ('Coat Weight', 0.0), ('Coat Roughness', 0.03), ('Emission Strength', 0.0),
                     ('Specular IOR Level', 0.5)):
            if k in b.inputs:
                saved.append((b.inputs[k], b.inputs[k].default_value))
                b.inputs[k].default_value = v
    hidden = []
    try:
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for o in c.objects:
            if o.get('noexport'):
                continue
            if o.hide_get():
                hidden.append(o)
                o.hide_set(False)
            o.select_set(True)
        path = f'{outdir}\\{shape}.glb'
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
            export_texcoords=False, export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_vertex_color='NAME', export_vertex_color_name='Col', export_animations=False, export_skins=False, export_morph=False,
            export_lights=False, export_cameras=False, export_extras=False, export_image_format='NONE')
    finally:
        for inp, v in saved:
            inp.default_value = v
        for o, n in renamed:
            o.name = n
            if o.data is not None:
                o.data.name = n
        for o in hidden:
            o.hide_set(True)
        root.location = old_loc
    return path
