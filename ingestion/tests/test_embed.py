import numpy as np

from ingestion import embed


def _fake_embed_text(text: str) -> np.ndarray:
    # Every "a <word> font" probe points along axis 0 with a small per-word tilt on axis 1;
    # any other text points along axis 0 tilted toward axis 2.
    if text.startswith("a ") and text.endswith(" font"):
        vector = np.array([1.0, 0.1, 0.0])
    else:
        vector = np.array([1.0, 0.0, 0.5])
    return vector / np.linalg.norm(vector)


def test_embed_search_text_removes_text_modality_mean_and_normalizes(monkeypatch):
    monkeypatch.setattr(embed, "embed_text", _fake_embed_text)
    embed._text_center.cache_clear()

    result = embed.embed_search_text("friendly rounded modern")

    probe_mean = _fake_embed_text("a bold font")
    expected = _fake_embed_text("friendly rounded modern") - probe_mean
    expected /= np.linalg.norm(expected)
    assert np.allclose(result, expected)
    assert np.isclose(np.linalg.norm(result), 1.0)
    embed._text_center.cache_clear()


def test_embed_search_text_differs_from_raw_embedding(monkeypatch):
    monkeypatch.setattr(embed, "embed_text", _fake_embed_text)
    embed._text_center.cache_clear()

    raw = _fake_embed_text("elegant serif")
    centered = embed.embed_search_text("elegant serif")

    assert not np.allclose(raw, centered)
    embed._text_center.cache_clear()
