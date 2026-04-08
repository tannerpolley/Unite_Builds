from __future__ import annotations

import argparse
import json
import re
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
from scripts.sync_missing_pokemon import DEFAULT_ROSTER_JSON_PATH, sync_missing_pokemon_entries
from scripts.uniteapi_html import decode_saved_html as decode_uniteapi_html
from scripts.uniteapi_html import validate_uniteapi_html_content


META_HTML_PATH = REPO_ROOT / "data" / "html" / "Unite API _ Pokémon Unite Meta Tierlist.html"
DATE_PATH = REPO_ROOT / "data" / "txt" / "date.txt"
MATCHES_PATH = REPO_ROOT / "data" / "txt" / "matches.txt"
UNITE_META_CSV_PATH = REPO_ROOT / "data" / "csv" / "Unite_Meta.csv"
UNITEAPI_ROSTER_PATH = DEFAULT_ROSTER_JSON_PATH
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

PERCENT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def normalize_battle_item_name(name: str) -> str:
    return name.replace(" ", "").replace(".", "").replace("-", "")


def normalize_pokemon_name(name: str) -> str:
    return POKEMON_NAME_ALIASES.get(name, name)


def validate_saved_html_content(path: Path, html: str, *, is_meta: bool = False) -> str | None:
    validation_error = validate_uniteapi_html_content(
        html,
        is_meta=is_meta,
        require_moves=False,
    )
    if validation_error:
        return f"{path} {validation_error}"
    return None


def extract_percent_values(text: str) -> list[float]:
    return [float(value) for value in PERCENT_PATTERN.findall(text)]


def extract_first_percent_from_container(container) -> float | None:
    current = container
    for _ in range(6):
        if current is None:
            break
        values = extract_percent_values(current.get_text(" ", strip=True))
        if values:
            return values[0]
        current = current.parent
    return None


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
    return decode_uniteapi_html(path)


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


def is_pageless_pokemon(pokemon_name: str, pokemon_entry: dict[str, str]) -> bool:
    if pokemon_name in SPECIAL_CASE_MOVESETS:
        return True
    uniteapi_name = pokemon_entry.get("uniteapi_name", "")
    return uniteapi_name.startswith("mega")


def build_saved_page_index() -> dict[str, Path]:
    page_index: dict[str, Path] = {}
    for page_path in list_saved_pokemon_pages():
        pokemon_name = parse_saved_pokemon_name(page_path)
        if pokemon_name:
            page_index[pokemon_name] = page_path
    return page_index


def ensure_output_dirs() -> None:
    for directory in (
        DATE_PATH.parent,
        MATCHES_PATH.parent,
        UNITE_META_CSV_PATH.parent,
        UNITEAPI_ROSTER_PATH.parent,
        SITE_METADATA_PATH.parent,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def validate_required_inputs(
    pokemon_dict: dict[str, dict],
    *,
    allow_missing: bool = False,
) -> tuple[list[str], dict[str, object]]:
    errors = []
    warnings = []
    summary: dict[str, object] = {
        "required_pages": 0,
        "validated_pages": 0,
        "skipped_special_cases": 0,
        "missing_pages": [],
        "invalid_pages": [],
    }

    required_files = [
        META_HTML_PATH,
        BATTLE_ITEMS_PATH,
    ]

    for required_path in required_files:
        if not required_path.exists():
            errors.append(f"Missing required input: {required_path}")

    if not POKEMON_SITES_PATH.exists():
        errors.append(f"Missing required directory: {POKEMON_SITES_PATH}")
    elif not list_saved_pokemon_pages():
        errors.append(f"No saved Pokemon pages found in {POKEMON_SITES_PATH}")

    if errors:
        summary["warnings"] = warnings
        return errors, summary

    try:
        meta_html = decode_saved_html(META_HTML_PATH)
    except Exception as exc:
        errors.append(f"Invalid meta HTML file: {META_HTML_PATH} ({exc})")
    else:
        meta_error = validate_saved_html_content(META_HTML_PATH, meta_html, is_meta=True)
        if meta_error:
            errors.append(meta_error)

    saved_page_index = build_saved_page_index()
    missing_pages: list[str] = []
    invalid_pages: list[str] = []

    for pokemon_name, pokemon_entry in sorted(pokemon_dict.items()):
        if pokemon_name == "Scyther" or is_pageless_pokemon(pokemon_name, pokemon_entry):
            summary["skipped_special_cases"] = int(summary["skipped_special_cases"]) + 1
            continue

        summary["required_pages"] = int(summary["required_pages"]) + 1
        page_path = saved_page_index.get(pokemon_name)
        if page_path is None:
            missing_pages.append(pokemon_name)
            continue
        if page_path.suffix.lower() != ".html":
            invalid_pages.append(f"{pokemon_name}: expected .html page, found {page_path.name}")
            continue

        try:
            html = decode_saved_html(page_path)
        except Exception as exc:
            invalid_pages.append(f"{pokemon_name}: {page_path.name} ({exc})")
            continue

        page_error = validate_saved_html_content(page_path, html, is_meta=False)
        if page_error:
            invalid_pages.append(f"{pokemon_name}: {page_error}")
            continue

        soup = BeautifulSoup(html, "html.parser")
        if not find_moveset_rows(soup):
            invalid_pages.append(f"{pokemon_name}: {page_path.name} has no detected moveset rows")
            continue

        summary["validated_pages"] = int(summary["validated_pages"]) + 1

    summary["missing_pages"] = missing_pages
    summary["invalid_pages"] = invalid_pages

    if missing_pages:
        message = "Missing required Pokemon pages: " + ", ".join(missing_pages)
        if allow_missing:
            warnings.append(message)
        else:
            errors.append(message)

    if invalid_pages:
        message = "Invalid Pokemon pages:\n- " + "\n- ".join(invalid_pages)
        if allow_missing:
            warnings.append(message)
        else:
            errors.append(message)

    summary["warnings"] = warnings
    return errors, summary


def build_rate_lookup(names: list[str], values: list[float]) -> dict[str, float]:
    lookup: dict[str, float] = {}
    for name, value in zip(names, values):
        lookup[normalize_pokemon_name(name)] = value
    return lookup


def find_heading_near_block(rate_block) -> str:
    inspected = 0
    for element in rate_block.previous_elements:
        inspected += 1
        if inspected > 1200:
            break
        if not hasattr(element, "get_text"):
            continue
        text = element.get_text(" ", strip=True).lower()
        if not text:
            continue
        if "win rate" in text:
            return "win"
        if "pick rate" in text:
            return "pick"
        if "ban rate" in text:
            return "ban"
    return ""


def is_candidate_rate_block(tag) -> bool:
    image_count = sum(1 for image in tag.find_all("img") if "t_Square_" in image.get("src", ""))
    if image_count < 10:
        return False
    percent_values = extract_percent_values(tag.get_text(" ", strip=True))
    return len(percent_values) >= 10


def find_meta_rate_blocks(meta_soup: BeautifulSoup):
    class_name = "sc-d5d8a548-1 jXtpKR"
    rate_blocks = meta_soup.find_all("div", class_=class_name)
    if len(rate_blocks) >= 5:
        return rate_blocks[2], rate_blocks[3], rate_blocks[4]

    candidate_blocks = [tag for tag in meta_soup.find_all("div") if is_candidate_rate_block(tag)]
    if not candidate_blocks:
        raise ValueError("Could not locate rate blocks on the saved meta page")

    bucketed: dict[str, object] = {}
    for block in candidate_blocks:
        label = find_heading_near_block(block)
        if label and label not in bucketed:
            bucketed[label] = block

    if {"win", "pick", "ban"}.issubset(bucketed.keys()):
        return bucketed["win"], bucketed["pick"], bucketed["ban"]
    if {"win", "pick"}.issubset(bucketed.keys()):
        return bucketed["win"], bucketed["pick"], bucketed.get("ban", bucketed["pick"])

    if len(candidate_blocks) >= 3:
        return candidate_blocks[0], candidate_blocks[1], candidate_blocks[2]
    if len(candidate_blocks) == 2:
        return candidate_blocks[0], candidate_blocks[1], candidate_blocks[1]
    raise ValueError("Could not infer rate blocks from fallback selectors")


def extract_rates_from_block(rate_block) -> tuple[list[str], list[float]]:
    entry_class = "sc-71f8e1a4-0 iDyfqa"
    class_entries = rate_block.find_all("div", class_=entry_class)
    if class_entries:
        names = [extract_image_key(image["src"], "t_Square_") for image in rate_block.find_all("img") if "t_Square_" in image.get("src", "")]
        values = []
        for entry in class_entries:
            text_value = entry.get_text(" ", strip=True)
            match = PERCENT_PATTERN.search(text_value)
            if match:
                values.append(float(match.group(1)))
        return names, values

    names = []
    values = []
    for image in rate_block.find_all("img"):
        src = image.get("src", "")
        if "t_Square_" not in src:
            continue
        key = extract_image_key(src, "t_Square_")
        if not key:
            continue
        value = extract_first_percent_from_container(image)
        if value is None:
            continue
        names.append(key)
        values.append(value)

    return names, values


def extract_meta_rates(meta_soup: BeautifulSoup) -> tuple[str, float, dict[str, float], dict[str, float], dict[str, float]]:
    date = get_simple_stat_value(meta_soup, ["last updated", "updated"])
    matches = float(get_simple_stat_value(meta_soup, ["total games analyzed", "games analyzed"]).replace(",", ""))

    win_rate_block, pick_rate_block, ban_rate_block = find_meta_rate_blocks(meta_soup)
    win_rate_names, win_rate_values = extract_rates_from_block(win_rate_block)
    pick_rate_names, pick_rate_values = extract_rates_from_block(pick_rate_block)
    ban_rate_names, ban_rate_values = extract_rates_from_block(ban_rate_block)

    if not ban_rate_values:
        ban_rate_names = pick_rate_names
        ban_rate_values = pick_rate_values

    pick_rate_dict = build_rate_lookup(pick_rate_names, pick_rate_values)
    win_rate_dict = build_rate_lookup(win_rate_names, win_rate_values)
    ban_rate_dict = build_rate_lookup(ban_rate_names, ban_rate_values)

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
        "Role": pokemon_dict[pokemon_name]["role"],
        "Pick Rate": pick_rate_dict[pokemon_name],
        "Win Rate": win_rate_dict[pokemon_name],
        "Move Set": f"{move_1_name}/{move_2_name}",
        "Move 1": f"Moves/{pokemon_name} - {move_1_name}.png",
        "Move 2": f"Moves/{pokemon_name} - {move_2_name}.png",
        "Battle Items": [],
    }


def extract_move_name_from_image_tag(image_tag) -> str:
    container = image_tag.find_parent("div")
    if container is None:
        return ""

    text = " ".join(container.stripped_strings)
    text = text.replace("Pick Rate", "").replace("Win Rate", "").strip()
    if not text or "%" in text or len(text) > 120:
        return ""
    return text


def find_moveset_rows(soup: BeautifulSoup) -> list:
    rows = soup.find_all("div", class_="sc-a9315c2e-0 dNgHcB")
    if rows:
        return rows

    fallback_rows = []
    for tag in soup.find_all("div"):
        text = tag.get_text(" ", strip=True)
        if "Pick Rate" not in text or "Win Rate" not in text:
            continue
        html = str(tag)
        if html.count("t_Skill_") >= 2 and html.count("t_prop_") >= 1:
            fallback_rows.append(tag)

    pruned_rows = []
    fallback_set = set(fallback_rows)
    for row in fallback_rows:
        has_child_row = any(child in fallback_set for child in row.find_all("div"))
        if not has_child_row:
            pruned_rows.append(row)
    return pruned_rows


def parse_moveset_row_with_class_selectors(
    moveset_row,
    *,
    pokemon_name: str,
    role: str,
    pick_rate_dict: dict[str, float],
    battle_items_dict: dict[str, str],
) -> dict | None:
    moveset_columns = moveset_row.find_all("div", class_="sc-a9315c2e-2 SBHRg")
    if not moveset_columns:
        return None

    moveset_entry = {
        "Name": pokemon_name,
        "Pokemon": f"Pokemon/{pokemon_name}.png",
        "Role": role,
    }

    move_names = []
    for index, moveset_column in enumerate(moveset_columns):
        label_node = moveset_column.find("p", class_="sc-6d6ea15e-3 hxGuyl")
        value_node = moveset_column.find("p", class_="sc-6d6ea15e-4 eZnfiD")
        if label_node is None:
            continue

        text = label_node.get_text(strip=True)
        value_text = value_node.get_text(strip=True) if value_node else ""

        if text == "Pick Rate" and value_text:
            pick_rate_value = float(value_text.rstrip("%"))
            moveset_entry[text] = pick_rate_value * pick_rate_dict[pokemon_name] / 100
        elif text == "Win Rate" and value_text:
            moveset_entry[text] = float(value_text.rstrip("%"))
        else:
            moveset_entry[f"Move {int(index - 1)}"] = f"Moves/{pokemon_name} - {text}.png"
            move_names.append(text)

    if len(move_names) != 2:
        raise ValueError(f"Expected exactly two moves for {pokemon_name}")
    moveset_entry["Move Set"] = f"{move_names[0]}/{move_names[1]}"

    item_set_list = []
    item_columns = moveset_row.find_all("div", class_="sc-6106a1d4-1 RuwBF")
    for item_column in item_columns:
        item_rate_nodes = item_column.find_all("p", class_="sc-6d6ea15e-3 LHyXa")
        if len(item_rate_nodes) < 2:
            continue
        pick_rate_node, win_rate_node = item_rate_nodes[:2]
        image_tag = item_column.find("img")
        if image_tag is None:
            continue
        image_key = extract_image_key(image_tag.get("src", ""), "t_prop_")
        normalized_key = normalize_battle_item_name(image_key)
        item_name = battle_items_dict.get(normalized_key)
        if not item_name:
            raise KeyError(f"Unknown battle item image key '{image_key}' for {pokemon_name}")

        item_set_list.append(
            {
                "Battle Item": item_name,
                "Pick Rate": float(pick_rate_node.get_text(strip=True).rstrip("%")),
                "Win Rate": float(win_rate_node.get_text(strip=True).rstrip("%")),
            }
        )

    moveset_entry["Battle Items"] = item_set_list
    return moveset_entry


def parse_moveset_row_with_fallback(
    moveset_row,
    *,
    pokemon_name: str,
    role: str,
    pick_rate_dict: dict[str, float],
    battle_items_dict: dict[str, str],
) -> dict:
    moveset_entry = {
        "Name": pokemon_name,
        "Pokemon": f"Pokemon/{pokemon_name}.png",
        "Role": role,
    }

    move_names: list[str] = []
    for image in moveset_row.find_all("img"):
        src = image.get("src", "")
        if "t_Skill_" not in src:
            continue
        move_name = extract_move_name_from_image_tag(image)
        if not move_name or move_name in move_names:
            continue
        move_names.append(move_name)
        if len(move_names) == 2:
            break

    if len(move_names) != 2:
        raise ValueError(f"Fallback parse could not detect two moves for {pokemon_name}")

    rate_values = extract_percent_values(moveset_row.get_text(" ", strip=True))
    if len(rate_values) < 2:
        raise ValueError(f"Fallback parse could not detect moveset pick/win rates for {pokemon_name}")

    relative_pick_rate = rate_values[0]
    moveset_entry["Pick Rate"] = relative_pick_rate * pick_rate_dict[pokemon_name] / 100
    moveset_entry["Win Rate"] = rate_values[1]
    moveset_entry["Move 1"] = f"Moves/{pokemon_name} - {move_names[0]}.png"
    moveset_entry["Move 2"] = f"Moves/{pokemon_name} - {move_names[1]}.png"
    moveset_entry["Move Set"] = f"{move_names[0]}/{move_names[1]}"

    item_set_list = []
    seen_item_keys = set()
    for image in moveset_row.find_all("img"):
        src = image.get("src", "")
        if "t_prop_" not in src:
            continue
        image_key = extract_image_key(src, "t_prop_")
        if not image_key:
            continue
        normalized_key = normalize_battle_item_name(image_key)
        if normalized_key in seen_item_keys:
            continue
        seen_item_keys.add(normalized_key)

        item_name = battle_items_dict.get(normalized_key)
        if not item_name:
            raise KeyError(f"Unknown battle item image key '{image_key}' for {pokemon_name}")

        container = image.find_parent("div")
        value_list = extract_percent_values(container.get_text(" ", strip=True) if container else "")
        if len(value_list) < 2:
            continue
        item_set_list.append(
            {
                "Battle Item": item_name,
                "Pick Rate": value_list[0],
                "Win Rate": value_list[1],
            }
        )

    moveset_entry["Battle Items"] = item_set_list
    return moveset_entry


def extract_movesets(
    pokemon_dict: dict[str, dict],
    pick_rate_dict: dict[str, float],
    win_rate_dict: dict[str, float],
    battle_items_dict: dict[str, str],
    *,
    allow_missing: bool = False,
) -> tuple[list[dict], dict[str, object]]:
    movesets: list[dict] = []
    unknown_saved_pages: list[str] = []
    missing_moveset_rows: list[str] = []
    parsed_page_count = 0
    skipped_special_cases = 0

    for path in list_saved_pokemon_pages():
        pokemon_name = parse_saved_pokemon_name(path)
        if not pokemon_name:
            continue

        if pokemon_name not in pokemon_dict:
            unknown_saved_pages.append(pokemon_name)
            continue

        special_case = SPECIAL_CASE_MOVESETS.get(pokemon_name)
        if special_case:
            skipped_special_cases += 1
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

        try:
            soup = load_saved_html_soup(path)
        except Exception as exc:
            if allow_missing:
                missing_moveset_rows.append(f"{pokemon_name}: {path.name} ({exc})")
                continue
            raise
        moveset_rows = find_moveset_rows(soup)
        if not moveset_rows:
            missing_moveset_rows.append(f"{pokemon_name}: {path.name}")
            continue

        parsed_page_count += 1
        for moveset_row in moveset_rows:
            moveset_entry = parse_moveset_row_with_class_selectors(
                moveset_row,
                pokemon_name=pokemon_name,
                role=pokemon_dict[pokemon_name]["role"],
                pick_rate_dict=pick_rate_dict,
                battle_items_dict=battle_items_dict,
            )
            if moveset_entry is None:
                moveset_entry = parse_moveset_row_with_fallback(
                    moveset_row,
                    pokemon_name=pokemon_name,
                    role=pokemon_dict[pokemon_name]["role"],
                    pick_rate_dict=pick_rate_dict,
                    battle_items_dict=battle_items_dict,
                )
            movesets.append(moveset_entry)

    if unknown_saved_pages:
        raise ValueError(
            "Saved Pokemon pages are missing metadata entries in data/json/uniteapi_roster.json: "
            + ", ".join(sorted(set(unknown_saved_pages)))
        )

    if missing_moveset_rows and not allow_missing:
        raise ValueError("Missing detected moveset rows for:\n- " + "\n- ".join(sorted(set(missing_moveset_rows))))

    summary = {
        "parsed_pages": parsed_page_count,
        "skipped_special_cases": skipped_special_cases,
        "missing_pages": sorted(set(missing_moveset_rows)),
    }
    return movesets, summary


def run_build(
    skip_image_formatting: bool = False,
    skip_preflight: bool = False,
    allow_missing: bool = False,
) -> dict[str, object]:
    ensure_output_dirs()

    sync_result = sync_missing_pokemon_entries(META_HTML_PATH, UNITEAPI_ROSTER_PATH)
    pokemon_dict = sync_result["roster_dict"]

    if not skip_preflight:
        errors, preflight_summary = validate_required_inputs(pokemon_dict, allow_missing=allow_missing)
        for warning in preflight_summary.get("warnings", []):
            print(f"Preflight warning: {warning}")
        if errors:
            raise SystemExit("Preflight failed:\n- " + "\n- ".join(errors))
    else:
        preflight_summary = {
            "required_pages": 0,
            "validated_pages": 0,
            "skipped_special_cases": 0,
            "missing_pages": [],
            "invalid_pages": [],
            "warnings": [],
        }

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    meta_soup = load_saved_html_soup(META_HTML_PATH)
    date, matches, pick_rate_dict, win_rate_dict, ban_rate_dict = extract_meta_rates(meta_soup)
    write_supporting_outputs(date, matches, generated_at)
    write_unite_meta_csv(pick_rate_dict, win_rate_dict, ban_rate_dict)

    battle_items_dict = build_battle_item_lookup(load_json(BATTLE_ITEMS_PATH, "battle items"))

    movesets, moveset_summary = extract_movesets(
        pokemon_dict,
        pick_rate_dict,
        win_rate_dict,
        battle_items_dict,
        allow_missing=allow_missing,
    )
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
        "preflight": preflight_summary,
        "moveset_summary": moveset_summary,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build static Unite Builds data from saved Unite API pages.")
    parser.add_argument("--skip-image-formatting", action="store_true", help="Skip static image normalization after rebuilding data.")
    parser.add_argument("--skip-preflight", action="store_true", help="Run even if required inputs are missing or incomplete.")
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="Allow missing/invalid Pokemon pages (warnings only) instead of strict preflight failure.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_build(
        skip_image_formatting=args.skip_image_formatting,
        skip_preflight=args.skip_preflight,
        allow_missing=args.allow_missing,
    )
    print(f"Built {result['rows']} moveset rows from Unite API data")
    print(f"Source updated: {result['date']}")
    print(f"Total matches analyzed: {int(result['matches']):,}")
    print(f"Asset version: {result['asset_version']}")
    print("Scrape summary:")
    print(f"  Parsed Pokemon pages: {result['moveset_summary']['parsed_pages']}")
    print(f"  Skipped special-case pages: {result['moveset_summary']['skipped_special_cases']}")
    print(f"  Missing row pages: {len(result['moveset_summary']['missing_pages'])}")
    print(f"  Preflight validated pages: {result['preflight']['validated_pages']}/{result['preflight']['required_pages']}")


if __name__ == "__main__":
    main()
