from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path('/home/ubuntu/a30-anti-fraud-mobile-app')
SOURCE = Path('/home/ubuntu/upload/a30-icon-option-3.png')
TARGETS = {
    'assets/images/icon.png': 1024,
    'assets/images/splash-icon.png': 1024,
    'assets/images/android-icon-foreground.png': 1024,
    'assets/images/favicon.png': 256,
}


def prepare_square_icon(image: Image.Image, size: int) -> Image.Image:
    image = image.convert('RGBA')
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((size, size), Image.LANCZOS)
    return image


if not SOURCE.exists():
    raise FileNotFoundError(f'Missing source icon: {SOURCE}')

with Image.open(SOURCE) as source_image:
    for relative_path, size in TARGETS.items():
        target_path = PROJECT_ROOT / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        processed = prepare_square_icon(source_image, size)
        processed.save(target_path, format='PNG', optimize=True, compress_level=9)
        print(f'generated {relative_path} -> {size}x{size}')
