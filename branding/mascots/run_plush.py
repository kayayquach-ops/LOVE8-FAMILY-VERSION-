# Bộ dựng 8 linh vật thú bông vải nỉ của Sweet Home (Blender 5.2, chạy qua MCP Blender hoặc Text Editor).
#
# Dựng và xuất GLB vào app/public/mascots/:
#   D = r"<repo>\branding\mascots"; exec(open(D + r"\run_plush.py", encoding="utf-8").read())
#   goP(["cloud", "chick", "bunny", "kitten", "bear", "sprout", "riceball", "star"], export=True)
# Ảnh xem trước Cycles: setup_stage(); render_tile("bunny", 0, r"...\bunny.png")   (yaw -38 là góc nghiêng 3/4)
# Soát GLB:            node branding/mascots/check.mjs app/public/mascots/*.glb
# Ảnh bằng mã app:     node branding/mascots/preview/shot.mjs out.png views=front,34 pose=wave|sleep talk=0.8
# Vân nỉ dùng chung:   python branding/mascots/felt_normal.py
#
# Cách may: mk.py (toạ độ, vật liệu, metaball, mảng nỉ khâu đè), lib.py (gốc Mascot, ống, khối giọt, cơm nắm, sao),
# plush.py (cắt đường may, bơm phồng bằng Cloth + Pressure, khoét rãnh), plushies.py (Mây, thỏ), plushies2.py (6 con còn lại),
# export.py (bỏ tiền tố tên, GLB không UV, không KHR), stage.py (sân khấu Cycles).
import os, time
for _f in ('mk.py', 'lib.py', 'plush.py', 'plushies.py', 'plushies2.py', 'export.py', 'stage.py'):
    exec(open(os.path.join(D, _f), encoding='utf-8').read(), globals())
OUT = os.path.abspath(os.path.join(D, '..', '..', 'app', 'public', 'mascots'))

def goP(shapes, export=False):
    for s in shapes:
        t0 = time.time()
        c = PLUSH[s]()
        objs = list(c.objects)
        msg = f'{s} {time.time() - t0:.1f}s bbox={bbox_gltf(objs)} verts={sum(len(o.data.vertices) for o in objs if o.type == "MESH")}'
        if export:
            p = export_shape(s, OUT)
            msg += f' {os.path.getsize(p) // 1024}KB'
        print(msg)
