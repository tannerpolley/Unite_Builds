# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the main entry point for the static site.
- `static/css/` holds stylesheets, `static/js/` holds client-side logic, and `static/json/` contains data consumed by the UI.
- `static/img/` stores Pokemon, move, and item images referenced by the UI.
- `data/` contains scraped/source datasets (`csv/`, `html/`, `txt/`) plus `battle_items.json`.
- `scripts/` includes Python utilities for scraping/transforming data and a Puppeteer screenshot script.
- `assets/` and `preview.png` hold site artwork/preview assets used for sharing.

## Build, Test, and Development Commands
- `npm run preview`: Uses Puppeteer (`scripts/screenshot.js`) to capture a fresh `preview.png` from the deployed site.
- `npm test`: Placeholder; currently exits with an error (no automated tests configured).
- Local viewing: open `index.html` directly or serve the repo with a static server (for example, `python -m http.server`).

## Coding Style & Naming Conventions
- Indentation: 2 spaces in HTML/CSS/JS (match existing files).
- JavaScript: use `const`/`let`, double-quoted strings, and keep DOM selectors near usage for readability.
- Data files: keep structured JSON in `static/json/` and source data in `data/`; prefer descriptive snake-case filenames.

## Testing Guidelines
- No automated test framework is set up.
- Validate changes by loading the site and checking filtering, sorting, and popups with real data in `static/json/`.

## Commit & Pull Request Guidelines
- Git history could not be read in this environment (safe directory restriction), so no established commit style was detected.
- Use short, imperative commit subjects (for example, "Update move details data") and include a clear PR description.
- For UI changes, include a screenshot or updated `preview.png`; link related issues when applicable.

## Data & Scraping Notes
- Scraping/refresh scripts live in `scripts/` and generally update `data/` and `static/json/` outputs.
- Keep generated assets (images/JSON) in their existing folders to avoid breaking `static/js/` lookups.
