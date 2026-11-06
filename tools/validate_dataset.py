#!/usr/bin/env python3
"""Check whether generated study data meets the repository targets."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED_DIR = ROOT / "data" / "generated"
COVERAGE_PATH = GENERATED_DIR / "coverage.json"

REQUIRED_TARGETS = {
    "jlpt_n1_180_candidate_vocab": 10000,
    "jpt_990_candidate_vocab": 20000,
    "joyo_kanji": 2136,
    "modern_kanji_candidate": 3000,
}


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as file:
        return sum(1 for line in file if line.strip())


def main() -> int:
    if not COVERAGE_PATH.exists():
        print("data/generated/coverage.json is missing.")
        print("Run: python tools/build_dataset.py --download")
        return 1

    coverage = json.loads(COVERAGE_PATH.read_text(encoding="utf-8"))
    counts = {
        "vocab": count_jsonl(GENERATED_DIR / "vocab.jsonl"),
        "kanji": count_jsonl(GENERATED_DIR / "kanji.jsonl"),
        "grammar": count_jsonl(GENERATED_DIR / "grammar.jsonl"),
        "business_keigo": count_jsonl(GENERATED_DIR / "business_keigo.jsonl"),
        "domain_terms": count_jsonl(GENERATED_DIR / "domain_terms.jsonl"),
        "joyo_kanji": coverage.get("counts", {}).get("joyo_kanji", 0),
    }

    checks = {
        "jlpt_n1_180_candidate_vocab": counts["vocab"] >= REQUIRED_TARGETS["jlpt_n1_180_candidate_vocab"],
        "jpt_990_candidate_vocab": counts["vocab"] >= REQUIRED_TARGETS["jpt_990_candidate_vocab"],
        "joyo_kanji": counts["joyo_kanji"] >= REQUIRED_TARGETS["joyo_kanji"],
        "modern_kanji_candidate": counts["kanji"] >= REQUIRED_TARGETS["modern_kanji_candidate"],
        "grammar_seed_exists": counts["grammar"] > 0,
        "business_keigo_seed_exists": counts["business_keigo"] > 0,
        "domain_terms_seed_exists": counts["domain_terms"] > 0,
    }

    print("Counts")
    for name, value in counts.items():
        print(f"- {name}: {value}")

    print("\nChecks")
    failed = False
    for name, ok in checks.items():
        mark = "OK" if ok else "MISSING"
        print(f"- {name}: {mark}")
        failed = failed or not ok

    if failed:
        print("\nSome targets are not ready yet.")
        print("Usually this means the generated files were not built, or the source data needs review.")
        return 1

    print("\nAll required targets are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
