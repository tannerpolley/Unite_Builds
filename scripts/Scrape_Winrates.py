from __future__ import annotations

import argparse
import json
import quopri
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

import pandas as pd
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.Extra_Functions import fix_special_cases, organize_df
from scripts.format_images import format_static_images


META_HTML_PATH = REPO_ROOT / "data" / "html" / "Unite API _ Pokémon Unite Meta Tierlist.html"
DATE_PATH = REPO_ROOT / "data" / "txt" / "date.txt"
MATCHES_PATH = REPO_ROOT / "data" / "txt" / "matches.txt"
UNITE_META_CSV_PATH = REPO_ROOT / "data" / "csv" / "Unite_Meta.csv"
POKEMON_DETAILS_PATH = REPO_ROOT / "static" / "json" / "all_pokemon_detailed.json"
SITE_METADATA_PATH = REPO_ROOT / "static" / "json" / "site_metadata.json"
BATTLE_ITEMS_PATH = REPO_ROOT / "data" / "json" / "unite_db_battle_items.json"
POKEMON_SITES_PATH = REPO_ROOT / "data" / "html" / "Pokemon_Sites"

UNITE_API_PAGE_PREFIX = "Unite API _ Pokémon Unite Meta for "

POKEMON_NAME_ALIASES = {
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
    "Sirfetch": "Sirfetch'd",
}

BATTLE_ITEM_IMAGE_KEY_ALIASES = {
    "Purify": "Full Heal",
    "Gear": "Slow Smoke",
    "Ganrao": "Goal Getter",
    "Controller": "Goal Hacker",
    "Tail": "Fluffy Tail",
}

SPECIAL_CASE_MOVESETS = {
    "Mega Lucario": ("Power-Up Punch", "Close Combat"),
    "Mega Charizard X": ("Fire Punch", "Flare Blitz"),
    "Mega Charizard Y": ("Flamethrower", "Fire Blast"),
    "Mega Gyarados": ("Dragon Breath", "Waterfall"),
}


def normalize_battle_item_name(name: str) -> str:
    return name.replace(" ", "").replace(".", "").replace("-", "")


def normalize_pokemon_name(name: str) -> str:
    return POKEMON_NAME_ALIASES.get(name, name)


def build_battle_item_lookup(items_payload: list[dict]) -> dict[str, str]:
    lookup: dict[str, str] = {}

    for item in items_payload:
        display_name = item.get("display_name") or item["name"]
        lookup[normalize_battle_item_name(item["name"])] = display_name
        lookup[normalize_battle_item_name(display_name)] = display_name

    for image_key, display_name in BATTLE_ITEM_IMAGE_KEY_ALIASES.items():
        lookup[normalize_battle_item_name(image_key)] = display_name

    return lookup


def get_simple_stat_value(soup: BeautifulSoup, label_fragments: list[str]) -> str:
    for stat_block in soup.select("div[class*='simpleStat_stat__']"):
        paragraphs = [p.get_text(strip=True) for p in stat_block.find_all("p")]
        if len(paragraphs) < 2:
            continue

        value = paragraphs[0]
        label = " ".join(paragraphs[1:]).lower()
        if any(fragment in label for fragment in label_fragments):
            return value

    for paragraph in soup.find_all("p"):
        label = paragraph.get_text(" ", strip=True).lower()
        if not any(fragment in label for fragment in label_fragments):
            continue

        value_node = paragraph.find_previous_sibling("p")
        if value_node is None:
            continue

        value = value_node.get_text(strip=True)
        if value:
            return value

    raise ValueError(f"Could not find simple stat for labels: {label_fragments}")


def extract_image_key(src: str, prefix: str) -> str:
    decoded_src = unquote(src)
    if "url=" in decoded_src:
        decoded_src = decoded_src.split("url=", 1)[1].split("&", 1)[0]

    filename = decoded_src.split("/")[-1]
    stem = filename.rsplit(".", 1)[0]
    if stem.startswith(prefix):
        return stem[len(prefix):]
    return stem


def decode_saved_html(path: Path) -> str:
    return quopri.decodestring(path.read_bytes()).decode("utf-8", errors="ignore")


def load_saved_html_soup(path: Path) -> BeautifulSoup:
    return BeautifulSoup(decode_saved_html(path), "html.parser")


def list_saved_pokemon_pages() -> list[Path]:
    if not POKEMON_SITES_PATH.exists():
        return []

    return sorted(
        path for path in POKEMON_SITES_PATH.iterdir()
        if path.suffix.lower() in {".html", ".txt"}
    )


def parse_saved_pokemon_name(path: Path) -> str | None:
    if path.suffix.lower() not in {".html", ".txt"}:
        return None

    stem = path.stem
    if not stem.startswith(UNITE_API_PAGE_PREFIX):
        return None

    return stem.removeprefix(UNITE_API_PAGE_PREFIX)


def ensure_output_dirs() -> None:
    for directory in (
        DATE_PATH.parent,
        MATCHES_PATH.parent,
        UNITE_META_CSV_PATH.parent,
        SITE_METADATA_PATH.parent,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def validate_required_inputs() -> list[str]:
    errors = []

    required_files = [
        META_HTML_PATH,
        POKEMON_DETAILS_PATH,
        BATTLE_ITEMS_PATH,
    ]

    for path in required_files:
        if not path.exists():
            errors.append(f"Missing required input: {path}")

    if not POKEMON_SITES_PATH.exists():
        errors.append(f"Missing required directory: {POKEMON_SITES_PATH}")
    elif not list_saved_pokemon_pages():
        errors.append(f"No saved Pokemon pages found in {POKEMON_SITES_PATH}")

    return errors


def build_rate_lookup(names: list[str], values: list[float]) -> dict[str, float]:
    lookup: dict[str, float] = {}
    for name, value in zip(names, values):
        lookup[normalize_pokemon_name(name)] = value
    return lookup


def extract_meta_rates(meta_soup: BeautifulSoup) -> tuple[str, float, dict[str, float], dict[str, float], dict[str, float]]:
    date = get_simple_stat_value(meta_soup, ["last updated", "updated"])
    matches = float(get_simple_stat_value(meta_soup, ["total games analyzed", "games analyzed"]).replace(",", ""))

    class_name = "sc-d5d8a548-1 jXtpKR"
    rate_blocks = meta_soup.find_all("div", class_=class_name)
    if len(rate_blocks) < 5:
        raise ValueError("Could not locate Unite API rate blocks on the saved meta page")

    win_rate_block, pick_rate_block, ban_rate_block = rate_blocks[2:]

    entry_class = "sc-71f8e1a4-0 iDyfqa"
    if not ban_rate_block.find_all("div", class_=entry_class):
        ban_rate_block = pick_rate_block

    pick_rate_num = []
    win_rate_num = []
    ban_rate_num = []
    for pokemon_pick_rate, pokemon_win_rate, pokemon_ban_rate in zip(
        pick_rate_block.find_all("div", class_=entry_class),
        win_rate_block.find_all("div", class_=entry_class),
        ban_rate_block.find_all("div", class_=entry_class),
    ):
        pick_rate_num.append(float(pokemon_pick_rate.div.text[:-2]))
        win_rate_num.append(float(pokemon_win_rate.div.text[:-2]))
        ban_rate_num.append(float(pokemon_ban_rate.div.text[:-2]))

    pick_rate_names = [
        extract_image_key(image["src"], "t_Square_")
        for image in pick_rate_block.find_all("img")
    ]
    win_rate_names = [
        extract_image_key(image["src"], "t_Square_")
        for image in win_rate_block.find_all("img")
    ]
    ban_rate_names = [
        extract_image_key(image["src"], "t_Square_")
        for image in ban_rate_block.find_all("img")
    ]

    pick_rate_dict = build_rate_lookup(pick_rate_names, pick_rate_num)
    win_rate_dict = build_rate_lookup(win_rate_names, win_rate_num)
    ban_rate_dict = build_rate_lookup(ban_rate_names, ban_rate_num)

    return date, matches, pick_rate_dict, win_rate_dict, ban_rate_dict


def write_supporting_outputs(date: str, matches: float, generated_at: str) -> None:
    DATE_PATH.write_text(date, encoding="utf-8")
    MATCHES_PATH.write_text(str(matches), encoding="utf-8")
    SITE_METADATA_PATH.write_text(
        json.dumps(
            {
                "date": date,
                "matches": matches,
                "generatedAt": generated_at,
                "assetVersion": generated_at,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


def write_unite_meta_csv(
    pick_rate_dict: dict[str, float],
    win_rate_dict: dict[str, float],
    ban_rate_dict: dict[str, float],
) -> None:
    all_names = list(win_rate_dict.keys())
    combined_dict = {
        "Win Rate": [win_rate_dict[name] for name in all_names],
        "Pick Rate": [pick_rate_dict.get(name) for name in all_names],
        "Ban Rate": [ban_rate_dict.get(name) for name in all_names],
    }
    pd.DataFrame(combined_dict, index=all_names).to_csv(UNITE_META_CSV_PATH)


def load_json(path: Path, label: str):
    with open(path, encoding="utf-8") as file_handle:
        try:
            return json.load(file_handle)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in {label}: {path}") from exc


def build_special_case_moveset(
    pokemon_name: str,
    move_names: tuple[str, str],
    pokemon_dict: dict[str, dict],
    pick_rate_dict: dict[str, float],
    win_rate_dict: dict[str, float],
) -> dict:
    move_1_name, move_2_name = move_names
    return {
        "Name": pokemon_name,
        "Pokemon": f"Pokemon/{pokemon_name}.png",
        "Role": pokemon_dict[pokemon_name]["Role"],
        "Pick Rate": pick_rate_dict[pokemon_name],
        "Win Rate": win_rate_dict[pokemon_name],
        "Move Set": f"{move_1_name}/{move_2_name}",
        "Move 1": f"Moves/{pokemon_name} - {move_1_name}.png",
        "Move 2": f"Moves/{pokemon_name} - {move_2_name}.png",
        "Battle Items": [],
    }


def extract_movesets(
    pokemon_dict: dict[str, dict],
    pick_rate_dict: dict[str, float],
    win_rate_dict: dict[str, float],
    battle_items_dict: dict[str, str],
) -> list[dict]:
    movesets: list[dict] = []
    unknown_saved_pages: list[str] = []

    for path in list_saved_pokemon_pages():
        pokemon_name = parse_saved_pokemon_name(path)
        if not pokemon_name:
            continue

        if pokemon_name not in pokemon_dict:
            unknown_saved_pages.append(pokemon_name)
            continue

        special_case = SPECIAL_CASE_MOVESETS.get(pokemon_name)
        if special_case:
            movesets.append(
                build_special_case_moveset(
                    pokemon_name,
                    special_case,
                    pokemon_dict,
                    pick_rate_dict,
                    win_rate_dict,
                )
            )
            continue

        soup = load_saved_html_soup(path)
        moveset_rows = soup.find_all("div", class_="sc-a9315c2e-0 dNgHcB")

        for moveset_row in moveset_rows:
            moveset_entry = {
                "Name": pokemon_name,
                "Pokemon": f"Pokemon/{pokemon_name}.png",
                "Role": pokemon_dict[pokemon_name]["Role"],
            }

            move_names = []
            moveset_columns = moveset_row.find_all("div", class_="sc-a9315c2e-2 SBHRg")
            for index, moveset_column in enumerate(moveset_columns):
                text = moveset_column.find("p", class_="sc-6d6ea15e-3 hxGuyl").text
                value_node = moveset_column.find("p", class_="sc-6d6ea15e-4 eZnfiD")

                if text == "Pick Rate":
                    pick_rate_value = float(value_node.text[:-2])
                    moveset_entry[text] = pick_rate_value * pick_rate_dict[pokemon_name] / 100
                elif text == "Win Rate":
                    moveset_entry[text] = float(value_node.text[:-2])
                else:
                    moveset_entry[f"Move {int(index - 1)}"] = f"Moves/{pokemon_name} - {text}.png"
                    move_names.append(text)

            if len(move_names) != 2:
                raise ValueError(f"Expected exactly two moves for {pokemon_name} in {path.name}")

            moveset_entry["Move Set"] = f"{move_names[0]}/{move_names[1]}"

            item_set_list = []
            item_columns = moveset_row.find_all("div", class_="sc-6106a1d4-1 RuwBF")
            for item_column in item_columns:
                pick_rate_node, win_rate_node = item_column.find_all("p", class_="sc-6d6ea15e-3 LHyXa")
                image_key = extract_image_key(item_column.find("img")["src"], "t_prop_")
                normalized_key = normalize_battle_item_name(image_key)
                item_name = battle_items_dict.get(normalized_key)
                if not item_name:
                    raise KeyError(f"Unknown battle item image key '{image_key}' for {pokemon_name}")

                item_set_list.append(
                    {
                        "Battle Item": item_name,
                        "Pick Rate": float(pick_rate_node.text[:-2]),
                        "Win Rate": float(win_rate_node.text[:-2]),
                    }
                )

            moveset_entry["Battle Items"] = item_set_list
            movesets.append(moveset_entry)

    if unknown_saved_pages:
        raise ValueError(
            "Saved Pokemon pages are missing metadata entries in all_pokemon_detailed.json: "
            + ", ".join(sorted(set(unknown_saved_pages)))
        )

    return movesets


def run_build(skip_image_formatting: bool = False, skip_preflight: bool = False) -> dict[str, object]:
    ensure_output_dirs()

    if not skip_preflight:
        errors = validate_required_inputs()
        if errors:
            raise SystemExit("Preflight failed:\n- " + "\n- ".join(errors))

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    meta_soup = load_saved_html_soup(META_HTML_PATH)
    date, matches, pick_rate_dict, win_rate_dict, ban_rate_dict = extract_meta_rates(meta_soup)
    write_supporting_outputs(date, matches, generated_at)
    write_unite_meta_csv(pick_rate_dict, win_rate_dict, ban_rate_dict)

    pokemon_dict = load_json(POKEMON_DETAILS_PATH, "Pokemon details")
    battle_items_dict = build_battle_item_lookup(load_json(BATTLE_ITEMS_PATH, "battle items"))

    movesets = extract_movesets(pokemon_dict, pick_rate_dict, win_rate_dict, battle_items_dict)
    column_titles = ["Name", "Pokemon", "Move Set", "Win Rate", "Pick Rate", "Role", "Move 1", "Move 2", "Battle Items"]
    df = fix_special_cases(movesets, matches, pick_rate_dict, win_rate_dict)
    rows = organize_df(df, column_titles)

    formatted_images = None
    if skip_image_formatting:
        print("Skipped image formatting")
    else:
        formatted_images = format_static_images()
        print("Formatted images:")
        for key, value in formatted_images.items():
            print(f"  {key}: {value}")

    return {
        "rows": len(rows),
        "date": date,
        "matches": matches,
        "asset_version": generated_at,
        "formatted_images": formatted_images,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build static Unite Builds data from saved Unite API pages.")
    parser.add_argument("--skip-image-formatting", action="store_true", help="Skip static image normalization after rebuilding data.")
    parser.add_argument("--skip-preflight", action="store_true", help="Run even if required inputs are missing or incomplete.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_build(
        skip_image_formatting=args.skip_image_formatting,
        skip_preflight=args.skip_preflight,
    )
    print(f"Built {result['rows']} moveset rows from Unite API data")
    print(f"Source updated: {result['date']}")
    print(f"Total matches analyzed: {int(result['matches']):,}")
    print(f"Asset version: {result['asset_version']}")


if __name__ == "__main__":
    main()
