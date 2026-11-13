# Dựng font TTF cho phim tuần (ffmpeg drawtext cần một file font đủ chữ Việt, Anh, Hàn).
# Ghép các phần latin, latin-ext, vietnamese, korean của gói @fontsource (WOFF) thành một file TTF.
# Chạy lại khi muốn đổi font: python scripts/recap-fonts.py  (cần fonttools)
import copy
import os
import re
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'node_modules', '@fontsource')
OUT = os.path.join(ROOT, 'server', 'recap-assets')

# Font có chân chỉ giữ 2350 chữ Hàn thông dụng (KS X 1001) cho nhẹ; chữ Hàn hiếm thì server/recap.ts chuyển dòng đó sang font không chân (đủ 11172 chữ).
FONTS = [
    ('noto-serif-kr', 600, 'NotoSerifKR-SemiBold.ttf', True),
    ('noto-sans-kr', 500, 'NotoSansKR-Medium.ttf', False),
]
PARTS = ['latin-ext', 'vietnamese', 'korean']  # gốc là phần latin để giữ bảng kerning của chữ Latin


def ksx1001():
    out = set()
    for a in range(0xB0, 0xC9):
        for b in range(0xA1, 0xFF):
            try:
                c = bytes([a, b]).decode('euc_kr')
            except UnicodeDecodeError:
                continue
            if '가' <= c <= '힣':
                out.add(ord(c))
    return out


def merge(pkg, weight, out, common_only):
    keep = ksx1001() if common_only else None
    path = lambda part: os.path.join(SRC, pkg, 'files', f'{pkg}-{part}-{weight}-normal.woff')
    base = TTFont(path('latin'))
    base.flavor = None
    order = list(base.getGlyphOrder())
    have = set(order)
    glyf, hmtx = base['glyf'], base['hmtx']
    vmtx = base['vmtx'] if 'vmtx' in base else None
    cmap = dict(base.getBestCmap())
    for part in PARTS:
        f = TTFont(path(part))
        fg = f['glyf']
        fcmap = f.getBestCmap()
        if keep is not None:
            fcmap = {c: n for c, n in fcmap.items() if not (0xAC00 <= c <= 0xD7A3) or c in keep}
        used = set(fcmap.values())
        for name in f.getGlyphOrder():
            if name in have:
                continue
            m = re.match(r'^uni([0-9A-F]{4})$', name)
            if keep is not None and name not in used and m and 0xAC00 <= int(m.group(1), 16) <= 0xD7A3:
                continue
            have.add(name)
            order.append(name)
            glyf.glyphs[name] = copy.deepcopy(fg[name])
            hmtx.metrics[name] = f['hmtx'].metrics[name]
            if vmtx is not None and 'vmtx' in f:
                vmtx.metrics[name] = f['vmtx'].metrics[name]
        for code, name in fcmap.items():
            cmap.setdefault(code, name)
    base.setGlyphOrder(order)
    glyf.glyphOrder = order
    for t in base['cmap'].tables:
        if t.format in (4, 12):
            t.cmap = {c: n for c, n in cmap.items() if t.format == 12 or c <= 0xFFFF}
    # Thêm bảng cmap dạng 12: server/recap.ts đọc bảng này để đo bề ngang chữ (ngắt dòng, căn giữa).
    if not any(t.format == 12 for t in base['cmap'].tables):
        t12 = CmapSubtable.newSubtable(12)
        t12.platformID, t12.platEncID, t12.language = 3, 10, 0
        t12.cmap = dict(cmap)
        base['cmap'].tables.append(t12)
    for tag in ('BASE', 'STAT'):
        if tag in base:
            del base[tag]
    base.save(os.path.join(OUT, out))
    hangul = sum(1 for c in cmap if 0xAC00 <= c <= 0xD7A3)
    print(out, len(order), 'glyphs,', hangul, 'hangul,', os.path.getsize(os.path.join(OUT, out)) // 1024, 'kB')


os.makedirs(OUT, exist_ok=True)
for pkg, weight, out, common_only in FONTS:
    merge(pkg, weight, out, common_only)
