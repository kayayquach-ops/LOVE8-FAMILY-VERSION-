# Lọ yêu thương + 10 hạt charm của Sweet Home, dựng và chụp bằng Blender 5.2 chạy nền (không đụng Blender đang mở).
# Các bước (bản 13/11/2026, mẫu và ánh sáng đã chốt với người dùng), B = ".../Blender 5.2/blender.exe":
#   $B -b --factory-startup -P branding/jar/run.py -- charms [id ...] --out R --samples 512 --exposure -0.6
#   $B -b --factory-startup -P branding/jar/run.py -- jar --out J --samples 384 --exposure -0.6
#   python branding/jar/export.py R charms ; python branding/jar/export.py J jar
#       (WebP vào app/public/jar, số liệu cho mô phỏng xếp hạt vào app/src/jarData.json)
#   python branding/jar/preview.py <ảnh.png> 25    (ảnh duyệt, xếp hạt bằng đúng app/src/jarSim.ts qua layout-cli.ts)
#   $B -b --factory-startup -P branding/jar/run.py -- scene --out T --save "C:\Users\YT KOREA\homeletter\jar.blend"
# Hạt render không khử nhiễu (khử nhiễu làm mất vân nỉ). Lọ chụp hai lần trên phông đen/trắng để tách độ trong của kính.
# Đổi cỡ hạt trong lọ: SEED trong export.py (39 hạt phải đầy tới dưới vai, chưa chạm thẻ kraft).
import bpy, os, sys, math, json, time

D = os.path.dirname(os.path.abspath(__file__))
for _f in ('lib.py', 'studio.py', 'charms.py', 'jar.py'):
    _p = os.path.join(D, _f)
    if os.path.exists(_p):
        exec(open(_p, encoding='utf-8').read(), globals())

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    if name in argv:
        i = argv.index(name)
        v = argv[i + 1]
        del argv[i:i + 2]
        return v
    return default


OUT = opt('--out', os.path.join(D, 'out'))
SIZE = int(opt('--size', '384'))
SAMPLES = int(opt('--samples', '256'))
SAVE = opt('--save')
EXPO = float(opt('--exposure', '0'))
NODEN = '--nodenoise' in argv
if NODEN:
    argv.remove('--nodenoise')
os.makedirs(OUT, exist_ok=True)
mode = argv[0] if argv else 'charms'
ids = argv[1:]

bpy.ops.wm.read_factory_settings(use_empty=True)
setup(SAMPLES, EXPO)
if NODEN:
    bpy.context.scene.cycles.use_denoising = False

if mode == 'charms':
    ids = ids or ORDER
    world(through=1.25)
    lights()
    # mặt sàn sáng ấm chỉ thấy trong phản chiếu: vàng, ngọc trai, pha lê không bị tối nửa dưới
    card('CardFloor', (0, -2.5, -3.2), 6.0, 3.0, 1.6, soft=0.6)
    cam = camera()
    sc = bpy.context.scene
    if not NODEN:
        # khử nhiễu làm mất vân sợi nỉ: hạt render không khử nhiễu, nhiều mẫu, thu nhỏ 2 lần khi export
        sc.cycles.use_denoising = False
        sc.cycles.use_adaptive_sampling = True
        sc.cycles.adaptive_threshold = 0.012
    built = {}
    for cid in ORDER:
        if cid in ids:
            built[cid] = BUILD[cid]()
    for cid, (c, r) in built.items():
        r.rotation_euler = tuple(math.radians(a) for a in VIEW[cid])
    for cid, (c, r) in built.items():
        t0 = time.time()
        for k, (c2, r2) in built.items():
            c2.hide_render = k != cid
            c2.hide_viewport = k != cid
        bpy.context.view_layer.update()
        cam.location = (0, -10, 0)
        frame_objects(cam, [o for o in c.all_objects])
        render(os.path.join(OUT, f'charm_{cid}.png'), SIZE, SIZE)
        print('RENDERED', cid, f'{time.time() - t0:.1f}s')
    for c2, r2 in built.values():
        c2.hide_render = False
        c2.hide_viewport = False

elif mode == 'jar':
    build_and_render_jar(OUT, argv[1:])

elif mode == 'scene':
    # file .blend để chỉnh tay: lọ ở giữa, 10 hạt xếp hàng bên phải, sân khấu như lúc chụp lọ
    build_and_render_jar(OUT, ['noshot'])
    for i, cid in enumerate(ORDER):
        c, r = BUILD[cid]()
        r.rotation_euler = tuple(math.radians(a) for a in VIEW[cid])
        r.location = (1.9 + (i % 5) * 1.15, -0.6, 2.2 - (i // 5) * 1.3)
        r.scale = (0.45, 0.45, 0.45)

if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=SAVE)
    print('SAVED', SAVE)
