"""Làm font cho trang (site/fonts/*.woff2) từ font gốc của slide.

Montserrat: chỉ giữ chữ Latin và tiếng Việt.
Noto Sans KR: chỉ giữ những chữ Hàn có trong site/index.html và site/main.js,
nên sửa chữ tiếng Hàn xong thì chạy lại:  python tools/fonts.py   (cần: pip install fonttools brotli)
"""
import pathlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent / "site"
SRC = HERE.parent.parent / "oasis6" / "pitch" / "thuyet-trinh" / "web" / "fonts"
OUT = SITE / "fonts"

LATIN_VI = ("U+0020-007E,U+00A0-00FF,U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,"
            "U+01AF-01B0,U+0300-0301,U+0303,U+0309,U+0323,U+1EA0-1EF9,U+2010-2027,U+2030-203A,U+20AB,U+2122")


def save(font, path):
    font.flavor = "woff2"
    font.save(path)
    print(f"{path.name}: {path.stat().st_size // 1024} KB")


def run(src, dst, unicodes=None, text=None):
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.hinting = False
    opts.desubroutinize = True
    font = TTFont(src) if isinstance(src, (str, pathlib.Path)) else src
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes or [], text=text or "")
    s.subset(font)
    save(font, dst)


def main():
    OUT.mkdir(exist_ok=True)
    uni = subset.parse_unicodes(LATIN_VI)
    for w, name in [(500, "Medium"), (600, "SemiBold"), (700, "Bold")]:
        run(SRC / f"Montserrat-{name}.otf", OUT / f"montserrat-{w}.woff2", unicodes=uni)

    text = (SITE / "index.html").read_text(encoding="utf-8") + (SITE / "main.js").read_text(encoding="utf-8")
    hangul = "".join(sorted(set(re.findall(r"[ᄀ-ᇿ㄰-㆏가-힣]", text))))
    print(f"chữ Hàn: {len(hangul)}")
    kr = TTFont(SRC / "NotoSansKR-VF.ttf")
    kr = instancer.instantiateVariableFont(kr, {"wght": (500, 700)})
    run(kr, OUT / "noto-sans-kr.woff2", text=hangul + "·‘’“”…")


if __name__ == "__main__":
    main()
