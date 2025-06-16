from bs4 import BeautifulSoup
import os
import json
import pandas as pd
import numpy as np
from scripts.Fix_Hoopa_Winrate import fix_hoopa_winrate, fix_comfey_winrate
import ast
np.set_printoptions(legacy='1.25')
from pprint import pprint

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

with open("../data/roles.json") as f_in:
    role_dict = json.load(f_in)

with open("../data/battle_items.json") as f_in:
    battle_items_dict = json.load(f_in)

#
# #%%
#
#%%
path = r'C:\Users\Tanner\Documents\git\Unite_Builds\data\html\Pokemon_Sites'

files = os.listdir(path)
for file in files:
    if file[35:-5] in list(role_dict.keys()) is False:
        print(len(files), len(list(role_dict.keys())))


#
# #%%
all_movesets = []

for file in files:
    Pokemon_name = file[35:-5]

    with open(path + '\\' + file, 'r') as fp:

        soup = BeautifulSoup(fp, "html.parser")

        builds = []
        # Contains the moveset block
        for i, build_block in enumerate(soup.find_all('div', class_='sc-a9315c2e-0 dNgHcB')):
            build_i = {'Name': Pokemon_name, 'Role': role_dict[Pokemon_name]}

            # Contains the each seperate 1 of 4 blocks for pick rate, win rate, and move names
            for j, column in enumerate(build_block.find_all('div', class_='sc-a9315c2e-2 SBHRg')):
                text = column.find('p', class_='sc-6d6ea15e-3 hxGuyl').text
                numb = column.find('p', class_='sc-6d6ea15e-4 eZnfiD')

                if numb is not None:
                    numb = numb.text

                if j < 2:
                    if j == 0:
                        numb = str(float(numb[:-2]) * pick_rate_dict[Pokemon_name] / 100) + ' %'

                    build_i[text] = float(numb[:-2])

                elif j == 2:
                    move_1_name = text
                    if move_1_name == 'Dual Wingbeat':
                        Pokemon_name_2 = 'Scyther'
                        build_i['Role'] = 'Speedster'
                        build_i['Name'] = Pokemon_name_2
                    else:
                        Pokemon_name_2 = Pokemon_name

                    move_1_pic_file = 'Moves/' + Pokemon_name_2 + ' - ' + move_1_name + '.png'

                elif j == 3:
                    move_2_name = text
                    if move_1_name == 'Dual Wingbeat':
                        Pokemon_name_2 = 'Scyther'
                        build_i['Role'] = 'Speedster'
                    else:
                        Pokemon_name_2 = Pokemon_name

                    move_2_pic_file = 'Moves/' + Pokemon_name_2 + ' - ' + move_2_name + '.png'

            # Contains each seperate 1 of 3 blocks for pick rate, win rate, and item name
            item_set_list_dict = []
            item_pick_rates = []
            item_win_rates = []
            item_names = []
            for j, column in enumerate(build_block.find_all('div', class_='sc-6106a1d4-1 RuwBF')):

                # Contains both the pick rate and win rate for each item
                text = column.find('p', class_='sc-6d6ea15e-3 hxGuyl').text
                pick_rate, win_rate = column.find_all('p', class_='sc-6d6ea15e-3 LHyXa')
                # print(pick_rate)

                img = column.find('img')

                # pull out the url=… part and URL-decode it
                item_names.append(battle_items_dict[img['src'][37:-15]])

                pick_rate = pick_rate.text
                win_rate = win_rate.text

                item_pick_rates.append(float(pick_rate[:-2]))
                item_win_rates.append(float(win_rate[:-2]))
                item_set_dict = {
                    'Battle Item': battle_items_dict[img['src'][37:-15]],
                    'Pick Rate': float(pick_rate[:-2]),
                    'Win Rate': float(win_rate[:-2]),
                }
                item_set_list_dict.append(item_set_dict)

            # item_set_line_1 = f'{item_names[0]:>15}: {item_pick_rates[0]:05.2f} % | {item_win_rates[0]:05.2f} %'
            # item_set_line_2 = f'{item_names[1]:>15}: {item_pick_rates[1]:05.2f} % | {item_win_rates[1]:05.2f} %'
            # item_set_line_3 = f'{item_names[2]:>15}: {item_pick_rates[2]:05.2f} % | {item_win_rates[2]:05.2f} %'
            # combined_string = "<br>".join([item_set_line_1, item_set_line_2, item_set_line_3])

            if Pokemon_name != 'Mew' or Pokemon_name != 'Blaziken':
                build_i['Move Set'] = move_1_name + '/' + move_2_name
                build_i['Move 1'] = move_1_pic_file
                build_i['Move 2'] = move_2_pic_file


            build_i['Battle Items'] = item_set_list_dict

            if move_1_name == 'Surging Strikes':
                Pokemon_name_2 = 'Urshifu_Rapid'
            elif move_1_name == 'Wicked Blow':
                Pokemon_name_2 = 'Urshifu_Single'
            build_i['Pokemon'] = 'Pokemon/' + Pokemon_name_2 + '.png'

            if Pokemon_name == 'Mew' and i == 3:


                item_dictionary = {
                    'Eject Button': {
                        'Pick Rate': [],
                        'Win Rate': [],
                        'Picks': [],
                        'Wins': [],
                    },
                    'X Speed': {
                        'Pick Rate': [],
                        'Win Rate': [],
                        'Picks': [],
                        'Wins': [],
                    },
                    'Potion': {
                        'Pick Rate': [],
                        'Win Rate': [],
                        'Picks': [],
                        'Wins': [],
                    },
                    'X Attack': {
                        'Pick Rate': [],
                        'Win Rate': [],
                        'Picks': [],
                        'Wins': [],
                    },
                    'Remainder': {
                        'Pick Rate': [],
                        'Win Rate': [],
                        'Picks': [],
                        'Wins': [],
                    }
                }
                item_set_list_dict_new = []

                pick_rates = []
                for i in [-3, -2, -1]:
                    pick_rate = all_movesets[i]['Pick Rate']
                    pick_rates.append(pick_rate / pick_rate_dict[Pokemon_name]*100)
                    win_rate = all_movesets[i]['Win Rate']
                    picks = pick_rate/100 * matches
                    wins = picks * win_rate/100
                    item_set_list_dict_i = all_movesets[i]['Battle Items']
                    move_set_picks = 0
                    move_set_wins = 0
                    for j in range(3):
                        item = item_set_list_dict_i[j]['Battle Item']
                        item_dictionary[item]['Pick Rate'].append(item_set_list_dict_i[j]['Pick Rate'])
                        item_dictionary[item]['Picks'].append(item_set_list_dict_i[j]['Pick Rate']/100 * picks)
                        move_set_picks += item_set_list_dict_i[j]['Pick Rate']/100 * picks
                        item_dictionary[item]['Win Rate'].append(item_set_list_dict_i[j]['Win Rate'])
                        item_dictionary[item]['Wins'].append(item_set_list_dict_i[j]['Pick Rate']/100 * picks * item_set_list_dict_i[j]['Win Rate']/100)
                        move_set_wins += item_set_list_dict_i[j]['Pick Rate']/100 * picks * item_set_list_dict_i[j]['Win Rate']/100

                    item_dictionary['Remainder']['Picks'].append(picks - move_set_picks)
                    item_dictionary['Remainder']['Wins'].append((wins - move_set_wins))
                    item_dictionary['Remainder']['Pick Rate'].append((picks - move_set_picks)/picks*100)
                    item_dictionary['Remainder']['Win Rate'].append((wins - move_set_wins)/(picks - move_set_picks)*100)



                pick_rate = build_i['Pick Rate']
                pick_rates.append(pick_rate / pick_rate_dict[Pokemon_name] * 100)
                win_rate = build_i['Win Rate']
                picks = pick_rate/100 * matches
                wins = picks * win_rate / 100
                move_set_picks = 0
                move_set_wins = 0
                for j in range(3):
                    item = item_set_list_dict[j]['Battle Item']
                    item_dictionary[item]['Pick Rate'].append(item_set_list_dict[j]['Pick Rate'])
                    item_dictionary[item]['Picks'].append(item_set_list_dict[j]['Pick Rate']/100 * picks)
                    move_set_picks += item_set_list_dict[j]['Pick Rate']/100 * picks
                    item_dictionary[item]['Win Rate'].append(item_set_list_dict[j]['Win Rate'])
                    item_dictionary[item]['Wins'].append(item_set_list_dict[j]['Pick Rate']/100 * picks * item_set_list_dict[j]['Win Rate']/100)
                    move_set_wins += item_set_list_dict[j]['Pick Rate']/100 * picks * item_set_list_dict[j]['Win Rate']/100

                item_dictionary['Remainder']['Picks'].append(picks - move_set_picks)
                item_dictionary['Remainder']['Wins'].append((wins - move_set_wins))
                item_dictionary['Remainder']['Pick Rate'].append((picks - move_set_picks) / picks * 100)
                item_dictionary['Remainder']['Win Rate'].append((wins - move_set_wins) / (picks - move_set_picks) * 100)

                total_dictionary = {
                    'Eject Button': {
                        'Picks': [],
                        'Wins': [],
                        'Pick Rate': [],
                        'Win Rate': [],
                    },
                    'X Speed': {
                        'Picks': [],
                        'Wins': [],
                        'Pick Rate': [],
                        'Win Rate': [],
                    },
                    'Potion': {
                        'Picks': [],
                        'Wins': [],
                    },
                    'X Attack': {
                        'Picks': [],
                        'Wins': [],
                        'Pick Rate': [],
                        'Win Rate': [],
                    },
                    'Remainder': {
                        'Picks': [],
                        'Wins': [],
                        'Pick Rate': [],
                        'Win Rate': [],
                    }
                }

                mew_matches = sum(pick_rates) /10000 * pick_rate_dict[Pokemon_name] * matches
                for item in total_dictionary.keys():
                    total_dictionary[item]['Picks'] = sum(item_dictionary[item]['Picks'])
                    total_dictionary[item]['Wins'] = sum(item_dictionary[item]['Wins'])
                    total_dictionary[item]['Pick Rate'] = total_dictionary[item]['Picks'] /mew_matches*100
                    total_dictionary[item]['Win Rate'] = np.array(total_dictionary[item]['Wins']) / (np.array(total_dictionary[item]['Picks']) + 1e-5 )*100

                del total_dictionary['Remainder']
                item_pick_rate_dict = {}
                for item in total_dictionary.keys():
                    item_pick_rate_dict[item] = total_dictionary[item]['Pick Rate']

                key_min = min(item_pick_rate_dict, key=item_pick_rate_dict.get)

                item_pick_rate_dict.pop(key_min)

                valid_keys = item_pick_rate_dict.keys()

                item_set_list_dict_new = []
                for item in valid_keys:
                    item_set_dict = {
                        'Battle Item': item,
                        'Pick Rate': round(float(total_dictionary[item]['Pick Rate']),2),
                        'Win Rate': round(float(total_dictionary[item]['Win Rate']),2),
                    }
                    item_set_list_dict_new.append(item_set_dict)


                move_1_file = ['Moves/' + 'Mew' + ' - ' + 'Solar Beam' + '.png',
                               'Moves/' + 'Mew' + ' - ' + 'Surf' + '.png',
                               'Moves/' + 'Mew' + ' - ' + 'Electro Ball' + '.png']
                move_2_file = ['Moves/' + 'Mew' + ' - ' + 'Light Screen' + '.png',
                               'Moves/' + 'Mew' + ' - ' + 'Agility' + '.png',
                               'Moves/' + 'Mew' + ' - ' + 'Coaching' + '.png']

                build_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                           'Role': role_dict[Pokemon_name],
                           'Pick Rate': pick_rate_dict[Pokemon_name],
                           'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': 'All',
                           'Move 1': move_1_file, 'Move 2': move_2_file, 'Battle Items': item_set_list_dict_new}
                all_movesets.pop(-1)
                all_movesets.pop(-1)
                all_movesets.pop(-1)
                all_movesets.append(build_i)
                continue

            elif Pokemon_name == 'Blaziken' and i == 1:
                move_1_file = ['Moves/' + 'Blaziken' + ' - ' + 'Overheat' + '.png',
                               'Moves/' + 'Blaziken' + ' - ' + 'Fire Punch' + '.png']
                move_2_file = ['Moves/' + 'Blaziken' + ' - ' + 'Blaze Kick' + '.png',
                               'Moves/' + 'Blaziken' + ' - ' + 'Focus Blast' + '.png']

                pick_rate_0 = all_movesets[-1]['Pick Rate']
                win_rate_0 = all_movesets[-1]['Win Rate']
                picks_0 = pick_rate_0 * matches
                item_set_list_dict_0 = all_movesets[-1]['Battle Items']
                pick_rate_1 = build_i['Pick Rate']
                picks_1 = pick_rate_1 * matches
                item_set_list_dict_1 = item_set_list_dict
                item_set_list_dict_new = []
                for i in range(len(item_set_list_dict_0)):
                    item = item_set_list_dict_0[i]['Battle Item']
                    pick_rate_item_0 = item_set_list_dict_0[i]['Pick Rate']
                    picks_item_0 = pick_rate_item_0 * picks_0
                    win_rate_item_0 = item_set_list_dict_0[i]['Win Rate']
                    wins_item_0 = picks_item_0 * win_rate_0

                    pick_rate_item_1 = item_set_list_dict_1[i]['Pick Rate']
                    picks_item_1 = pick_rate_item_1 * picks_1
                    win_rate_item_1 = item_set_list_dict_1[i]['Win Rate']
                    wins_item_1 = picks_item_1 * win_rate_item_1

                    picks_item_total = picks_item_0 + picks_item_1
                    wins_item_total = wins_item_0 + wins_item_1

                    item_set_list_dict[i]['Pick Rate'] = picks_item_total / (picks_0 + picks_1)
                    item_set_list_dict[i]['Win Rate'] = wins_item_total / picks_item_total * 100

                    item_set_dict = {
                        'Battle Item': item,
                        'Pick Rate': round(float(picks_item_total / (picks_0 + picks_1)),2),
                        'Win Rate': round(float(wins_item_total / picks_item_total),2),
                    }
                    item_set_list_dict_new.append(item_set_dict)


                build_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
                           'Role': role_dict[Pokemon_name], 'Pick Rate': pick_rate_dict[Pokemon_name],
                           'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': 'All', 'Move 1': move_1_file,
                           'Move 2': move_2_file, 'Battle Items': item_set_list_dict_new}
                all_movesets.pop(-1)

                all_movesets.append(build_i)
                continue

            # if (Pokemon_name == 'Mew' or Pokemon_name == 'Blaziken') and i > 0:
            #     continue

            all_movesets.append(build_i)

# #%%
#

pd.options.display.float_format = '{:.2f}%'.format
df = pd.DataFrame(all_movesets)

columns_titles = ["Name", "Pokemon", "Move Set", "Win Rate", "Pick Rate", "Role", "Move 1", "Move 2", "Battle Items"]
df = df.reindex(columns=columns_titles)

# print(df[df["Name"] == 'Comfey'])

#
# Fix Hoopa Winrates

win_rate = win_rate_dict['Hoopa']
pick_rate = pick_rate_dict['Hoopa']

df_hoopa = df[df['Name'] == 'Hoopa']
df_hoopa_fix = fix_hoopa_winrate(df_hoopa, pick_rate, win_rate, pick_rate_dict, matches)
df = df[df['Name'] != 'Hoopa']
df = pd.concat([df, df_hoopa_fix], ignore_index=True)
df = df.sort_values(by='Name').reset_index(drop=True)

# Fix Comfey Winrates

pokemon = df['Move Set'].to_list()
name = 'Comfey'

indicies = []
for i in range(len(pokemon)):
    if pokemon[i] == 'Floral Healing/Magical Leaf':
        indicies.append(i)
win_rate = win_rate_dict[name]
pick_rate = pick_rate_dict[name]

win_rates = []
pick_rates = []
for i in indicies:
    win_rates.append(df.loc[i, 'Win Rate'])
    pick_rates.append(df.loc[i, 'Pick Rate'] / pick_rate_dict[name] * 100)

pick_rate, win_rate = fix_comfey_winrate(pick_rates, win_rates, pick_rate, win_rate, matches)
pick_rate = np.round(pick_rate * pick_rate_dict[name] / 100, 4)

df.loc[indicies[0], 'Win Rate'] = win_rate
df.loc[indicies[0], 'Pick Rate'] = pick_rate
df.drop(index=indicies[1], inplace=True)


pd.options.display.float_format = '{:.2f}%'.format

#%%
df['Pick Rate'] = df['Pick Rate'].round(2)
df['Win Rate'] = df['Win Rate'].round(2)

df.to_csv('../data/csv/all_movesets.csv',
          index=False,
          quoting=1,
          )

df = pd.read_csv('../data/csv/all_movesets.csv')


df['Battle Items'] = df['Battle Items'].apply(ast.literal_eval)

# 3. Explode so each dict becomes its own row
df_exploded = df.explode('Battle Items').reset_index(drop=True)


# 4. Normalize those dicts into separate columns
item_details = pd.json_normalize(df_exploded['Battle Items'])

# 5. Drop the old list-column and concat the new fields
df_final = pd.concat([
    df_exploded.drop(columns=['Battle Items']),
    item_details
], axis=1)

for i, row in df_final.iterrows():
    df_final.loc[i, 'Battle Item'] = f'Battle_Items/{row["Battle Item"]}.png'

# df = df[df['Pick Rate'] >= .75]
df_final.to_csv("../data/csv/all_movesets.csv",
          index=False,
          quoting=1,
          )

def ensure_list(cell):
    try:
        parsed = eval(cell)
        return parsed if isinstance(parsed, list) else [cell]
    except:
        return [cell]


# Load and process the CSV
df = pd.read_csv("../data/csv/all_movesets.csv")
df["Move 1"] = df["Move 1"].apply(ensure_list)
df["Move 2"] = df["Move 2"].apply(ensure_list)

group_keys = ["Name", "Move Set"]
static_columns = ["Name", "Pokemon", "Role", "Move Set", "Move 1", "Move 2", "Win Rate", "Pick Rate"]

# Group by Name + Move Set
final_data = []
for (name, moveset), group in df.groupby(group_keys, sort=False):
    row = group.iloc[0]
    moveset_entry = {col: row[col] for col in static_columns}

    for idx, (_, item_row) in enumerate(group.iterrows(), 1):
        moveset_entry[f"Item {idx}"] = item_row["Battle Item"]
        moveset_entry[f"Win Rate {idx}"] = item_row["Win Rate.1"]
        moveset_entry[f"Pick Rate {idx}"] = item_row["Pick Rate.1"]

    final_data.append(moveset_entry)

# Export to data.js
with open("../static/js/data.js", "w", encoding="utf-8") as f:
    f.write("const items = ")
    json.dump(final_data, f, indent=2)
    f.write(";")