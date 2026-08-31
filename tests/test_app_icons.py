"""App icon regression tests. Run with a Python environment containing Pillow."""
import json
import math
import unittest
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class AppIconTests(unittest.TestCase):
    def test_manifests_and_files(self):
        manifests = [json.loads((ROOT / path).read_text(encoding="utf-8-sig"))
                     for path in ("site.webmanifest", "static/site.webmanifest")]
        self.assertEqual(manifests[0], manifests[1])
        for manifest in manifests:
            self.assertEqual(manifest["name"], "트래픽캐쳐")
            self.assertEqual(manifest["background_color"], "#ffffff")
            self.assertEqual(manifest["display"], "standalone")
            self.assertEqual({(i["purpose"], i["sizes"]) for i in manifest["icons"]},
                             {(p, s) for p in ("any", "maskable") for s in ("192x192", "512x512")})
            for entry in manifest["icons"]:
                path = ROOT / urlsplit(entry["src"]).path.lstrip("/")
                with Image.open(path) as icon:
                    size = int(entry["sizes"].split("x")[0])
                    self.assertEqual(icon.size, (size, size))
                    self.assertEqual(icon.format, "PNG")
                    self.assertEqual(icon.mode, "RGB")
                    self.assertEqual(icon.convert("RGBA").getchannel("A").getextrema(), (255, 255))
                    # White logo must survive Android's minimum circular mask.
                    white = [(x, y) for y in range(size) for x in range(size)
                             if min(icon.getpixel((x, y))) > 210]
                    self.assertTrue(white)
                    radius = max(math.hypot(x - (size-1)/2, y - (size-1)/2) for x, y in white)
                    self.assertLessEqual(radius, size * .4)

    def test_legacy_root_assets_match(self):
        for size in (192, 512):
            name = f"android-chrome-{size}x{size}.png"
            self.assertEqual((ROOT / name).read_bytes(), (ROOT / "static" / name).read_bytes())

    def test_generated_pixels_preserve_approved_source(self):
        with Image.open(ROOT / "static/traffic-catcher-app-icon-source.png") as source:
            for size in (192, 512):
                expected = source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
                for prefix in ("android-chrome", "android-chrome-maskable"):
                    with Image.open(ROOT / "static" / f"{prefix}-{size}x{size}.png") as actual:
                        self.assertEqual(actual.tobytes(), expected.tobytes())


if __name__ == "__main__":
    unittest.main()
