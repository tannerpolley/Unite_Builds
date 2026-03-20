from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.sync_missing_pokemon import (
    DEFAULT_ROSTER_JSON_PATH,
    DEFAULT_UNITE_DB_POKEMON_PATH,
    normalize_display_name,
    normalize_lookup_key,
)


POPUP_JSON_PATH = REPO_ROOT / "static" / "json" / "pokemon_popup_details.json"


def load_json(path: Path) -> object:
    with open(path, "r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    return "\n\n".join(part.strip() for part in text.split("\n\n") if part.strip())


def join_description_parts(*values: object) -> str:
    parts = []
    for value in values:
        text = clean_text(value)
        if text and text not in parts:
            parts.append(text)
    return "\n\n".join(parts)


def build_description(skill: dict) -> str:
    rsb = skill.get("rsb") or {}
    description = join_description_parts(
        skill.get("description"),
        skill.get("description1"),
        skill.get("description2"),
        skill.get("description3"),
        skill.get("description4"),
    )

    if not description:
        description = clean_text(rsb.get("true_desc"))

    notes = clean_text(rsb.get("notes"))
    if notes and notes not in description:
        description = f"{description}\n\n{notes}" if description else notes

    return description


def format_level(value: object) -> str:
    return clean_text(value)


def format_cooldown(value: object) -> str:
    text = clean_text(value)
    if not text:
        return ""
    if text.lower().endswith("s"):
        return text
    return f"{text}s"


def build_passive_entry(skill: dict) -> dict[str, str]:
    entry = {
        "Name": clean_text(skill.get("name")),
        "Description": build_description(skill),
    }

    passive_name_2 = clean_text(skill.get("passive2_name"))
    passive_description_2 = clean_text(skill.get("passive2_description"))
    if passive_name_2:
        entry["Name 2"] = passive_name_2
    if passive_description_2:
        entry["Description 2"] = passive_description_2

    return entry


def build_upgrade_entry(skill: dict) -> dict[str, str]:
    rsb = skill.get("rsb") or {}
    return {
        "Name": clean_text(skill.get("name")),
        "Level": format_level(skill.get("level1")),
        "Cooldown": format_cooldown(skill.get("cd1") or skill.get("cd")),
        "Description": build_description(skill),
        "Enhanced Level": format_level(skill.get("level2")),
        "Enhanced Description": clean_text(rsb.get("enhanced_true_desc")),
    }


def build_move_slot(skill: dict) -> dict[str, object]:
    slot = {
        "Name": clean_text(skill.get("name")),
        "Level": format_level(skill.get("level1")),
        "Cooldown": format_cooldown(skill.get("cd1") or skill.get("cd")),
        "Description": build_description(skill),
    }

    for index, upgrade in enumerate(skill.get("upgrades") or [], start=1):
        slot[f"Upgrade {index}"] = build_upgrade_entry(upgrade)

    return slot


def build_unite_move_entry(skill: dict) -> dict[str, str]:
    return {
        "Name": clean_text(skill.get("name")),
        "Level": format_level(skill.get("level") or skill.get("level1")),
        "Cooldown": format_cooldown(skill.get("cd") or skill.get("cd1")),
        "Description": build_description(skill),
        "Buff Duration": clean_text(skill.get("buff_duration")),
        "Buff Stats": clean_text(skill.get("buffs")),
    }


def build_popup_entry(record: dict) -> dict[str, object]:
    skills = record.get("skills") or []
    popup_entry = {
        "Passive Ability": {},
        "Attack": "",
        "Move 1": {},
        "Move 2": {},
        "Unite Move": {},
    }

    for skill in skills:
        ability = clean_text(skill.get("ability"))
        if ability == "Passive":
            popup_entry["Passive Ability"] = build_passive_entry(skill)
        elif ability == "Basic":
            popup_entry["Attack"] = build_description(skill)
        elif ability == "Move 1":
            popup_entry["Move 1"] = build_move_slot(skill)
        elif ability == "Move 2":
            popup_entry["Move 2"] = build_move_slot(skill)
        elif ability == "Unite Move":
            popup_entry["Unite Move"] = build_unite_move_entry(skill)

    return popup_entry


def build_raw_index(snapshot: list[dict]) -> dict[str, dict]:
    raw_index: dict[str, dict] = {}
    for record in snapshot:
        for candidate_name in {
            clean_text(record.get("display_name")),
            normalize_display_name(clean_text(record.get("display_name"))),
            clean_text(record.get("name")),
            normalize_display_name(clean_text(record.get("name"))),
        }:
            lookup_key = normalize_lookup_key(candidate_name)
            if lookup_key:
                raw_index[lookup_key] = record
    return raw_index


def transform_snapshot(
    snapshot: list[dict],
    roster_dict: dict[str, dict] | None = None,
) -> dict[str, dict]:
    raw_index = build_raw_index(snapshot)
    popup_details: dict[str, dict] = {}
    consumed_record_ids: set[str] = set()

    if roster_dict:
        missing_names = []
        for display_name in roster_dict:
            lookup_key = normalize_lookup_key(display_name)
            record = raw_index.get(lookup_key)
            if not record:
                missing_names.append(display_name)
                continue
            popup_details[display_name] = build_popup_entry(record)
            consumed_record_ids.add(clean_text(record.get("id")))

        if missing_names:
            raise ValueError(
                "Missing UniteDB snapshot entries for: " + ", ".join(missing_names)
            )

    for record in snapshot:
        record_id = clean_text(record.get("id"))
        if record_id and record_id in consumed_record_ids:
            continue

        display_name = normalize_display_name(clean_text(record.get("display_name") or record.get("name")))
        if not display_name or display_name in popup_details:
            continue

        popup_details[display_name] = build_popup_entry(record)

    return popup_details


def write_popup_json(path: Path, popup_details: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file_handle:
        json.dump(popup_details, file_handle, indent=2, ensure_ascii=False)
        file_handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transform UniteDB pokemon.json snapshot data into the published popup details JSON."
    )
    parser.add_argument("--snapshot-path", type=Path, default=DEFAULT_UNITE_DB_POKEMON_PATH)
    parser.add_argument("--roster-path", type=Path, default=DEFAULT_ROSTER_JSON_PATH)
    parser.add_argument("--output-path", type=Path, default=POPUP_JSON_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.snapshot_path.exists():
        raise SystemExit(f"Missing UniteDB snapshot: {args.snapshot_path}")

    snapshot = load_json(args.snapshot_path)
    if not isinstance(snapshot, list):
        raise SystemExit(f"Expected {args.snapshot_path} to contain a top-level array")

    roster_dict = None
    if args.roster_path.exists():
        roster_payload = load_json(args.roster_path)
        if not isinstance(roster_payload, dict):
            raise SystemExit(f"Expected {args.roster_path} to contain a top-level object")
        roster_dict = roster_payload

    popup_details = transform_snapshot(snapshot, roster_dict)
    write_popup_json(args.output_path, popup_details)

    print(f"Built popup details for {len(popup_details)} Pokemon")
    print(f"Snapshot source: {args.snapshot_path}")
    print(f"Output file: {args.output_path}")


if __name__ == "__main__":
    main()
