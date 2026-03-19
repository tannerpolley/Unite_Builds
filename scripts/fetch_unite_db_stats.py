from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
STATS_URL = "https://unite-db.com/stats.json"
OUTPUT_PATH = REPO_ROOT / "data" / "json" / "unite_db_stats.json"


def fetch_stats() -> list[dict]:
    with urlopen(STATS_URL, timeout=30) as response:
        payload = json.load(response)

    if not isinstance(payload, list):
        raise ValueError("Expected UniteDB stats.json to be a top-level array")

    return payload


def main() -> None:
    stats = fetch_stats()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(f"{json.dumps(stats, indent=2)}\n", encoding="utf-8")
    print(f"Saved {len(stats)} UniteDB stat entries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
