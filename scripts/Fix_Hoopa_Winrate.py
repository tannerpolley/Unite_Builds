import numpy as np
import pandas as pd
from collections import defaultdict
from pprint import pprint




def fix_hoopa_winrate(df_hoopa, total_pick_rate, total_win_rate, pick_rate_dict, total_matches):

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
        picks = avg_pick_rate/100*total_picks
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
