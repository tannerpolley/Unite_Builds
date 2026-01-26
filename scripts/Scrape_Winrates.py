from bs4 import BeautifulSoup
import os
import json
import pandas as pd
import numpy as np
from pprint import pprint
from scripts.Extra_Functions import fix_special_cases, organize_df


np.set_printoptions(legacy='1.25')

# Gather overall Win Rate and Pick Rate data from main meta page

with open('../data/html/Unite API _ Pokémon Unite Meta Tierlist.html', 'r') as fp:
    soup = BeautifulSoup(fp, "html.parser")

    date, matches = soup.find_all('div', class_="simpleStat_stat__o0Y7q")

    date = date.find('p', class_="mantine-focus-auto simpleStat_count__dG_xB m_b6d8b162 mantine-Text-root").text
    matches = float(
        matches.find('p', class_="mantine-focus-auto simpleStat_count__dG_xB m_b6d8b162 mantine-Text-root").text)

    with open("../data/txt/date.txt", "w") as f:
        f.write(date)

    with open("../data/txt/matches.txt", "w") as f:
        f.write(str(matches))

    class_str = "sc-d5d8a548-1 jXtpKR"
    # print(len(soup.find_all('div', class_=class_str)))
    win_rate_block, pick_rate_block, ban_rate_block = soup.find_all('div', class_=class_str)[2:]

    class_str = "sc-71f8e1a4-0 iDyfqa"
    pick_rate_num = []
    win_rate_num = []
    ban_rate_num = []

    if ban_rate_block.find_all('div', class_=class_str) == []:
        ban_rate_block = pick_rate_block

    for pokemon_pick_rate, pokemon_win_rate, pokemon_ban_rate in zip(pick_rate_block.find_all('div', class_=class_str),
                                                                     win_rate_block.find_all('div', class_=class_str),
                                                                     ban_rate_block.find_all('div', class_=class_str)
                                                                     ):



        pick_rate_num.append(float(pokemon_pick_rate.div.text[:-2]))
        win_rate_num.append(float(pokemon_win_rate.div.text[:-2]))
        ban_rate_num.append(float(pokemon_ban_rate.div.text[:-2]))

    pick_rate_name = []
    win_rate_name = []
    ban_rate_name = []
    for pick_mon_name, win_mon_name, ban_mon_name in zip(pick_rate_block.find_all('img'),
                                                         win_rate_block.find_all('img'),
                                                         ban_rate_block.find_all('img')
                                                         ):
        pick_rate_name.append(pick_mon_name['src'][39:-14])
        win_rate_name.append(win_mon_name['src'][39:-14])
        ban_rate_name.append(ban_mon_name['src'][39:-14])


pick_rate_dict = {}
for k, v in zip(pick_rate_name, pick_rate_num):
    pick_rate_dict[k] = v

win_rate_dict = {}
for k, v in zip(win_rate_name, win_rate_num):
    win_rate_dict[k] = v

ban_rate_dict = {}
for k, v in zip(ban_rate_name, ban_rate_num):
    ban_rate_dict[k] = v

combined_dict = {
    'Win Rate': [],
    'Pick Rate': [],
    'Ban Rate': [],
}

names = []
dict_list = [win_rate_dict, pick_rate_dict, ban_rate_dict]
for k, v in win_rate_dict.items():
    for i, k2 in enumerate(combined_dict.keys()):
        combined_dict[k2].append(dict_list[i][k])
    if k == 'Ninetales':
        k3 = 'Alolan Ninetales'
    elif k == 'Raichu':
        k3 = 'Alolan Raichu'
    elif k == 'MrMime':
        k3 = 'Mr. Mime'
    elif k == 'Urshifu_Single':
        k3 = 'Urshifu'
    elif k == 'HoOh':
        k3 = 'Ho-Oh'
    elif k == 'Meowscara':
        k3 = 'Meowscarada'
    elif k == 'Rapidash':
        k3 = 'Galarian Rapidash'
    elif k == 'MEGALucario':
        k3 = 'Mega Lucario'
    elif k == 'CharizardX':
        k3 = 'Mega Charizard X'
    elif k == 'CharizardY':
        k3 = 'Mega Charizard Y'
    elif k == 'MegaGyarados':
        k3 = 'Mega Gyarados'
    elif k == 'MewtwoY':
        k3 = 'Mewtwo Y'
    elif k == 'MewtwoX':
        k3 = 'Mewtwo X'
    else:
        k3 = k
    names.append(k3)

df = pd.DataFrame(combined_dict, index=names)

df.to_csv('../data/csv/Unite_Meta.csv')
#
# #%%
#
df = pd.read_csv('../data/csv/Unite_Meta.csv', index_col=0)

win_rate_dict = {}
pick_rate_dict = {}
ban_rate_dict = {}
for i, row in df.iterrows():
    win_rate_dict[i] = row['Win Rate']
    pick_rate_dict[i] = row['Pick Rate']
    ban_rate_dict[i] = row['Ban Rate']
    
with open("../static/json/all_pokemon_detailed.json") as f_in:
    pokemon_dict = json.load(f_in)

with open("../data/battle_items.json") as f_in:
    battle_items_dict = json.load(f_in)


path = r'C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Pokemon_Sites'

files = os.listdir(path)
for file in files:
    if file[35:-5] in list(pokemon_dict.keys()) is False:
        print(len(files), len(list(pokemon_dict.keys())))

#
# #%%
movesets = []

for file in files:
    if file[-4:] == 'html':
        Pokemon_name = file[35:-5]
    elif file[-3:] == 'txt':
        Pokemon_name = file[35:-4]

    if Pokemon_name == 'Mega Lucario':
        move_1_name = 'Power-Up Punch'
        move_2_name = 'Close Combat'
        move_1_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_1_name + '.png'
        move_2_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_2_name + '.png'

        moveset_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                   'Role': pokemon_dict[Pokemon_name]['Role'],
                   'Pick Rate': pick_rate_dict[Pokemon_name],
                   'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': move_1_name + '/' + move_2_name,
                   'Move 1': move_1_pic_file, 'Move 2': move_2_pic_file, 'Battle Items': {}}

        movesets.append(moveset_i)

        continue

    if Pokemon_name == 'Mega Charizard X':
        move_1_name = 'Fire Punch'
        move_2_name = 'Flare Blitz'
        move_1_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_1_name + '.png'
        move_2_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_2_name + '.png'

        moveset_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                   'Role': pokemon_dict[Pokemon_name]['Role'],
                   'Pick Rate': pick_rate_dict[Pokemon_name],
                   'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': move_1_name + '/' + move_2_name,
                   'Move 1': move_1_pic_file, 'Move 2': move_2_pic_file, 'Battle Items': {}}

        movesets.append(moveset_i)

        continue

    if Pokemon_name == 'Mega Charizard Y':
        move_1_name = 'Flamethrower'
        move_2_name = 'Fire Blast'
        move_1_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_1_name + '.png'
        move_2_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_2_name + '.png'

        moveset_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                   'Role': pokemon_dict[Pokemon_name]['Role'],
                   'Pick Rate': pick_rate_dict[Pokemon_name],
                   'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': move_1_name + '/' + move_2_name,
                   'Move 1': move_1_pic_file, 'Move 2': move_2_pic_file, 'Battle Items': {}}

        movesets.append(moveset_i)

        continue

    if Pokemon_name == 'Mega Gyarados':
        move_1_name = 'Dragon Breath'
        move_2_name = 'Waterfall'
        move_1_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_1_name + '.png'
        move_2_pic_file = 'Moves/' + Pokemon_name + ' - ' + move_2_name + '.png'

        moveset_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                   'Role': pokemon_dict[Pokemon_name]['Role'],
                   'Pick Rate': pick_rate_dict[Pokemon_name],
                   'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': move_1_name + '/' + move_2_name,
                   'Move 1': move_1_pic_file, 'Move 2': move_2_pic_file, 'Battle Items': {}}

        movesets.append(moveset_i)

        continue

    with open(path + '\\' + file, 'r') as fp:

        soup = BeautifulSoup(fp, "html.parser")

        # Gets all the rows of the existing movesets for the current pokemon
        moveset_rows = soup.find_all('div', class_='sc-a9315c2e-0 dNgHcB')

        # Loops through each row of all the movesets
        for i, moveset_row in enumerate(moveset_rows):
            moveset_i = {
                'Name': Pokemon_name,
                'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                'Role': pokemon_dict[Pokemon_name]['Role'],
            }

            # Gets all the columns of the current row for the current moveset
            moveset_columns = moveset_row.find_all('div', class_='sc-a9315c2e-2 SBHRg')

            # Loops through each column of current moveset row
            move_names = []
            for j, moveset_column in enumerate(moveset_columns):

                # Text of column name (Pick Rate, Win Rate, Move Name 1 or Move Name 2)
                text = moveset_column.find('p', class_='sc-6d6ea15e-3 hxGuyl').text
                numb = moveset_column.find('p', class_='sc-6d6ea15e-4 eZnfiD')

                # Filters for either the Pick Rate column or Win Rate column

                if text == 'Pick Rate':
                    numb = numb.text[:-2]

                    moveset_i[text] = float((str(float(numb) * pick_rate_dict[Pokemon_name] / 100) + ' %')[:-2])
                elif text == 'Win Rate':
                    moveset_i[text] = float(numb.text[:-2])
                else:
                    moveset_i[f"Move {int(j-1)}"] = 'Moves/' + Pokemon_name + ' - ' + text + '.png'
                    move_names.append(text)

            moveset_i['Move Set'] = move_names[0] + '/' + move_names[1]

            # Contains each seperate 1 of 3 blocks for item pick rate, item win rate, and item name
            item_columns = moveset_row.find_all('div', class_='sc-6106a1d4-1 RuwBF')

            item_set_list_dict = []
            for j, item_column in enumerate(item_columns):
                # Contains both the pick rate and win rate for each item
                pick_rate, win_rate = item_column.find_all('p', class_='sc-6d6ea15e-3 LHyXa')
                item_name = battle_items_dict[item_column.find('img')['src'][37:-15]]

                pick_rate = float(pick_rate.text[:-2])
                win_rate = float(win_rate.text[:-2])

                item_set_dict = {
                    'Battle Item': item_name,
                    'Pick Rate': pick_rate,
                    'Win Rate': win_rate,
                }
                item_set_list_dict.append(item_set_dict)

            moveset_i['Battle Items'] = item_set_list_dict

            movesets.append(moveset_i)


column_titles = ["Name", "Pokemon", "Move Set", "Win Rate", "Pick Rate", "Role", "Move 1", "Move 2", "Battle Items"]

df = fix_special_cases(movesets, matches, pick_rate_dict, win_rate_dict)
organize_df(df, column_titles)
