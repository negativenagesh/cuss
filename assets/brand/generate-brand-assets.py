#!/usr/bin/env python3
"""
CUSS brand asset generator (Neo-Y2K / Acid-Lime on Obsidian).

Produces every raster the mobile app, the macOS Menu Bar app, and the DMG installer need:
  mobile/assets/icon.png            1024x1024  (Expo iOS/Android legacy icon)
  mobile/assets/adaptive-icon.png   1024x1024  (Android adaptive foreground, transparent)
  mobile/assets/splash.png          1284x2778  (dark splash with crest + wordmark)
  mobile/assets/favicon.png         48x48
  assets/brand/cuss-logo-1024.png   1024x1024  (installer hero)
  assets/brand/dmg-background.png   1320x800 @2x (660x400 pt DMG window background)
  assets/brand/CUSS.icns            macOS app icon (via iconutil)

Run:  python3 assets/brand/generate-brand-assets.py
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "mobile" / "assets" / "fonts"
OUT_MOBILE = ROOT / "mobile" / "assets"
OUT_BRAND = ROOT / "assets" / "brand"
OUT_BRAND.mkdir(parents=True, exist_ok=True)

# Palette (mobile/src/theme.ts)
OBSIDIAN = (7, 7, 12, 255)
SURFACE = (16, 17, 26, 255)
LIME = (212, 255, 0, 255)
CYAN = (0, 240, 255, 255)
MAGENTA = (255, 42, 133, 255)
BONE = (236, 236, 240, 255)
GRID = (24, 27, 44, 255)
EDGE = (43, 47, 72, 255)


def font(name: str, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / name), size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


def rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def glow(layer: Image.Image, radius: int, strength: float = 1.0) -> Image.Image:
    g = layer.filter(ImageFilter.GaussianBlur(radius))
    if strength != 1.0:
        a = g.split()[3].point(lambda v: min(255, int(v * strength)))
        g.putalpha(a)
    return g


def bolt_polygon(cx: float, cy: float, s: float) -> list[tuple[float, float]]:
    """Brutalist lightning bolt (the ⚡ CUSS umbilical mark), normalized to a box of size s."""
    pts = [
        (0.58, 0.02), (0.22, 0.56), (0.47, 0.56), (0.40, 0.98),
        (0.78, 0.42), (0.53, 0.42), (0.62, 0.02),
    ]
    return [(cx - s / 2 + x * s, cy - s / 2 + y * s) for x, y in pts]


def draw_crest(size: int, transparent_bg: bool = False, scale: float = 1.0) -> Image.Image:
    """The CUSS crest: registration dials + lime arc + bolt. Returns RGBA."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if not transparent_bg:
        bg = Image.new("RGBA", (size, size), OBSIDIAN)
        # architectural grid
        gd = ImageDraw.Draw(bg)
        step = size // 16
        for i in range(0, size, step):
            gd.line((i, 0, i, size), fill=GRID, width=max(1, size // 512))
            gd.line((0, i, size, i), fill=GRID, width=max(1, size // 512))
        # radial vignette
        vig = Image.new("L", (size, size), 0)
        vd = ImageDraw.Draw(vig)
        for r in range(size // 2, 0, -max(1, size // 128)):
            vd.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=int(255 * (1 - r / (size / 2)) ** 1.6))
        bg = Image.composite(Image.new("RGBA", (size, size), OBSIDIAN), bg, vig)
        img.alpha_composite(bg)

    cx = cy = size / 2
    R = size * 0.36 * scale
    lw = max(2, int(size * 0.014 * scale))

    # ambient layer: dashed outer dial (cyan) + magenta dashed half ring
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    dash_count = 48
    for i in range(dash_count):
        a0 = i * 360 / dash_count
        if i % 2 == 0:
            rd.arc((cx - R, cy - R, cx + R, cy + R), a0, a0 + 360 / dash_count * 0.55, fill=CYAN[:3] + (150,), width=lw)
    rd.arc((cx - R * 0.82, cy - R * 0.82, cx + R * 0.82, cy + R * 0.82), 0, 180, fill=MAGENTA[:3] + (200,), width=lw)
    img.alpha_composite(glow(ring, lw * 2, 0.9))
    img.alpha_composite(ring)

    # secondary layer: lime arc (top half) + tick marks
    arc = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arc)
    ad.arc((cx - R * 0.82, cy - R * 0.82, cx + R * 0.82, cy + R * 0.82), 180, 360, fill=LIME, width=int(lw * 1.6))
    for ang in (90, 270):
        a = math.radians(ang)
        ad.line(
            (cx + math.cos(a) * R * 1.02, cy + math.sin(a) * R * 1.02, cx + math.cos(a) * R * 1.16, cy + math.sin(a) * R * 1.16),
            fill=LIME, width=int(lw * 1.6),
        )
    img.alpha_composite(glow(arc, lw * 3, 1.2))
    img.alpha_composite(arc)

    # primary layer: the bolt with hard-edge shadow + lime glow
    bolt = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bolt)
    s = R * 1.25
    shadow_pts = [(x + lw * 1.2, y + lw * 1.2) for x, y in bolt_polygon(cx, cy, s)]
    bd.polygon(shadow_pts, fill=MAGENTA)
    bd.polygon(bolt_polygon(cx, cy, s), fill=LIME)
    img.alpha_composite(glow(bolt, int(lw * 4), 1.0))
    img.alpha_composite(bolt)

    # registration dots
    dd = ImageDraw.Draw(img)
    r = lw * 1.1
    dd.ellipse((cx + R * 1.02 - r, cy - r, cx + R * 1.02 + r, cy + r), fill=CYAN)
    dd.ellipse((cx - R * 1.02 - r, cy - r, cx - R * 1.02 + r, cy + r), fill=CYAN)
    return img


def make_icon() -> Image.Image:
    size = 1024
    crest = draw_crest(size)
    # brutalist corner brackets
    d = ImageDraw.Draw(crest)
    m, L, w = 70, 110, 14
    d.line((m, m + L, m, m, m + L, m), fill=LIME, width=w)
    d.line((size - m, m + L, size - m, m, size - m - L, m), fill=CYAN, width=w)
    d.line((m, size - m - L, m, size - m, m + L, size - m), fill=MAGENTA, width=w)
    d.line((size - m, size - m - L, size - m, size - m, size - m - L, size - m), fill=LIME, width=w)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(crest, (0, 0), rounded_mask(size, 224))
    # squircle edge stroke
    ImageDraw.Draw(out).rounded_rectangle((6, 6, size - 7, size - 7), radius=220, outline=EDGE, width=6)
    return out


def make_adaptive_foreground() -> Image.Image:
    # Android adaptive icon: 1024 canvas, safe zone = center 66% circle
    return draw_crest(1024, transparent_bg=True, scale=0.78)


def make_splash() -> Image.Image:
    W, H = 1284, 2778
    img = Image.new("RGBA", (W, H), OBSIDIAN)
    d = ImageDraw.Draw(img)
    for i in range(0, W, 80):
        d.line((i, 0, i, H), fill=GRID, width=1)
    for i in range(0, H, 80):
        d.line((0, i, W, i), fill=GRID, width=1)
    crest = draw_crest(900, transparent_bg=True)
    img.alpha_composite(crest, (W // 2 - 450, H // 2 - 620))

    wm = font("Unbounded-Variable.ttf", 220, "Black")
    tw = d.textlength("CUSS", font=wm)
    # magenta hard shadow then lime wordmark
    d.text((W / 2 - tw / 2 + 10, H / 2 + 300 + 10), "CUSS", font=wm, fill=MAGENTA)
    d.text((W / 2 - tw / 2, H / 2 + 300), "CUSS", font=wm, fill=LIME)
    sub = font("SpaceMono-Bold.ttf", 44)
    s = "CYBERNETIC UMBILICAL STUDIO & SYNTH"
    sw = d.textlength(s, font=sub)
    d.text((W / 2 - sw / 2, H / 2 + 600), s, font=sub, fill=CYAN)
    eyebrow = font("SpaceMono-Bold.ttf", 34)
    e = "01 // MOBILE CONTROL DECK FOR CURSOR"
    ew = d.textlength(e, font=eyebrow)
    d.rounded_rectangle((W / 2 - ew / 2 - 36, 300, W / 2 + ew / 2 + 36, 380), radius=16, fill=SURFACE, outline=EDGE, width=3)
    d.ellipse((W / 2 - ew / 2 - 14, 328, W / 2 - ew / 2 + 10, 352), fill=LIME)
    d.text((W / 2 - ew / 2 + 30, 318), e, font=eyebrow, fill=CYAN)
    return img


def make_dmg_background() -> Image.Image:
    # 660x400 pt window at @2x
    W, H = 1320, 800
    img = Image.new("RGBA", (W, H), OBSIDIAN)
    d = ImageDraw.Draw(img)
    for i in range(0, W, 80):
        d.line((i, 0, i, H), fill=GRID, width=1)
    for i in range(0, H, 80):
        d.line((0, i, W, i), fill=GRID, width=1)
    # corner brackets
    m, L, w = 36, 70, 8
    d.line((m, m + L, m, m, m + L, m), fill=LIME, width=w)
    d.line((W - m, m + L, W - m, m, W - m - L, m), fill=CYAN, width=w)
    d.line((m, H - m - L, m, H - m, m + L, H - m), fill=MAGENTA, width=w)
    d.line((W - m, H - m - L, W - m, H - m, W - m - L, H - m), fill=LIME, width=w)
    wm = font("Unbounded-Variable.ttf", 120, "Black")
    d.text((W / 2 - d.textlength("CUSS", font=wm) / 2 + 6, 96), "CUSS", font=wm, fill=MAGENTA)
    d.text((W / 2 - d.textlength("CUSS", font=wm) / 2, 90), "CUSS", font=wm, fill=LIME)
    sub = font("SpaceMono-Bold.ttf", 28)
    s = "DOUBLE-CLICK  [ INSTALL CUSS ]  //  DRIVE CURSOR FROM YOUR PHONE"
    d.text((W / 2 - d.textlength(s, font=sub) / 2, 250), s, font=sub, fill=CYAN)
    # dashed "slot" reticle behind the installer icon (Finder places it at 330x250 pt → 660x500 px)
    ad = ImageDraw.Draw(img)
    cx, cy, r = 660, 500, 170
    for i in range(0, 360, 12):
        ad.arc((cx - r, cy - r, cx + r, cy + r), i, i + 6, fill=CYAN[:3] + (140,), width=4)
    ad.arc((cx - r + 18, cy - r + 18, cx + r - 18, cy + r - 18), 200, 340, fill=LIME, width=5)
    small = font("SpaceMono-Regular.ttf", 22)
    foot = "Zero API keys · Zero terminal · Runs in your Mac menu bar"
    d.text((W / 2 - d.textlength(foot, font=small) / 2, H - 70), foot, font=small, fill=BONE[:3] + (160,))
    return img


def make_icns(icon: Image.Image, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as td:
        iconset = Path(td) / "CUSS.iconset"
        iconset.mkdir()
        for px in (16, 32, 128, 256, 512):
            icon.resize((px, px), Image.LANCZOS).save(iconset / f"icon_{px}x{px}.png")
            icon.resize((px * 2, px * 2), Image.LANCZOS).save(iconset / f"icon_{px}x{px}@2x.png")
        subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(dest)], check=True)


def main() -> None:
    icon = make_icon()
    icon.save(OUT_MOBILE / "icon.png")
    icon.save(OUT_BRAND / "cuss-logo-1024.png")
    icon.resize((48, 48), Image.LANCZOS).save(OUT_MOBILE / "favicon.png")
    make_adaptive_foreground().save(OUT_MOBILE / "adaptive-icon.png")
    make_splash().save(OUT_MOBILE / "splash.png")
    make_dmg_background().save(OUT_BRAND / "dmg-background.png")
    make_icns(icon, OUT_BRAND / "CUSS.icns")
    print("✓ brand assets written to", OUT_MOBILE, "and", OUT_BRAND)


if __name__ == "__main__":
    main()
