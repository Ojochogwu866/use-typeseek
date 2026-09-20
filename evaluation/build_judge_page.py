"""Build evaluation/judge.html: a page for widening each query's expected_fonts by eye.

Pools every font that appeared in any snapshot's top 10 for a query (plus the fonts already
expected), renders each in its own typeface via Google Fonts, and exports an updated
text_queries.json from the ticked boxes.

    python evaluation/build_judge_page.py && open evaluation/judge.html
"""

import json
from pathlib import Path
from urllib.parse import quote_plus

EVAL_DIR = Path(__file__).resolve().parent
QUERIES_PATH = EVAL_DIR / "text_queries.json"
OUT_PATH = EVAL_DIR / "judge.html"


def pooled_candidates(cases: list[dict]) -> list[dict]:
    snapshots = [json.loads(p.read_text()) for p in sorted((EVAL_DIR / "results").glob("*.json"))]
    pooled = []
    for case in cases:
        names = list(case["expected_fonts"])
        for snapshot in snapshots:
            row = next((q for q in snapshot["queries"] if q["query"] == case["query"]), None)
            names += row["top10"] if row else []
        pooled.append({**case, "candidates": list(dict.fromkeys(names))})
    return pooled


def font_css_url(names: list[str]) -> str:
    families = "&".join(f"family={quote_plus(name)}" for name in names)
    return f"https://fonts.googleapis.com/css2?{families}&display=swap"


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Judge font matches</title>
__FONT_LINKS__
<style>
  :root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --card: #fff; --line: #e7e5e4; --accent: #2563eb; --good: #16a34a; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #171717; --fg: #f5f5f4; --muted: #a8a29e; --card: #232323; --line: #363636; --accent: #60a5fa; --good: #4ade80; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header p { margin: 0; color: var(--muted); flex: 1 1 260px; }
  button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
  main { max-width: 1100px; margin: 0 auto; padding: 8px 16px 64px; }
  section { margin-top: 32px; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  label.card { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
  label.card:has(input:checked) { border-color: var(--good); box-shadow: inset 0 0 0 1px var(--good); }
  .name { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); }
  .name input { accent-color: var(--good); }
  .sample { font-size: 26px; line-height: 1.2; margin-top: 4px; overflow-wrap: anywhere; }
  .tag { color: var(--accent); }
</style>
</head>
<body>
<header>
  <p>Tick every font you would accept for the query. Ticks save in this browser. <span id="count"></span></p>
  <button id="copy">Copy updated text_queries.json</button>
</header>
<main id="root"></main>
<script>
const DATA = __DATA__;
const SAMPLE = "Quick brown fox 123";
const KEY = "typeseek-judge-v1";
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}

const root = document.getElementById("root");
DATA.forEach((c, qi) => {
  const section = document.createElement("section");
  const head = document.createElement("h2");
  head.textContent = c.query;
  section.append(head);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = (c.expected_category ? "category: " + c.expected_category + " · " : "") + c.candidates.length + " candidates";
  section.append(meta);
  const grid = document.createElement("div");
  grid.className = "grid";
  c.candidates.forEach(name => {
    const id = qi + "|" + name;
    const expected = c.expected_fonts.includes(name);
    const checked = id in saved ? saved[id] : expected;
    const label = document.createElement("label");
    label.className = "card";
    const top = document.createElement("div");
    top.className = "name";
    const title = document.createElement("span");
    title.textContent = name;
    if (expected) { const t = document.createElement("span"); t.className = "tag"; t.textContent = " (was expected)"; title.append(t); }
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.dataset.q = qi; box.dataset.name = name;
    box.addEventListener("change", () => {
      saved[id] = box.checked;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
      updateCount();
    });
    top.append(title, box);
    const sample = document.createElement("div");
    sample.className = "sample";
    sample.style.fontFamily = "'" + name + "', sans-serif";
    sample.textContent = SAMPLE;
    label.append(top, sample);
    grid.append(label);
  });
  section.append(grid);
  root.append(section);
});

function accepted(qi) {
  return [...document.querySelectorAll('input[data-q="' + qi + '"]')].filter(b => b.checked).map(b => b.dataset.name);
}
function updateCount() {
  const total = document.querySelectorAll("input:checked").length;
  document.getElementById("count").textContent = total + " fonts ticked across " + DATA.length + " queries.";
}
updateCount();

document.getElementById("copy").addEventListener("click", async () => {
  const out = DATA.map((c, qi) => {
    const item = { query: c.query };
    if (c.expected_category) item.expected_category = c.expected_category;
    item.expected_fonts = accepted(qi);
    return item;
  });
  const text = JSON.stringify(out, null, 2) + "\\n";
  try { await navigator.clipboard.writeText(text); document.getElementById("copy").textContent = "Copied"; }
  catch (e) { prompt("Copy this JSON:", text); }
  setTimeout(() => { document.getElementById("copy").textContent = "Copy updated text_queries.json"; }, 1500);
});
</script>
</body>
</html>
"""


def main() -> None:
    pooled = pooled_candidates(json.loads(QUERIES_PATH.read_text()))
    links = "\n".join(
        f'<link rel="stylesheet" href="{font_css_url(case["candidates"])}">' for case in pooled
    )
    page = TEMPLATE.replace("__FONT_LINKS__", links).replace("__DATA__", json.dumps(pooled))
    OUT_PATH.write_text(page)
    total = sum(len(case["candidates"]) for case in pooled)
    print(f"wrote {OUT_PATH.relative_to(EVAL_DIR.parent)}: {len(pooled)} queries, {total} candidates")


if __name__ == "__main__":
    main()
