from __future__ import annotations

import quopri
import re
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
HTML_MIN_MARKERS = ("<html", "unite api")
CHALLENGE_MARKERS = (
    "just a moment",
    "verify you are human",
    "attention required",
    "cf-browser-verification",
)


def is_probably_binary_blob(blob: bytes) -> bool:
    if not blob:
        return True
    if blob.startswith(PNG_SIGNATURE):
        return True

    sample = blob[:4096]
    control_count = 0
    for value in sample:
        if value == 0:
            return True
        is_control = value < 9 or (13 < value < 32) or value == 127
        if is_control:
            control_count += 1

    return (control_count / len(sample)) > 0.25


def looks_like_challenge_html(html: str) -> bool:
    lower_html = html.lower()
    return any(marker in lower_html for marker in CHALLENGE_MARKERS)


def _score_html_candidate(text: str) -> int:
    lower = text.lower()
    markers = ("<html", "</html", "<body", "unite api", "pick rate", "win rate", "t_square_", "t_skill_")
    score = sum(1 for marker in markers if marker in lower)
    if lower.count("<") > 10:
        score += 1
    encoded_token_count = len(re.findall(r"=[0-9a-f]{2}", lower))
    soft_break_count = lower.count("=\n") + lower.count("=\r\n")
    score -= (encoded_token_count // 6) + (soft_break_count * 2)
    return score


def decode_saved_html(path: Path | str) -> str:
    path = Path(path)
    blob = path.read_bytes()
    if is_probably_binary_blob(blob):
        raise ValueError(f"{path} is binary and not a valid saved HTML file")

    direct_text = blob.decode("utf-8", errors="ignore")
    qp_text = quopri.decodestring(blob).decode("utf-8", errors="ignore")

    direct_score = _score_html_candidate(direct_text)
    qp_score = _score_html_candidate(qp_text)
    if qp_score > direct_score:
        return qp_text
    return direct_text


def validate_uniteapi_html_content(
    html: str,
    *,
    is_meta: bool,
    pokemon_name: str | None = None,
    require_moves: bool = True,
) -> str | None:
    lower_html = html.lower()

    if not all(marker in lower_html for marker in HTML_MIN_MARKERS):
        return "missing expected HTML markers"

    if looks_like_challenge_html(lower_html):
        return "challenge/interstitial page detected"

    if is_meta:
        has_meta_markers = "pick rate" in lower_html and "win rate" in lower_html and "t_square_" in lower_html
        if not has_meta_markers:
            return "missing expected meta rate markers"
        return None

    has_page_markers = "pick rate" in lower_html and "win rate" in lower_html
    if not has_page_markers:
        return "missing expected Pokemon page rate markers"

    if require_moves and "t_skill_" not in lower_html:
        display_name = pokemon_name or "Pokemon"
        return f"{display_name} page is missing move markers (t_Skill_)"

    return None
