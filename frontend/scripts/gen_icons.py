"""Generate LiquidAudio app icon variants (full icon + Android adaptive foreground)."""
from PIL import Image, ImageDraw, ImageFilter
import math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")
os.makedirs(OUT, exist_ok=True)
S = 1024

VARIANTS = {
    "rose":     [(244, 63, 94), (139, 16, 60), (60, 5, 25)],
    "ocean":    [(56, 189, 248), (37, 99, 235), (17, 24, 90)],
    "aurora":   [(52, 211, 153), (14, 116, 144), (15, 23, 42)],
    "midnight": [(71, 85, 105), (30, 41, 59), (2, 6, 23)],
    "gold":     [(251, 191, 36), (180, 83, 9), (69, 26, 3)],
    "violet":   [(192, 132, 252), (124, 58, 237), (46, 16, 101)],
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(colors, size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            if t < 0.5:
                c = lerp(colors[0], colors[1], t * 2)
            else:
                c = lerp(colors[1], colors[2], (t - 0.5) * 2)
            px[x, y] = c
    # soft radial glow top-left
    glow = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-size * 0.2, -size * 0.3, size * 0.7, size * 0.55], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    white = Image.new("RGB", (size, size), (255, 255, 255))
    img = Image.composite(white, img, glow.point(lambda v: int(v * 0.55)))
    return img


def glyph(size, scale=1.0):
    """Glassy pill bars (equalizer) glyph on transparent canvas."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = size / 2, size / 2
    heights = [0.34, 0.62, 0.86, 0.56, 0.40]
    bar_w = size * 0.085 * scale
    gap = size * 0.06 * scale
    total = len(heights) * bar_w + (len(heights) - 1) * gap
    x = cx - total / 2
    # shadow pass
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for h in heights:
        hh = size * h * 0.6 * scale
        sd.rounded_rectangle([x + size*0.012, cy - hh/2 + size*0.02, x + bar_w + size*0.012, cy + hh/2 + size*0.02],
                             radius=bar_w/2, fill=(0, 0, 0, 120))
        x += bar_w + gap
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.02))
    layer = Image.alpha_composite(layer, sh)
    d = ImageDraw.Draw(layer)
    x = cx - total / 2
    for h in heights:
        hh = size * h * 0.6 * scale
        d.rounded_rectangle([x, cy - hh/2, x + bar_w, cy + hh/2], radius=bar_w/2, fill=(255, 255, 255, 240))
        # inner highlight
        d.rounded_rectangle([x + bar_w*0.18, cy - hh/2 + bar_w*0.2, x + bar_w*0.5, cy - hh/2 + hh*0.35],
                            radius=bar_w*0.16, fill=(255, 255, 255, 90))
        x += bar_w + gap
    return layer


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


for name, cols in VARIANTS.items():
    bg = gradient(cols, S).convert("RGBA")
    # glass sheen band
    sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(0, 0), (S, 0), (S, S * 0.42), (0, S * 0.62)], fill=(255, 255, 255, 26))
    bg = Image.alpha_composite(bg, sheen)
    full = Image.alpha_composite(bg, glyph(S))
    full.putalpha(rounded_mask(S, int(S * 0.22)))
    full.save(os.path.join(OUT, f"{name}.png"))
    # square (no rounding) for iOS/Android launcher – OS applies its own mask
    square = Image.alpha_composite(bg, glyph(S))
    square.convert("RGB").save(os.path.join(OUT, f"{name}-square.png"))
    # adaptive foreground: transparent, glyph in safe zone (66%)
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fg = Image.alpha_composite(fg, glyph(S, scale=0.72))
    fg.save(os.path.join(OUT, f"{name}-foreground.png"))
    # adaptive background as image (gradient)
    bg.convert("RGB").save(os.path.join(OUT, f"{name}-background.png"))
    print("ok", name)
