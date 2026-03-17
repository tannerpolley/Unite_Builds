import time
from pathlib import Path

import numpy as np
import pyautogui
import pyperclip

from download_uniteapi_images import ensure_move_images_from_page, ensure_pokemon_square_image, wait_for_download
from format_images import format_static_images
from sync_missing_pokemon import sync_missing_pokemon_entries

REPO_ROOT = Path(__file__).resolve().parents[1]
POKEMON_PAGES_PATH = REPO_ROOT / 'data' / 'html' / 'Pokemon_Sites'
META_HTML_PATH = REPO_ROOT / 'data' / 'html' / 'Unite API _ Pokémon Unite Meta Tierlist.html'

new_week = True
get_pages = True
short_rest = 0.5

if new_week:
    for file_path in POKEMON_PAGES_PATH.glob('*'):
        if file_path.is_file():
            file_path.unlink()
    if META_HTML_PATH.exists():
        META_HTML_PATH.unlink()

pokemon_dict = {}
meta_entry_map = {}
new_images_downloaded = False

if get_pages:
    time.sleep(3)
    pyautogui.hotkey('ctrl', 'l')
    time.sleep(short_rest)
    pyperclip.copy(r'https://uniteapi.dev/meta')
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    time.sleep(short_rest)
    pyautogui.hotkey('ctrl', 's')
    time.sleep(short_rest)
    pyautogui.hotkey('alt', 'n')
    time.sleep(short_rest)
    pyperclip.copy(str(META_HTML_PATH))
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    wait_for_download(META_HTML_PATH, 'Main Meta Page')

    sync_result = sync_missing_pokemon_entries(META_HTML_PATH)
    pokemon_dict = sync_result['pokemon_dict']
    meta_entry_map = sync_result['meta_entry_map']

    for name, pokemon_data in pokemon_dict.items():
        meta_entry = meta_entry_map.get(name)
        if ensure_pokemon_square_image(name, meta_entry):
            new_images_downloaded = True

        uniteapi_name = pokemon_data['uniteapi-name']
        if uniteapi_name == 'scyther':
            continue
        if uniteapi_name.startswith('mega'):
            placeholder_path = POKEMON_PAGES_PATH / f'Unite API _ Pokémon Unite Meta for {name}.txt'
            np.savetxt(placeholder_path, np.array([]))
            time.sleep(short_rest / 2)
            continue

        print(name)
        url = 'https://uniteapi.dev/meta/pokemon-unite-meta-for-' + uniteapi_name
        pyperclip.copy(url)
        time.sleep(short_rest / 2)
        pyautogui.hotkey('ctrl', 'l')
        time.sleep(short_rest)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(short_rest)
        pyautogui.press('enter')
        time.sleep(short_rest * 2)
        pyautogui.hotkey('ctrl', 's')
        time.sleep(short_rest)
        pyautogui.hotkey('alt', 'n')
        time.sleep(short_rest)
        pokemon_page_path = POKEMON_PAGES_PATH / f'Unite API _ Pokémon Unite Meta for {name}.html'
        pyperclip.copy(str(pokemon_page_path))
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(short_rest)
        pyautogui.press('enter')
        wait_for_download(pokemon_page_path, name)

        if ensure_move_images_from_page(pokemon_page_path, name):
            new_images_downloaded = True

        time.sleep(short_rest / 2)
else:
    sync_result = sync_missing_pokemon_entries(META_HTML_PATH)
    pokemon_dict = sync_result['pokemon_dict']
    meta_entry_map = sync_result['meta_entry_map']

if new_images_downloaded:
    summary = format_static_images()
    print('Formatted newly downloaded images:')
    for key, value in summary.items():
        print(f'{key}: {value}')

pokemon_list = []
for file_path in POKEMON_PAGES_PATH.iterdir():
    pokemon_list.append(file_path.name[35:-5])

for pokemon in pokemon_dict.keys():
    if pokemon not in pokemon_list and pokemon != 'Scyther':
        print(pokemon)
