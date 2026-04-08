#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const puppeteer = require("puppeteer");

const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_HTML_DIR = path.join(REPO_ROOT, "data", "html");
const POKEMON_SITES_DIR = path.join(DATA_HTML_DIR, "Pokemon_Sites");
const META_HTML_PATH = path.join(DATA_HTML_DIR, "Unite API _ Pok\u00e9mon Unite Meta Tierlist.html");
const ROSTER_JSON_PATH = path.join(REPO_ROOT, "data", "json", "uniteapi_roster.json");
const PROFILE_DIR = path.join(REPO_ROOT, "data", "tmp", "uniteapi_puppeteer_profile");

const PAGELESS_POKEMON = new Set([
  "Mega Charizard X",
  "Mega Charizard Y",
  "Mega Gyarados",
  "Mega Lucario",
]);

const DISPLAY_NAME_OVERRIDES = {
  Ninetales: "Alolan Ninetales",
  Raichu: "Alolan Raichu",
  MrMime: "Mr. Mime",
  Urshifu_Single: "Urshifu",
  HoOh: "Ho-Oh",
  Meowscara: "Meowscarada",
  Rapidash: "Galarian Rapidash",
  MEGALucario: "Mega Lucario",
  CharizardX: "Mega Charizard X",
  CharizardY: "Mega Charizard Y",
  MegaGyarados: "Mega Gyarados",
  MewtwoY: "Mewtwo Y",
  MewtwoX: "Mewtwo X",
  Sirfetch: "Sirfetch'd",
};

const UNITEAPI_SLUG_OVERRIDES = {
  Ninetales: "alolanninetales",
  Raichu: "alolanraichu",
  MrMime: "mrmime",
  Urshifu_Single: "urshifu",
  HoOh: "ho-oh",
  "Ho-Oh": "ho-oh",
  Rapidash: "galarianrapidash",
  MEGALucario: "megalucario",
  CharizardX: "charizardx",
  CharizardY: "charizardy",
  MegaGyarados: "megagyarados",
  MewtwoY: "mewtwoy",
  MewtwoX: "mewtwox",
  Sirfetch: "sirfetch'd",
  "Sirfetch'd": "sirfetch'd",
};

const CHALLENGE_MARKERS = [
  "just a moment",
  "verify you are human",
  "attention required",
  "cf-browser-verification",
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function normalizeDisplayName(rawName) {
  return DISPLAY_NAME_OVERRIDES[rawName] || rawName;
}

function buildSlug(rawName, displayName) {
  if (UNITEAPI_SLUG_OVERRIDES[rawName]) {
    return UNITEAPI_SLUG_OVERRIDES[rawName];
  }
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseArgs(argv) {
  const options = {
    resume: false,
    pokemon: [],
    headful: true,
    retries: 3,
    allowRosterAdditions: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--resume") {
      options.resume = true;
      continue;
    }
    if (arg === "--pokemon") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--pokemon requires a value");
      }
      value
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => options.pokemon.push(token));
      i += 1;
      continue;
    }
    if (arg === "--headful") {
      options.headful = true;
      continue;
    }
    if (arg === "--headless" || arg === "--no-headful") {
      options.headful = false;
      continue;
    }
    if (arg === "--retries") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--retries must be a positive integer");
      }
      options.retries = value;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-roster-additions") {
      options.allowRosterAdditions = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log("Usage: node scripts/capture_uniteapi_pages.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  --resume                Skip pages that already validate");
  console.log("  --pokemon <name[,name]> Capture only the selected Pokemon page(s)");
  console.log("  --headful               Run a headed browser (default)");
  console.log("  --headless              Run headless");
  console.log("  --retries <n>           Capture retries per page (default: 3)");
  console.log("  --no-roster-additions   Do not append unknown entries to uniteapi_roster.json");
  console.log("  -h, --help              Show this help");
}

function loadJson(pathValue, fallbackValue = {}) {
  if (!fs.existsSync(pathValue)) {
    return fallbackValue;
  }
  return JSON.parse(fs.readFileSync(pathValue, "utf8"));
}

function saveJson(pathValue, payload) {
  fs.mkdirSync(path.dirname(pathValue), { recursive: true });
  fs.writeFileSync(pathValue, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function decodeImageKey(src, prefix) {
  let decoded = src || "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = src || "";
  }

  if (decoded.includes("url=")) {
    decoded = decoded.split("url=", 2)[1].split("&", 1)[0];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Keep best-effort decode.
    }
  }

  const filename = decoded.split("/").pop() || "";
  const stem = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return stem.startsWith(prefix) ? stem.slice(prefix.length) : "";
}

function extractMetaEntriesFromHtml(html) {
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  const entries = [];
  const seen = new Set();
  let match = imgRegex.exec(html);

  while (match) {
    const imageKey = decodeImageKey(match[1], "t_Square_");
    if (imageKey) {
      const displayName = normalizeDisplayName(imageKey);
      if (!seen.has(displayName)) {
        seen.add(displayName);
        entries.push({
          display_name: displayName,
          raw_name: imageKey,
          uniteapi_name: buildSlug(imageKey, displayName),
          square_image_key: imageKey,
          square_image_url: `https://uniteapi.dev/Sprites/t_Square_${imageKey}.png`,
        });
      }
    }
    match = imgRegex.exec(html);
  }

  return entries;
}

function updateRosterFromMetaHtml(metaHtml, { allowRosterAdditions = true } = {}) {
  const existingRoster = loadJson(ROSTER_JSON_PATH, {});
  const entries = extractMetaEntriesFromHtml(metaHtml);
  if (!entries.length) {
    return { roster: existingRoster, added: [] };
  }

  const roster = {};
  const added = [];

  for (const entry of entries) {
    const alreadyExists = Boolean(existingRoster[entry.display_name]);
    if (!alreadyExists && !allowRosterAdditions) {
      continue;
    }

    const existingEntry = existingRoster[entry.display_name] || {};
    roster[entry.display_name] = {
      display_name: entry.display_name,
      uniteapi_name: entry.uniteapi_name,
      role: existingEntry.role || "",
      square_image_key: entry.square_image_key,
    };
    if (!alreadyExists) {
      added.push(entry.display_name);
    }
  }

  const oldSerialized = JSON.stringify(existingRoster);
  const newSerialized = JSON.stringify(roster);
  if (oldSerialized !== newSerialized) {
    saveJson(ROSTER_JSON_PATH, roster);
  }

  return { roster, added };
}

function isProbablyBinary(buffer) {
  if (!buffer || !buffer.length) {
    return true;
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let controlCount = 0;
  for (const value of sample) {
    if (value === 0x00) {
      return true;
    }
    const isControl = value < 0x09 || (value > 0x0d && value < 0x20) || value === 0x7f;
    if (isControl) {
      controlCount += 1;
    }
  }

  return controlCount / sample.length > 0.25;
}

function isChallengeHtml(html) {
  const lower = html.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker));
}

function validateCapturedHtml(html, { kind, pokemonName }) {
  const lower = html.toLowerCase();
  if (!lower.includes("<html")) {
    return { valid: false, reason: "missing <html> tag" };
  }
  if (isChallengeHtml(lower)) {
    return { valid: false, reason: "challenge page detected" };
  }
  if (!lower.includes("unite api")) {
    return { valid: false, reason: "missing expected Unite API marker" };
  }

  if (kind === "meta") {
    const hasMetaMarkers = lower.includes("pick rate") && lower.includes("win rate") && lower.includes("t_square_");
    if (!hasMetaMarkers) {
      return { valid: false, reason: "meta page is missing expected rate markers" };
    }
    return { valid: true };
  }

  const hasPokemonMarkers = lower.includes("pick rate") && lower.includes("win rate");
  if (!hasPokemonMarkers) {
    return { valid: false, reason: `${pokemonName} page is missing pick/win markers` };
  }
  if (!lower.includes("t_skill_")) {
    return { valid: false, reason: `${pokemonName} page is missing move image markers (t_Skill_)` };
  }

  return { valid: true };
}

function validateExistingFile(targetPath, context) {
  if (!fs.existsSync(targetPath)) {
    return { valid: false, reason: "file does not exist" };
  }

  const bytes = fs.readFileSync(targetPath);
  if (isProbablyBinary(bytes)) {
    return { valid: false, reason: "file looks binary" };
  }

  const html = bytes.toString("utf8");
  return validateCapturedHtml(html, context);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function waitForEnterPrompt(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(`${prompt}\nPress Enter when the page is ready to continue... `, () => resolve());
  });
}

async function captureHtmlWithChallengeHandling(page, url, label, state, rl) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
  await sleep(1200);

  let html = await page.content();
  if (!isChallengeHtml(html)) {
    return html;
  }

  if (!state.promptedChallenge) {
    state.promptedChallenge = true;
    console.log(`Challenge detected while opening ${label}.`);
    await waitForEnterPrompt(
      rl,
      "Please solve the challenge in the opened browser window."
    );
    await sleep(800);
  } else {
    await sleep(2000);
  }

  html = await page.content();
  return html;
}

async function capturePageToDisk(page, target) {
  const { url, label, path: targetPath, context, retries, challengeState, rl } = target;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  let lastReason = "unknown failure";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    console.log(`Capturing ${label} (attempt ${attempt}/${retries})`);
    const html = await captureHtmlWithChallengeHandling(page, url, label, challengeState, rl);
    const validation = validateCapturedHtml(html, context);
    if (validation.valid) {
      fs.writeFileSync(targetPath, html, "utf8");
      return { captured: true, reason: null };
    }
    lastReason = validation.reason;
    console.log(`  Invalid capture for ${label}: ${validation.reason}`);
    await sleep(1200);
    await page.reload({ waitUntil: "networkidle2", timeout: 120000 }).catch(() => null);
  }

  return { captured: false, reason: lastReason };
}

function normalizeNameForLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function filterRoster(roster, selectedPokemonNames) {
  if (!selectedPokemonNames.length) {
    return roster;
  }

  const requested = new Set(selectedPokemonNames.map(normalizeNameForLookup));
  const filtered = {};
  for (const [name, entry] of Object.entries(roster)) {
    if (requested.has(normalizeNameForLookup(name))) {
      filtered[name] = entry;
    }
  }
  return filtered;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  fs.mkdirSync(POKEMON_SITES_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(ROSTER_JSON_PATH), { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: options.headful ? false : "new",
    userDataDir: PROFILE_DIR,
    defaultViewport: { width: 1440, height: 1000 },
  });

  const rl = createReadline();
  const page = await browser.newPage();
  const challengeState = { promptedChallenge: false };
  const failures = [];

  const summary = {
    captured: 0,
    skipped: 0,
    placeholders: 0,
    failed: 0,
  };

  try {
    const metaContext = { kind: "meta", pokemonName: null };
    const metaValidation = options.resume ? validateExistingFile(META_HTML_PATH, metaContext) : { valid: false };
    let metaHtml;
    if (metaValidation.valid) {
      summary.skipped += 1;
      metaHtml = fs.readFileSync(META_HTML_PATH, "utf8");
      console.log("Reusing existing valid meta page");
    } else {
      const result = await capturePageToDisk(page, {
        url: "https://uniteapi.dev/meta",
        label: "Main Meta Page",
        path: META_HTML_PATH,
        context: metaContext,
        retries: options.retries,
        challengeState,
        rl,
      });
      if (!result.captured) {
        throw new Error(`Failed to capture Main Meta Page: ${result.reason}`);
      }
      metaHtml = fs.readFileSync(META_HTML_PATH, "utf8");
      summary.captured += 1;
    }

    const rosterResult = updateRosterFromMetaHtml(metaHtml, {
      allowRosterAdditions: options.allowRosterAdditions,
    });
    if (rosterResult.added.length) {
      console.log(`Added missing roster entries: ${rosterResult.added.join(", ")}`);
    }

    const selectedRoster = filterRoster(rosterResult.roster, options.pokemon);
    if (options.pokemon.length && !Object.keys(selectedRoster).length) {
      throw new Error("No matching Pokemon names were found in uniteapi_roster.json");
    }

    for (const [name, entry] of Object.entries(selectedRoster).sort((a, b) => a[0].localeCompare(b[0]))) {
      const slug = entry.uniteapi_name || buildSlug(name, name);
      if (slug === "scyther") {
        continue;
      }

      if (PAGELESS_POKEMON.has(name) || slug.startsWith("mega")) {
        const placeholderPath = path.join(POKEMON_SITES_DIR, `Unite API _ Pok\u00e9mon Unite Meta for ${name}.txt`);
        if (!fs.existsSync(placeholderPath)) {
          fs.writeFileSync(placeholderPath, "", "utf8");
        }
        summary.placeholders += 1;
        continue;
      }

      const targetPath = path.join(POKEMON_SITES_DIR, `Unite API _ Pok\u00e9mon Unite Meta for ${name}.html`);
      const context = { kind: "pokemon", pokemonName: name };
      const existingValidation = options.resume ? validateExistingFile(targetPath, context) : { valid: false };
      if (existingValidation.valid) {
        summary.skipped += 1;
        continue;
      }

      const url = `https://uniteapi.dev/meta/pokemon-unite-meta-for-${slug}`;
      const result = await capturePageToDisk(page, {
        url,
        label: name,
        path: targetPath,
        context,
        retries: options.retries,
        challengeState,
        rl,
      });
      if (!result.captured) {
        failures.push(`${name}: ${result.reason}`);
        summary.failed += 1;
        continue;
      }
      summary.captured += 1;
    }
  } finally {
    rl.close();
    await browser.close();
  }

  console.log("\nCapture Summary");
  console.log(`  Captured pages: ${summary.captured}`);
  console.log(`  Reused pages: ${summary.skipped}`);
  console.log(`  Placeholder pages: ${summary.placeholders}`);
  console.log(`  Failed pages: ${summary.failed}`);

  if (failures.length) {
    console.log("\nFailed Pages:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
