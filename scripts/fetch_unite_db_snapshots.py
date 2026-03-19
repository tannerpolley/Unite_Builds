from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "data" / "json"
ENDPOINTS = {
    "pokemon": "unite_db_pokemon.json",
    "held_items": "unite_db_held_items.json",
    "battle_items": "unite_db_battle_items.json",
    "stats": "unite_db_stats.json",
}


def fetch_endpoint(endpoint: str) -> list[dict]:
    url = f"https://unite-db.com/{endpoint}.json"

    with urlopen(url, timeout=30) as response:
        payload = json.load(response)

    if not isinstance(payload, list):
        raise ValueError(f"Expected {url} to return a top-level array")

    return payload


def write_snapshot(filename: str, payload: list[dict]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / filename
    output_path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def main() -> None:
    for endpoint, filename in ENDPOINTS.items():
        payload = fetch_endpoint(endpoint)
        write_snapshot(filename, payload)
        print(f"Saved {len(payload)} entries from {endpoint}.json to {OUTPUT_DIR / filename}")


if __name__ == "__main__":
    main()
