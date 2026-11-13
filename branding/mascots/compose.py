# Ghép các ảnh render thành một tấm xem trước có chú thích.
# python branding/mascots/compose.py <out.png> <ảnh1>::<chú thích> <ảnh2>::<chú thích> ... [--cols N]
import sys
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
out = args.pop(0)
cols = 4
if '--cols' in args:
    i = args.index('--cols')
    cols = int(args[i + 1])
    del args[i:i + 2]
items = []
for a in args:
    path, _, cap = a.partition('::')
    items.append((Image.open(path).convert('RGB'), cap))
w, h = items[0][0].size
cap_h = 70
rows = (len(items) + cols - 1) // cols
bg = items[0][0].getpixel((10, 10))
sheet = Image.new('RGB', (w * cols, (h + cap_h) * rows), bg)
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 30)
except OSError:
    font = ImageFont.load_default()
for k, (im, cap) in enumerate(items):
    x, y = (k % cols) * w, (k // cols) * (h + cap_h)
    sheet.paste(im, (x, y))
    if cap:
        tw = draw.textlength(cap, font=font)
        draw.text((x + (w - tw) / 2, y + h + 12), cap, fill=(110, 96, 84), font=font)
sheet.save(out)
print(out, sheet.size)
