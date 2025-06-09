import json
from pathlib import Path

def build_all_pokemon_detailed(input_path: str, output_path: str) -> None:
    """
    Load 'data/pokemon.json' and write a detailed JSON for every Pokémon,
    using multiple fallbacks to find passive descriptions (passive2_description,
    rsb2.true_desc, rsb.true_desc, or 'description').
    """
    with open(input_path, "r", encoding="utf8") as f:
        all_pokemon = json.load(f)

    detailed = {}
    missing_logs = []

    def fmt_cd(val):
        return f"{val}s" if val else ""

    for entry in all_pokemon:
        poke_name = entry.get("name")
        if not poke_name:
            continue

        data = {}
        missing = []

        # 1) Passive Ability
        passive_skill = next((s for s in entry.get("skills", []) if s.get("ability") == "Passive"), None)
        if passive_skill:
            p_name = ""
            p_desc = ""
            # If "passive2_name" exists, use that on name
            if passive_skill.get("passive2_name"):
                p_name = passive_skill["passive2_name"]
                # Try: passive2_description first
                p_desc = passive_skill.get("passive2_description", "").strip()
                if not p_desc:
                    # Fallback 1: rsb2.true_desc + notes
                    rsb2 = passive_skill.get("rsb2", {})
                    p2_true = rsb2.get("true_desc", "").strip()
                    p2_notes = rsb2.get("notes", "").strip()
                    if p2_true:
                        p_desc = p2_true + (f" {p2_notes}" if p2_notes else "")
                    else:
                        # Fallback 2: rsb.true_desc + notes
                        rsb = passive_skill.get("rsb", {})
                        p_true = rsb.get("true_desc", "").strip()
                        p_notes = rsb.get("notes", "").strip()
                        if p_true:
                            p_desc = p_true + (f" {p_notes}" if p_notes else "")
                        else:
                            # Fallback 3: passive_skill["description"]
                            p_desc = passive_skill.get("description", "").strip()
                            if not p_desc:
                                missing.append("Passive Ability")
                                p_desc = "Description not available."
            else:
                # No passive2; use single passive fields
                p_name = passive_skill.get("name", "")
                rsb = passive_skill.get("rsb", {})
                p_true = rsb.get("true_desc", "").strip()
                p_notes = rsb.get("notes", "").strip()
                if p_true:
                    p_desc = p_true + (f" {p_notes}" if p_notes else "")
                else:
                    p_desc = passive_skill.get("description", "").strip()
                    if not p_desc:
                        missing.append("Passive Ability")
                        p_desc = "Description not available."
            data["Passive Ability"] = {"Name": p_name, "Description": p_desc}

        # 2) Basic Attack
        basic = next((s for s in entry.get("skills", []) if s.get("ability") == "Basic"), None)
        if basic:
            rsb = basic.get("rsb", {})
            b_true = rsb.get("true_desc", "").strip()
            b_notes = rsb.get("notes", "").strip()
            if b_true:
                b_desc = b_true + (f" {b_notes}" if b_notes else "")
            else:
                b_desc = basic.get("description", "").strip()
                if not b_desc:
                    missing.append("Attack")
                    b_desc = "Description not available."
            data["Attack"] = b_desc

        # 3) Move 1
        move1 = next((s for s in entry.get("skills", []) if s.get("ability") == "Move 1"), None)
        if move1:
            m1 = {
                "Name": move1.get("name", ""),
                "Level": "1 or 3",
                "Cooldown": fmt_cd(move1.get("cd", ""))
            }
            rsb = move1.get("rsb", {})
            m1_true = rsb.get("true_desc", "").strip()
            m1_notes = rsb.get("notes", "").strip()
            if m1_true:
                m1_desc = m1_true + (f" {m1_notes}" if m1_notes else "")
            else:
                m1_desc = move1.get("description", "").strip()
                if not m1_desc:
                    missing.append("Move 1")
                    m1_desc = "Description not available."
            m1["Description"] = m1_desc

            for idx, up in enumerate(move1.get("upgrades", []), start=1):
                key = f"Upgrade {idx}"
                rsb_up = up.get("rsb", {})
                up_name = up.get("name", "")
                up_level = up.get("level1", "").strip()
                up_cd = fmt_cd(up.get("cd1", ""))

                up_desc = up.get("description1", "").strip() or rsb_up.get("true_desc", "").strip()
                if not up_desc:
                    missing.append(f"Move 1 {key} description1")
                    up_desc = "Description not available."
                up_notes = rsb_up.get("notes", "").strip()
                if up_notes:
                    up_desc += f" {up_notes}"

                up_enh_desc = rsb_up.get("enhanced_true_desc", "").strip()
                if not up_enh_desc:
                    up_enh_desc = up.get("description2", "").strip()
                    if not up_enh_desc:
                        missing.append(f"Move 1 {key} enhanced_true_desc/description2")
                        up_enh_desc = "Description not available."
                up_enh_lvl = up.get("level2", "").strip()

                m1[key] = {
                    "Name": up_name,
                    "Level": up_level,
                    "Cooldown": up_cd,
                    "Description": up_desc,
                    "Enhanced Level": up_enh_lvl,
                    "Enhanced Descprition": up_enh_desc
                }
            data["Move 1"] = m1

        # 4) Move 2
        move2 = next((s for s in entry.get("skills", []) if s.get("ability") == "Move 2"), None)
        if move2:
            m2 = {
                "Name": move2.get("name", ""),
                "Level": "1 or 3",
                "Cooldown": fmt_cd(move2.get("cd", ""))
            }
            rsb = move2.get("rsb", {})
            m2_true = rsb.get("true_desc", "").strip()
            m2_notes = rsb.get("notes", "").strip()
            if m2_true:
                m2_desc = m2_true + (f" {m2_notes}" if m2_notes else "")
            else:
                m2_desc = move2.get("description", "").strip()
                if not m2_desc:
                    missing.append("Move 2")
                    m2_desc = "Description not available."
            m2["Description"] = m2_desc

            for idx, up in enumerate(move2.get("upgrades", []), start=1):
                key = f"Upgrade {idx}"
                rsb_up = up.get("rsb", {})
                up_name = up.get("name", "")
                up_level = up.get("level1", "").strip()
                up_cd = fmt_cd(up.get("cd1", ""))

                up_desc = up.get("description1", "").strip() or rsb_up.get("true_desc", "").strip()
                if not up_desc:
                    missing.append(f"Move 2 {key} description1")
                    up_desc = "Description not available."
                up_notes = rsb_up.get("notes", "").strip()
                if up_notes:
                    up_desc += f" {up_notes}"

                up_enh_desc = rsb_up.get("enhanced_true_desc", "").strip()
                if not up_enh_desc:
                    up_enh_desc = up.get("description2", "").strip()
                    if not up_enh_desc:
                        missing.append(f"Move 2 {key} enhanced_true_desc/description2")
                        up_enh_desc = "Description not available."
                up_enh_lvl = up.get("level2", "").strip()

                m2[key] = {
                    "Name": up_name,
                    "Level": up_level,
                    "Cooldown": up_cd,
                    "Description": up_desc,
                    "Enhanced Level": up_enh_lvl,
                    "Enhanced Descprition": up_enh_desc
                }
            data["Move 2"] = m2

        # 5) Unite Move
        unite = next((s for s in entry.get("skills", []) if s.get("ability") == "Unite Move"), None)
        if unite:
            rsb = unite.get("rsb", {})
            u_true = rsb.get("true_desc", "").strip() or unite.get("description", "").strip()
            if not u_true:
                missing.append("Unite Move")
                u_true = "Description not available."
            data["Unite Move"] = {
                "Name": unite.get("name", ""),
                "Level": unite.get("level", "").strip(),
                "Cooldown": fmt_cd(unite.get("cd", "")),
                "Description": u_true,
                "Buffs": unite.get("buffs", "").strip()
            }

        if data:
            detailed[poke_name] = data
            if missing:
                missing_logs.append(f"{poke_name}: missing → {', '.join(missing)}")

    for log in missing_logs:
        print(log)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf8") as out_f:
        json.dump(detailed, out_f, ensure_ascii=False, indent=2)

    print(f"Wrote detailed moves for {len(detailed)} Pokémon to '{output_path}'.")


if __name__ == "__main__":
    build_all_pokemon_detailed(
        input_path="data/pokemon.json",
        output_path="data/all_pokemon_detailed.json"
    )
