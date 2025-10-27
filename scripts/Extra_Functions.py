import numpy as np
import pandas as pd
from collections import defaultdict
import json
import ast

def organize_df(df, column_titles):

    df = df.sort_values(by='Name').reset_index(drop=True)

    df['Pick Rate'] = df['Pick Rate'].round(2)
    df['Win Rate'] = df['Win Rate'].round(2)

    df = df.reindex(columns=column_titles)

    df.to_csv('../data/csv/movesets.csv',
              index=False,
              quoting=1,
              )

    df = pd.read_csv('../data/csv/movesets.csv')

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
    df_final.to_csv("../data/csv/movesets.csv",
                    index=False,
                    quoting=1,
                    )

    # Load and process the CSV b
    df = pd.read_csv("../data/csv/movesets.csv")
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



def fix_special_cases(movesets, matches, pick_rate_dict, win_rate_dict):

    blaziken_movesets = []
    mew_movesets = []
    mega_lucario_movesets = []
    collect_mega_charizard_x_movesets = []
    for moveset in movesets:
        Pokemon_name = moveset['Name']

        if Pokemon_name == 'Blaziken':
            blaziken_movesets.append(moveset)
        elif Pokemon_name == 'Mew':
            mew_movesets.append(moveset)
        elif Pokemon_name == 'Mega Lucario':
            mega_lucario_movesets.append(moveset)

    movesets = fix_blaziken(movesets, blaziken_movesets, matches)
    movesets = fix_mega(movesets, mega_lucario_movesets, matches)
    movesets = fix_mew(movesets, mew_movesets, matches, pick_rate_dict, win_rate_dict)
    movesets = fix_scyther_and_urshifu(movesets)

    pd.options.display.float_format = '{:.2f}%'.format
    df = pd.DataFrame(movesets)

    columns_titles = ["Name", "Pokemon", "Move Set", "Win Rate", "Pick Rate", "Role", "Move 1", "Move 2",
                      "Battle Items"]

    df = df.reindex(columns=columns_titles)
    df_hoopa = df[df['Name'] == 'Hoopa']

    df_hoopa_fix = fix_hoopa(df_hoopa, pick_rate_dict, win_rate_dict, matches)

    df = df[df['Name'] != 'Hoopa']
    df = pd.concat([df, df_hoopa_fix], ignore_index=True)

    return df

def ensure_list(cell):
    try:
        parsed = eval(cell)
        return parsed if isinstance(parsed, list) else [cell]
    except:
        return [cell]


def fix_mew(movesets, mew_movesets, matches, pick_rate_dict, win_rate_dict):

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
        'Full Heal': {
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

    movesets_mew = mew_movesets[:-1]
    build_i = mew_movesets[-1]
    item_set_list_dict = build_i['Battle Items']

    Pokemon_name = 'Mew'

    pick_rates = []
    for k in [-3, -2, -1]:
        pick_rate = movesets_mew[k]['Pick Rate']
        pick_rates.append(pick_rate / pick_rate_dict[Pokemon_name] * 100)
        win_rate = movesets_mew[k]['Win Rate']
        picks = pick_rate / 100 * matches
        wins = picks * win_rate / 100
        item_set_list_dict_i = movesets_mew[k]['Battle Items']
        move_set_picks = 0
        move_set_wins = 0
        for l in range(3):
            item = item_set_list_dict_i[l]['Battle Item']
            item_dictionary[item]['Pick Rate'].append(item_set_list_dict_i[l]['Pick Rate'])
            item_dictionary[item]['Picks'].append(item_set_list_dict_i[l]['Pick Rate'] / 100 * picks)
            move_set_picks += item_set_list_dict_i[l]['Pick Rate'] / 100 * picks
            item_dictionary[item]['Win Rate'].append(item_set_list_dict_i[l]['Win Rate'])
            item_dictionary[item]['Wins'].append(
                item_set_list_dict_i[l]['Pick Rate'] / 100 * picks * item_set_list_dict_i[l]['Win Rate'] / 100)
            move_set_wins += item_set_list_dict_i[l]['Pick Rate'] / 100 * picks * item_set_list_dict_i[l][
                'Win Rate'] / 100

        item_dictionary['Remainder']['Picks'].append(picks - move_set_picks)
        item_dictionary['Remainder']['Wins'].append((wins - move_set_wins))
        item_dictionary['Remainder']['Pick Rate'].append((picks - move_set_picks) / picks * 100)
        item_dictionary['Remainder']['Win Rate'].append((wins - move_set_wins) / (picks - move_set_picks) * 100)

    pick_rate = build_i['Pick Rate']
    pick_rates.append(pick_rate / pick_rate_dict[Pokemon_name] * 100)
    win_rate = build_i['Win Rate']
    picks = pick_rate / 100 * matches
    wins = picks * win_rate / 100
    move_set_picks = 0
    move_set_wins = 0
    for k in range(3):
        item = item_set_list_dict[k]['Battle Item']
        item_dictionary[item]['Pick Rate'].append(item_set_list_dict[k]['Pick Rate'])
        item_dictionary[item]['Picks'].append(item_set_list_dict[k]['Pick Rate'] / 100 * picks)
        move_set_picks += item_set_list_dict[k]['Pick Rate'] / 100 * picks
        item_dictionary[item]['Win Rate'].append(item_set_list_dict[k]['Win Rate'])
        item_dictionary[item]['Wins'].append(
            item_set_list_dict[k]['Pick Rate'] / 100 * picks * item_set_list_dict[k]['Win Rate'] / 100)
        move_set_wins += item_set_list_dict[k]['Pick Rate'] / 100 * picks * item_set_list_dict[k]['Win Rate'] / 100

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

    mew_matches = sum(pick_rates) / 10000 * pick_rate_dict[Pokemon_name] * matches
    for item in total_dictionary.keys():
        total_dictionary[item]['Picks'] = sum(item_dictionary[item]['Picks'])
        total_dictionary[item]['Wins'] = sum(item_dictionary[item]['Wins'])
        total_dictionary[item]['Pick Rate'] = total_dictionary[item]['Picks'] / mew_matches * 100
        total_dictionary[item]['Win Rate'] = np.array(total_dictionary[item]['Wins']) / (
                    np.array(total_dictionary[item]['Picks']) + 1e-5) * 100

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
            'Pick Rate': round(float(total_dictionary[item]['Pick Rate']), 2),
            'Win Rate': round(float(total_dictionary[item]['Win Rate']), 2),
        }
        item_set_list_dict_new.append(item_set_dict)

    move_1_file = ['Moves/' + 'Mew' + ' - ' + 'Solar Beam' + '.png',
                   'Moves/' + 'Mew' + ' - ' + 'Surf' + '.png',
                   'Moves/' + 'Mew' + ' - ' + 'Electro Ball' + '.png']
    move_2_file = ['Moves/' + 'Mew' + ' - ' + 'Light Screen' + '.png',
                   'Moves/' + 'Mew' + ' - ' + 'Agility' + '.png',
                   'Moves/' + 'Mew' + ' - ' + 'Coaching' + '.png']

    moveset_i = {'Name': Pokemon_name, 'Pokemon': 'Pokemon/' + Pokemon_name + '.png',
               'Role': build_i['Role'],
               'Pick Rate': pick_rate_dict[Pokemon_name],
               'Win Rate': win_rate_dict[Pokemon_name], 'Move Set': 'All',
               'Move 1': move_1_file, 'Move 2': move_2_file, 'Battle Items': item_set_list_dict_new}

    movesets.remove(mew_movesets[0])
    movesets.remove(mew_movesets[1])
    movesets.remove(mew_movesets[2])
    movesets.remove(mew_movesets[3])
    movesets.append(moveset_i)

    return movesets


def fix_blaziken(movesets, blaziken_movesets, matches):

    move_1_file = ['Moves/' + 'Blaziken' + ' - ' + 'Overheat' + '.png',
                   'Moves/' + 'Blaziken' + ' - ' + 'Fire Punch' + '.png']
    move_2_file = ['Moves/' + 'Blaziken' + ' - ' + 'Blaze Kick' + '.png',
                   'Moves/' + 'Blaziken' + ' - ' + 'Focus Blast' + '.png']

    moveset_0, moveset_1 = blaziken_movesets

    pick_rate_0 = moveset_0['Pick Rate']
    win_rate_0 = moveset_0['Win Rate']
    picks_0 = pick_rate_0 * matches
    wins_0 = picks_0*win_rate_0
    item_set_list_dict_0 = moveset_0['Battle Items']

    pick_rate_1 = moveset_1['Pick Rate']
    win_rate_1 = moveset_1['Win Rate']
    picks_1 = pick_rate_1 * matches
    wins_1 = picks_1*win_rate_1
    item_set_list_dict_1 = moveset_1['Battle Items']

    picks = picks_0 + picks_1
    wins = wins_0 + wins_1
    win_rate = wins/picks
    pick_rate = picks/matches

    item_set_list_dict_new = []

    for k in range(len(item_set_list_dict_0)):
        item = item_set_list_dict_0[k]['Battle Item']
        pick_rate_item_0 = item_set_list_dict_0[k]['Pick Rate']
        picks_item_0 = pick_rate_item_0 * picks_0
        win_rate_item_0 = item_set_list_dict_0[k]['Win Rate']
        wins_item_0 = picks_item_0 * win_rate_item_0

        pick_rate_item_1 = item_set_list_dict_1[k]['Pick Rate']
        picks_item_1 = pick_rate_item_1 * picks_1
        win_rate_item_1 = item_set_list_dict_1[k]['Win Rate']
        wins_item_1 = picks_item_1 * win_rate_item_1

        picks_item_total = picks_item_0 + picks_item_1
        wins_item_total = wins_item_0 + wins_item_1

        item_pick_rate = picks_item_total / picks
        item_win_rate = wins_item_total / picks_item_total

        item_set_dict = {
            'Battle Item': item,
            'Pick Rate': round(item_pick_rate, 2),
            'Win Rate': round(item_win_rate, 2),
        }
        item_set_list_dict_new.append(item_set_dict)

    moveset_i = {'Name': moveset_0['Name'], 'Pokemon': 'Pokemon/' + moveset_0['Name'] + '.png',
               'Role': moveset_0['Role'], 'Pick Rate': pick_rate,
               'Win Rate': win_rate, 'Move Set': 'All', 'Move 1': move_1_file,
               'Move 2': move_2_file, 'Battle Items': item_set_list_dict_new}

    movesets.remove(moveset_0)
    movesets.remove(moveset_1)

    movesets.append(moveset_i)

    return movesets


def fix_hoopa(df_hoopa, pick_rate_dict, win_rate_dict, total_matches):

    total_win_rate = win_rate_dict['Hoopa']
    total_pick_rate = pick_rate_dict['Hoopa']

    pd.options.display.float_format = '{:.2f}'.format


    total_hoopa_matches = total_matches * total_pick_rate / 100
    total_hoopa_wins = total_hoopa_matches * total_win_rate / 100
    # print(total_matches, total_pick_rate, total_win_rate, total_hoopa_matches, total_hoopa_wins)
    pick_rates = df_hoopa['Pick Rate']
    if "Phantom Force/Trick" in list(df_hoopa['Move Set']):
        missing_moveset = "Shadow Ball/Hyperspace Hole"
    elif "Shadow Ball/Hyperspace Hole" in list(df_hoopa['Move Set']):
        missing_moveset = "Phantom Force/Trick"
    else:
        print('Different Moveset is missing somehow')

    missing_pick_rate = 100 - sum(pick_rates / (pick_rate_dict['Hoopa'] / 100))
    if missing_pick_rate < 0:
        missing_pick_rate = 0

    battle_item_nested_dict = defaultdict(lambda: defaultdict(dict))

    items = ['Eject Button', 'Potion', 'X Speed', 'X Attack']

    hoopa_dic = {'Move Set': [], 'Win Rate': [], 'Pick Rate': [], 'Win Count': [], 'Pick Count': []}
    for i, row in df_hoopa.iterrows():
        hoopa_dic['Win Rate'].append(row['Win Rate'])
        hoopa_dic['Pick Rate'].append(row['Pick Rate'] / (pick_rate_dict['Hoopa'] / 100))
        hoopa_dic['Move Set'].append(row['Move Set'])

        for sub_dict in row['Battle Items']:
            k = list(sub_dict.keys())
            v = list(sub_dict.values())

            battle_item_nested_dict[row['Move Set']][v[0]][k[1]] = v[1]
            battle_item_nested_dict[row['Move Set']][v[0]][k[2]] = v[2]

            for item in items:
                if item not in battle_item_nested_dict[row['Move Set']].keys():
                    battle_item_nested_dict[row['Move Set']][item][k[1]] = 00.00
                    battle_item_nested_dict[row['Move Set']][item][k[2]] = 00.00


    def dictify(obj):
        """
        Recursively turn defaultdicts (or any dict) into plain dicts,
        stripping away factory info.
        """
        if isinstance(obj, dict):
            return {k: dictify(v) for k, v in obj.items()}
        return obj


    # suppose your nested default dict is called `nested_dd`
    new_dict = dictify(battle_item_nested_dict)

    # pprint(new_dict)

    movesets = hoopa_dic['Move Set']

    hoopa_dic['Pick Rate'].append(missing_pick_rate)
    hoopa_dic['Move Set'].append(missing_moveset)

    all_moves_pick_rate = np.array(hoopa_dic['Pick Rate'])

    for i in range(len(all_moves_pick_rate)):
        hoopa_dic['Pick Count'].append(all_moves_pick_rate[i] / 100 * total_hoopa_matches)

    winrates = list(df_hoopa['Win Rate'])
    for i in range(len(winrates)):
        hoopa_dic['Win Count'].append(winrates[i] / 100 * hoopa_dic['Pick Count'][i])

    if missing_pick_rate == 0:
        hoopa_dic['Win Count'].append(0)
    else:
        hoopa_dic['Win Count'].append(total_hoopa_wins - sum(hoopa_dic['Win Count']))

    hoopa_dic['Win Rate'].append(hoopa_dic['Win Count'][-1] * 100 / hoopa_dic['Pick Count'][-1])

    hoopa_dic['Move Set'].append('Total')
    hoopa_dic['Win Count'].append(sum(hoopa_dic['Win Count']))
    hoopa_dic['Pick Count'].append(sum(hoopa_dic['Pick Count']))
    hoopa_dic['Win Rate'].append(hoopa_dic['Win Count'][-1]*100/hoopa_dic['Pick Count'][-1])
    hoopa_dic['Pick Rate'].append(hoopa_dic['Pick Count'][-1]*100/total_matches)

    df_hoopa_all = pd.DataFrame(hoopa_dic)
    # print(df_hoopa_all.to_string())

    movesets.remove(missing_moveset)
    movesets.remove('Total')

    for moveset in movesets:
        for item in items:
            new_dict[moveset][item]['Picks'] = new_dict[moveset][item]['Pick Rate'] / 100 * float(df_hoopa_all[df_hoopa_all['Move Set'] == moveset]['Pick Count'].to_numpy())
            new_dict[moveset][item]['Wins'] = new_dict[moveset][item]['Win Rate'] / 100 * new_dict[moveset][item]['Picks']

    random_item_dict_list = []
    for moveset in movesets:
        Σ_picks = 0
        Σ_wins = 0
        random_item_dict = {}
        for item in items:

            Σ_picks += new_dict[moveset][item]['Picks']
            Σ_wins += new_dict[moveset][item]['Wins']
        total_moveset_picks = float(df_hoopa_all[df_hoopa_all['Move Set'] == moveset]['Pick Count'].to_numpy())
        total_moveset_wins = float(df_hoopa_all[df_hoopa_all['Move Set'] == moveset]['Win Count'].to_numpy())
        picks_left = total_moveset_picks - Σ_picks
        wins_left = total_moveset_wins - Σ_wins
        pick_rate_left = picks_left / total_moveset_picks*100
        win_rate_left = wins_left / picks_left*100
        random_item_dict['Picks'] = picks_left
        random_item_dict['Pick Rate'] = pick_rate_left
        random_item_dict['Wins'] = wins_left
        random_item_dict['Win Rate'] = win_rate_left
        random_item_dict_list.append(random_item_dict)

    for i, (k, v) in enumerate(new_dict.items()):
        v['Random Item'] = random_item_dict_list[i]

    items = ['Eject Button', 'Potion', 'X Speed', 'X Attack', 'Random Item']
    missing_dict_list = []
    avg = 0
    
    for item in items:
        missing_dict = {}
        avg_pick_rate = sum([new_dict[moveset][item]['Pick Rate'] for moveset in movesets]) / 4
        ratio_of_wins = 0
        for moveset in movesets:
            ratio_of_wins += new_dict[moveset][item]['Wins']/float(df_hoopa_all[df_hoopa_all['Move Set'] == moveset]['Win Count'].to_numpy())
        ratio_of_wins /= len(movesets)
        ratio_of_wins *= 100
        avg += avg_pick_rate
        total_picks = float(df_hoopa_all[df_hoopa_all['Move Set'] == missing_moveset]['Pick Count'].to_numpy())
        total_wins = float(df_hoopa_all[df_hoopa_all['Move Set'] == missing_moveset]['Win Count'].to_numpy())
        picks = avg_pick_rate/100*total_picks  + 1e-5
        wins = ratio_of_wins/100*total_wins
        missing_dict['Picks'] = picks 
        missing_dict['Wins'] = wins
        missing_dict['Pick Rate'] = picks/total_picks*100
        missing_dict['Win Rate'] = wins/picks*100 + 1e-5
        missing_dict_list.append(missing_dict)

    new_dict[missing_moveset] = {items[i]: missing_dict_list[i] for i in range(len(items))}


    # pprint(new_dict)

    moveset_w_item = []
    item_win_rates_list = []
    item_pick_rates_list = []
    item_picks_list = []
    item_wins_list = []


    movesets.append(missing_moveset)
    for moveset in movesets:
        for item in items:
            moveset_w_item.append(moveset + ' - ' + item)
            item_win_rates_list.append(new_dict[moveset][item]['Win Rate'])
            item_pick_rates_list.append(new_dict[moveset][item]['Pick Rate'])
            item_picks_list.append(new_dict[moveset][item]['Picks'])
            item_wins_list.append(new_dict[moveset][item]['Wins'])

    hoopa_dic_items = {'Move Set':  moveset_w_item, 'Win Rate': item_win_rates_list, 'Pick Rate': item_pick_rates_list, 'Win Count': item_wins_list, 'Pick Count': item_picks_list}

    df_hoopa_items = pd.DataFrame(hoopa_dic_items)

    hoopa_dic_2 = {'Move Set': [], 'Win Rate': [], 'Pick Rate': [], 'Wins': [], 'Picks': []}
    for moveset in movesets:
        Σ_picks = 0
        Σ_wins = 0
        for item in items:
            Σ_picks += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Pick Count'].to_numpy()[0]
            Σ_wins += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Win Count'].to_numpy()[0]
        hoopa_dic_2['Move Set'].append(moveset)
        hoopa_dic_2['Picks'].append(Σ_picks)
        hoopa_dic_2['Wins'].append(Σ_wins)
        hoopa_dic_2['Pick Rate'].append(Σ_picks/total_hoopa_matches*100)
        hoopa_dic_2['Win Rate'].append(Σ_wins/Σ_picks*100 + 1e-5)

    hoopa_dic_2['Move Set'].append('Total')
    hoopa_dic_2['Picks'].append(sum(hoopa_dic_2['Picks']))
    hoopa_dic_2['Wins'].append(sum(hoopa_dic_2['Wins']))
    hoopa_dic_2['Pick Rate'].append(hoopa_dic_2['Picks'][-1] / total_matches * 100)
    hoopa_dic_2['Win Rate'].append(hoopa_dic_2['Wins'][-1] / hoopa_dic_2['Picks'][-1] * 100 + 1e-5)

    df_hoopa_all_2 = pd.DataFrame(hoopa_dic_2)


    # true_wins_count = 0
    # true_picks_count = 0
    #
    # for i, row in df_hoopa_all.iterrows():
    #     moveset = row['Move Set']
    #     if moveset != 'Hyperspace Fury/Hyperspace Fury':
    #         true_wins_count += float(row['Win Count'])
    #         true_picks_count += float(row['Pick Count'])

    true_picks_battle_items = {}
    true_wins_battle_items = {}
    for item in items:
        Σ_true_item_picks = 0
        Σ_true_item_wins = 0
        for moveset in movesets:
            if moveset != 'Hyperspace Fury/Hyperspace Fury':
                Σ_true_item_picks += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Pick Count'].to_numpy()[0]
                Σ_true_item_wins += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Win Count'].to_numpy()[0]
        # print(item, Σ_true_item_picks)
        true_picks_battle_items[item] = Σ_true_item_picks
        true_wins_battle_items[item] = Σ_true_item_wins

    # print(sum([v for v in true_picks_battle_items.values()]), total_hoopa_matches)

    true_pick_rate = []
    win_share = []
    true_wins = []
    true_picks = []
    true_win_rate = []
    move_1 = []
    move_2 = []
    move_sets = []
    name = []
    Pokemon = []
    Role = []
    HH_df = df_hoopa_all[df_hoopa_all['Move Set'] == 'Hyperspace Fury/Hyperspace Fury']
    HH_wins = HH_df['Win Count'].to_numpy()[0]

    HH_moveset = 'Hyperspace Fury/Hyperspace Fury'
    true_picks = []
    true_wins = []
    true_pick_rate = []
    true_win_rate = []
    for i, row in df_hoopa_all.iterrows():
        moveset = row['Move Set']
        if moveset == 'Total':
            continue
        Σ_true_picks = 0
        true_pick_per_item = []
        for item in items:
            if moveset == HH_moveset:
                true_picks.append(1e-9)
                true_wins.append(0)
                true_win_rate.append(0)
                true_pick_rate.append(0)
            else:
                item_picks = df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Pick Count'].to_numpy()[0]
                item_wins = df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['Win Count'].to_numpy()[0]
                HH_item_picks = df_hoopa_items[df_hoopa_items['Move Set'] == HH_moveset + ' - ' + item]['Pick Count'].to_numpy()[0]
                HH_item_wins = df_hoopa_items[df_hoopa_items['Move Set'] == HH_moveset + ' - ' + item]['Win Count'].to_numpy()[0]
                item_pick_rate_per_moveset = item_picks/true_picks_battle_items[item]
                pick_share_item = item_pick_rate_per_moveset * HH_item_picks
                true_picks.append(item_picks + pick_share_item)
                true_pick_per_item.append(item_picks + pick_share_item)
                Σ_true_picks += item_picks + pick_share_item
                win_share_item = item_pick_rate_per_moveset * HH_item_wins
                true_wins.append(item_wins + win_share_item)
                if (item_picks + pick_share_item) == 0:
                    true_win_rate.append(0.0)
                else:
                    true_win_rate.append((item_wins + win_share_item)/(item_picks + pick_share_item)*100)

        for i in range(5):
            if moveset == HH_moveset:
                continue
            else:
                total_true_picks = Σ_true_picks
                true_pick_rate.append(true_pick_per_item[i]/total_true_picks*100)
        #
        #
        move_sets.append(moveset)
        move_1_i, move_2_i = moveset.split('/')
        move_1.append('Moves/Hoopa' + ' - ' + move_1_i + '.png')
        move_2.append('Moves/Hoopa' + ' - ' + move_2_i + '.png')
        name.append('Hoopa')
        Pokemon.append('Pokemon/Hoopa.png')
        Role.append('Supporter')

    df_hoopa_items['True Win Rate'] = true_win_rate
    df_hoopa_items['True Pick Rate'] = true_pick_rate
    df_hoopa_items['True Wins'] = true_wins
    df_hoopa_items['True Picks'] = true_picks

    hoopa_dic_2['True Win Rate'] = []
    hoopa_dic_2['True Pick Rate'] = []
    hoopa_dic_2['True Wins'] = []
    hoopa_dic_2['True Picks'] = []
    for moveset in movesets:
        Σ_picks = 0
        Σ_wins = 0
        for item in items:
            Σ_picks += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['True Picks'].to_numpy()[0]
            Σ_wins += df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['True Wins'].to_numpy()[0]
        hoopa_dic_2['True Picks'].append(Σ_picks)
        hoopa_dic_2['True Wins'].append(Σ_wins)
        hoopa_dic_2['True Pick Rate'].append(Σ_picks/total_hoopa_matches*100)
        hoopa_dic_2['True Win Rate'].append(Σ_wins/Σ_picks*100)

    hoopa_dic_2['True Picks'].append(sum(hoopa_dic_2['True Picks']))
    hoopa_dic_2['True Wins'].append(sum(hoopa_dic_2['True Wins']))
    hoopa_dic_2['True Pick Rate'].append(hoopa_dic_2['True Picks'][-1] / total_matches * 100)
    hoopa_dic_2['True Win Rate'].append(hoopa_dic_2['True Wins'][-1] / hoopa_dic_2['True Picks'][-1] * 100)

    df_hoopa_all_2 = pd.DataFrame(hoopa_dic_2)

    # print(df_hoopa_all_2.to_string())

    battle_item_list_dict_2 = []
    # print(movesets)
    for moveset in movesets:
        battle_item_list_dict = []
        for item in items:
            if item == 'Random Item':
                continue
            else:
                item_dictionary = {'Battle Item': item,
                                   'Pick Rate': round(df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['True Pick Rate'].to_numpy()[0], 2),
                                   'Win Rate': round(df_hoopa_items[df_hoopa_items['Move Set'] == moveset + ' - ' + item]['True Win Rate'].to_numpy()[0], 2)}
                if item_dictionary['Pick Rate'] == 0.0 and moveset != 'Hyperspace Fury/Hyperspace Fury':
                    continue
                battle_item_list_dict.append(item_dictionary)

        if moveset == missing_moveset:
            find_lowest = {}
            for dictionary in battle_item_list_dict:
                find_lowest[dictionary['Battle Item']] = dictionary['Pick Rate']

            item_to_remove = min(find_lowest, key=find_lowest.get)

            battle_item_list_dict = [d for d in battle_item_list_dict if d["Battle Item"] != item_to_remove]
            
        battle_item_list_dict_2.append(battle_item_list_dict)

    #
    new_dic = {"Name": name,
               "Pokemon": Pokemon,
               "Move Set": move_sets,
               "Win Rate": np.round(np.array(hoopa_dic_2['True Win Rate'][:-1]), 4),
               "Pick Rate": np.round(np.array(hoopa_dic_2['True Pick Rate'][:-1]) * (pick_rate_dict['Hoopa'] / 100), 4), "Role": Role,
               "Move 1": move_1,
               "Move 2": move_2,
               "Battle Items": battle_item_list_dict_2
               }



    df = pd.DataFrame(new_dic)
    # print(df)
    df.drop(df[df['Move Set'] == 'Hyperspace Fury/Hyperspace Fury'].index, inplace=True)

    # print(df.to_string())

    return df


def fix_comfey_winrate(skillsets_pick_rate, skillsets_win_rate, total_pick_rate, total_win_rate, total_matches):
    total_comfey_matches = total_matches * total_pick_rate / 100

    skillsets_win_rate = np.array(skillsets_win_rate) / 100
    skillsets_picks_count = np.array(skillsets_pick_rate) / 100 * total_comfey_matches
    skillsets_wins_count = skillsets_picks_count * skillsets_win_rate

    true_picks = skillsets_picks_count[0] + skillsets_picks_count[1]
    true_wins = skillsets_wins_count[0] + skillsets_wins_count[1]

    true_pick_rate = true_picks / total_comfey_matches
    true_win_rate = true_wins / true_picks

    return true_pick_rate * 100, true_win_rate * 100


def fix_scyther_and_urshifu(movesets):

    indices = []
    for i, d in enumerate(movesets):
        if d['Name'] == 'Scizor':
            if d["Move 1"].split('-')[-1] == " Dual Wingbeat.png":
                indices.append(i)
    for i in indices:
        Pokemon_name = 'Scyther'
        movesets[i]['Name'] = Pokemon_name
        movesets[i]['Role'] = 'Speedster'
        movesets[i]['Pokemon'] = 'Pokemon/' + Pokemon_name + '.png'
        movesets[i]['Move 1'] = 'Moves/' + Pokemon_name + ' - ' + "Dual Wingbeat" + '.png'
        movesets[i]['Move 2'] = 'Moves/' + Pokemon_name + ' -' + movesets[i]['Move 2'].split('-')[-1]

    for i, d in enumerate(movesets):
        if d['Name'] == 'Urshifu':
            if d["Move 1"].split('-')[-1] == " Surging Strikes.png":
                movesets[i]['Pokemon'] = 'Pokemon/' + 'Urshifu_Rapid' + '.png'
            elif d["Move 1"].split('-')[-1] == " Wicked Blow.png":
                movesets[i]['Pokemon'] = 'Pokemon/' + 'Urshifu_Single' + '.png'
            else:
                continue

    return movesets


def fix_mega(movesets, pokemon_movesets, matches):


    moveset_0, moveset_1 = pokemon_movesets

    pick_rate_0 = moveset_0['Pick Rate']
    win_rate_0 = moveset_0['Win Rate']
    picks_0 = pick_rate_0 * matches
    wins_0 = picks_0*win_rate_0
    item_set_list_dict_0 = moveset_0['Battle Items']

    pick_rate_1 = moveset_1['Pick Rate']
    win_rate_1 = moveset_1['Win Rate']
    picks_1 = pick_rate_1 * matches
    wins_1 = picks_1*win_rate_1
    item_set_list_dict_1 = moveset_1['Battle Items']

    picks = picks_0 + picks_1
    wins = wins_0 + wins_1
    win_rate = wins/picks
    pick_rate = picks/matches

    item_set_list_dict_new = []

    for k in range(len(item_set_list_dict_0)):
        item = item_set_list_dict_0[k]['Battle Item']
        pick_rate_item_0 = item_set_list_dict_0[k]['Pick Rate']
        picks_item_0 = pick_rate_item_0 * picks_0
        win_rate_item_0 = item_set_list_dict_0[k]['Win Rate']
        wins_item_0 = picks_item_0 * win_rate_item_0

        pick_rate_item_1 = item_set_list_dict_1[k]['Pick Rate']
        picks_item_1 = pick_rate_item_1 * picks_1
        win_rate_item_1 = item_set_list_dict_1[k]['Win Rate']
        wins_item_1 = picks_item_1 * win_rate_item_1

        picks_item_total = picks_item_0 + picks_item_1
        wins_item_total = wins_item_0 + wins_item_1

        item_pick_rate = picks_item_total / picks
        item_win_rate = wins_item_total / picks_item_total

        item_set_dict = {
            'Battle Item': item,
            'Pick Rate': round(item_pick_rate, 2),
            'Win Rate': round(item_win_rate, 2),
        }
        item_set_list_dict_new.append(item_set_dict)

    moveset_i = {'Name': moveset_0['Name'], 'Pokemon': 'Pokemon/' + moveset_0['Name'] + '.png',
               'Role': moveset_0['Role'], 'Pick Rate': pick_rate,
               'Win Rate': win_rate, 'Move Set': moveset_0['Move Set'], 'Move 1': moveset_0['Move 1'],
               'Move 2': moveset_0['Move 2'], 'Battle Items': item_set_list_dict_new}

    movesets.remove(moveset_0)
    movesets.remove(moveset_1)

    movesets.append(moveset_i)

    return movesets
