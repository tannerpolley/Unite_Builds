import pandas as pd
import json


def ensure_list(cell):
    try:
        parsed = eval(cell)
        return parsed if isinstance(parsed, list) else [cell]
    except:
        return [cell]


# Load and process the CSV
df = pd.read_csv("all_movesets.csv")
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
with open("data.js", "w", encoding="utf-8") as f:
    f.write("const items = ")
    json.dump(final_data, f, indent=2)
    f.write(";")
