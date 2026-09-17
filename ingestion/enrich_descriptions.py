"""Tag each font specimen with searchable style vocabulary using a vision LLM, offline.

Powers the text-search leg (F2): full-text search over these tags, alongside the font's
name/category, is what lets a query like "bold rounded playful" surface fonts that were
never named anything close to that.
"""

import base64
import json
from functools import lru_cache
from pathlib import Path

from tqdm import tqdm

from ingestion.catalog import load_catalog
from ingestion.config import ANTHROPIC_API_KEY, CATALOG_PATH, ENRICHMENT_MODEL, TAGS_DIR, TRAINING_DIR
from ingestion.logging_setup import get_logger
from ingestion.models import FontFamily
from ingestion.render_specimens import list_specimens

logger = get_logger(__name__)

PROMPT = (
    "Look at this font specimen. List 5-8 comma-separated words or short phrases describing "
    "its visual style, the way a designer searching for this look would type them "
    "(e.g. bold, rounded, geometric, playful, elegant, hand-drawn, condensed, futuristic, "
    "serif, script, tight spacing). Reply with ONLY the comma-separated list, nothing else."
)

LOCAL_STYLE_PROMPTS = {
    "bold": "bold heavy",
    "light": "light delicate",
    "rounded": "rounded soft",
    "geometric": "geometric structured",
    "playful": "playful whimsical",
    "elegant": "elegant refined",
    "hand-drawn": "hand-drawn informal",
    "condensed": "condensed narrow",
    "wide": "wide expansive",
    "serif": "serif",
    "sans-serif": "sans-serif",
    "script": "script calligraphic",
    "display": "decorative display",
    "monospace": "monospace",
    "friendly": "friendly approachable",
    "technical": "technical mechanical",
    "retro": "retro vintage",
    "futuristic": "futuristic",
    "ornate": "ornate decorative",
    "minimal": "minimal clean",
    "quirky": "quirky unusual",
    "formal": "formal traditional",
}

LOCAL_STYLE_TEMPLATES = (
    "a font specimen in a {style} style",
    "a {style} typeface",
    "lettering that looks {style}",
)


def tags_path(family: FontFamily) -> Path:
    return TAGS_DIR / f"{family.slug}.txt"


def pick_specimen(family: FontFamily) -> Path | None:
    """Prefer the pangram (more letterforms, more informative for style) over the bare glyph."""
    specimens = {path.stem: path for path in list_specimens(family)}
    specimen = specimens.get("pangram") or specimens.get("glyph") or next(iter(specimens.values()), None)
    if specimen is not None:
        return specimen

    training_dir = TRAINING_DIR / family.slug
    training_images = sorted(training_dir.glob("*.jpg"))
    return training_images[0] if training_images else None


def load_training_catalog() -> list[FontFamily]:
    manifest_path = TRAINING_DIR / "manifest.json"
    data = json.loads(manifest_path.read_text())
    return [
        FontFamily(
            name=item["name"],
            source="google-fonts",
            source_url=f"https://fonts.google.com/specimen/{item['name'].replace(' ', '+')}",
            category=item.get("category", "unknown"),
            license="commercial-ok",
            variant_urls={},
        )
        for item in data
    ]


@lru_cache(maxsize=1)
def _load_local_model():
    import open_clip
    import torch

    model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-16-SigLIP", pretrained="webli")
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    return model.to(device), preprocess, open_clip.get_tokenizer("ViT-B-16-SigLIP"), device


def tag_family_local(family: FontFamily) -> str | None:
    specimen = pick_specimen(family)
    if specimen is None:
        return None

    import torch
    from PIL import Image

    model, preprocess, tokenizer, device = _load_local_model()
    image = preprocess(Image.open(specimen).convert("RGB")).unsqueeze(0).to(device)
    prompt_sets = [
        [template.format(style=style) for style in LOCAL_STYLE_PROMPTS.values()]
        for template in LOCAL_STYLE_TEMPLATES
    ]
    with torch.no_grad():
        image_features = model.encode_image(image)
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        scores = []
        for prompts in prompt_sets:
            text_features = model.encode_text(tokenizer(prompts).to(device))
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            scores.append((image_features @ text_features.T).squeeze(0))
        scores = torch.stack(scores).mean(dim=0)

    ranked = scores.argsort(descending=True).tolist()
    tags = [list(LOCAL_STYLE_PROMPTS)[index] for index in ranked[:5]]
    if family.category not in tags:
        tags.append(family.category)
    return ", ".join(tags[:8])


def tag_family(client, family: FontFamily) -> str | None:
    # client is an anthropic.Anthropic instance; left untyped since the SDK is lazily
    # imported in main() to keep the base install light.
    specimen = pick_specimen(family)
    if specimen is None:
        return None

    image_data = base64.standard_b64encode(specimen.read_bytes()).decode("ascii")
    media_type = "image/jpeg" if specimen.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    response = client.messages.create(
        model=ENRICHMENT_MODEL,
        max_tokens=100,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )
    return response.content[0].text.strip()


def main() -> None:
    TAGS_DIR.mkdir(parents=True, exist_ok=True)
    families = load_catalog(CATALOG_PATH) if CATALOG_PATH.exists() else load_training_catalog()
    client = None
    if ANTHROPIC_API_KEY:
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        except ImportError:
            logger.warning("Anthropic SDK is unavailable; using local tagging")
    api_enabled = client is not None

    tagged = skipped = failed = 0
    for family in tqdm(families, desc="enriching descriptions"):
        dest = tags_path(family)
        if dest.exists():
            tagged += 1
            continue

        try:
            if api_enabled:
                tags = tag_family(client, family)
            else:
                tags = tag_family_local(family)
        except Exception:
            if api_enabled:
                logger.warning("API enrichment unavailable for %s; switching to local tagging", family.name)
                api_enabled = False
                try:
                    tags = tag_family_local(family)
                except Exception:
                    logger.warning("local tagging failed for %s", family.name, exc_info=True)
                    failed += 1
                    continue
            else:
                logger.warning("local tagging failed for %s", family.name, exc_info=True)
                failed += 1
                continue

        if tags is None:
            skipped += 1
            continue

        dest.write_text(tags)
        tagged += 1

    logger.info("tagged %d families, skipped %d (no specimen), failed %d", tagged, skipped, failed)


if __name__ == "__main__":
    main()
