"""Idempotent upsert of the full font corpus into Postgres."""

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from tqdm import tqdm

from ingestion.catalog import load_catalog
from ingestion.config import CATALOG_PATH, DATABASE_URL, EMBEDDINGS_DIR, TAGS_DIR
from ingestion.logging_setup import get_logger
from ingestion.models import FontFamily

logger = get_logger(__name__)


def get_connection() -> psycopg.Connection:
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    register_vector(conn)
    return conn


def upsert_font(conn: psycopg.Connection, family: FontFamily) -> int:
    row = conn.execute(
        """
        INSERT INTO fonts (name, source, source_url, license, category)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (source, name) DO UPDATE SET
            source_url = EXCLUDED.source_url,
            license = EXCLUDED.license,
            category = EXCLUDED.category
        RETURNING id
        """,
        (family.name, family.source, family.source_url, family.license, family.category),
    ).fetchone()
    return row[0]


def load_embedding_center(conn: psycopg.Connection) -> np.ndarray | None:
    row = conn.execute("SELECT vec FROM embedding_center LIMIT 1").fetchone()
    return row[0].to_numpy() if row else None


def upsert_embedding(conn: psycopg.Connection, font_id: int, vector: np.ndarray, center: np.ndarray | None) -> None:
    if center is not None:
        vector = vector - center
        vector = vector / np.linalg.norm(vector)
    conn.execute(
        """
        INSERT INTO embeddings (font_id, vec)
        VALUES (%s, %s)
        ON CONFLICT (font_id) DO UPDATE SET vec = EXCLUDED.vec
        """,
        (font_id, vector),
    )


def upsert_embedding_by_weight(
    conn: psycopg.Connection, font_id: int, weight: str, vector: np.ndarray, center: np.ndarray | None
) -> None:
    if center is not None:
        vector = vector - center
        vector = vector / np.linalg.norm(vector)
    conn.execute(
        """
        INSERT INTO embeddings_by_weight (font_id, weight, vec)
        VALUES (%s, %s, %s)
        ON CONFLICT (font_id, weight) DO UPDATE SET vec = EXCLUDED.vec
        """,
        (font_id, weight, vector),
    )


def upsert_description(conn: psycopg.Connection, font_id: int, official_text: str | None, llm_tags: str | None = None) -> None:
    conn.execute(
        """
        INSERT INTO descriptions (font_id, official_text, llm_tags, tsv)
        VALUES (%s, %s, %s, to_tsvector('english', coalesce(%s, '') || ' ' || coalesce(%s, '')))
        ON CONFLICT (font_id) DO UPDATE SET
            official_text = EXCLUDED.official_text,
            llm_tags = EXCLUDED.llm_tags,
            tsv = EXCLUDED.tsv
        """,
        (font_id, official_text, llm_tags, official_text, llm_tags),
    )


def load_family(
    conn: psycopg.Connection,
    family: FontFamily,
    embedding: np.ndarray | None,
    weight_embeddings: dict[str, np.ndarray],
    llm_tags: str | None,
    center: np.ndarray | None,
) -> int:
    font_id = upsert_font(conn, family)
    if embedding is not None:
        upsert_embedding(conn, font_id, embedding, center)
    for weight, vector in weight_embeddings.items():
        upsert_embedding_by_weight(conn, font_id, weight, vector, center)
    upsert_description(conn, font_id, official_text=f"{family.name} ({family.category})", llm_tags=llm_tags)
    return font_id


def main() -> None:
    families = load_catalog(CATALOG_PATH)
    conn = get_connection()
    center = load_embedding_center(conn)
    if center is None:
        logger.warning("no embedding_center row found — new embeddings will be stored uncentered")

    loaded = missing_embedding = missing_tags = failed = 0
    weight_vectors_loaded = 0
    for family in tqdm(families, desc="loading corpus"):
        embedding_path = EMBEDDINGS_DIR / f"{family.slug}.npy"
        embedding = np.load(embedding_path) if embedding_path.exists() else None
        if embedding is None:
            missing_embedding += 1

        weight_dir = EMBEDDINGS_DIR / family.slug / "weights"
        weight_embeddings = (
            {path.stem: np.load(path) for path in weight_dir.glob("*.npy")} if weight_dir.exists() else {}
        )
        weight_vectors_loaded += len(weight_embeddings)

        tags_path = TAGS_DIR / f"{family.slug}.txt"
        llm_tags = tags_path.read_text() if tags_path.exists() else None
        if llm_tags is None:
            missing_tags += 1

        try:
            load_family(conn, family, embedding, weight_embeddings, llm_tags, center)
        except psycopg.OperationalError:
            logger.warning("connection dropped while loading %s, reconnecting", family.name)
            conn = get_connection()
            try:
                load_family(conn, family, embedding, weight_embeddings, llm_tags, center)
            except psycopg.OperationalError:
                logger.warning("failed to load %s after reconnect", family.name, exc_info=True)
                failed += 1
                continue
        loaded += 1

    logger.info(
        "loaded %d families (%d without an embedding, %d without tags, %d failed, %d weight vectors)",
        loaded,
        missing_embedding,
        missing_tags,
        failed,
        weight_vectors_loaded,
    )


if __name__ == "__main__":
    main()
