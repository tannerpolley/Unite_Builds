const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO_ROOT = path.resolve(__dirname, "..");
const POPUP_DETAILS_PATH = path.join(REPO_ROOT, "static", "json", "pokemon_popup_details.json");
const MOVE_ICON_DIR = path.join(REPO_ROOT, "static", "img", "Moves");
const CDN_BASE = "https://d275t8dp8rxb42.cloudfront.net/skills";

function encodePathSegment(value) {
  return encodeURIComponent(String(value || "").trim())
    .replace(/%20/g, " ");
}

function getMoveRecords(popupDetails) {
  const records = [];
  const seen = new Set();

  for (const [pokemonName, details] of Object.entries(popupDetails || {})) {
    for (const slotName of ["Move 1", "Move 2"]) {
      const slot = details?.[slotName];
      if (!slot || typeof slot !== "object") {
        continue;
      }

      const moveNames = [];
      if (slot.Name) {
        moveNames.push(slot.Name);
      }

      for (const key of Object.keys(slot)) {
        if (/^Upgrade/.test(key) && slot[key]?.Name) {
          moveNames.push(slot[key].Name);
        }
      }

      for (const moveName of moveNames) {
        const fileName = `${pokemonName} - ${moveName}.png`;
        if (seen.has(fileName)) {
          continue;
        }
        seen.add(fileName);
        records.push({
          pokemonName,
          moveName,
          fileName,
          outputPath: path.join(MOVE_ICON_DIR, fileName),
          url: `${CDN_BASE}/${encodePathSegment(pokemonName)}/${encodePathSegment(moveName)}.png`
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
  const popupDetails = JSON.parse(fs.readFileSync(POPUP_DETAILS_PATH, "utf8"));
  const moveRecords = getMoveRecords(popupDetails);
  const missingRecords = moveRecords.filter((record) => !fs.existsSync(record.outputPath));

  if (missingRecords.length === 0) {
    console.log("No missing move icons found.");
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

  console.log(`Downloaded ${missingRecords.length - failures.length} of ${missingRecords.length} missing move icons.`);

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
