import pyautogui
import pyperclip
from pathlib import Path
import time
import os
import numpy as np
import json

from playwright.sync_api import sync_playwright
from pathlib import Path

def fetch_with_playwright(url, out_path):
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
            ]
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/114.0.5735.199 Safari/537.36"
            )
        )
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=60000)
        # optional: solve a CAPTCHA here with a 3rd‑party service
        html = page.content()
        Path(out_path).write_text(html, encoding="utf-8")
        browser.close()


fetch_with_playwright("https://uniteapi.dev/meta", r"C:\Users\Tanner\Documents\git\Unite_Builds\scripts\page.html")


# Need to setup default save location

# path = r'C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Pokemon_Sites'
#
# with open("../data/roles.json") as f_in:
#     role_dict = json.load(f_in)
#
# new_week = False
# get_pages = False
#
# if new_week:
#
#     files = [f.unlink() for f in Path(path).glob("*") if f.is_file() or f.is_dir()]
#
#
# else:
#     files = os.listdir(path)
#
# pokemons = list(role_dict.keys())
# names = [name.lower().replace(" ", "") for name in pokemons]
#
# if get_pages:
#     time.sleep(3)
#     for name, pokemon in zip(names, pokemons):
#         if name == 'mr.mime':
#             name = 'mrmime'
#         url = r'https://uniteapi.dev/meta/pokemon-unite-meta-for-' + name
#         fname = r"Unite API _ Pokémon Unite Meta for " + pokemon
#         pyperclip.copy(url)
#         pyautogui.hotkey('ctrl', 'l')
#         time.sleep(.5)
#         pyautogui.hotkey('ctrl', 'v')
#         time.sleep(.5)
#
#         pyautogui.press('enter')
#         time.sleep(1.0)
#         pyautogui.hotkey('ctrl', 's')       # open Save As dialog
#         time.sleep(1.0)
#         pyperclip.copy(fname)
#         pyautogui.hotkey('ctrl', 'v')
#         time.sleep(1.0)
#         pyautogui.press('enter')
#         time.sleep(3.5)
#
#
#
# pokemon_list = []
# files = os.listdir(path)
# for file in files:
#     pokemon_list.append(file[35:-5])
#
# pokemon_list_key = role_dict.keys()
# print(len(pokemon_list_key))
# for pokemon in pokemon_list_key:
#     if pokemon not in pokemon_list:
#         print(pokemon)

