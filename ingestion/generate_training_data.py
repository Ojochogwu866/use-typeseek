"""Generates an augmented training set for font fine-tuning. Layout: TRAINING_DIR/<slug>/*.jpg"""

import json
import zlib
from pathlib import Path
from random import Random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from tqdm import tqdm

from ingestion.catalog import load_catalog
from ingestion.config import CATALOG_PATH, TRAINING_DIR
from ingestion.download_fonts import font_variant_path
from ingestion.logging_setup import get_logger
from ingestion.models import FontFamily
from ingestion.render_specimens import _is_valid_font

logger = get_logger(__name__)

CANVAS = (512, 256)
MARGIN = 30
AUGMENTATIONS_PER_COMBO = 4

SAMPLE_TEXTS = [
    "Hello World",
    "The Quick Fox",
    "Design Studio",
    "Coffee & Co",
    "Mountain View",
    "Summer Nights",
]

BACKGROUNDS = [
    ((28, 29, 34), (245, 245, 245)),
    ((235, 229, 217), (30, 30, 30)),
    ((255, 255, 255), (10, 10, 10)),
    ((60, 60, 65), (230, 230, 230)),
    ((240, 235, 225), (40, 35, 30)),
]


def _fit_font_loose(font_path: Path, text: str, max_width: int, max_height: int, max_size: int = 200) -> ImageFont.FreeTypeFont:
    size = max_size
    while size > 8:
        font = ImageFont.truetype(str(font_path), size)
        left, top, right, bottom = font.getbbox(text)
        if right - left <= max_width and bottom - top <= max_height:
            return font
        size -= 4
    return ImageFont.truetype(str(font_path), 8)


def _base_render(font_path: Path, text: str) -> tuple[Image.Image, tuple[int, int, int]]:
    """One plain black-on-white render, reused as the source for several cheap augmentations."""
    font = _fit_font_loose(font_path, text, CANVAS[0] - 2 * MARGIN, CANVAS[1] - 2 * MARGIN)
    image = Image.new("L", CANVAS, color=255)
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = (CANVAS[0] - (right - left)) / 2 - left
    y = (CANVAS[1] - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=font, fill=0)
    return image, (left, top, right, bottom)


def _augment(base: Image.Image, seed: int) -> Image.Image:
    rng = Random(seed)
    bg_color, fg_color = rng.choice(BACKGROUNDS)

    mask = base.point(lambda p: 255 - p)
    colored = Image.new("RGB", base.size, color=bg_color)
    fg_layer = Image.new("RGB", base.size, color=fg_color)
    colored.paste(fg_layer, mask=mask)

    angle = rng.uniform(-10, 10)
    colored = colored.rotate(angle, expand=True, fillcolor=bg_color, resample=Image.BICUBIC)
    colored = colored.resize(CANVAS)

    if rng.random() < 0.7:
        colored = colored.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 1.5)))

    arr = np.array(colored).astype(np.float32)
    arr = arr * rng.uniform(0.85, 1.15) + rng.uniform(-15, 15)
    colored = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    if rng.random() < 0.3:
        zoom = rng.uniform(1.0, 1.25)
        w, h = colored.size
        cropped = colored.crop((0, 0, int(w / zoom), int(h / zoom))).resize(CANVAS)
        colored = cropped

    return colored


def generate_family(family: FontFamily, out_dir: Path) -> int:
    variant_paths = {
        variant: path
        for variant in family.variant_urls
        if (path := font_variant_path(family, variant)).exists() and _is_valid_font(path)
    }
    weights = [w for w in family.upright_weights if w in variant_paths]
    if not weights and variant_paths:
        weights = [next(iter(variant_paths))]
    if not weights:
        return 0

    class_dir = out_dir / family.slug
    class_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for weight in weights:
        for text_idx, text in enumerate(SAMPLE_TEXTS):
            try:
                base, bbox = _base_render(variant_paths[weight], text)
            except Exception:
                logger.warning("failed to render %s at weight %s", family.name, weight, exc_info=True)
                continue
            if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
                continue
            for aug_idx in range(AUGMENTATIONS_PER_COMBO):
                seed = zlib.crc32(f"{family.slug}-{weight}-{text_idx}-{aug_idx}".encode())
                image = _augment(base, seed)
                dest = class_dir / f"{weight}_{text_idx}_{aug_idx}.jpg"
                image.save(dest, quality=rng_quality(seed))
                count += 1
    return count


def rng_quality(seed: int) -> int:
    return 55 + (seed % 41)


def main() -> None:
    families = load_catalog(CATALOG_PATH)
    TRAINING_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    generated = skipped = 0
    for family in tqdm(families, desc="generating training data"):
        count = generate_family(family, TRAINING_DIR)
        if count == 0:
            skipped += 1
            continue
        manifest.append({"slug": family.slug, "name": family.name, "category": family.category, "images": count})
        generated += 1

    (TRAINING_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    total_images = sum(m["images"] for m in manifest)
    logger.info(
        "generated training data for %d families, skipped %d, %d total images",
        generated, skipped, total_images,
    )


if __name__ == "__main__":
    main()
