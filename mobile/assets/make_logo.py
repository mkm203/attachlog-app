"""Draws the AttachLog logo: a logbook page with a spiral binding and an amber check mark."""
import sys
from PIL import Image, ImageDraw

TEAL, DEEP, PAPER, LINE, AMBER, INK = "#0B6B5D", "#08524A", "#FFFFFF", "#CFE3DF", "#F5B83D", "#0B3D36"
SS = 4  # supersampling for smooth edges


def artwork(size: int, scale: float) -> Image.Image:
    """The book + check on a transparent square; `scale` shrinks it toward the centre (safe zone)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S * scale / 100.0                     # one design unit
    ox = oy = S * (1 - scale) / 2
    P = lambda x, y: (ox + x * u, oy + y * u)  # noqa: E731

    # page shadow, page
    d.rounded_rectangle([*P(21, 17), *P(79, 85)], radius=7 * u, fill=DEEP)
    d.rounded_rectangle([*P(19, 14), *P(77, 82)], radius=7 * u, fill=PAPER)
    # ruled lines
    for i, (y, x2) in enumerate([(32, 66), (44, 66), (56, 54)]):
        d.rounded_rectangle([*P(33, y - 2.2), *P(x2, y + 2.2)], radius=2.2 * u, fill=LINE)
    # spiral binding
    for y in (24, 38, 52, 66):
        d.rounded_rectangle([*P(13, y - 3.2), *P(27, y + 3.2)], radius=3.2 * u, fill=INK)
        d.rounded_rectangle([*P(15, y - 1.4), *P(25, y + 1.4)], radius=1.4 * u, fill=TEAL)
    # amber badge with check
    cx, cy, r = 66, 70, 17
    d.ellipse([*P(cx - r - 2.4, cy - r - 2.4), *P(cx + r + 2.4, cy + r + 2.4)], fill=PAPER)
    d.ellipse([*P(cx - r, cy - r), *P(cx + r, cy + r)], fill=AMBER)
    pts = [P(cx - 8, cy + 0.5), P(cx - 2.2, cy + 6.5), P(cx + 8.5, cy - 6)]
    w = int(4.6 * u)
    d.line(pts, fill=INK, width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):            # round the ends
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def full_icon(size: int) -> Image.Image:        # app icon: opaque, the store applies the corner mask
    bg = Image.new("RGBA", (size, size), TEAL)
    bg.alpha_composite(artwork(size, 0.86))
    return bg.convert("RGB")


def foreground(size: int) -> Image.Image:       # Android adaptive foreground: art inside the central 66%
    return artwork(size, 0.62)


def rounded(size: int) -> Image.Image:          # for web pages
    base = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=size * SS * 0.22, fill=TEAL)
    base = base.resize((size, size), Image.LANCZOS)
    base.alpha_composite(artwork(size, 0.86))
    return base


if __name__ == "__main__":
    mobile, static = sys.argv[1], sys.argv[2]
    full_icon(1024).save(f"{mobile}/icon.png")
    foreground(1024).save(f"{mobile}/adaptive-icon.png")
    rounded(512).save(f"{mobile}/splash-icon.png")
    rounded(64).save(f"{mobile}/favicon.png")
    rounded(256).save(f"{static}/logo.png")
    rounded(48).save(f"{static}/favicon.png")
