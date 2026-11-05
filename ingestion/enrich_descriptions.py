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
    "Look at this font specimen. Ignore the angle, colours and background of the image; describe only "
    "the letterforms. List 5-8 comma-separated words or short phrases describing "
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
    specimens = pick_specimens(family)
    return specimens[0] if specimens else None


def _weight(image: Path) -> int:
    prefix = image.stem.split("_")[0]
    return 400 if prefix == "regular" else int(prefix) if prefix.isdigit() else 400


def pick_specimens(family: FontFamily) -> list[Path]:
    """The regular weight, plus the heaviest when the family has one, so the description fits the family.

    Training images are sorted by name, so taking the first one showed the lightest weight: Fredoka Light
    was described as thin and minimal, and never matched "bold rounded playful".
    """
    specimens = {path.stem: path for path in list_specimens(family)}
    rendered = specimens.get("pangram") or specimens.get("glyph") or next(iter(specimens.values()), None)
    if rendered is not None:
        return [rendered]

    training_dir = TRAINING_DIR / family.slug
    upright = sorted(training_dir.glob("*_0_0.jpg"))
    if not upright:
        training_images = sorted(training_dir.glob("*.jpg"))
        return training_images[:1]
    regular = next((image for image in upright if image.stem.startswith("regular")), upright[0])
    heaviest = max(upright, key=_weight)
    return [regular] if heaviest == regular else [regular, heaviest]


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
    specimens = pick_specimens(family)
    if not specimens:
        return None

    images = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg" if specimen.suffix.lower() in {".jpg", ".jpeg"} else "image/png",
                "data": base64.standard_b64encode(specimen.read_bytes()).decode("ascii"),
            },
        }
        for specimen in specimens
    ]
    note = "These images show the same font family at its regular and heaviest weight. " if len(specimens) > 1 else ""
    # Room for the model's thinking before its answer; the answer itself is a short list.
    response = client.messages.create(
        model=ENRICHMENT_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": [*images, {"type": "text", "text": note + PROMPT}]}],
    )
    text = " ".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise RuntimeError(f"empty description for {family.name} (stop reason: {response.stop_reason})")
    return text


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
                # Stop rather than quietly mixing local tags into an API run; rerunning resumes where it stopped.
                logger.error("API enrichment failed for %s; stopping so the run can be fixed and resumed", family.name)
                raise
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
