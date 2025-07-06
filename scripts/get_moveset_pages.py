import pyautogui
import pyperclip
from pathlib import Path
import time
import os
import numpy as np
import json

# def get_coords(x, y):
#     print(x, y)
#
# with mouse.Listener(on_move = get_coords) as listen:                                https://uniteapi.dev/meta/pokemon-unite-meta-for-aegislash
#     listen.join()


# Need to setup default save location

path = r'C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Pokemon_Sites'

with open("../data/roles.json") as f_in:
    role_dict = json.load(f_in)

new_week = True
get_pages = True

if new_week:

    files = [f.unlink() for f in Path(path).glob("*") if f.is_file() or f.is_dir()]


else:
    files = os.listdir(path)

pokemons = list(role_dict.keys())
names = [name.lower().replace(" ", "") for name in pokemons]

if get_pages:
    time.sleep(3)
    for name, pokemon in zip(names, pokemons):
        if name == 'mr.mime':
            name = 'mrmime'
        url = r'https://uniteapi.dev/meta/pokemon-unite-meta-for-' + name
        fname = r"Unite API _ Pokémon Unite Meta for " + pokemon
        pyperclip.copy(url)
        pyautogui.hotkey('ctrl', 'l')
        time.sleep(.3)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(.3)

        pyautogui.press('enter')
        time.sleep(1)
        pyautogui.hotkey('ctrl', 's')       # open Save As dialog
        time.sleep(1)
        pyperclip.copy(fname)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(1)
        pyautogui.press('enter')
        time.sleep(1)



pokemon_list = []
files = os.listdir(path)
for file in files:
    pokemon_list.append(file[35:-5])

pokemon_list_key = role_dict.keys()
print(len(pokemon_list_key))
for pokemon in pokemon_list_key:
    if pokemon not in pokemon_list:
        print(pokemon)

