#!/usr/bin/env python3
"""Cắt gọn font để app mở nhanh: chỉ giữ chữ Latin và tiếng Việt, và chỉ giữ những icon app đang dùng.

Chạy lại mỗi khi dùng thêm icon Ionicons mới trong mobile/src (typecheck sẽ báo lỗi nếu quên):
    pip install fonttools brotli
    python3 scripts/subset-fonts.py

Kết quả:
    mobile/assets/fonts/*.ttf              font chữ đã cắt (Be Vietnam Pro, Literata) cho iOS và Android
    mobile/assets/fonts/*.woff2            cùng font đó, định dạng WOFF2 nhẹ hơn cho bản web
    mobile/assets/fonts/Ionicons-subset.ttf
    mobile/src/components/ionicons.json    danh sách icon được giữ (tên -> mã ký tự)
"""
import json
import re
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / 'mobile'
MODULES = MOBILE / 'node_modules'
OUT = MOBILE / 'assets' / 'fonts'

# Chữ Latin cơ bản, dấu câu, và bộ chữ tiếng Việt (giống phần "vietnamese" của Google Fonts), thêm ký hiệu ₩ và ₫.
TEXT_UNICODES = (
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,'
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,'
    'U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,'
    'U+2000-206F,U+20A9,U+20AB,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'
)

TEXT_FONTS = {
    'BeVietnamPro-Regular.ttf': '@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf',
    'BeVietnamPro-Medium.ttf': '@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf',
    'BeVietnamPro-SemiBold.ttf': '@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf',
    'BeVietnamPro-Bold.ttf': '@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf',
    'Literata-Regular.ttf': '@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf',
    'Literata-SemiBold.ttf': '@expo-google-fonts/literata/600SemiBold/Literata_600SemiBold.ttf',
    'Literata-Bold.ttf': '@expo-google-fonts/literata/700Bold/Literata_700Bold.ttf',
}

ICON_FONT = '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'
ICON_GLYPHS = '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'


def run_subset(src: Path, dst: Path, args: list[str]) -> None:
    subset.main([str(src), f'--output-file={dst}', *args])
    print(f'{dst.relative_to(ROOT)}: {src.stat().st_size // 1024}KB -> {dst.stat().st_size // 1024}KB')


def used_icon_names(glyphs: dict) -> dict:
    """Mọi chuỗi trong mã nguồn trùng tên một icon Ionicons đều được giữ lại."""
    found = set()
    for path in (MOBILE / 'src').rglob('*.ts*'):
        for name in re.findall(r"""['"]([a-z0-9-]+)['"]""", path.read_text(encoding='utf-8')):
            if name in glyphs:
                found.add(name)
    return {name: glyphs[name] for name in sorted(found)}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    text_args = [f'--unicodes={TEXT_UNICODES}', '--layout-features=*', '--no-hinting', '--desubroutinize']
    for name, src in TEXT_FONTS.items():
        run_subset(MODULES / src, OUT / name, text_args)
        run_subset(MODULES / src, OUT / name.replace('.ttf', '.woff2'), [*text_args, '--flavor=woff2'])

    glyphs = json.loads((MODULES / ICON_GLYPHS).read_text())
    keep = used_icon_names(glyphs)
    (MOBILE / 'src' / 'components' / 'ionicons.json').write_text(json.dumps(keep, indent=2) + '\n')
    codepoints = ','.join(f'U+{cp:04X}' for cp in sorted(set(keep.values())))
    run_subset(MODULES / ICON_FONT, OUT / 'Ionicons-subset.ttf', [f'--unicodes={codepoints}', '--no-hinting'])
    print(f'{len(keep)} icon')


if __name__ == '__main__':
    main()
