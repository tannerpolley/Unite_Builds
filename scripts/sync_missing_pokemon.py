from __future__ import annotations

import argparse
import json
import quopri
import re
from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_META_HTML_PATH = REPO_ROOT / "data" / "html" / "Unite API _ Pokémon Unite Meta Tierlist.html"
DEFAULT_ROSTER_JSON_PATH = REPO_ROOT / "data" / "json" / "uniteapi_roster.json"
DEFAULT_UNITE_DB_POKEMON_PATH = REPO_ROOT / "data" / "json" / "unite_db_pokemon.json"

ROLE_NAMES = ("Attacker", "Defender", "Speedster", "All-Rounder", "Supporter")
DISPLAY_NAME_OVERRIDES = {
    "Ninetales": "Alolan Ninetales",
    "Raichu": "Alolan Raichu",
    "MrMime": "Mr. Mime",
    "Urshifu_Single": "Urshifu",
    "HoOh": "Ho-Oh",
    "Meowscara": "Meowscarada",
    "Rapidash": "Galarian Rapidash",
    "MEGALucario": "Mega Lucario",
    "CharizardX": "Mega Charizard X",
    "CharizardY": "Mega Charizard Y",
    "MegaGyarados": "Mega Gyarados",
    "MewtwoY": "Mewtwo Y",
    "MewtwoX": "Mewtwo X",
    "Mega Mewtwo Y": "Mewtwo Y",
    "Mega Mewtwo X": "Mewtwo X",
    "Sirfetch": "Sirfetch'd",
}
UNITEAPI_SLUG_OVERRIDES = {
    "Ninetales": "alolanninetales",
    "Raichu": "alolanraichu",
    "MrMime": "mrmime",
    "Urshifu_Single": "urshifu",
    "HoOh": "ho-oh",
    "Ho-Oh": "ho-oh",
    "Rapidash": "galarianrapidash",
    "MEGALucario": "megalucario",
    "CharizardX": "charizardx",
    "CharizardY": "charizardy",
    "MegaGyarados": "megagyarados",
    "MewtwoY": "mewtwoy",
    "MewtwoX": "mewtwox",
    "Sirfetch": "sirfetch'd",
    "Sirfetch'd": "sirfetch'd",
}


def normalize_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def extract_image_key(src: str, prefix: str) -> str:
    decoded_src = unquote(src or "")
    if "url=" in decoded_src:
        decoded_src = decoded_src.split("url=", 1)[1].split("&", 1)[0]

    filename = decoded_src.split("/")[-1]
    stem = filename.rsplit(".", 1)[0]
    if stem.startswith(prefix):
        return stem[len(prefix):]
    return stem


def build_uniteapi_image_url(image_key: str, prefix: str = "t_Square_") -> str:
    return f"https://uniteapi.dev/Sprites/{prefix}{image_key}.png"


def normalize_display_name(raw_name: str) -> str:
    return DISPLAY_NAME_OVERRIDES.get(raw_name, raw_name)


def build_uniteapi_slug(raw_name: str, display_name: str) -> str:
    if raw_name in UNITEAPI_SLUG_OVERRIDES:
        return UNITEAPI_SLUG_OVERRIDES[raw_name]
    return re.sub(r"[^a-z0-9]+", "", display_name.lower())


def load_json_dict(path: Path | str) -> dict:
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def save_json_dict(path: Path | str, payload: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2, ensure_ascii=False)
        file_handle.write("\n")


def decode_saved_html(path: Path | str) -> str:
    path = Path(path)
    return quopri.decodestring(path.read_bytes()).decode("utf-8", errors="ignore")


def extract_meta_page_entries(meta_html_path: Path | str) -> list[dict[str, str]]:
    meta_html_path = Path(meta_html_path)
    soup = BeautifulSoup(decode_saved_html(meta_html_path), "html.parser")
    entries: list[dict[str, str]] = []
    seen: set[str] = set()
    blocks = soup.find_all("div", class_="sc-d5d8a548-1 jXtpKR")

    if len(blocks) >= 4:
        try:
            win_rate_block, pick_rate_block = blocks[2], blocks[3]
            table_images = list(win_rate_block.find_all("img")) + list(pick_rate_block.find_all("img"))
        except Exception:
            table_images = []
    else:
        table_images = []

    for image in table_images:
        src = unquote(image.get("src", ""))
        if "t_Square_" not in src:
            continue

        raw_name = extract_image_key(src, "t_Square_")
        if not raw_name:
            continue

        display_name = normalize_display_name(raw_name)
        if display_name in seen:
            continue

        seen.add(display_name)
        entries.append(
            {
                "display_name": display_name,
                "raw_name": raw_name,
                "uniteapi_name": build_uniteapi_slug(raw_name, display_name),
                "square_image_key": raw_name,
                "square_image_url": build_uniteapi_image_url(raw_name),
            }
        )

    return entries


def load_unite_db_snapshot(path: Path | str) -> list[dict]:
    path = Path(path)
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as file_handle:
        payload = json.load(file_handle)
    if not isinstance(payload, list):
        raise ValueError(f"Expected a top-level array in {path}")
    return payload


def build_unite_db_role_index(snapshot: list[dict]) -> dict[str, dict[str, str]]:
    index: dict[str, dict[str, str]] = {}

    for record in snapshot:
        raw_display_name = record.get("display_name") or record.get("name")
        if not raw_display_name:
            continue

        site_display_name = normalize_display_name(raw_display_name)
        role = ((record.get("tags") or {}).get("role") or "").strip()
        entry = {
            "display_name": site_display_name,
            "role": role,
        }

        candidate_names = {
            site_display_name,
            raw_display_name,
            record.get("name", ""),
        }

        for candidate_name in candidate_names:
            lookup_key = normalize_lookup_key(candidate_name)
            if lookup_key:
                index[lookup_key] = entry

    return index


def match_unite_db_role(meta_entry: dict[str, str], role_index: dict[str, dict[str, str]]) -> dict[str, str]:
    lookup_keys = [
        normalize_lookup_key(meta_entry["display_name"]),
        normalize_lookup_key(meta_entry["raw_name"]),
        normalize_lookup_key(meta_entry["uniteapi_name"]),
    ]

    for lookup_key in lookup_keys:
        if lookup_key in role_index:
            return role_index[lookup_key]

    return {}


def sync_missing_pokemon_entries(
    meta_html_path: Path | str = DEFAULT_META_HTML_PATH,
    roster_json_path: Path | str = DEFAULT_ROSTER_JSON_PATH,
    unite_db_pokemon_path: Path | str = DEFAULT_UNITE_DB_POKEMON_PATH,
) -> dict:
    meta_html_path = Path(meta_html_path)
    roster_json_path = Path(roster_json_path)
    unite_db_pokemon_path = Path(unite_db_pokemon_path)

    existing_roster = load_json_dict(roster_json_path)
    if not meta_html_path.exists():
        return {
            "roster_dict": existing_roster,
            "meta_entries": [],
            "meta_entry_map": {},
            "added_entries": [],
        }

    meta_entries = extract_meta_page_entries(meta_html_path)
    meta_entry_map = {entry["display_name"]: entry for entry in meta_entries}
    role_index = build_unite_db_role_index(load_unite_db_snapshot(unite_db_pokemon_path))

    roster_dict = {}
    added_entries = []

    for entry in meta_entries:
        display_name = entry["display_name"]
        existing_entry = existing_roster.get(display_name, {})
        matched_unite_db_entry = match_unite_db_role(entry, role_index)
        role = matched_unite_db_entry.get("role") or existing_entry.get("role", "")

        roster_dict[display_name] = {
            "display_name": display_name,
            "uniteapi_name": entry["uniteapi_name"],
            "role": role,
            "square_image_key": entry["square_image_key"],
        }

        if display_name not in existing_roster:
            added_entries.append(entry)

    if roster_dict != existing_roster:
        save_json_dict(roster_json_path, roster_dict)

    if added_entries:
        print("Added missing Pokemon entries: " + ", ".join(entry["display_name"] for entry in added_entries))

    return {
        "roster_dict": roster_dict,
        "meta_entries": meta_entries,
        "meta_entry_map": meta_entry_map,
        "added_entries": added_entries,
    }


def ensure_missing_pokemon_entries(
    meta_html_path: Path | str = DEFAULT_META_HTML_PATH,
    roster_json_path: Path | str = DEFAULT_ROSTER_JSON_PATH,
    unite_db_pokemon_path: Path | str = DEFAULT_UNITE_DB_POKEMON_PATH,
) -> dict:
    return sync_missing_pokemon_entries(meta_html_path, roster_json_path, unite_db_pokemon_path)["roster_dict"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the UniteAPI roster metadata JSON from the saved meta page.")
    parser.add_argument("--meta-html-path", type=Path, default=DEFAULT_META_HTML_PATH)
    parser.add_argument("--output-path", type=Path, default=DEFAULT_ROSTER_JSON_PATH)
    parser.add_argument("--unite-db-pokemon-path", type=Path, default=DEFAULT_UNITE_DB_POKEMON_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = sync_missing_pokemon_entries(
        meta_html_path=args.meta_html_path,
        roster_json_path=args.output_path,
        unite_db_pokemon_path=args.unite_db_pokemon_path,
    )
    print(f"Synced {len(result['roster_dict'])} UniteAPI roster entries to {args.output_path}")


if __name__ == "__main__":
    main()
