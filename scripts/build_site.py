from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def run_step(command: list[str], label: str) -> None:
    print(f"[build_site] {label}")
    result = subprocess.run(command, cwd=REPO_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"{label} failed with exit code {result.returncode}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the standard post-scrape site build.")
    parser.add_argument(
        "--skip-patch-history",
        action="store_true",
        help="Skip refreshing patch history JSON via the Node helper.",
    )
    parser.add_argument(
        "--skip-popup-details",
        action="store_true",
        help="Skip rebuilding popup detail JSON from the UniteDB snapshot.",
    )
    parser.add_argument(
        "--skip-image-formatting",
        action="store_true",
        help="Pass through to scripts/Scrape_Winrates.py.",
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="Pass through to scripts/Scrape_Winrates.py.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.skip_popup_details:
        print("[build_site] Skipped popup detail refresh")
    else:
        run_step([sys.executable, str(REPO_ROOT / "scripts" / "scrape_unite_db.py")], "Refreshing popup detail data")

    scrape_command = [sys.executable, str(REPO_ROOT / "scripts" / "Scrape_Winrates.py")]
    if args.skip_image_formatting:
        scrape_command.append("--skip-image-formatting")
    if args.skip_preflight:
        scrape_command.append("--skip-preflight")

    run_step(scrape_command, "Rebuilding moveset data")

    node = shutil.which("node")
    if node:
        run_step([node, str(REPO_ROOT / "scripts" / "sync_held_item_icons.js")], "Syncing held item icons")
    else:
        print("[build_site] Skipped held item icon sync (node not found)")

    if args.skip_patch_history:
        print("[build_site] Skipped patch history refresh")
        return

    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("npm is required for patch history refresh. Re-run with --skip-patch-history if needed.")

    run_step([npm, "run", "build:patch-history"], "Refreshing patch history")


if __name__ == "__main__":
    main()
