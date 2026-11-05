"""Updates only the descriptions table (LLM tags and the search tsvector) from data/tags, leaving fonts and
embeddings untouched. Reads the database URL from an env file given on the command line, refuses the live
database unless --allow-live is passed, and is a dry run unless --apply is passed."""

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values

from ingestion.catalog import load_catalog
from ingestion.config import CATALOG_PATH, TAGS_DIR
from ingestion.enrich_descriptions import load_training_catalog
from ingestion.logging_setup import get_logger

logger = get_logger(__name__)
LIVE_HOST_PREFIX = "ep-lively-term-asgptwez"


def read_database_url(env_file: Path) -> str:
    url = dotenv_values(env_file).get("DATABASE_URL", "")
    if not url:
        raise SystemExit(f"{env_file} has no DATABASE_URL")
    return url


def is_live(url: str) -> bool:
    return (urlparse(url).hostname or "").startswith(LIVE_HOST_PREFIX)


def load_tags(tags_dir: Path) -> dict[tuple[str, str], str]:
    families = load_catalog(CATALOG_PATH) if CATALOG_PATH.exists() else load_training_catalog()
    tags = {}
    for family in families:
        path = tags_dir / f"{family.slug}.txt"
        if path.exists():
            tags[(family.source, family.name)] = path.read_text().strip()
    return tags


def update(conn: psycopg.Connection, tags: dict[tuple[str, str], str], should_apply: bool) -> tuple[int, int]:
    rows = conn.execute("SELECT id, source, name FROM fonts").fetchall()
    matched = [(font_id, tags[(source, name)]) for font_id, source, name in rows if (source, name) in tags]
    if should_apply:
        # One batched transaction: the site sees either all the new descriptions or none of them.
        with conn.transaction(), conn.cursor() as cursor:
            cursor.executemany(
                """
                UPDATE descriptions
                SET llm_tags = %s, tsv = to_tsvector('english', coalesce(official_text, '') || ' ' || %s)
                WHERE font_id = %s
                """,
                [(llm_tags, llm_tags, font_id) for font_id, llm_tags in matched],
            )
    return len(rows), len(matched)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path, help="env file holding DATABASE_URL for the target database")
    parser.add_argument("--apply", action="store_true", help="write the changes (default is a dry run)")
    parser.add_argument("--allow-live", action="store_true", help="permit the live database")
    parser.add_argument("--tags-dir", type=Path, default=TAGS_DIR, help="folder of <slug>.txt tag files (default: data/tags)")
    args = parser.parse_args()

    url = read_database_url(args.env_file)
    host = urlparse(url).hostname or "?"
    if is_live(url) and not args.allow_live:
        sys.exit(f"refusing: {args.env_file} points at the live database ({host.split('.')[0]}); pass --allow-live to override")

    tags = load_tags(args.tags_dir)
    with psycopg.connect(url) as conn:
        fonts, matched = update(conn, tags, args.apply)
    mode = "updated" if args.apply else "would update"
    logger.info("target %s: %d fonts in database, %d tag files, %s %d descriptions", host.split(".")[0], fonts, len(tags), mode, matched)


if __name__ == "__main__":
    main()
