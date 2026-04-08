# Unite_Builds

Static Pokemon Unite site for GitHub Pages, with local Python and Node tooling that scrapes and transforms source data into publishable assets.

## Project layout
- `index.html` and `static/` are the published site.
- `static/json/` contains generated site data consumed by the frontend.
- `data/` holds source snapshots and intermediate outputs used during scraping and transforms.
- `scripts/` contains local operators' scripts for scraping, image normalization, patch-history generation, and preview capture.

## Source vs generated vs published
- Source/operator files: `scripts/`, `data/`, workflow files, manifests, and local `.codex/` notes.
- Generated site data: `static/json/moveset_rows.json`, `static/json/pokemon_popup_details.json`, `static/json/pokemon_patch_history.json`, `static/json/pokemon_move_patch_history.json`, `static/json/site_metadata.json`.
- Build metadata: `data/json/uniteapi_roster.json` is the local roster contract for the manual Unite API saver and the moveset build.
- Local-only caches: large raw UniteDB snapshots such as `data/json/unite_db_pokemon.json`, `data/json/unite_db_held_items.json`, `data/json/unite_db_stats.json`, and `data/json/unite_db_patch_notes_raw.json` are useful for local refresh work but are not required to be committed.
- Published artifact: `index.html`, `static/`, `preview.png`, `favicon.ico`, `CNAME`, and the Google verification HTML file.

## Manual Unite API workflow
Unite API capture now defaults to requests-first with browser fallback:
1. `scripts/get_moveset_pages.py` runs in `--mode auto` by default.
2. It fetches `https://uniteapi.dev/meta` once, updates roster metadata, and tries requests capture for Pokemon pages.
3. If requests capture fails validation for specific pages, it falls back to Puppeteer for only those pages.
4. If a browser challenge page appears, solve it in the browser window and continue.
5. All capture modes write validated HTML snapshots into `data/html/` and `data/html/Pokemon_Sites/`.

Default auto capture:
```powershell
conda run -n Unite_Builds python scripts/get_moveset_pages.py
```

Direct requests capture:
```powershell
npm run capture:uniteapi:requests
```

Direct browser capture:
```powershell
npm run capture:uniteapi
```

Auto mode with resume (fetch only missing/invalid pages):
```powershell
conda run -n Unite_Builds python scripts/get_moveset_pages.py --resume
```

Capture a specific Pokemon page (auto mode):
```powershell
conda run -n Unite_Builds python scripts/get_moveset_pages.py --pokemon Inteleon
```

Force refresh even when the source date is unchanged:
```powershell
conda run -n Unite_Builds python scripts/get_moveset_pages.py --force-refresh
```

Low-traffic note: the requests capture path is date-gated by default (source date from meta page). If the source date is unchanged, full Pokemon refresh is skipped unless `--force-refresh` is set. Unite API also exposes `/_next/data/<buildId>/en/...json` endpoints, but their `pageProps.a/e` payload is custom-encoded and is not used by this workflow yet.

## Windows scheduled updater + one-click publish
Use this if you want a weekly watcher that retries daily until Unite API updates, then auto-builds and pushes to `main`.

One-time task install (daily 6:00 AM local machine time):
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install_unite_update_task.ps1
```

Manual one-click run:
- Double-click `Run-UniteBuilds-Update.cmd` in repo root, or run:
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run_unite_weekly_update.ps1 -Manual
```

How the cycle works:
1. Sunday run sets `pending_update_cycle=true`.
2. Daily scheduled runs at 6:00 AM continue while pending.
3. If source date is unchanged, it exits and retries next day.
4. When source date changes, it runs `capture -> build_site -> smoke`, stages curated outputs, commits, and pushes to `origin/main`.
5. On success, it sets `pending_update_cycle=false` and waits until next Sunday.

State and logs:
- State: `data/tmp/unite_update_state.json`
- Logs: `data/tmp/unite_update_logs/*.log`

Troubleshooting:
- Runner enforces git preconditions: `main` branch, non-detached HEAD, clean working tree, and fast-forwardable pull.
- Scheduled mode is requests-only capture (no browser challenge fallback).

## Build/update flow
Use the repo-named Conda environment when available.

1. Refresh saved Unite API HTML manually with:
```powershell
conda run -n Unite_Builds python scripts/get_moveset_pages.py
```
2. Refresh the local UniteDB JSON snapshots when popup details need updating:
```powershell
conda run -n Unite_Builds python scripts/fetch_unite_db_snapshots.py
```
3. Run the standard post-scrape build with:
```powershell
conda run -n Unite_Builds python scripts/build_site.py
```
4. If you only want the Unite API table rebuild, run:
```powershell
conda run -n Unite_Builds python scripts/Scrape_Winrates.py
```
If you need to proceed with partial data (warnings instead of strict preflight failure), run:
```powershell
conda run -n Unite_Builds python scripts/Scrape_Winrates.py --allow-missing
```
5. If you only want to rebuild popup detail data from the cached UniteDB snapshot, run:
```powershell
conda run -n Unite_Builds python scripts/scrape_unite_db.py
```
6. Refresh patch-history JSON with:
```powershell
npm run build:patch-history
```
7. Run the local smoke test with:
```powershell
npm test
```
8. Refresh the social/share preview image with:
```powershell
npm run preview
```

`data/json/unite_db_battle_items.json` stays committed because `scripts/Scrape_Winrates.py` currently reads it directly.

## Local environment
- Python dependencies are declared in `environment.yml`.
- Node is only used for local helper scripts such as patch-history generation and `preview.png` capture.
- `npm test` now runs a Puppeteer smoke test that serves the repo locally, verifies the table renders, and opens both move and Pokemon popups.
- Because the frontend uses `fetch()` for JSON assets, serve the repo over HTTP for local browser testing instead of relying on `file://`.

Example:
```powershell
conda run -n Unite_Builds python -m http.server 8000
```

## GitHub Pages deployment
GitHub Pages is deployed by Actions from a staged site-only artifact.

The deploy workflow uploads only the files the site actually needs, instead of publishing the entire repository. Source folders like `data/` and `scripts/` stay in the repo but are not included in the Pages artifact.

The Pages workflow now also runs the local Puppeteer smoke test before staging the site artifact, so a broken table or popup render will block deployment.
