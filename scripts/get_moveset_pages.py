from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REQUESTS_CAPTURE_SCRIPT_PATH = REPO_ROOT / "scripts" / "capture_uniteapi_requests.py"
BROWSER_CAPTURE_SCRIPT_PATH = REPO_ROOT / "scripts" / "capture_uniteapi_pages.js"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture Unite API meta and Pokemon pages (requests-first with browser fallback)."
    )
    parser.add_argument(
        "--mode",
        choices=("auto", "requests", "browser"),
        default="auto",
        help="Capture mode. auto=requests first then browser fallback for failed pages.",
    )
    parser.add_argument("--resume", action="store_true", help="Skip pages that already validate.")
    parser.add_argument(
        "--pokemon",
        action="append",
        default=[],
        help="Capture only selected Pokemon page(s). May be provided multiple times.",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Bypass source-date gate and force Pokemon page refresh.",
    )
    parser.add_argument("--headless", action="store_true", help="Run browser fallback headless.")
    parser.add_argument("--headful", action="store_true", help="Run browser fallback headed.")
    parser.add_argument("--retries", type=int, default=None, help="Retry count per page/request.")
    parser.add_argument("--max-workers", type=int, default=None, help="Requests capture worker count.")
    parser.add_argument("--timeout", type=float, default=None, help="Requests capture timeout in seconds.")
    return parser.parse_args()


def build_requests_command(
    args: argparse.Namespace,
    *,
    allow_partial: bool = False,
    failed_output: Path | None = None,
) -> list[str]:
    if not REQUESTS_CAPTURE_SCRIPT_PATH.exists():
        raise FileNotFoundError(f"Missing requests capture script: {REQUESTS_CAPTURE_SCRIPT_PATH}")

    command = [sys.executable, str(REQUESTS_CAPTURE_SCRIPT_PATH)]

    if args.resume:
        command.append("--resume")

    for pokemon_name in args.pokemon:
        command.extend(["--pokemon", pokemon_name])

    if args.force_refresh:
        command.append("--force-refresh")

    if args.retries is not None:
        if args.retries < 1:
            raise ValueError("--retries must be a positive integer")
        command.extend(["--retries", str(args.retries)])

    if args.max_workers is not None:
        if args.max_workers < 1:
            raise ValueError("--max-workers must be a positive integer")
        command.extend(["--max-workers", str(args.max_workers)])

    if args.timeout is not None:
        if args.timeout <= 0:
            raise ValueError("--timeout must be positive")
        command.extend(["--timeout", str(args.timeout)])

    if allow_partial:
        command.append("--allow-partial")

    if failed_output is not None:
        command.extend(["--failed-output", str(failed_output)])

    return command


def build_browser_command(
    args: argparse.Namespace,
    *,
    pokemon_override: list[str] | None = None,
    resume_override: bool | None = None,
    no_roster_additions: bool = False,
) -> list[str]:
    if not BROWSER_CAPTURE_SCRIPT_PATH.exists():
        raise FileNotFoundError(f"Missing browser capture script: {BROWSER_CAPTURE_SCRIPT_PATH}")

    command = ["node", str(BROWSER_CAPTURE_SCRIPT_PATH)]

    should_resume = args.resume if resume_override is None else resume_override
    if should_resume:
        command.append("--resume")

    pokemon_targets = args.pokemon if pokemon_override is None else pokemon_override
    for pokemon_name in pokemon_targets:
        command.extend(["--pokemon", pokemon_name])

    if args.headless:
        command.append("--headless")
    elif args.headful:
        command.append("--headful")

    if args.retries is not None:
        if args.retries < 1:
            raise ValueError("--retries must be a positive integer")
        command.extend(["--retries", str(args.retries)])

    if no_roster_additions:
        command.append("--no-roster-additions")

    return command


def load_failed_targets(path: Path) -> list[str]:
    if not path.exists():
        return []

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if isinstance(payload, list):
        return [str(item) for item in payload if str(item).strip()]

    if isinstance(payload, dict):
        failed = payload.get("failed_pokemon", [])
        if isinstance(failed, list):
            return [str(item) for item in failed if str(item).strip()]

    return []


def run_command(command: list[str]) -> int:
    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    return result.returncode


def main() -> None:
    args = parse_args()

    if args.mode == "browser":
        raise SystemExit(run_command(build_browser_command(args)))

    if args.mode == "requests":
        raise SystemExit(run_command(build_requests_command(args)))

    failed_output_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="uniteapi_failed_", suffix=".json", delete=False) as handle:
            failed_output_path = Path(handle.name)

        requests_return = run_command(
            build_requests_command(args, allow_partial=True, failed_output=failed_output_path)
        )
        failed_targets = load_failed_targets(failed_output_path)

        if failed_targets:
            print(
                "Requests capture failed for "
                f"{len(failed_targets)} page(s); running browser fallback for those targets."
            )
            browser_return = run_command(
                build_browser_command(
                    args,
                    pokemon_override=failed_targets,
                    resume_override=False,
                    no_roster_additions=True,
                )
            )
            if browser_return != 0:
                raise SystemExit(browser_return)

        if requests_return != 0 and not failed_targets:
            print("Requests capture hit a fatal error; running browser capture for the requested scope.")
            browser_return = run_command(build_browser_command(args, no_roster_additions=True))
            raise SystemExit(browser_return)

        raise SystemExit(0)
    finally:
        if failed_output_path is not None:
            failed_output_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
