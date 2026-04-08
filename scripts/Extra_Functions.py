import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
MOVESETS_CSV_PATH = REPO_ROOT / "data" / "csv" / "movesets.csv"
MOVESET_ROWS_JSON_PATH = REPO_ROOT / "static" / "json" / "moveset_rows.json"
MATCHES_TXT_PATH = REPO_ROOT / "data" / "txt" / "matches.txt"
UNITE_META_CSV_PATH = REPO_ROOT / "data" / "csv" / "Unite_Meta.csv"
UNITE_DB_POKEMON_JSON_PATH = REPO_ROOT / "data" / "json" / "unite_db_pokemon.json"
MAIN_MOVE_FALLBACKS_PATH = REPO_ROOT / "data" / "json" / "main_move_fallbacks.json"
POKEMON_POPUP_DETAILS_PATH = REPO_ROOT / "static" / "json" / "pokemon_popup_details.json"
HIDDEN_MOVESET_EXCLUSIONS = {
    "Mew",
    "Blaziken",
    "Mega Charizard X",
    "Mega Charizard Y",
    "Mega Gyarados",
    "Mega Lucario",
    "Scizor",
    "Scyther",
    "Urshifu",
}
TIER_SCORE_CONFIG = {
    "model": "trusted-gated-log-trust-normalized",
    "displayCutoff": 1.0,
    "outlierFenceMultiplier": 1.5,
    "trustPivot": 1.0,
    "trustSharpness": 0.25,
    "winWeight": 0.8,
    "pickWeight": 0.25,
    "banWeight": 0.005,
    "banScale": 2.0,
    "bands": [
        {"label": "A+", "threshold": 0.8333333333333334},
        {"label": "A", "threshold": 0.6666666666666666},
        {"label": "A-", "threshold": 0.5},
        {"label": "B+", "threshold": 0.3333333333333333},
        {"label": "B", "threshold": 0.16666666666666666},
        {"label": "B-", "threshold": 0.0},
        {"label": "C+", "threshold": -0.16666666666666666},
        {"label": "C", "threshold": -0.3333333333333333},
        {"label": "C-", "threshold": -0.5},
        {"label": "D+", "threshold": -0.6666666666666666},
        {"label": "D", "threshold": -0.8333333333333334},
        {"label": "D-", "threshold": -1.0},
    ],
}
HELD_ITEM_NAME_ALIASES = {
    "EXP Share": "Exp Share",
}
POKEMON_NAME_ALIASES = {
    "alolanninetales": "ninetales",
    "alolanraichu": "raichu",
    "galarianrapidash": "rapidash",
}
ALL_MAIN_MOVE_TOKEN = "all"


def normalize_build_key(value):
    return "".join(character.lower() for character in str(value or "") if character.isalnum())


def normalize_held_item_name(value):
    item_name = str(value or "").strip()
    return HELD_ITEM_NAME_ALIASES.get(item_name, item_name)


def empty_recommended_build():
    return {
        "name": None,
        "heldItems": [],
        "altHeldItem": None,
        "altHeldItems": [],
    }


def normalize_pokemon_key(value):
    normalized = normalize_build_key(value)
    return POKEMON_NAME_ALIASES.get(normalized, normalized)


def load_total_matches():
    if not MATCHES_TXT_PATH.exists():
        return 0.0

    with open(MATCHES_TXT_PATH, "r", encoding="utf-8") as f:
        raw_value = f.read().strip()

    try:
        return float(raw_value)
    except ValueError:
        return 0.0


def load_unite_meta_ban_rates():
    if not UNITE_META_CSV_PATH.exists():
        return {}

    meta_df = pd.read_csv(UNITE_META_CSV_PATH)
    if "Pokemon" not in meta_df.columns or "Ban Rate" not in meta_df.columns:
        return {}

    meta_df = meta_df.copy()
    meta_df["_normalized_name"] = meta_df["Pokemon"].map(normalize_pokemon_key)
    meta_df["Ban Rate"] = pd.to_numeric(meta_df["Ban Rate"], errors="coerce").fillna(0.0)
    return meta_df.groupby("_normalized_name")["Ban Rate"].mean().to_dict()


def safe_zscore(values):
    series = pd.to_numeric(pd.Series(values), errors="coerce").fillna(0.0)
    std = float(series.std(ddof=0))
    if np.isclose(std, 0.0):
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - float(series.mean())) / std


def normalize_signed_range(values, trusted_mask=None):
    series = pd.to_numeric(pd.Series(values), errors="coerce").fillna(0.0)
    if trusted_mask is not None:
        trusted_series = series[pd.Series(trusted_mask, index=series.index).fillna(False)]
        if len(trusted_series) >= 2:
            minimum = float(trusted_series.min())
            maximum = float(trusted_series.max())
        else:
            minimum = float(series.min()) if len(series) else 0.0
            maximum = float(series.max()) if len(series) else 0.0
    else:
        minimum = float(series.min()) if len(series) else 0.0
        maximum = float(series.max()) if len(series) else 0.0
    if np.isclose(maximum, minimum):
        return pd.Series(np.zeros(len(series)), index=series.index)
    scaled = (series - minimum) / (maximum - minimum)
    return (scaled * 2.0) - 1.0


def tukey_fences(values, multiplier=1.5):
    series = pd.to_numeric(pd.Series(values), errors="coerce").dropna()
    if series.empty:
        return None, None

    q1 = float(series.quantile(0.25))
    q3 = float(series.quantile(0.75))
    iqr = q3 - q1
    if np.isclose(iqr, 0.0):
        return q1, q3

    fence_multiplier = max(float(multiplier), 0.0)
    lower = q1 - (fence_multiplier * iqr)
    upper = q3 + (fence_multiplier * iqr)
    return lower, upper


def score_to_tier(score):
    if score > 1.0:
        return "S"
    if score < -1.0:
        return "F"

    for band in TIER_SCORE_CONFIG.get("bands", []):
        if score >= band["threshold"]:
            return band["label"]
    return "F"


def compute_tier_raw_score(df):
    win_rates = pd.to_numeric(df["Win Rate"], errors="coerce").fillna(0.0)
    pick_rates = pd.to_numeric(df["Pick Rate"], errors="coerce").fillna(0.0)
    ban_rates = pd.to_numeric(df["Ban Rate"], errors="coerce").fillna(0.0)

    win_z = safe_zscore(win_rates)
    pick_z = safe_zscore(pick_rates)
    ban_z = safe_zscore(ban_rates)
    trust_pivot = max(float(TIER_SCORE_CONFIG.get("trustPivot", 1.0)), 0.05)
    trust_sharpness = max(float(TIER_SCORE_CONFIG.get("trustSharpness", 0.25)), 0.05)
    pick_trust = np.tanh(np.log(np.clip(pick_rates, 0.05, None) / trust_pivot) / trust_sharpness)
    trust_factor = (pick_trust + 1.0) / 2.0
    ban_scale = max(float(TIER_SCORE_CONFIG.get("banScale", 2.0)), 0.01)
    ban_signal = np.tanh(ban_z / ban_scale)
    return (
        trust_factor
        * (
            float(TIER_SCORE_CONFIG["winWeight"]) * win_z
            + float(TIER_SCORE_CONFIG["pickWeight"]) * pick_z
        )
        + float(TIER_SCORE_CONFIG["banWeight"]) * ban_signal
    )


def add_tier_estimates(df):
    df = df.copy()
    if df.empty:
        df["Tier"] = pd.Series(dtype="object")
        df["Tier Raw Score"] = pd.Series(dtype="float64")
        df["Tier Score"] = pd.Series(dtype="float64")
        return df

    ban_rate_lookup = load_unite_meta_ban_rates()
    df["_normalized_name"] = df["Name"].map(normalize_pokemon_key)
    df["Ban Rate"] = df["_normalized_name"].map(ban_rate_lookup).fillna(0.0)

    tier_raw_score = compute_tier_raw_score(df)
    display_cutoff = float(TIER_SCORE_CONFIG.get("displayCutoff", 1.0))
    fence_multiplier = float(TIER_SCORE_CONFIG.get("outlierFenceMultiplier", 1.5))
    trusted_mask = pd.to_numeric(df["Pick Rate"], errors="coerce").fillna(0.0) >= display_cutoff
    trusted_raw_scores = tier_raw_score[trusted_mask]
    lower_fence, upper_fence = tukey_fences(trusted_raw_scores, fence_multiplier)
    if lower_fence is None or upper_fence is None:
        trusted_inlier_mask = trusted_mask
    else:
        trusted_inlier_mask = trusted_mask & tier_raw_score.between(lower_fence, upper_fence)

    tier_score = normalize_signed_range(tier_raw_score, trusted_mask=trusted_inlier_mask)

    df["Tier Raw Score"] = tier_raw_score.round(3)
    df["Tier"] = tier_score.map(score_to_tier)
    df["Tier Score"] = tier_score.round(3)
    return df.drop(columns=["_normalized_name"], errors="ignore")


def finalize_recommended_build(build_variants):
    if not build_variants:
        return empty_recommended_build()

    primary_variant = build_variants[0]
    primary_items = [normalize_held_item_name(item) for item in primary_variant.get("held_items", []) if item][:3]
    if len(primary_items) < 3:
        return empty_recommended_build()
    alt_items = []

    def add_alt_item(item_name):
        normalized = normalize_held_item_name(item_name)
        if not normalized or normalized in primary_items or normalized in alt_items:
            return
        alt_items.append(normalized)

    add_alt_item(primary_variant.get("held_items_optional"))

    for variant in build_variants[1:]:
        for item_name in variant.get("held_items", []) or []:
            add_alt_item(item_name)
        add_alt_item(variant.get("held_items_optional"))

    return {
        "name": primary_variant.get("name") or None,
        "heldItems": primary_items,
        "altHeldItem": alt_items[0] if alt_items else None,
        "altHeldItems": alt_items,
    }


def load_main_move_fallbacks():
    if not MAIN_MOVE_FALLBACKS_PATH.exists():
        return {}

    with open(MAIN_MOVE_FALLBACKS_PATH, "r", encoding="utf-8") as handle:
        fallback_entries = json.load(handle)

    normalized_fallbacks = {}
    for pokemon_name, move_names in fallback_entries.items():
        if isinstance(move_names, str):
            move_names = [move_names]

        normalized_fallbacks[normalize_pokemon_key(pokemon_name)] = [
            normalize_build_key(move_name)
            for move_name in move_names
            if normalize_build_key(move_name)
        ]

    return normalized_fallbacks


def load_unite_db_build_lookup():
    if not UNITE_DB_POKEMON_JSON_PATH.exists():
        return {}, {}, {}

    with open(UNITE_DB_POKEMON_JSON_PATH, "r", encoding="utf-8") as handle:
        pokemon_entries = json.load(handle)

    pair_variants_lookup = defaultdict(list)
    pokemon_build_lookup = defaultdict(list)
    for pokemon_entry in pokemon_entries:
        pokemon_names = {
            normalize_pokemon_key(pokemon_entry.get("display_name")),
            normalize_pokemon_key(pokemon_entry.get("name")),
        }
        pokemon_names.discard("")

        for build in pokemon_entry.get("builds", []):
            upgrade_moves = tuple(
                normalize_build_key(move_name)
                for move_name in build.get("upgrade", [])
                if normalize_build_key(move_name)
            )

            for pokemon_name in pokemon_names:
                pair_variants_lookup[(pokemon_name, upgrade_moves)].append(build)

    build_lookup = {}
    unordered_build_lookup = {}
    for (pokemon_name, upgrade_moves), build_variants in pair_variants_lookup.items():
        recommended_build = finalize_recommended_build(build_variants)
        if len(upgrade_moves) == 2:
            build_lookup[(pokemon_name, upgrade_moves)] = recommended_build
            unordered_build_lookup.setdefault(
                (pokemon_name, tuple(sorted(upgrade_moves))),
                recommended_build,
            )
        pokemon_build_lookup[pokemon_name].append({
            "upgradeMoves": upgrade_moves,
            "upgradeMoveNames": tuple(build.get("upgrade", [])),
            "recommendedBuild": recommended_build,
        })

    return build_lookup, unordered_build_lookup, pokemon_build_lookup


def load_move_display_lookup():
    display_lookup = {}

    sources = []
    if MOVESETS_CSV_PATH.exists():
        sources.append(MOVESETS_CSV_PATH)
    if MOVESET_ROWS_JSON_PATH.exists():
        sources.append(MOVESET_ROWS_JSON_PATH)

    for source_path in sources:
        try:
            if source_path.suffix.lower() == ".csv":
                frame = pd.read_csv(source_path)
                move_sets = frame["Move Set"].dropna() if "Move Set" in frame.columns else []
            else:
                with open(source_path, "r", encoding="utf-8") as handle:
                    rows = json.load(handle)
                move_sets = [
                    row.get("Move Set")
                    for row in rows
                    if isinstance(row, dict) and row.get("Move Set")
                ]
        except Exception:
            continue

        for move_set in move_sets:
            for move_name in str(move_set).split("/"):
                normalized_move = normalize_build_key(move_name)
                if normalized_move and normalized_move not in display_lookup:
                    display_lookup[normalized_move] = move_name.strip()

    return display_lookup


def load_pokemon_popup_move_grids():
    if not POKEMON_POPUP_DETAILS_PATH.exists():
        return {}

    move_display_lookup = load_move_display_lookup()
    with open(POKEMON_POPUP_DETAILS_PATH, "r", encoding="utf-8") as handle:
        popup_details = json.load(handle)

    move_grid_lookup = {}
    for pokemon_name, pokemon_entry in popup_details.items():
        if not isinstance(pokemon_entry, dict):
            continue

        move_1 = pokemon_entry.get("Move 1")
        move_2 = pokemon_entry.get("Move 2")
        if not isinstance(move_1, dict) or not isinstance(move_2, dict):
            continue

        slot1_moves = [
            move_display_lookup.get(normalize_build_key((move_1.get("Upgrade 1") or {}).get("Name")), (move_1.get("Upgrade 1") or {}).get("Name")),
            move_display_lookup.get(normalize_build_key((move_1.get("Upgrade 2") or {}).get("Name")), (move_1.get("Upgrade 2") or {}).get("Name")),
        ]
        slot2_moves = [
            move_display_lookup.get(normalize_build_key((move_2.get("Upgrade 1") or {}).get("Name")), (move_2.get("Upgrade 1") or {}).get("Name")),
            move_display_lookup.get(normalize_build_key((move_2.get("Upgrade 2") or {}).get("Name")), (move_2.get("Upgrade 2") or {}).get("Name")),
        ]
        if not all(slot1_moves) or not all(slot2_moves):
            continue

        move_grid_lookup[normalize_pokemon_key(pokemon_name)] = {
            "slot1Moves": slot1_moves,
            "slot2Moves": slot2_moves,
            "pairs": [(slot1_move, slot2_move) for slot1_move in slot1_moves for slot2_move in slot2_moves],
        }

    return move_grid_lookup


def backfill_hidden_movesets(movesets, matches, pick_rate_dict, win_rate_dict):
    movesets_by_name = defaultdict(list)
    for moveset in movesets:
        movesets_by_name[moveset.get("Name")].append(moveset)

    move_grid_lookup = load_pokemon_popup_move_grids()
    total_matches = float(matches or 0.0)
    synthetic_movesets = []

    for pokemon_name, pokemon_movesets in movesets_by_name.items():
        if pokemon_name in HIDDEN_MOVESET_EXCLUSIONS:
            continue

        pair_rows = []
        first_moves = []
        second_moves = []
        for moveset in pokemon_movesets:
            move_parts = [part.strip() for part in str(moveset.get("Move Set") or "").split("/") if part.strip()]
            if len(move_parts) != 2:
                break
            pair_rows.append(tuple(move_parts))
            first_moves.append(move_parts[0])
            second_moves.append(move_parts[1])
        else:
            pokemon_pick_rate = float(pick_rate_dict.get(pokemon_name, 0.0) or 0.0)
            pokemon_win_rate = float(win_rate_dict.get(pokemon_name, 0.0) or 0.0)
            total_pokemon_picks = (pokemon_pick_rate / 100.0) * total_matches
            total_pokemon_wins = total_pokemon_picks * (pokemon_win_rate / 100.0)
            observed_picks = sum(float(moveset.get("Pick Rate", 0.0) or 0.0) / 100.0 * total_matches for moveset in pokemon_movesets)
            observed_wins = sum(
                (float(moveset.get("Pick Rate", 0.0) or 0.0) / 100.0)
                * total_matches
                * (float(moveset.get("Win Rate", 0.0) or 0.0) / 100.0)
                for moveset in pokemon_movesets
            )
            missing_picks = max(total_pokemon_picks - observed_picks, 0.0)
            missing_wins = max(total_pokemon_wins - observed_wins, 0.0)
            move_grid = move_grid_lookup.get(normalize_pokemon_key(pokemon_name))
            if len(pokemon_movesets) == 3:
                unique_first_moves = list(dict.fromkeys(first_moves))
                unique_second_moves = list(dict.fromkeys(second_moves))
                if len(unique_first_moves) != 2 or len(unique_second_moves) != 2:
                    continue

                existing_pairs = set(pair_rows)
                missing_pairs = [
                    (first_move, second_move)
                    for first_move in unique_first_moves
                    for second_move in unique_second_moves
                    if (first_move, second_move) not in existing_pairs
                ]
                if len(missing_pairs) != 1:
                    continue

                missing_pair_weights = [1.0]
                missing_move_names = list(missing_pairs[0])
            elif len(pokemon_movesets) == 2 and move_grid and len(move_grid.get("pairs", [])) == 4:
                visible_pairs = set(pair_rows)
                missing_pairs = [pair for pair in move_grid["pairs"] if pair not in visible_pairs]
                if len(missing_pairs) != 2:
                    continue

                visible_firsts = set(first_moves)
                visible_seconds = set(second_moves)
                if len(visible_firsts) == 1 and len(visible_seconds) == 2:
                    visible_second_pick_rates = {
                        pair[1]: float(row.get("Pick Rate", 0.0) or 0.0)
                        for pair, row in zip(pair_rows, pokemon_movesets)
                    }
                    missing_pair_weights = [
                        visible_second_pick_rates.get(pair[1], 0.0)
                        for pair in missing_pairs
                    ]
                elif len(visible_seconds) == 1 and len(visible_firsts) == 2:
                    visible_first_pick_rates = {
                        pair[0]: float(row.get("Pick Rate", 0.0) or 0.0)
                        for pair, row in zip(pair_rows, pokemon_movesets)
                    }
                    missing_pair_weights = [
                        visible_first_pick_rates.get(pair[0], 0.0)
                        for pair in missing_pairs
                    ]
                else:
                    missing_pair_weights = [1.0, 1.0]
                if not any(weight > 0 for weight in missing_pair_weights):
                    missing_pair_weights = [1.0 for _ in missing_pairs]
                missing_move_names = [list(pair) for pair in missing_pairs]
            else:
                continue

            weight_total = float(sum(missing_pair_weights)) if missing_pair_weights else 0.0
            if weight_total <= 0:
                continue

            target_pick_rate_total = round((missing_picks / total_matches * 100.0), 2) if total_matches > 0 else 0.0
            row_specs = []
            for pair, weight in zip(missing_pairs, missing_pair_weights):
                estimated_picks = missing_picks * (float(weight) / weight_total)
                estimated_pick_rate = (estimated_picks / total_matches * 100.0) if total_matches > 0 else 0.0
                estimated_win_rate = (missing_wins / missing_picks * 100.0) if missing_picks > 0 else pokemon_win_rate
                row_specs.append({
                    "Name": pokemon_name,
                    "Pokemon": f"Pokemon/{pokemon_name}.png",
                    "Role": pokemon_movesets[0].get("Role"),
                    "Pick Rate": estimated_pick_rate,
                    "Win Rate": estimated_win_rate,
                    "Move Set": f"{pair[0]}/{pair[1]}",
                    "Move 1": f"Moves/{pokemon_name} - {pair[0]}.png",
                    "Move 2": f"Moves/{pokemon_name} - {pair[1]}.png",
                    "Battle Items": [],
                })

            rounded_pick_rates = [round(spec["Pick Rate"], 2) for spec in row_specs]
            if rounded_pick_rates:
                rounded_pick_rates[-1] = round(target_pick_rate_total - sum(rounded_pick_rates[:-1]), 2)
                for spec, pick_rate in zip(row_specs, rounded_pick_rates):
                    spec["Pick Rate"] = pick_rate
                    spec["Win Rate"] = round(spec["Win Rate"], 2)
                    synthetic_movesets.append(spec)

    if not synthetic_movesets:
        return movesets

    return movesets + synthetic_movesets


def get_recommended_build(
    move_set_name,
    pokemon_name,
    build_lookup,
    unordered_build_lookup,
    pokemon_build_lookup,
    main_move_fallbacks,
):
    move_names = [normalize_build_key(part) for part in str(move_set_name or "").split("/") if normalize_build_key(part)]

    pokemon_key = normalize_pokemon_key(pokemon_name)
    candidate_builds = pokemon_build_lookup.get(pokemon_key, [])
    pokemon_main_moves = main_move_fallbacks.get(pokemon_key, [])

    if ALL_MAIN_MOVE_TOKEN in pokemon_main_moves and candidate_builds:
        return candidate_builds[0]["recommendedBuild"]

    if len(move_names) != 2:
        return empty_recommended_build()

    exact_match = build_lookup.get((pokemon_key, tuple(move_names)))
    if exact_match:
        return exact_match

    unordered_match = unordered_build_lookup.get((pokemon_key, tuple(sorted(move_names))))
    if unordered_match:
        return unordered_match

    for candidate in candidate_builds:
        candidate_moves = candidate["upgradeMoves"]
        if len(candidate_moves) == 1 and candidate_moves[0] in move_names:
            return candidate["recommendedBuild"]

    row_main_moves = [move_name for move_name in move_names if move_name in pokemon_main_moves]
    for main_move in row_main_moves:
        for candidate in candidate_builds:
            if main_move in candidate["upgradeMoves"]:
                return candidate["recommendedBuild"]

    for candidate in candidate_builds:
        if len(candidate["upgradeMoves"]) == 0:
            return candidate["recommendedBuild"]

    for candidate in candidate_builds:
        recommended_build = candidate["recommendedBuild"]
        if recommended_build.get("heldItems"):
            return recommended_build

    return empty_recommended_build()


def sanitize_for_json(value):
    if isinstance(value, dict):
        return {key: sanitize_for_json(inner_value) for key, inner_value in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(inner_value) for inner_value in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(inner_value) for inner_value in value]
    if isinstance(value, np.ndarray):
        return [sanitize_for_json(inner_value) for inner_value in value.tolist()]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, (float, np.floating)) and pd.isna(value):
        return None
    return value


def build_moveset_rows(df):
    build_lookup, unordered_build_lookup, pokemon_build_lookup = load_unite_db_build_lookup()
    main_move_fallbacks = load_main_move_fallbacks()
    df = add_tier_estimates(df)
    df = df.sort_values(by='Name').reset_index(drop=True)
    df['Pick Rate'] = df['Pick Rate'].round(2)
    df['Win Rate'] = df['Win Rate'].round(2)
    static_columns = ["Name", "Pokemon", "Role", "Move Set", "Move 1", "Move 2", "Tier", "Tier Raw Score", "Tier Score", "Win Rate", "Pick Rate"]
    final_data = []

    for _, row in df.iterrows():
        moveset_entry = {col: row[col] for col in static_columns}
        battle_items = row["Battle Items"] if isinstance(row["Battle Items"], list) else []
        moveset_entry["recommendedBuild"] = get_recommended_build(
            row.get("Move Set"),
            row.get("Name"),
            build_lookup,
            unordered_build_lookup,
            pokemon_build_lookup,
            main_move_fallbacks,
        )

        for idx, item_row in enumerate(battle_items, 1):
            item_name = item_row.get("Battle Item")
            moveset_entry[f"Item {idx}"] = f"Battle_Items/{item_name}.png" if item_name else None
            moveset_entry[f"Win Rate {idx}"] = item_row.get("Win Rate")
            moveset_entry[f"Pick Rate {idx}"] = item_row.get("Pick Rate")

        final_data.append(sanitize_for_json(moveset_entry))

    return final_data


def organize_df(df, column_titles):
    df = df.reindex(columns=column_titles)
    json_ready_data = build_moveset_rows(df)

    csv_static_columns = ["Name", "Pokemon", "Role", "Move Set", "Move 1", "Move 2", "Tier", "Tier Raw Score", "Tier Score", "Win Rate", "Pick Rate"]
    item_columns = []
    max_items = max((len(row.get("Battle Items", [])) for _, row in df.iterrows()), default=0)
    for idx in range(1, max_items + 1):
        item_columns.extend([f"Item {idx}", f"Win Rate {idx}", f"Pick Rate {idx}"])

    csv_columns = csv_static_columns + item_columns
    csv_df = pd.DataFrame(json_ready_data).reindex(columns=csv_columns)

    MOVESETS_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    csv_df.to_csv(
        MOVESETS_CSV_PATH,
        index=False,
        quoting=1,
    )

    MOVESET_ROWS_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MOVESET_ROWS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(json_ready_data, f, indent=2, allow_nan=False)
        f.write("\n")
    return json_ready_data

def fix_special_cases(movesets, matches, pick_rate_dict, win_rate_dict):

    blaziken_movesets = []
    mew_movesets = []
    for moveset in movesets:
        Pokemon_name = moveset['Name']

        if Pokemon_name == 'Blaziken':
            blaziken_movesets.append(moveset)
        elif Pokemon_name == 'Mew':
            mew_movesets.append(moveset)

    movesets = fix_blaziken(movesets, blaziken_movesets, matches)
    # movesets = fix_mega(movesets, mega_lucario_movesets, matches)
    movesets = fix_mew(movesets, mew_movesets, matches, pick_rate_dict, win_rate_dict)
    movesets = fix_scyther_and_urshifu(movesets)
    movesets = backfill_hidden_movesets(movesets, matches, pick_rate_dict, win_rate_dict)

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
        parsed = ast.literal_eval(cell)
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

    print(pokemon_movesets)
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
