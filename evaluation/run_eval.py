"""Score the text-search API against evaluation/text_queries.json.

Run a snapshot:   python evaluation/run_eval.py --url http://127.0.0.1:8877 --label head
Compare two:      python evaluation/run_eval.py --compare before after

A query "hits" at k when any of its expected_fonts appears in the top k results.
Expected fonts are curated judgement, not ground truth -- read the per-query rows,
not just the aggregate.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
QUERIES_PATH = EVAL_DIR / "text_queries.json"
RESULTS_DIR = EVAL_DIR / "results"
KS = (1, 5, 10)


def search(url: str, query: str) -> list[dict]:
    request = urllib.request.Request(
        f"{url}/search/text",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def score_query(case: dict, results: list[dict]) -> dict:
    expected = set(case["expected_fonts"])
    names = [r["name"] for r in results]
    first_rank = next((i + 1 for i, name in enumerate(names) if name in expected), None)
    row = {
        "query": case["query"],
        "returned": len(names),
        "first_hit_rank": first_rank,
        "reciprocal_rank": 1 / first_rank if first_rank else 0.0,
        "top10": names[:10],
        "top10_categories": [r["category"] for r in results[:10]],
    }
    for k in KS:
        row[f"hit@{k}"] = any(name in expected for name in names[:k])
    if "expected_category" in case:
        top5 = results[:5]
        row["category_purity@5"] = (
            sum(r["category"] == case["expected_category"] for r in top5) / len(top5) if top5 else 0.0
        )
    return row


def aggregate(rows: list[dict]) -> dict:
    n = len(rows)
    summary = {f"hit@{k}": sum(r[f"hit@{k}"] for r in rows) / n for k in KS}
    summary["mrr"] = sum(r["reciprocal_rank"] for r in rows) / n
    purity = [r["category_purity@5"] for r in rows if "category_purity@5" in r]
    summary["category_purity@5"] = sum(purity) / len(purity) if purity else None
    summary["empty_result_queries"] = sum(r["returned"] == 0 for r in rows)
    return summary


def run(url: str, label: str) -> None:
    cases = json.loads(QUERIES_PATH.read_text())
    rows = [score_query(case, search(url, case["query"])) for case in cases]
    summary = aggregate(rows)

    print(f"\n{'query':44s} {'@1':>3} {'@5':>3} {'@10':>3} {'rank':>5}  top-5")
    for r in rows:
        mark = lambda hit: "Y" if hit else "."
        rank = r["first_hit_rank"] or "-"
        print(f"{r['query'][:44]:44s} {mark(r['hit@1']):>3} {mark(r['hit@5']):>3} {mark(r['hit@10']):>3} {rank:>5}  {', '.join(r['top10'][:5])}")

    print(f"\n[{label}] {len(rows)} queries")
    for key, value in summary.items():
        print(f"  {key:22s} {'n/a' if value is None else round(value, 3)}")

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{label}.json"
    out.write_text(json.dumps({"label": label, "summary": summary, "queries": rows}, indent=2) + "\n")
    print(f"\nwrote {out.relative_to(EVAL_DIR.parent)}")


def compare(before_label: str, after_label: str) -> None:
    before, after = (json.loads((RESULTS_DIR / f"{label}.json").read_text()) for label in (before_label, after_label))
    print(f"{'metric':22s} {before_label:>12s} {after_label:>12s}")
    for key in before["summary"]:
        b, a = before["summary"][key], after["summary"][key]
        fmt = lambda v: "n/a" if v is None else f"{v:.3f}"
        print(f"{key:22s} {fmt(b):>12s} {fmt(a):>12s}")

    print("\nper-query first-hit rank (- = no expected font in returned results)")
    after_by_query = {q["query"]: q for q in after["queries"]}
    for q in before["queries"]:
        b, a = q["first_hit_rank"] or "-", after_by_query[q["query"]]["first_hit_rank"] or "-"
        print(f"  {q['query'][:44]:44s} {str(b):>4} -> {str(a):>4}")


def rescore(labels: list[str]) -> None:
    """Re-score saved snapshots against the current text_queries.json, from their saved top 10.

    Use after editing expected_fonts. MRR here is capped at rank 10 (MRR@10), since snapshots
    only keep ten results per query.
    """
    cases = json.loads(QUERIES_PATH.read_text())
    print(f"{'snapshot':18s} {'hit@1':>6} {'hit@5':>6} {'hit@10':>6} {'mrr@10':>7}")
    for label in labels:
        snapshot = json.loads((RESULTS_DIR / f"{label}.json").read_text())
        by_query = {q["query"]: q["top10"] for q in snapshot["queries"]}
        hits = {k: 0 for k in KS}
        reciprocal = 0.0
        for case in cases:
            expected = set(case["expected_fonts"])
            first = next((i + 1 for i, name in enumerate(by_query[case["query"]]) if name in expected), None)
            reciprocal += 1 / first if first else 0.0
            for k in KS:
                hits[k] += bool(first and first <= k)
        n = len(cases)
        print(f"{label:18s} {hits[1] / n:6.3f} {hits[5] / n:6.3f} {hits[10] / n:6.3f} {reciprocal / n:7.3f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8877")
    parser.add_argument("--label", help="name for the results snapshot")
    parser.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"))
    parser.add_argument("--rescore", nargs="+", metavar="LABEL", help="re-score saved snapshots against current labels")
    args = parser.parse_args()

    if args.rescore:
        rescore(args.rescore)
    elif args.compare:
        compare(*args.compare)
    elif args.label:
        run(args.url, args.label)
    else:
        sys.exit("pass --label to run a snapshot, or --compare BEFORE AFTER")


if __name__ == "__main__":
    main()
