"""Draws the AttachLog open-book mark and exports app, adaptive, splash, and web icons."""
import sys
from PIL import Image, ImageDraw

INK, DEEP, TEAL = "#123E40", "#0A3035", "#286F69"
PAPER, MINT, LINE, CORAL = "#FFF9EC", "#BCE8D2", "#8EC9B5", "#F19A74"
SS = 4


def artwork(size: int, scale: float) -> Image.Image:
    """A two-page field journal with a warm bookmark, on a transparent square."""
    side = size * SS
    image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    unit = side * scale / 100
    offset = side * (1 - scale) / 2

    def point(x: float, y: float) -> tuple[float, float]:
        return offset + x * unit, offset + y * unit

    def polygon(points: list[tuple[float, float]], color: str) -> None:
        draw.polygon([point(x, y) for x, y in points], fill=color)

    left = [(18, 27), (42, 31), (49, 37), (49, 76), (43, 71), (18, 67)]
    right = [(51, 37), (58, 31), (82, 27), (82, 67), (57, 71), (51, 76)]
    polygon([(x, y + 3) for x, y in left], DEEP)
    polygon([(x, y + 3) for x, y in right], DEEP)
    polygon(left, PAPER)
    polygon(right, "#E4F3E8")

    outline = [point(x, y) for x, y in left]
    draw.line(outline + [outline[0]], fill=INK, width=max(2, int(unit * 2)), joint="curve")
    outline = [point(x, y) for x, y in right]
    draw.line(outline + [outline[0]], fill=INK, width=max(2, int(unit * 2)), joint="curve")
    draw.line([point(50, 37), point(50, 76)], fill=TEAL, width=max(3, int(unit * 3)))

    for y, end in ((43, 38), (52, 41), (61, 43)):
        start = point(25, y)
        finish = point(end, y + 1)
        draw.line([start, finish], fill=LINE, width=max(2, int(unit * 2.2)))
        start = point(57, y)
        finish = point(75, y - 2)
        draw.line([start, finish], fill=LINE, width=max(2, int(unit * 2.2)))

    polygon([(65, 20), (76, 20), (76, 43), (70.5, 39), (65, 43)], CORAL)
    for x, y, radius in ((23, 21, 1.8), (82, 48, 1.5), (30, 75, 1.4)):
        px, py = point(x, y)
        r = radius * unit
        draw.ellipse((px - r, py - r, px + r, py + r), fill=MINT)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    top = (22, 111, 101)
    bottom = (8, 48, 54)
    for y in range(size):
        blend = y / max(size - 1, 1)
        color = tuple(round(top[i] * (1 - blend) + bottom[i] * blend) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def full_icon(size: int) -> Image.Image:
    base = gradient(size)
    draw = ImageDraw.Draw(base, "RGBA")
    draw.ellipse((-size * 0.3, -size * 0.28, size * 0.53, size * 0.55), fill=(190, 235, 213, 20))
    base.alpha_composite(artwork(size, 0.82))
    return base.convert("RGB")


def foreground(size: int) -> Image.Image:
    return artwork(size, 0.68)


def rounded(size: int) -> Image.Image:
    base = gradient(size)
    mask = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * SS - 1, size * SS - 1), radius=size * SS * 0.23, fill=255,
    )
    base.putalpha(mask.resize((size, size), Image.Resampling.LANCZOS))
    base.alpha_composite(artwork(size, 0.82))
    return base


if __name__ == "__main__":
    mobile, static = sys.argv[1], sys.argv[2]
    full_icon(1024).save(f"{mobile}/icon.png")
    foreground(1024).save(f"{mobile}/adaptive-icon.png")
    rounded(512).save(f"{mobile}/splash-icon.png")
    rounded(64).save(f"{mobile}/favicon.png")
    rounded(256).save(f"{static}/logo.png")
    rounded(48).save(f"{static}/favicon.png")
