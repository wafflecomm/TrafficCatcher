"""Resize the approved opaque app icon without redrawing it (requires Pillow).

Usage: python scripts/build_app_icons.py path/to/approved-square-image.png
Omit the path to regenerate from static/traffic-catcher-app-icon-source.png.
Favicons and apple-touch-icon.png are intentionally not changed.
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "static" / "traffic-catcher-app-icon-source.png"


def build(source: Path):
    with Image.open(source) as original:
        if original.width != original.height or original.width < 512:
            raise ValueError("Use a square source at least 512px wide.")
        if original.convert("RGBA").getchannel("A").getextrema() != (255, 255):
            raise ValueError("App icons must have a fully opaque background.")
        image = original.convert("RGB")
    if source.resolve() != SOURCE.resolve():
        shutil.copyfile(source, SOURCE)
    for size in (192, 512):
        icon = image.resize((size, size), Image.Resampling.LANCZOS)
        # This approved image is already within the maskable circular safe zone.
        # Keep separate purposes/files so later icon variants can evolve safely.
        for name in (f"android-chrome-{size}x{size}.png",
                     f"android-chrome-maskable-{size}x{size}.png"):
            path = ROOT / "static" / name
            icon.save(path, format="PNG", optimize=True)
            print(path.relative_to(ROOT))
        # Preserve existing root asset routes for old bookmarks/manifests.
        image_path = ROOT / f"android-chrome-{size}x{size}.png"
        icon.save(image_path, format="PNG", optimize=True)
        print(image_path.relative_to(ROOT))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=SOURCE)
    build(parser.parse_args().source)
