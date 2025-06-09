# Script 2: clean_pokemon_json.py
import json
from pathlib import Path

def remove_blank_values(obj):
    """
    Recursively remove keys with empty-string values from dicts,
    and filter out empty strings from lists.
    """
    if isinstance(obj, dict):
        return {
            k: remove_blank_values(v)
            for k, v in obj.items()
            if v != "" and remove_blank_values(v) is not None
        }
    elif isinstance(obj, list):
        cleaned = [remove_blank_values(x) for x in obj]
        return [x for x in cleaned if x is not None and x != "" and (not (isinstance(x, (dict, list)) and not x))]
    else:
        return obj

def clean_pokemon_json(input_path: str, output_path: str) -> None:
    """
    Load 'data/pokemon.json', remove any fields whose value is a blank string,
    and write out a cleaned version.
    """
    with open(input_path, "r", encoding="utf8") as f:
        data = json.load(f)

    cleaned = remove_blank_values(data)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf8") as out_f:
        json.dump(cleaned, out_f, ensure_ascii=False, indent=2)

    print(f"Wrote cleaned JSON to '{output_path}'.")


if __name__ == "__main__":
    clean_pokemon_json(
        input_path="data/pokemon.json",
        output_path="data/pokemon.json"
    )
