"""Generate one searchable SigLIP embedding per training font family."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from tqdm import tqdm

from ingestion.config import EMBEDDING_DIM, EMBEDDING_MODEL, EMBEDDING_PRETRAINED, EMBEDDINGS_DIR, TRAINING_DIR


def load_model():
    import open_clip
    import torch

    model, _, preprocess = open_clip.create_model_and_transforms(
        EMBEDDING_MODEL, pretrained=EMBEDDING_PRETRAINED
    )
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    return model.to(device), preprocess, device


def embed_family(model, preprocess, device, paths, batch_size):
    import torch

    vectors = []
    for start in range(0, len(paths), batch_size):
        batch_paths = paths[start : start + batch_size]
        images = torch.stack([preprocess(Image.open(path).convert("RGB")) for path in batch_paths]).to(device)
        with torch.no_grad():
            batch_vectors = model.encode_image(images).float()
            batch_vectors /= batch_vectors.norm(dim=-1, keepdim=True)
        vectors.append(batch_vectors.cpu())
    family_vector = torch.cat(vectors).mean(dim=0)
    family_vector /= family_vector.norm()
    result = family_vector.numpy()
    assert result.shape == (EMBEDDING_DIM,)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-images", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    model, preprocess, device = load_model()
    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)

    embedded = skipped = 0
    for item in tqdm(manifest, desc="embedding training families"):
        family_dir = TRAINING_DIR / item["slug"]
        paths = sorted(family_dir.glob("*.jpg"))[: args.max_images]
        if not paths:
            skipped += 1
            continue
        vector = embed_family(model, preprocess, device, paths, args.batch_size)
        np.save(EMBEDDINGS_DIR / f"{item['slug']}.npy", vector)
        embedded += 1

    print(f"embedded {embedded} families, skipped {skipped}, device={device}")


if __name__ == "__main__":
    main()
