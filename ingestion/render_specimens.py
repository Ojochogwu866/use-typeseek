"""Render specimen images per font: glyph sample, pangram, weight strip, photo-style.

Complex-script shaping (Arabic, Devanagari, CJK, ...) is out of scope for now — PIL/FreeType
draws glyphs but does not shape them. Any rendering failure is logged and the font is
skipped rather than blocking the batch.
"""

import zlib
from dataclasses import dataclass
from pathlib import Path
from random import Random

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from tqdm import tqdm

from ingestion.catalog import load_catalog
from ingestion.config import CATALOG_PATH, GLYPH_SAMPLE, PANGRAM, SPECIMENS_DIR
from ingestion.download_fonts import font_variant_path
from ingestion.logging_setup import get_logger
from ingestion.models import FontFamily

logger = get_logger(__name__)

GLYPH_CANVAS = (512, 512)
PANGRAM_CANVAS = (1200, 200)
WEIGHT_STRIP_WIDTH = 900
WEIGHT_STRIP_ROW_HEIGHT = 90
MARGIN = 24

PHOTO_CANVAS = (1200, 260)
PHOTO_BACKGROUNDS = [
    ((28, 29, 34), (245, 245, 245)),
    ((235, 229, 217), (30, 30, 30)),
    ((255, 255, 255), (10, 10, 10)),
]


@dataclass(frozen=True, slots=True)
class Specimen:
    kind: str
    path: Path


def list_specimens(family: FontFamily) -> list[Path]:
    return sorted((SPECIMENS_DIR / family.slug).glob("*.png"))


def list_weight_specimens(family: FontFamily) -> dict[str, Path]:
    weights_dir = SPECIMENS_DIR / family.slug / "weights"
    return {path.stem: path for path in sorted(weights_dir.glob("*.png"))} if weights_dir.exists() else {}


def _is_valid_font(path: Path) -> bool:
    try:
        TTFont(path, lazy=True).close()
        return True
    except Exception:
        return False


def _fit_font(font_path: Path, text: str, max_width: int, max_height: int, max_size: int = 400) -> ImageFont.FreeTypeFont:
    size = max_size
    while size > 8:
        font = ImageFont.truetype(str(font_path), size)
        left, top, right, bottom = font.getbbox(text)
        if right - left <= max_width and bottom - top <= max_height:
            return font
        size -= 4
    return ImageFont.truetype(str(font_path), 8)


def _draw_centered(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    box_left, box_top, box_right, box_bottom = box
    x = box_left + ((box_right - box_left) - (right - left)) / 2 - left
    y = box_top + ((box_bottom - box_top) - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=font, fill=0)


def _render_single_line(font_path: Path, text: str, canvas_size: tuple[int, int], dest: Path) -> Path:
    width, height = canvas_size
    font = _fit_font(font_path, text, width - 2 * MARGIN, height - 2 * MARGIN)
    image = Image.new("L", canvas_size, color=255)
    draw = ImageDraw.Draw(image)
    _draw_centered(draw, text, font, (0, 0, width, height))
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest)
    return dest


def _render_photo_style(font_path: Path, text: str, canvas_size: tuple[int, int], dest: Path, seed: int) -> Path:
    rng = Random(seed)
    bg_color, fg_color = rng.choice(PHOTO_BACKGROUNDS)
    width, height = canvas_size

    font = _fit_font(font_path, text, width - 2 * MARGIN, height - 2 * MARGIN)
    image = Image.new("RGB", canvas_size, color=bg_color)
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = (width - (right - left)) / 2 - left
    y = (height - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=font, fill=fg_color)

    angle = rng.uniform(-6, 6)
    image = image.rotate(angle, expand=True, fillcolor=bg_color, resample=Image.BICUBIC)
    image = image.resize(canvas_size)
    image = image.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.3, 1.0)))

    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest)
    return dest


def _render_weight_strip(variant_paths: dict[str, Path], weights: list[str], dest: Path) -> Path:
    height = WEIGHT_STRIP_ROW_HEIGHT * len(weights)
    image = Image.new("L", (WEIGHT_STRIP_WIDTH, height), color=255)
    draw = ImageDraw.Draw(image)
    for row, weight in enumerate(weights):
        font = _fit_font(
            variant_paths[weight], PANGRAM,
            WEIGHT_STRIP_WIDTH - 2 * MARGIN, WEIGHT_STRIP_ROW_HEIGHT - 2 * MARGIN,
        )
        row_box = (MARGIN, row * WEIGHT_STRIP_ROW_HEIGHT, WEIGHT_STRIP_WIDTH - MARGIN, (row + 1) * WEIGHT_STRIP_ROW_HEIGHT)
        _draw_centered(draw, PANGRAM, font, row_box)
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest)
    return dest


def render_family_weights(family: FontFamily) -> dict[str, Path]:
    """One plain pangram render per weight the family actually ships."""
    variant_paths = {
        variant: path
        for variant in family.variant_urls
        if (path := font_variant_path(family, variant)).exists() and _is_valid_font(path)
    }
    weights = [w for w in family.upright_weights if w in variant_paths]
    if not weights:
        return {}

    out_dir = SPECIMENS_DIR / family.slug / "weights"
    rendered = {}
    for weight in weights:
        try:
            dest = _render_single_line(variant_paths[weight], PANGRAM, PANGRAM_CANVAS, out_dir / f"{weight}.png")
            rendered[weight] = dest
        except Exception:
            logger.warning("failed to render weight %s for %s", weight, family.name, exc_info=True)
    return rendered


def render_family(family: FontFamily) -> list[Specimen]:
    variant_paths = {
        variant: path
        for variant in family.variant_urls
        if (path := font_variant_path(family, variant)).exists() and _is_valid_font(path)
    }
    if not variant_paths:
        logger.warning("no valid downloaded font files for %s, skipping", family.name)
        return []

    primary = variant_paths.get(family.primary_variant) or next(iter(variant_paths.values()))
    out_dir = SPECIMENS_DIR / family.slug

    try:
        seed = zlib.crc32(family.slug.encode())
        specimens = [
            Specimen("glyph", _render_single_line(primary, GLYPH_SAMPLE, GLYPH_CANVAS, out_dir / "glyph.png")),
            Specimen("pangram", _render_single_line(primary, PANGRAM, PANGRAM_CANVAS, out_dir / "pangram.png")),
            Specimen("photo", _render_photo_style(primary, PANGRAM, PHOTO_CANVAS, out_dir / "photo.png", seed)),
        ]
        weights = [w for w in family.upright_weights if w in variant_paths]
        if len(weights) > 1:
            specimens.append(
                Specimen("weight_strip", _render_weight_strip(variant_paths, weights, out_dir / "weights.png"))
            )
        return specimens
    except Exception:
        logger.warning("failed to render specimens for %s", family.name, exc_info=True)
        return []


def main() -> None:
    families = load_catalog(CATALOG_PATH)
    rendered = skipped = 0
    weight_specimens = 0
    for family in tqdm(families, desc="rendering specimens"):
        if render_family(family):
            rendered += 1
        else:
            skipped += 1
        weight_specimens += len(render_family_weights(family))
    logger.info(
        "rendered specimens for %d families, skipped %d, %d per-weight specimens",
        rendered, skipped, weight_specimens,
    )


if __name__ == "__main__":
    main()
