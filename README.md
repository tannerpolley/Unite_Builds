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
`scripts/get_moveset_pages.py` intentionally stays manual and GUI-driven.

Unite API blocks normal request-based scraping, so the workflow is:
1. Open a browser yourself so the site is visible on screen.
2. Run the PyAutoGUI script locally.
3. Let it navigate, save HTML pages with `Ctrl+S`, and write those source snapshots into `data/html/`.

That manual browser-save path is expected behavior for this repo.

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
8. Refresh the local social/share preview image from the current worktree with:
```powershell
npm run preview
```

`data/json/unite_db_battle_items.json` stays committed because `scripts/Scrape_Winrates.py` currently reads it directly.

## Local environment
- Python dependencies are declared in `environment.yml`.
- Node is only used for local helper scripts such as patch-history generation and local `preview.png` capture.
- `npm test` now runs a Puppeteer smoke test that serves the repo locally, verifies the table renders, and opens both move and Pokemon popups.
- Because the frontend uses `fetch()` for JSON assets, serve the repo over HTTP for local browser testing instead of relying on `file://`.

Example:
```powershell
conda run -n Unite_Builds python -m http.server 8000
```

## Codex worktree helper
Use `scripts/codex-worktree.ps1` from any worktree clone to bootstrap and run the common local actions:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action status
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action build
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action smoke
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action preview
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action serve
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/codex-worktree.ps1 -Action patch-history
```

The default `setup` action verifies the repo-named Conda environment when available and runs `npm ci` unless `-SkipNpmInstall` is set. The GitHub Actions workflow at `.github/workflows/codex-checks.yml` mirrors the same smoke/build path on pull requests and pushes to `main`.

## GitHub Pages deployment
GitHub Pages is deployed by Actions from a staged site-only artifact.

The deploy workflow uploads only the files the site actually needs, instead of publishing the entire repository. Source folders like `data/` and `scripts/` stay in the repo but are not included in the Pages artifact.

The Pages workflow now also runs the local Puppeteer smoke test before staging the site artifact, so a broken table or popup render will block deployment.

## Vercel deployment
Vercel is now configured in-repo for the same staged static artifact model used by GitHub Pages.

- `vercel.json` tells Vercel to run `npm run stage:site` and publish `_site/`.
- `scripts/stage_site.js` stages only the public site files: `index.html`, `static/`, `preview.png`, `favicon.ico`, `CNAME`, and the Google verification HTML file when present.
- `.vercel/` is ignored because Vercel CLI stores local project linkage metadata there.

Recommended Vercel setup:

1. Import this GitHub repo into Vercel.
2. Keep the repo root as the project root.
3. Let Vercel use the repo `vercel.json` settings instead of overriding Build Command or Output Directory in the dashboard.
4. Add `unitebuilds.com` as the production domain in Vercel once the project is linked.

This keeps GitHub as the source of truth for code and PRs, while Vercel adds preview deployments for branches and pull requests.
