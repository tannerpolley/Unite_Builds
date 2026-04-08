from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.uniteapi_html import decode_saved_html


DEFAULT_META_HTML_PATH = REPO_ROOT / "data" / "html" / "Unite API _ Pokémon Unite Meta Tierlist.html"


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def extract_source_date(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for stat_block in soup.select("div[class*='simpleStat_stat__']"):
        paragraphs = [normalize_whitespace(paragraph.get_text()) for paragraph in stat_block.find_all("p")]
        if len(paragraphs) < 2:
            continue
        value = paragraphs[0]
        label = " ".join(paragraphs[1:]).lower()
        if "last updated" in label or label.strip() == "updated":
            return value

    for paragraph in soup.find_all("p"):
        label = normalize_whitespace(paragraph.get_text()).lower()
        if "last updated" not in label and label.strip() != "updated":
            continue
        value_node = paragraph.find_previous_sibling("p")
        if value_node is None:
            continue
        value = normalize_whitespace(value_node.get_text())
        if value:
            return value

    raise ValueError("Could not find source date on meta page")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read the source date from the saved Unite API meta HTML page.")
    parser.add_argument("--meta-path", type=Path, default=DEFAULT_META_HTML_PATH)
    parser.add_argument("--json", action="store_true", help="Emit a JSON payload with source_date.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    html = decode_saved_html(args.meta_path)
    source_date = extract_source_date(html)

    if args.json:
        print(json.dumps({"source_date": source_date}, ensure_ascii=False))
        return

    print(source_date)


if __name__ == "__main__":
    main()
