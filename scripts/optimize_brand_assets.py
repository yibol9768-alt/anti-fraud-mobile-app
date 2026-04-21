from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path("/home/ubuntu/a30-anti-fraud-mobile-app")
ASSETS = {
    "assets/images/icon.png": 1024,
    "assets/images/splash-icon.png": 1024,
    "assets/images/android-icon-foreground.png": 1024,
    "assets/images/favicon.png": 256,
}

for relative_path, size in ASSETS.items():
    asset_path = PROJECT_ROOT / relative_path
    with Image.open(asset_path) as image:
        image = image.convert("RGBA")
        image = image.resize((size, size), Image.LANCZOS)
        image.save(asset_path, format="PNG", optimize=True, compress_level=9)
        final_size_kb = asset_path.stat().st_size / 1024
        print(f"optimized {relative_path} -> {size}x{size}, {final_size_kb:.1f}KB")
