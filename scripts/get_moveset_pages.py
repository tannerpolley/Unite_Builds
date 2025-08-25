import pyautogui
import pyperclip
from pathlib import Path
import time
import os
import numpy as np
import json
import glob


def wait_for_downloads(path, pokemon, timeout=90, poll=0.1):
    """
    Block until no .crdownload files remain in `folder`,
    or raise if `timeout` seconds elapse.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path):
            print(f'Downloaded HTML page for {pokemon}')
            break
        time.sleep(poll)
    else:
        raise TimeoutError(f"No download stub seen for {pokemon}")


path = r'C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Pokemon_Sites'

with open("../data/roles.json") as f_in:
    role_dict = json.load(f_in)

new_week = True
get_pages = True

if new_week:

    files = [f.unlink() for f in Path(path).glob("*") if f.is_file() or f.is_dir()]
    # Path(r"C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Unite API _ Pokémon Unite Meta Tierlist.html").unlink()


else:
    files = os.listdir(path)

pokemons = list(role_dict.keys())
names = [name.lower().replace(" ", "") for name in pokemons]
names = [name.lower().replace(".", "") for name in names]

short_rest = .5

if get_pages:
    time.sleep(3)
    pyautogui.hotkey('ctrl', 'l')
    time.sleep(short_rest)
    url = r'https://uniteapi.dev/meta'
    pyperclip.copy(url)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    time.sleep(short_rest)
    pyautogui.hotkey('ctrl', 's')  # open Save As dialog
    time.sleep(short_rest)
    pyautogui.hotkey('alt', 'n')
    time.sleep(short_rest)
    fname = r"C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Unite API _ Pokémon Unite Meta Tierlist.html"
    pyperclip.copy(fname)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(short_rest)
    pyautogui.press('enter')
    wait_for_downloads(fname, "Main Meta Page")
    
    for name, pokemon in zip(names, pokemons):
        if name == 'scyther':
            continue

        url = r'https://uniteapi.dev/meta/pokemon-unite-meta-for-' + name
        pyperclip.copy(url)
        time.sleep(short_rest/2)
        pyautogui.hotkey('ctrl', 'l')
        time.sleep(short_rest)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(short_rest)
        pyautogui.press('enter')
        time.sleep(short_rest*2)
        pyautogui.hotkey('ctrl', 's')       # open Save As dialog
        time.sleep(short_rest)
        pyautogui.hotkey('alt', 'n')
        time.sleep(short_rest)
        fname = os.path.join(path, f"Unite API _ Pokémon Unite Meta for {pokemon}.html")
        pyperclip.copy(fname)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(short_rest)
        pyautogui.press('enter')
        wait_for_downloads(fname, pokemon)
        time.sleep(short_rest/2)



pokemon_list = []
files = os.listdir(path)
for file in files:
    pokemon_list.append(file[35:-5])

pokemon_list_key = role_dict.keys()
for pokemon in pokemon_list_key:
    if pokemon not in pokemon_list and pokemon != 'Scyther':
        print(pokemon)

