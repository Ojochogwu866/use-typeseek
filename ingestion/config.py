import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
FONTS_DIR = DATA_DIR / "fonts"
SPECIMENS_DIR = DATA_DIR / "specimens"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"
TAGS_DIR = DATA_DIR / "tags"
TRAINING_DIR = DATA_DIR / "training"
CATALOG_PATH = DATA_DIR / "fonts.json"

GOOGLE_FONTS_API_KEY = os.environ.get("GOOGLE_FONTS_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")

# Every Google Fonts catalog entry ships under OFL, Apache 2.0, or the Ubuntu Font
# License — all of which permit commercial use, so this source needs no per-font
# license classification.
GOOGLE_FONTS_LICENSE = "commercial-ok"

# ViT-B-16-SigLIP / webli: 768-dim output, matches the `embeddings.vec` column in schema.sql.
EMBEDDING_MODEL = "ViT-B-16-SigLIP"
EMBEDDING_PRETRAINED = "webli"
EMBEDDING_DIM = 768

GLYPH_SAMPLE = "Rag"
PANGRAM = "The quick brown fox jumps over the lazy dog"

ENRICHMENT_MODEL = "claude-haiku-4-5-20251001"
