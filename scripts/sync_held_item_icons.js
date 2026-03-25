const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO_ROOT = path.resolve(__dirname, "..");
const UNITE_DB_POKEMON_PATH = path.join(REPO_ROOT, "data", "json", "unite_db_pokemon.json");
const HELD_ITEM_ICON_DIR = path.join(REPO_ROOT, "static", "img", "Held_Items");
const CDN_BASE = "https://d275t8dp8rxb42.cloudfront.net/items/held";
const HELD_ITEM_ALIASES = new Map([
  ["EXP Share", "Exp Share"]
]);

function encodePathSegment(value) {
  return encodeURIComponent(String(value || "").trim())
    .replace(/%20/g, " ");
}

function normalizeHeldItemName(value) {
  const itemName = String(value || "").trim();
  return HELD_ITEM_ALIASES.get(itemName) || itemName;
}

function getHeldItemRecords(pokemonEntries) {
  const seen = new Set();
  const records = [];

  for (const pokemonEntry of pokemonEntries || []) {
    for (const build of pokemonEntry.builds || []) {
      const itemNames = [
        ...(Array.isArray(build.held_items) ? build.held_items : []),
        build.held_items_optional
      ].filter(Boolean);

      for (const itemName of itemNames) {
        const normalizedItemName = normalizeHeldItemName(itemName);
        if (!normalizedItemName || seen.has(normalizedItemName)) {
          continue;
        }

        seen.add(normalizedItemName);
        records.push({
          itemName: normalizedItemName,
          fileName: `${normalizedItemName}.png`,
          outputPath: path.join(HELD_ITEM_ICON_DIR, `${normalizedItemName}.png`),
          url: `${CDN_BASE}/${encodePathSegment(normalizedItemName)}.png`
        });
      }
    }
  }

  return records;
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ((response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400 && response.headers.location) {
        response.resume();
        resolve(downloadFile(response.headers.location, outputPath));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Request failed for ${url}: ${response.statusCode}`));
        return;
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const fileStream = fs.createWriteStream(outputPath);
      response.pipe(fileStream);
      fileStream.on("finish", () => fileStream.close(resolve));
      fileStream.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function main() {
  const pokemonEntries = JSON.parse(fs.readFileSync(UNITE_DB_POKEMON_PATH, "utf8"));
  const records = getHeldItemRecords(pokemonEntries);
  const missingRecords = records.filter((record) => !fs.existsSync(record.outputPath));

  if (missingRecords.length === 0) {
    console.log("No missing held-item icons found.");
    return;
  }

  const failures = [];
  for (const record of missingRecords) {
    try {
      await downloadFile(record.url, record.outputPath);
      console.log(`Downloaded ${record.fileName}`);
    } catch (error) {
      failures.push({ record, message: error.message });
    }
  }

  console.log(`Downloaded ${missingRecords.length - failures.length} of ${missingRecords.length} missing held-item icons.`);

  if (failures.length > 0) {
    failures.forEach((failure) => {
      console.error(`Failed to download ${failure.record.fileName}: ${failure.message}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
