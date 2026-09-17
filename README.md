# typeseek

Visual font discovery: find a font by uploading an image or describing it, instead of
knowing its name. Indexes free font sources (starting with Google Fonts) with SigLIP
embeddings and pgvector for similarity search.

## Requirements

- Python 3.11+
- Postgres with the `pgvector` extension (e.g. [Neon](https://neon.tech))
- A Google Fonts API key

## Setup

```
python -m venv .venv
./.venv/Scripts/pip install -e .
cp .env.example .env   # fill in GOOGLE_FONTS_API_KEY and DATABASE_URL
```

Apply the schema:

```
./.venv/Scripts/python -c "
import psycopg
from ingestion.config import DATABASE_URL
psycopg.connect(DATABASE_URL, autocommit=True).execute(open('ingestion/db/schema.sql').read())
"
```

## Ingestion pipeline

Each stage is idempotent and safe to re-run:

```
python -m ingestion.fetch_fonts        # pull the Google Fonts catalog
python -m ingestion.download_fonts     # cache font files locally
python -m ingestion.render_specimens   # render glyph/pangram/weight-strip PNGs
pip install -e ".[embed]"              # torch + open_clip, needed for the next step
python -m ingestion.embed              # SigLIP embeddings, one vector per font
python -m ingestion.enrich_descriptions # API-first tags; falls back to local SigLIP tagging
python -m ingestion.db.loader          # upsert everything into Postgres
```

`enrich_descriptions` skips existing tag files, so it is safe to stop and rerun. If
`data/fonts.json` and `data/specimens/` are unavailable but `data/training/` exists,
it uses the training manifest and one JPEG per font automatically. When Anthropic API
access is unavailable, it switches to local zero-shot SigLIP tags for the rest of that
run; a future run tries the API again first.

Optional, for serving specimen images from R2/S3:

```
pip install -e ".[storage]"
python -m ingestion.upload_specimens
```

## Querying

```
python -m ingestion.sanity_check path/to/image.png
```

Prints the top-k nearest fonts in the index by embedding similarity.
