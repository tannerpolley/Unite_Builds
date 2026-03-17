import os
import quopri
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

import pyautogui
import pyperclip
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[1]
STATIC_IMG_ROOT = REPO_ROOT / 'static' / 'img'
POKEMON_IMG_ROOT = STATIC_IMG_ROOT / 'Pokemon'
MOVE_IMG_ROOT = STATIC_IMG_ROOT / 'Moves'
UNITE_MOVE_IMG_ROOT = STATIC_IMG_ROOT / 'Unite_Moves'
SHORT_REST = 0.5
INVALID_FILENAME_CHARS = r'[<>:"/\\|?*]'


def sanitize_filename(value: str) -> str:
    value = re.sub(INVALID_FILENAME_CHARS, '', value or '').strip()
    value = re.sub(r'\s+', ' ', value)
    return value


def decode_saved_html(html_path: Path | str) -> str:
    html_path = Path(html_path)
    return quopri.decodestring(html_path.read_bytes()).decode('utf-8', errors='ignore')


def normalize_uniteapi_image_url(url: str) -> str:
    if not url:
        return ''

    decoded_url = unquote(url)
    if decoded_url.startswith('https://uniteapi.dev/Sprites/'):
        return decoded_url
    if decoded_url.startswith('/Sprites/'):
        return 'https://uniteapi.dev' + decoded_url

    if '/_next/image' in decoded_url:
        parsed = urlparse(decoded_url)
        query_url = parse_qs(parsed.query).get('url', [''])[0]
        query_url = unquote(query_url)
        if query_url.startswith('/Sprites/'):
            return 'https://uniteapi.dev' + query_url

    return decoded_url


def wait_for_download(path: Path | str, label: str, timeout: float = 90, poll: float = 0.1) -> None:
    target_path = Path(path)
    deadline = time.time() + timeout

    while time.time() < deadline:
        if target_path.exists():
            print(f'Downloaded {label}')
            return
        time.sleep(poll)

    raise TimeoutError(f'No download stub seen for {label}')


def save_url_via_browser(url: str, save_path: Path | str, label: str, short_rest: float = SHORT_REST) -> bool:
    if not url:
        return False

    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    if save_path.exists():
        return False

    pyperclip.copy(url)
    time.sleep(short_rest / 2)
    pyautogui.hotkey('ctrl', 'l')
    time.sleep(short_rest)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    time.sleep(short_rest)
    pyautogui.hotkey('ctrl', 's')
    time.sleep(short_rest)
    pyautogui.hotkey('alt', 'n')
    time.sleep(short_rest)
    pyperclip.copy(str(save_path))
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    wait_for_download(save_path, label)
    time.sleep(short_rest / 2)
    return True


def extract_move_name_from_image(img) -> str:
    container = img.find_parent('div')
    if container is None:
        return ''

    text = ' '.join(container.stripped_strings)
    text = text.replace('Pick Rate', '').replace('Win Rate', '').strip()
    if not text or '%' in text or len(text) > 80:
        return ''

    return sanitize_filename(text)


def extract_move_image_targets(html_path: Path | str, pokemon_name: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(decode_saved_html(html_path), 'html.parser')
    targets = []
    seen_names = set()

    for img in soup.find_all('img'):
        src = img.get('src', '') or ''
        if 't_Skill_' not in src:
            continue

        move_name = extract_move_name_from_image(img)
        if not move_name or move_name in seen_names:
            continue

        seen_names.add(move_name)
        targets.append({
            'name': move_name,
            'url': normalize_uniteapi_image_url(src),
            'save_path': str(MOVE_IMG_ROOT / f'{sanitize_filename(pokemon_name)} - {move_name}.png'),
        })

    return targets


def ensure_pokemon_square_image(pokemon_name: str, meta_entry: dict[str, str] | None) -> bool:
    if not meta_entry:
        return False

    image_url = meta_entry.get('square_image_url', '')
    save_path = POKEMON_IMG_ROOT / f'{sanitize_filename(pokemon_name)}.png'
    return save_url_via_browser(image_url, save_path, f'{pokemon_name} square image')


def ensure_move_images_from_page(html_path: Path | str, pokemon_name: str) -> int:
    html_path = Path(html_path)
    if not html_path.exists() or html_path.suffix.lower() != '.html':
        return 0

    download_count = 0
    for target in extract_move_image_targets(html_path, pokemon_name):
        if save_url_via_browser(target['url'], target['save_path'], f"{pokemon_name} move image: {target['name']}"):
            download_count += 1

    return download_count
