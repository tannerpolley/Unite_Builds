from pathlib import Path
import json
import quopri
import re
import time
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_META_HTML_PATH = REPO_ROOT / 'data' / 'html' / 'Unite API _ Pokémon Unite Meta Tierlist.html'
DEFAULT_POKEMON_JSON_PATH = REPO_ROOT / 'static' / 'json' / 'all_pokemon_detailed.json'
ROLE_NAMES = ('Attacker', 'Defender', 'Speedster', 'All-Rounder', 'Supporter')
DISPLAY_NAME_OVERRIDES = {
    'Ninetales': 'Alolan Ninetales',
    'Raichu': 'Alolan Raichu',
    'MrMime': 'Mr. Mime',
    'Urshifu_Single': 'Urshifu',
    'HoOh': 'Ho-Oh',
    'Meowscara': 'Meowscarada',
    'Rapidash': 'Galarian Rapidash',
    'MEGALucario': 'Mega Lucario',
    'CharizardX': 'Mega Charizard X',
    'CharizardY': 'Mega Charizard Y',
    'MegaGyarados': 'Mega Gyarados',
    'MewtwoY': 'Mewtwo Y',
    'MewtwoX': 'Mewtwo X',
    'Sirfetch': "Sirfetch'd",
}
UNITEAPI_SLUG_OVERRIDES = {
    'Ninetales': 'alolanninetales',
    'Raichu': 'alolanraichu',
    'MrMime': 'mrmime',
    'Urshifu_Single': 'urshifu',
    'HoOh': 'hooh',
    'Rapidash': 'galarianrapidash',
    'MEGALucario': 'megalucario',
    'CharizardX': 'charizardx',
    'CharizardY': 'charizardy',
    'MegaGyarados': 'megagyarados',
    'MewtwoY': 'mewtwoy',
    'MewtwoX': 'mewtwox',
    'Sirfetch': 'sirfetchd',
}
REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
}


def normalize_lookup_key(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', value.lower())


def clean_candidate_name(value: str) -> str:
    value = value or ''
    value = re.sub(r'avatar of (the )?pokemon', '', value, flags=re.IGNORECASE)
    value = re.sub(r'pokemon unite', '', value, flags=re.IGNORECASE)
    value = re.sub(r'\s+', ' ', value).strip(' -')
    return value


def extract_image_key(src: str, prefix: str) -> str:
    decoded_src = unquote(src or '')
    if 'url=' in decoded_src:
        decoded_src = decoded_src.split('url=', 1)[1].split('&', 1)[0]

    filename = decoded_src.split('/')[-1]
    stem = filename.rsplit('.', 1)[0]
    if stem.startswith(prefix):
        return stem[len(prefix):]
    return stem


def build_uniteapi_image_url(image_key: str, prefix: str = 't_Square_') -> str:
    return f'https://uniteapi.dev/Sprites/{prefix}{image_key}.png'


def normalize_display_name(raw_name: str) -> str:
    return DISPLAY_NAME_OVERRIDES.get(raw_name, raw_name)


def build_uniteapi_slug(raw_name: str, display_name: str) -> str:
    if raw_name in UNITEAPI_SLUG_OVERRIDES:
        return UNITEAPI_SLUG_OVERRIDES[raw_name]
    return re.sub(r'[^a-z0-9]+', '', display_name.lower())


def build_unite_db_slug(display_name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', display_name.lower()).strip('-')


def load_pokemon_json(pokemon_json_path: Path) -> dict:
    with open(pokemon_json_path, 'r', encoding='utf-8') as file:
        return json.load(file)


def save_pokemon_json(pokemon_json_path: Path, pokemon_dict: dict) -> None:
    with open(pokemon_json_path, 'w', encoding='utf-8') as file:
        json.dump(pokemon_dict, file, indent=2, ensure_ascii=False)


def extract_meta_page_entries(meta_html_path: Path) -> list[dict[str, str]]:
    soup = BeautifulSoup(quopri.decodestring(meta_html_path.read_bytes()).decode('utf-8', errors='ignore'), 'html.parser')
    entries = []
    seen = set()
    class_str = 'sc-d5d8a548-1 jXtpKR'
    blocks = soup.find_all('div', class_=class_str)

    if len(blocks) >= 4:
        try:
            win_rate_block, pick_rate_block = blocks[2], blocks[3]
            table_images = list(win_rate_block.find_all('img')) + list(pick_rate_block.find_all('img'))
        except Exception:
            table_images = []
    else:
        table_images = []

    for image in table_images:
        src = unquote(image.get('src', ''))
        if 't_Square_' not in src:
            continue

        raw_name = extract_image_key(src, 't_Square_')
        if not raw_name:
            continue

        display_name = normalize_display_name(raw_name)
        if display_name in seen:
            continue

        seen.add(display_name)
        entries.append({
            'display_name': display_name,
            'raw_name': raw_name,
            'uniteapi-name': build_uniteapi_slug(raw_name, display_name),
            'square_image_url': build_uniteapi_image_url(raw_name),
        })

    return entries


def fetch_html(url: str, timeout: float = 20.0) -> str:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.text


def count_unite_db_links(html: str) -> int:
    return len(set(re.findall(r'/pokemon/([^"\'?#/]+)', html or '')))


def fetch_rendered_html(url: str) -> str:
    from selenium import webdriver

    options = webdriver.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('user-agent=' + REQUEST_HEADERS['User-Agent'])

    driver = webdriver.Chrome(options=options)
    try:
        driver.get(url)
        time.sleep(2)
        return driver.page_source
    finally:
        driver.quit()


def get_unite_db_listing_html() -> str:
    urls = ('https://unite-db.com/', 'https://unite-db.com/pokemon')
    last_html = ''

    for url in urls:
        try:
            html = fetch_html(url)
            last_html = html
            if count_unite_db_links(html) >= 5:
                return html
        except Exception:
            continue

    for url in urls:
        try:
            html = fetch_rendered_html(url)
            last_html = html
            if count_unite_db_links(html) >= 5:
                return html
        except Exception:
            continue

    return last_html


def extract_role_from_text(texts: list[str]) -> str:
    joined_text = ' '.join(texts)
    for role in ROLE_NAMES:
        if re.search(rf'\b{re.escape(role)}\b', joined_text, re.IGNORECASE):
            return role
    return ''


def is_valid_name_candidate(value: str) -> bool:
    value = clean_candidate_name(value)
    if not value or len(value) > 40:
        return False
    if value in ROLE_NAMES:
        return False
    return any(character.isalpha() for character in value)


def choose_display_name(text_candidates: list[str], slug: str) -> str:
    for candidate in text_candidates:
        cleaned = clean_candidate_name(candidate)
        if not is_valid_name_candidate(cleaned):
            continue
        return cleaned

    return slug.replace('-', ' ').title()


def build_unite_db_index(html: str) -> dict[str, dict[str, str]]:
    soup = BeautifulSoup(html, 'html.parser')
    index = {}

    for anchor in soup.find_all('a', href=True):
        href = urljoin('https://unite-db.com', anchor['href'])
        if '/pokemon/' not in href:
            continue

        slug = href.split('/pokemon/', 1)[1].split('?', 1)[0].split('#', 1)[0].strip('/')
        if not slug or '/' in slug:
            continue

        container = anchor.find_parent(['article', 'li', 'section', 'div']) or anchor
        text_candidates = []
        for image in container.find_all('img')[:3]:
            alt_text = clean_candidate_name(image.get('alt', ''))
            if alt_text:
                text_candidates.append(alt_text)

        for text in container.stripped_strings:
            cleaned = clean_candidate_name(text)
            if cleaned:
                text_candidates.append(cleaned)

        role = extract_role_from_text(text_candidates)
        display_name = choose_display_name(text_candidates, slug)
        data = {
            'display_name': display_name,
            'unite-db-name': slug,
            'Role': role,
        }

        index.setdefault(normalize_lookup_key(slug), data)
        index.setdefault(normalize_lookup_key(display_name), data)

    return index


def fetch_unite_db_detail(slug: str) -> dict[str, str]:
    detail_url = f'https://unite-db.com/pokemon/{slug}'
    html = ''

    try:
        html = fetch_html(detail_url)
    except Exception:
        try:
            html = fetch_rendered_html(detail_url)
        except Exception:
            return {'display_name': slug.replace('-', ' ').title(), 'Role': ''}

    soup = BeautifulSoup(html, 'html.parser')
    text_candidates = []
    for image in soup.find_all('img')[:5]:
        alt_text = clean_candidate_name(image.get('alt', ''))
        if alt_text:
            text_candidates.append(alt_text)

    text_candidates.extend(list(soup.stripped_strings)[:120])
    return {
        'display_name': choose_display_name(text_candidates, slug),
        'Role': extract_role_from_text(text_candidates),
    }


def match_unite_db_entry(meta_entry: dict[str, str], unite_db_index: dict[str, dict[str, str]]) -> dict[str, str]:
    lookup_keys = [
        normalize_lookup_key(meta_entry['display_name']),
        normalize_lookup_key(meta_entry['raw_name']),
        normalize_lookup_key(meta_entry['uniteapi-name']),
    ]

    for lookup_key in lookup_keys:
        if lookup_key in unite_db_index:
            return unite_db_index[lookup_key]

    for data in unite_db_index.values():
        slug_key = normalize_lookup_key(data['unite-db-name'])
        if any(lookup_key and (lookup_key in slug_key or slug_key in lookup_key) for lookup_key in lookup_keys):
            return data

    return {}


def sync_missing_pokemon_entries(
    meta_html_path: Path | str = DEFAULT_META_HTML_PATH,
    pokemon_json_path: Path | str = DEFAULT_POKEMON_JSON_PATH,
) -> dict:
    meta_html_path = Path(meta_html_path)
    pokemon_json_path = Path(pokemon_json_path)

    pokemon_dict = load_pokemon_json(pokemon_json_path)
    if not meta_html_path.exists():
        return {
            'pokemon_dict': pokemon_dict,
            'meta_entries': [],
            'meta_entry_map': {},
            'added_entries': [],
        }

    meta_entries = extract_meta_page_entries(meta_html_path)
    meta_entry_map = {entry['display_name']: entry for entry in meta_entries}
    missing_entries = [entry for entry in meta_entries if entry['display_name'] not in pokemon_dict]
    if not missing_entries:
        return {
            'pokemon_dict': pokemon_dict,
            'meta_entries': meta_entries,
            'meta_entry_map': meta_entry_map,
            'added_entries': [],
        }

    unite_db_index = build_unite_db_index(get_unite_db_listing_html())
    added_entries = []

    for entry in missing_entries:
        unite_db_entry = match_unite_db_entry(entry, unite_db_index)
        unite_db_name = unite_db_entry.get('unite-db-name', build_unite_db_slug(entry['display_name']))
        role = unite_db_entry.get('Role', '')

        if not role:
            detail_entry = fetch_unite_db_detail(unite_db_name)
            role = detail_entry.get('Role', role)

        if not role:
            print(f"Could not resolve Role for {entry['display_name']}; leaving Role blank")

        pokemon_dict[entry['display_name']] = {
            'unite-db-name': unite_db_name,
            'uniteapi-name': entry['uniteapi-name'],
            'Role': role,
        }
        added_entries.append(entry)

    if added_entries:
        save_pokemon_json(pokemon_json_path, pokemon_dict)
        print('Added missing Pokemon entries: ' + ', '.join(entry['display_name'] for entry in added_entries))

    return {
        'pokemon_dict': pokemon_dict,
        'meta_entries': meta_entries,
        'meta_entry_map': meta_entry_map,
        'added_entries': added_entries,
    }


def ensure_missing_pokemon_entries(
    meta_html_path: Path | str = DEFAULT_META_HTML_PATH,
    pokemon_json_path: Path | str = DEFAULT_POKEMON_JSON_PATH,
) -> dict:
    return sync_missing_pokemon_entries(meta_html_path, pokemon_json_path)['pokemon_dict']
