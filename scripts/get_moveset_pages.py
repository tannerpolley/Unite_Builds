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
PAGELESS_POKEMON = {
    'Mega Charizard X',
    'Mega Charizard Y',
    'Mega Gyarados',
    'Mega Lucario',
}

new_week = False
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
existing_page_names = set()

if get_pages:
    time.sleep(3)
    if new_week or not META_HTML_PATH.exists():
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
    else:
        print('Reusing existing main meta page:', META_HTML_PATH.name)

    sync_result = sync_missing_pokemon_entries(META_HTML_PATH)
    pokemon_dict = sync_result['roster_dict']
    meta_entry_map = sync_result['meta_entry_map']
    existing_page_names = {
        file_path.name[35:-5]
        for file_path in POKEMON_PAGES_PATH.iterdir()
        if file_path.suffix.lower() in {'.html', '.txt'}
    }

    for name, pokemon_data in sorted(pokemon_dict.items()):
        meta_entry = meta_entry_map.get(name)
        if ensure_pokemon_square_image(name, meta_entry):
            new_images_downloaded = True

        uniteapi_name = pokemon_data['uniteapi_name']
        if uniteapi_name == 'scyther':
            continue
        if name in PAGELESS_POKEMON or uniteapi_name.startswith('mega'):
            placeholder_path = POKEMON_PAGES_PATH / f'Unite API _ Pokémon Unite Meta for {name}.txt'
            if new_week or not placeholder_path.exists():
                np.savetxt(placeholder_path, np.array([]))
            time.sleep(short_rest / 2)
            continue

        pokemon_page_path = POKEMON_PAGES_PATH / f'Unite API _ Pokémon Unite Meta for {name}.html'
        if not new_week and name in existing_page_names:
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
    pokemon_dict = sync_result['roster_dict']
    meta_entry_map = sync_result['meta_entry_map']

if not get_pages:
    existing_page_names = {
        file_path.name[35:-5]
        for file_path in POKEMON_PAGES_PATH.iterdir()
        if file_path.suffix.lower() in {'.html', '.txt'}
    }

if new_images_downloaded:
    summary = format_static_images()
    print('Formatted newly downloaded images:')
    for key, value in summary.items():
        print(f'{key}: {value}')

pokemon_list = sorted(existing_page_names)

for pokemon in pokemon_dict.keys():
    if pokemon not in pokemon_list and pokemon != 'Scyther':
        print(pokemon)
