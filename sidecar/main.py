"""Embedding sidecar: holds SigLIP in memory, exposes it over HTTP for the query API.

Run with: uvicorn sidecar.main:app --host 0.0.0.0 --port 8001
"""

import base64
from io import BytesIO

import pillow_heif
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from ingestion.detect_regions import detect_regions
from ingestion.embed import embed_pil_image, embed_search_text

pillow_heif.register_heif_opener()  # lets Image.open() decode .heic/.heif uploads (iPhone default)

app = FastAPI(title="typeseek embedding sidecar")

THUMBNAIL_MAX_DIMENSION = 160


class TextEmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    vector: list[float]


class RegionEmbedding(BaseModel):
    vector: list[float]
    thumbnail: str


class EmbedRegionsResponse(BaseModel):
    regions: list[RegionEmbedding]


def _region_box(region: dict, width: int, height: int) -> tuple[int, int, int, int]:
    x = max(0.0, min(1.0, region.get("x", 0.0)))
    y = max(0.0, min(1.0, region.get("y", 0.0)))
    w = max(0.01, min(1.0 - x, region.get("width", 1.0)))
    h = max(0.01, min(1.0 - y, region.get("height", 1.0)))
    left = int(x * width)
    upper = int(y * height)
    right = max(left + 1, int((x + w) * width))
    lower = max(upper + 1, int((y + h) * height))
    return left, upper, right, lower


def _thumbnail_base64(crop) -> str:
    thumb = crop.copy()
    thumb.thumbnail((THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION))
    buf = BytesIO()
    thumb.convert("RGB").save(buf, format="JPEG", quality=70)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/embed-image", response_model=EmbedResponse)
async def embed_image_endpoint(file: UploadFile = File(...)) -> EmbedResponse:
    data = await file.read()
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="could not decode image")

    vector = embed_pil_image(image)
    return EmbedResponse(vector=vector.tolist())


@app.post("/embed-image-regions", response_model=EmbedRegionsResponse)
async def embed_image_regions_endpoint(file: UploadFile = File(...)) -> EmbedRegionsResponse:
    data = await file.read()
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="could not decode image")

    regions = detect_regions(image)
    # Largest area first — index 0 becomes the "primary" region.
    regions.sort(key=lambda r: r.get("width", 1.0) * r.get("height", 1.0), reverse=True)

    width, height = image.size
    embeddings: list[RegionEmbedding] = []
    for region in regions:
        crop = image.crop(_region_box(region, width, height))
        vector = embed_pil_image(crop)
        embeddings.append(RegionEmbedding(vector=vector.tolist(), thumbnail=_thumbnail_base64(crop)))

    return EmbedRegionsResponse(regions=embeddings)


@app.post("/embed-text", response_model=EmbedResponse)
def embed_text_endpoint(payload: TextEmbedRequest) -> EmbedResponse:
    vector = embed_search_text(payload.text)
    return EmbedResponse(vector=vector.tolist())
