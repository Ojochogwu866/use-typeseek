"""One-off migration: center every stored embedding against the corpus mean.

Raw SigLIP embeddings of font specimens share a dominant "text on white background"
direction that swamps the actual font-identity signal (corpus mean vector norm ~0.96
out of a max of 1.0 — nearly every embedding points the same way). Subtracting the
mean and renormalizing restores real discriminative range. Run once against the
live corpus; `loader.py` centers newly-loaded fonts against the same stored mean
going forward.
"""

import json
from datetime import datetime, timezone

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from ingestion.config import DATABASE_URL
from ingestion.logging_setup import get_logger

logger = get_logger(__name__)


def main() -> None:
    conn = psycopg.connect(DATABASE_URL, autocommit=False)
    register_vector(conn)

    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM embedding_center")
        if cur.fetchone()[0] > 0:
            raise RuntimeError(
                "embedding_center already has a row -- embeddings.vec is already centered. "
                "Running this again would center already-centered data (double-centering), "
                "not the raw embeddings. If fonts were removed and the corpus needs "
                "recentering, recompute from the last embeddings_backup_*.json (raw, "
                "pre-centering) instead, excluding the removed font_ids -- do not run this "
                "script directly against the live table again."
            )

    with conn.cursor() as cur:
        cur.execute("SELECT font_id, vec FROM embeddings ORDER BY font_id")
        rows = cur.fetchall()

    font_ids = [r[0] for r in rows]
    vecs = np.array([r[1].to_numpy() for r in rows], dtype=np.float64)
    logger.info("loaded %d embeddings", len(vecs))

    backup_path = f"embeddings_backup_{datetime.now(timezone.utc):%Y%m%dT%H%M%S}.json"
    with open(backup_path, "w") as f:
        json.dump({fid: vec.tolist() for fid, vec in zip(font_ids, vecs)}, f)
    logger.info("backed up raw embeddings to %s", backup_path)

    mean = vecs.mean(axis=0)
    logger.info("corpus mean vector norm: %.4f", np.linalg.norm(mean))

    centered = vecs - mean
    centered /= np.linalg.norm(centered, axis=1, keepdims=True)

    BATCH_SIZE = 200
    with conn.cursor() as cur:
        cur.execute("DELETE FROM embedding_center")
        cur.execute("INSERT INTO embedding_center (vec) VALUES (%s)", (mean,))
        for start in range(0, len(font_ids), BATCH_SIZE):
            batch_ids = font_ids[start : start + BATCH_SIZE]
            batch_vecs = centered[start : start + BATCH_SIZE]
            cur.executemany(
                "UPDATE embeddings SET vec = %s WHERE font_id = %s",
                list(zip(batch_vecs, batch_ids)),
            )
            logger.info("updated %d / %d", min(start + BATCH_SIZE, len(font_ids)), len(font_ids))

    conn.commit()
    logger.info("recentered %d embeddings and stored corpus mean", len(font_ids))
    conn.close()


if __name__ == "__main__":
    main()
