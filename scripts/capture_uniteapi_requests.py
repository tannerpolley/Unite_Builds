from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.uniteapi_html import decode_saved_html, validate_uniteapi_html_content


META_URL = "https://uniteapi.dev/meta"
DATA_HTML_DIR = REPO_ROOT / "data" / "html"
POKEMON_SITES_DIR = DATA_HTML_DIR / "Pokemon_Sites"
META_HTML_PATH = DATA_HTML_DIR / "Unite API _ Pokémon Unite Meta Tierlist.html"
ROSTER_JSON_PATH = REPO_ROOT / "data" / "json" / "uniteapi_roster.json"
DATE_PATH = REPO_ROOT / "data" / "txt" / "date.txt"
UNITE_API_PAGE_PREFIX = "Unite API _ Pokémon Unite Meta for "

PAGELESS_POKEMON = {
    "Mega Charizard X",
    "Mega Charizard Y",
    "Mega Gyarados",
    "Mega Lucario",
}

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


def normalize_display_name(raw_name: str) -> str:
    return DISPLAY_NAME_OVERRIDES.get(raw_name, raw_name)


def build_slug(raw_name: str, display_name: str) -> str:
    if raw_name in UNITEAPI_SLUG_OVERRIDES:
        return UNITEAPI_SLUG_OVERRIDES[raw_name]
    return re.sub(r"[^a-z0-9]+", "", display_name.lower())


def normalize_name_for_lookup(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


def decode_image_key(src: str, prefix: str) -> str:
    decoded_src = unquote(src or "")
    if "url=" in decoded_src:
        decoded_src = decoded_src.split("url=", 1)[1].split("&", 1)[0]
        decoded_src = unquote(decoded_src)

    filename = decoded_src.split("/")[-1]
    stem = filename.rsplit(".", 1)[0]
    if stem.startswith(prefix):
        return stem[len(prefix):]
    return ""


def extract_percent_values(text: str) -> list[float]:
    return [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)\s*%", text)]


def is_candidate_rate_block(tag) -> bool:
    image_count = sum(1 for image in tag.find_all("img") if "t_Square_" in image.get("src", ""))
    if image_count < 10:
        return False
    percent_values = extract_percent_values(tag.get_text(" ", strip=True))
    return len(percent_values) >= 10


def extract_meta_entries(meta_html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(meta_html, "html.parser")
    entries: list[dict[str, str]] = []
    seen: set[str] = set()

    blocks = soup.find_all("div", class_="sc-d5d8a548-1 jXtpKR")
    if len(blocks) >= 4:
        candidate_images = list(blocks[2].find_all("img")) + list(blocks[3].find_all("img"))
    else:
        candidate_blocks = [tag for tag in soup.find_all("div") if is_candidate_rate_block(tag)]
        candidate_images = []
        for block in candidate_blocks[:3]:
            candidate_images.extend(block.find_all("img"))
        if not candidate_images:
            candidate_images = soup.find_all("img")

    for image in candidate_images:
        src = image.get("src", "")
        image_key = decode_image_key(src, "t_Square_")
        if not image_key:
            continue

        display_name = normalize_display_name(image_key)
        if display_name in seen:
            continue

        seen.add(display_name)
        entries.append(
            {
                "display_name": display_name,
                "raw_name": image_key,
                "uniteapi_name": build_slug(image_key, display_name),
                "square_image_key": image_key,
                "square_image_url": f"https://uniteapi.dev/Sprites/t_Square_{image_key}.png",
            }
        )

    return entries


def extract_meta_source_date(meta_html: str) -> str:
    soup = BeautifulSoup(meta_html, "html.parser")

    for stat_block in soup.select("div[class*='simpleStat_stat__']"):
        paragraphs = [paragraph.get_text(strip=True) for paragraph in stat_block.find_all("p")]
        if len(paragraphs) < 2:
            continue

        value = paragraphs[0]
        label = " ".join(paragraphs[1:]).lower()
        if "last updated" in label or label.strip() == "updated":
            return value

    for paragraph in soup.find_all("p"):
        label = paragraph.get_text(" ", strip=True).lower()
        if "last updated" not in label and label.strip() != "updated":
            continue

        value_node = paragraph.find_previous_sibling("p")
        if value_node is None:
            continue

        value = value_node.get_text(strip=True)
        if value:
            return value

    return ""


def load_json_dict(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def save_json_dict(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2, ensure_ascii=False)
        file_handle.write("\n")


def update_roster(entries: list[dict[str, str]], existing_roster: dict) -> tuple[dict, list[str]]:
    roster: dict[str, dict] = {}
    added_entries: list[str] = []

    for entry in entries:
        display_name = entry["display_name"]
        existing_entry = existing_roster.get(display_name, {})
        roster[display_name] = {
            "display_name": display_name,
            "uniteapi_name": entry["uniteapi_name"],
            "role": existing_entry.get("role", ""),
            "square_image_key": entry["square_image_key"],
        }
        if display_name not in existing_roster:
            added_entries.append(display_name)

    return roster, added_entries


def load_previous_source_date() -> str:
    if not DATE_PATH.exists():
        return ""
    return DATE_PATH.read_text(encoding="utf-8").strip()


def build_session(max_workers: int) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
    )

    retry = Retry(
        total=0,
        connect=0,
        read=0,
        redirect=0,
        status=0,
        allowed_methods=frozenset(["GET"]),
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=max_workers, pool_maxsize=max_workers)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def fetch_validated_html(
    session: requests.Session,
    *,
    url: str,
    is_meta: bool,
    pokemon_name: str | None,
    retries: int,
    timeout: float,
) -> tuple[str | None, str | None, int]:
    request_count = 0
    last_error: str | None = None

    for attempt in range(1, retries + 1):
        request_count += 1

        try:
            response = session.get(url, timeout=timeout)
        except requests.RequestException as exc:
            last_error = str(exc)
        else:
            if response.status_code != 200:
                last_error = f"HTTP {response.status_code}"
            else:
                content_type = response.headers.get("content-type", "").lower()
                if any(token in content_type for token in ("image/", "application/octet-stream", "application/json")):
                    last_error = f"unexpected content-type: {content_type}"
                else:
                    html = response.content.decode("utf-8", errors="ignore")
                    validation_error = validate_uniteapi_html_content(
                        html,
                        is_meta=is_meta,
                        pokemon_name=pokemon_name,
                        require_moves=not is_meta,
                    )
                    if validation_error is None:
                        return html, None, request_count
                    last_error = validation_error

        if attempt < retries:
            time.sleep(min(1.25 * attempt, 4.0))

    return None, last_error or "unknown error", request_count


def filter_roster_by_requested_names(roster: dict[str, dict], requested_names: list[str]) -> tuple[dict[str, dict], list[str]]:
    if not requested_names:
        return dict(roster), []

    requested_lookup = {normalize_name_for_lookup(name): name for name in requested_names}
    selected: dict[str, dict] = {}

    for display_name, entry in roster.items():
        lookup_key = normalize_name_for_lookup(display_name)
        if lookup_key in requested_lookup:
            selected[display_name] = entry

    matched_keys = {normalize_name_for_lookup(name) for name in selected}
    missing = [original for key, original in requested_lookup.items() if key not in matched_keys]
    return selected, missing


def is_pageless_pokemon(display_name: str, roster_entry: dict) -> bool:
    if display_name in PAGELESS_POKEMON:
        return True
    uniteapi_name = roster_entry.get("uniteapi_name", "")
    return uniteapi_name.startswith("mega")


def pokemon_page_path(display_name: str) -> Path:
    return POKEMON_SITES_DIR / f"{UNITE_API_PAGE_PREFIX}{display_name}.html"


def placeholder_page_path(display_name: str) -> Path:
    return POKEMON_SITES_DIR / f"{UNITE_API_PAGE_PREFIX}{display_name}.txt"


def has_valid_saved_page(path: Path, *, display_name: str) -> bool:
    if not path.exists():
        return False

    try:
        html = decode_saved_html(path)
    except Exception:
        return False

    return validate_uniteapi_html_content(
        html,
        is_meta=False,
        pokemon_name=display_name,
        require_moves=True,
    ) is None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture Unite API pages with requests+BeautifulSoup and save HTML snapshots."
    )
    parser.add_argument("--resume", action="store_true", help="Skip pages that already validate.")
    parser.add_argument(
        "--pokemon",
        action="append",
        default=[],
        help="Capture only selected Pokemon page(s). May be provided multiple times.",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Ignore source-date gate and refresh Pokemon pages even when source date is unchanged.",
    )
    parser.add_argument("--max-workers", type=int, default=6, help="Concurrent worker count for Pokemon page fetches.")
    parser.add_argument("--retries", type=int, default=3, help="Retry attempts per request.")
    parser.add_argument("--timeout", type=float, default=25.0, help="HTTP timeout in seconds.")
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Exit zero even when one or more Pokemon pages fail capture.",
    )
    parser.add_argument(
        "--failed-output",
        type=Path,
        default=None,
        help="Optional JSON output path for failed Pokemon names.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.max_workers < 1:
        raise ValueError("--max-workers must be a positive integer")
    if args.retries < 1:
        raise ValueError("--retries must be a positive integer")
    if args.timeout <= 0:
        raise ValueError("--timeout must be positive")

    requested_pokemon: list[str] = []
    for value in args.pokemon:
        requested_pokemon.extend(token.strip() for token in value.split(",") if token.strip())

    POKEMON_SITES_DIR.mkdir(parents=True, exist_ok=True)
    ROSTER_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_HTML_PATH.parent.mkdir(parents=True, exist_ok=True)

    summary = {
        "meta_requests": 0,
        "pokemon_requests": 0,
        "captured_pages": 0,
        "reused_pages": 0,
        "skipped_pages": 0,
        "skipped_due_date_gate": 0,
        "placeholder_pages": 0,
        "failed_pages": 0,
    }

    session = build_session(args.max_workers)
    failed_pokemon: list[str] = []

    try:
        meta_html, meta_error, meta_request_count = fetch_validated_html(
            session,
            url=META_URL,
            is_meta=True,
            pokemon_name=None,
            retries=args.retries,
            timeout=args.timeout,
        )
        summary["meta_requests"] = meta_request_count

        if meta_html is None:
            raise RuntimeError(f"Failed to capture meta page: {meta_error}")

        META_HTML_PATH.write_text(meta_html, encoding="utf-8")

        meta_entries = extract_meta_entries(meta_html)
        if not meta_entries:
            raise RuntimeError("Meta page parsed but no Pokemon entries were found.")

        existing_roster = load_json_dict(ROSTER_JSON_PATH)
        roster, added_entries = update_roster(meta_entries, existing_roster)
        if roster != existing_roster:
            save_json_dict(ROSTER_JSON_PATH, roster)
        if added_entries:
            print("Added missing roster entries: " + ", ".join(added_entries))

        selected_roster, missing_requested = filter_roster_by_requested_names(roster, requested_pokemon)
        if missing_requested:
            raise RuntimeError("Unknown pokemon target(s): " + ", ".join(missing_requested))

        source_date = extract_meta_source_date(meta_html)
        previous_date = load_previous_source_date()
        date_gate_active = (
            not requested_pokemon
            and not args.resume
            and not args.force_refresh
            and source_date
            and previous_date
            and source_date == previous_date
        )

        targets: list[tuple[str, str, Path]] = []

        for display_name, entry in sorted(selected_roster.items(), key=lambda item: item[0].lower()):
            uniteapi_slug = entry.get("uniteapi_name", "")
            if uniteapi_slug == "scyther":
                summary["skipped_pages"] += 1
                continue

            if is_pageless_pokemon(display_name, entry):
                placeholder_path = placeholder_page_path(display_name)
                if not placeholder_path.exists():
                    placeholder_path.write_text("", encoding="utf-8")
                summary["placeholder_pages"] += 1
                continue

            target_path = pokemon_page_path(display_name)

            if date_gate_active:
                summary["skipped_due_date_gate"] += 1
                continue

            if args.resume and has_valid_saved_page(target_path, display_name=display_name):
                summary["reused_pages"] += 1
                continue

            pokemon_url = f"https://uniteapi.dev/meta/pokemon-unite-meta-for-{uniteapi_slug}"
            targets.append((display_name, pokemon_url, target_path))

        def capture_one(target: tuple[str, str, Path]) -> tuple[str, bool, str | None, int]:
            display_name, url, target_path = target
            html, error, attempts = fetch_validated_html(
                session,
                url=url,
                is_meta=False,
                pokemon_name=display_name,
                retries=args.retries,
                timeout=args.timeout,
            )
            if html is None:
                return display_name, False, error, attempts

            target_path.write_text(html, encoding="utf-8")
            return display_name, True, None, attempts

        if targets:
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as executor:
                futures = [executor.submit(capture_one, target) for target in targets]
                for future in concurrent.futures.as_completed(futures):
                    display_name, success, error, attempts = future.result()
                    summary["pokemon_requests"] += attempts
                    if success:
                        summary["captured_pages"] += 1
                    else:
                        summary["failed_pages"] += 1
                        failed_pokemon.append(display_name)
                        print(f"Failed capture for {display_name}: {error}")

        failed_pokemon.sort(key=str.lower)

        print("\nCapture Summary")
        print(f"  Meta requests: {summary['meta_requests']}")
        print(f"  Pokemon requests: {summary['pokemon_requests']}")
        print(f"  Captured pages: {summary['captured_pages']}")
        print(f"  Reused pages: {summary['reused_pages']}")
        print(f"  Skipped (date gate): {summary['skipped_due_date_gate']}")
        print(f"  Skipped pages: {summary['skipped_pages']}")
        print(f"  Placeholder pages: {summary['placeholder_pages']}")
        print(f"  Failed pages: {summary['failed_pages']}")
        print(f"  Source date: {source_date or 'unknown'}")
        if previous_date:
            print(f"  Previous date: {previous_date}")

        if failed_pokemon:
            print("\nFailed Pokemon pages:")
            for name in failed_pokemon:
                print(f"  - {name}")

        if args.failed_output is not None:
            args.failed_output.parent.mkdir(parents=True, exist_ok=True)
            args.failed_output.write_text(
                json.dumps({"failed_pokemon": failed_pokemon}, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

        if failed_pokemon and not args.allow_partial:
            raise SystemExit(1)

    finally:
        session.close()


if __name__ == "__main__":
    main()
