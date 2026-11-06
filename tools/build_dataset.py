#!/usr/bin/env python3
"""Build large Japanese learning datasets from open sources.

This script is intentionally simple. It does three jobs:
1. Download open dictionary files when --download is used.
2. Convert JMdict and KANJIDIC2 XML into JSONL study cards.
3. Convert small hand-written TSV seed files into JSONL cards.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
GENERATED_DIR = DATA_DIR / "generated"
SEED_DIR = DATA_DIR / "seed"

JMDICT_URLS = [
    "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
    "https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
]
KANJIDIC2_URLS = [
    "http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz",
    "https://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz",
]
EDRDG_LICENSE = "CC BY-SA 4.0"

TARGETS = {
    "jlpt_n1_180_candidate_vocab": 10000,
    "jpt_990_candidate_vocab": 20000,
    "joyo_kanji": 2136,
    "modern_kanji_candidate": 3000,
}


def download(urls: list[str], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        print(f"skip: {path} already exists")
        return

    last_error: Exception | None = None
    for url in urls:
        try:
            print(f"download: {url}")
            urllib.request.urlretrieve(url, path)
            return
        except Exception as error:  # pragma: no cover - depends on network environment.
            last_error = error
            if path.exists():
                path.unlink()
            print(f"warning: failed to download from {url}: {error}", file=sys.stderr)

    raise RuntimeError(f"could not download {path.name}") from last_error


def read_tsv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file, delimiter="\t"))


def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            file.write("\n")
            count += 1
    return count


def unique_text(values: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value:
            continue
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def priority_score(priority_tags: list[str]) -> int:
    """Lower score means the word is more useful as a study candidate."""
    score = 100_000
    for tag in priority_tags:
        if tag in {"news1", "ichi1", "spec1", "gai1"}:
            score = min(score, 1)
        elif tag in {"news2", "ichi2", "spec2", "gai2"}:
            score = min(score, 2)
        elif tag.startswith("nf") and tag[2:].isdigit():
            score = min(score, 10 + int(tag[2:]))
    return score


def parse_jmdict(path: Path, max_entries: int) -> list[dict]:
    records: list[dict] = []
    with gzip.open(path, "rb") as file:
        for event, elem in ET.iterparse(file, events=("end",)):
            if elem.tag != "entry":
                continue

            ent_seq = elem.findtext("ent_seq") or "unknown"
            writings = unique_text(k.findtext("keb") for k in elem.findall("k_ele"))
            readings = unique_text(r.findtext("reb") for r in elem.findall("r_ele"))
            priority_tags = unique_text(
                [p.text for p in elem.findall(".//ke_pri")] +
                [p.text for p in elem.findall(".//re_pri")]
            )
            parts_of_speech = unique_text(p.text for p in elem.findall(".//pos"))
            fields = unique_text(f.text for f in elem.findall(".//field"))
            meanings = unique_text(g.text for g in elem.findall(".//gloss"))[:10]

            writing = writings[0] if writings else (readings[0] if readings else "")
            kana = readings[0] if readings else ""
            if not writing or not kana or not meanings:
                elem.clear()
                continue

            record = {
                "id": f"jmdict:{ent_seq}",
                "writing": writing,
                "kana": kana,
                "other_writings": writings[1:],
                "other_readings": readings[1:],
                "meanings": meanings,
                "pos": parts_of_speech[:8],
                "fields": fields[:8],
                "priority": priority_tags[:8],
                "course_tags": [],
                "difficulty_hint": "candidate",
                "source": {
                    "name": "JMdict",
                    "url": "https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project",
                    "license": EDRDG_LICENSE,
                },
                "_score": priority_score(priority_tags),
            }
            records.append(record)
            elem.clear()

    records.sort(key=lambda row: (row["_score"], row["id"]))
    selected = records[:max_entries]
    for index, row in enumerate(selected):
        tags = ["jpt_990_candidate"]
        if index < TARGETS["jlpt_n1_180_candidate_vocab"]:
            tags.append("jlpt_n1_180_candidate")
        for field in row["fields"]:
            safe_field = field.lower().replace(" ", "_").replace("&", "and")
            tags.append(f"domain:{safe_field}")
        row["course_tags"] = tags
        row["rank_hint"] = index + 1
        row.pop("_score", None)
    return selected


def parse_kanjidic2(path: Path, max_modern_kanji: int) -> list[dict]:
    records: list[dict] = []
    with gzip.open(path, "rb") as file:
        for event, elem in ET.iterparse(file, events=("end",)):
            if elem.tag != "character":
                continue

            literal = elem.findtext("literal") or ""
            grade = int_or_none(elem.findtext("misc/grade"))
            stroke_count = int_or_none(elem.findtext("misc/stroke_count"))
            frequency_rank = int_or_none(elem.findtext("misc/freq"))
            old_jlpt_level = int_or_none(elem.findtext("misc/jlpt"))
            on_readings = unique_text(
                r.text for r in elem.findall("reading_meaning/rmgroup/reading")
                if r.attrib.get("r_type") == "ja_on"
            )
            kun_readings = unique_text(
                r.text for r in elem.findall("reading_meaning/rmgroup/reading")
                if r.attrib.get("r_type") == "ja_kun"
            )
            meanings = unique_text(
                m.text for m in elem.findall("reading_meaning/rmgroup/meaning")
                if "m_lang" not in m.attrib
            )
            variants = [
                {"type": v.attrib.get("var_type", "unknown"), "value": v.text}
                for v in elem.findall("misc/variant")
                if v.text
            ]
            if not literal:
                elem.clear()
                continue

            is_joyo = grade is not None and 1 <= grade <= 8
            records.append({
                "id": f"kanjidic2:{literal}",
                "literal": literal,
                "grade": grade,
                "stroke_count": stroke_count,
                "frequency_rank": frequency_rank,
                "old_jlpt_level": old_jlpt_level,
                "on_readings": on_readings,
                "kun_readings": kun_readings,
                "meanings": meanings,
                "variants": variants,
                "course_tags": ["joyo_2136"] if is_joyo else [],
                "source": {
                    "name": "KANJIDIC2",
                    "url": "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
                    "license": EDRDG_LICENSE,
                },
                "_is_joyo": is_joyo,
            })
            elem.clear()

    records.sort(key=lambda row: (
        0 if row["_is_joyo"] else 1,
        row["frequency_rank"] if row["frequency_rank"] is not None else 99_999,
        row["grade"] if row["grade"] is not None else 99,
        row["literal"],
    ))
    selected = records[:max_modern_kanji]
    for row in selected:
        if "modern_kanji_3000_candidate" not in row["course_tags"]:
            row["course_tags"].append("modern_kanji_3000_candidate")
        row.pop("_is_joyo", None)
    return selected


def seed_rows_to_cards(rows: list[dict[str, str]], kind: str) -> list[dict]:
    cards: list[dict] = []
    for row in rows:
        if kind == "grammar":
            tags = [tag for tag in row.get("tags", "").split(";") if tag]
            cards.append({
                "id": row["id"],
                "level": row["level"],
                "pattern": row["pattern"],
                "meaning_ko": row["meaning_ko"],
                "simple_note": row["simple_note"],
                "tags": tags,
                "source": {"name": "original seed", "license": "repository-owned"},
            })
        elif kind == "business_keigo":
            tags = [tag for tag in row.get("tags", "").split(";") if tag]
            cards.append({
                "id": row["id"],
                "category": row["category"],
                "japanese": row["japanese"],
                "kana": row["kana"],
                "meaning_ko": row["meaning_ko"],
                "simple_note": row["simple_note"],
                "register": row["register"],
                "tags": tags,
                "source": {"name": "original seed", "license": "repository-owned"},
            })
        elif kind == "domain_terms":
            tags = [tag for tag in row.get("tags", "").split(";") if tag]
            cards.append({
                "id": row["id"],
                "domain": row["domain"],
                "japanese": row["japanese"],
                "kana": row["kana"],
                "meaning_ko": row["meaning_ko"],
                "education_stage": row["education_stage"],
                "simple_note": row["simple_note"],
                "tags": tags,
                "source": {"name": "original seed", "license": "repository-owned"},
            })
    return cards


def build_coverage(counts: dict[str, int]) -> dict:
    return {
        "counts": counts,
        "targets": TARGETS,
        "status": {
            "jlpt_n1_180_candidate_vocab": counts.get("vocab", 0) >= TARGETS["jlpt_n1_180_candidate_vocab"],
            "jpt_990_candidate_vocab": counts.get("vocab", 0) >= TARGETS["jpt_990_candidate_vocab"],
            "joyo_kanji": counts.get("joyo_kanji", 0) >= TARGETS["joyo_kanji"],
            "modern_kanji_candidate": counts.get("kanji", 0) >= TARGETS["modern_kanji_candidate"],
        },
        "note": "Course tags are learning candidates, not official JLPT or JPT source lists.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Japanese learning data files.")
    parser.add_argument("--download", action="store_true", help="Download JMdict and KANJIDIC2 first.")
    parser.add_argument("--max-vocab", type=int, default=TARGETS["jpt_990_candidate_vocab"])
    parser.add_argument("--max-kanji", type=int, default=TARGETS["modern_kanji_candidate"])
    parser.add_argument("--out", type=Path, default=GENERATED_DIR)
    args = parser.parse_args()

    if args.download:
        download(JMDICT_URLS, RAW_DIR / "JMdict_e.gz")
        download(KANJIDIC2_URLS, RAW_DIR / "kanjidic2.xml.gz")

    counts: dict[str, int] = {}

    jmdict_path = RAW_DIR / "JMdict_e.gz"
    if jmdict_path.exists():
        vocab_cards = parse_jmdict(jmdict_path, args.max_vocab)
        counts["vocab"] = write_jsonl(args.out / "vocab.jsonl", vocab_cards)
    else:
        print("warning: JMdict_e.gz not found. Run with --download to build vocabulary.", file=sys.stderr)
        counts["vocab"] = 0

    kanjidic2_path = RAW_DIR / "kanjidic2.xml.gz"
    if kanjidic2_path.exists():
        kanji_cards = parse_kanjidic2(kanjidic2_path, args.max_kanji)
        counts["kanji"] = write_jsonl(args.out / "kanji.jsonl", kanji_cards)
        counts["joyo_kanji"] = sum(1 for card in kanji_cards if "joyo_2136" in card["course_tags"])
    else:
        print("warning: kanjidic2.xml.gz not found. Run with --download to build kanji.", file=sys.stderr)
        counts["kanji"] = 0
        counts["joyo_kanji"] = 0

    grammar_cards = seed_rows_to_cards(read_tsv(SEED_DIR / "grammar.tsv"), "grammar")
    business_cards = seed_rows_to_cards(read_tsv(SEED_DIR / "business_keigo.tsv"), "business_keigo")
    domain_cards = seed_rows_to_cards(read_tsv(SEED_DIR / "domain_terms.tsv"), "domain_terms")
    counts["grammar"] = write_jsonl(args.out / "grammar.jsonl", grammar_cards)
    counts["business_keigo"] = write_jsonl(args.out / "business_keigo.jsonl", business_cards)
    counts["domain_terms"] = write_jsonl(args.out / "domain_terms.jsonl", domain_cards)

    coverage = build_coverage(counts)
    (args.out / "coverage.json").write_text(
        json.dumps(coverage, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(coverage, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
