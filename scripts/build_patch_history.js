const fs = require("fs");
const path = require("path");
const https = require("https");
const vm = require("vm");

const REPO_ROOT = path.resolve(__dirname, "..");
const PATCH_NOTES_URL = "https://unite-db.com/patch-notes";
const SOURCE_JSON_PATH = path.join(REPO_ROOT, "static", "json", "all_pokemon_detailed.json");
const BATTLE_ITEMS_JSON_PATH = path.join(REPO_ROOT, "data", "json", "unite_db_battle_items.json");
const HELD_ITEMS_JSON_PATH = path.join(REPO_ROOT, "data", "json", "unite_db_held_items.json");
const RAW_OUTPUT_PATH = path.join(REPO_ROOT, "data", "json", "unite_db_patch_notes_raw.json");
const GROUPED_OUTPUT_PATH = path.join(REPO_ROOT, "static", "json", "pokemon_patch_history.json");
const MOVE_OUTPUT_PATH = path.join(REPO_ROOT, "static", "json", "pokemon_move_patch_history.json");

const GENERAL_POKEMON_HEADING_KEYS = new Set([
  "general",
  "stats",
  "naturalstats",
  "attack",
  "attacks",
  "basicattack",
  "basicattacks",
  "autoattack",
  "autoattacks",
  "boostedattack",
  "boostedattacks",
  "normalattack",
  "normalattacks"
]);

const CHANGE_HEADING_ALIASES = {
  watershiriken: "watershuriken",
  watershiruken: "watershuriken"
};

const EXPLICIT_NON_POKEMON_HEADING_KEYS = new Set([
  "allpokemon",
  "autoattacks",
  "battleitems",
  "battlereports",
  "bossrushreturns",
  "bugfixes",
  "communication",
  "draft",
  "draftbattles",
  "draftmode",
  "emblems",
  "exp",
  "expshare",
  "experienceshare",
  "experiencesystemadjustments",
  "goalzones",
  "helditems",
  "holditems",
  "items",
  "map",
  "maptheiaskyruins",
  "matchmaking",
  "miscellaneous",
  "othernotes",
  "objectives",
  "pokemon",
  "qualityoflife",
  "rankingsystem",
  "remoatstadium",
  "replays",
  "scavengerhunt",
  "snowballbattleinshivrecity",
  "surrendervote",
  "theiaskyruins",
  "uiimprovements",
  "uniteclubmembership",
  "unitesquads",
  "wildpokemon"
]);

const NON_ROSTER_ENTITY_KEYS = new Set([
  "corphish",
  "groudon",
  "kyogre",
  "lugia",
  "regidrago"
]);

const MULTI_POKEMON_HEADING_ALIASES = {
  mewtwoxy: ["Mewtwo X", "Mewtwo Y"],
  scizorscyther: ["Scizor", "Scyther"],
  scytherscizor: ["Scyther", "Scizor"]
};

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects while fetching ${url}`));
      return;
    }

    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Unite_Builds/1.0; +https://unite-db.com/patch-notes)"
          }
        },
        (response) => {
          const statusCode = response.statusCode || 0;

          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            const redirectUrl = new URL(response.headers.location, url).toString();
            response.resume();
            resolve(fetchText(redirectUrl, redirectCount + 1));
            return;
          }

          if (statusCode !== 200) {
            response.resume();
            reject(new Error(`Request failed for ${url}: ${statusCode}`));
            return;
          }

          const chunks = [];
          response.setEncoding("utf8");
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(chunks.join("")));
        }
      )
      .on("error", reject);
  });
}

function extractPayloadUrl(patchNotesHtml) {
  const match = patchNotesHtml.match(/\/_nuxt\/static\/[^"'\\]+\/patch-notes\/payload\.js/);
  if (!match) {
    throw new Error("Unable to locate patch-notes payload URL in UniteDB HTML");
  }
  return new URL(match[0], PATCH_NOTES_URL).toString();
}

function loadNuxtPayload(payloadSource) {
  let capturedPayload = null;
  const sandbox = {
    __NUXT_JSONP__: (_routePath, payload) => {
      capturedPayload = typeof payload === "function" ? payload() : payload;
    }
  };

  vm.runInNewContext(payloadSource, sandbox, { timeout: 5000 });

  if (!capturedPayload || !Array.isArray(capturedPayload.data) || !capturedPayload.data[0]) {
    throw new Error("Unable to parse Nuxt payload for UniteDB patch notes");
  }

  return capturedPayload;
}

function extractPatchVersion(title) {
  if (!title) {
    return "";
  }

  const match = title.match(/(?:Patch\s+)?(\d+(?:\.\d+)+)/i);
  return match ? match[1] : "";
}

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function collectHeaderMatches(text, headerRegex) {
  const matches = [];
  let match;

  while ((match = headerRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      contentStart: match.index + match[0].length,
      heading: match[1].trim()
    });
  }

  return matches;
}

function trimBlankLines(text) {
  return String(text || "").replace(/^\s*\n+|\n+\s*$/g, "");
}

function cleanChangeBody(text) {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "&nbsp;" || trimmed === "&#160;" || trimmed === "\u00A0" || trimmed === "***") {
        return "";
      }
      return line.replace(/\u00A0/g, " ");
    });

  return trimBlankLines(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

function parseChangeEntries(pokemonBody) {
  const changeMatches = collectHeaderMatches(
    pokemonBody,
    /^######\s+([^\n]+)\n?/gm
  );

  if (changeMatches.length === 0) {
    const generalBody = cleanChangeBody(pokemonBody);
    return generalBody ? [{ heading: "General", body: generalBody }] : [];
  }

  return changeMatches
    .map((match, index) => {
      const end = index + 1 < changeMatches.length ? changeMatches[index + 1].start : pokemonBody.length;
      const body = cleanChangeBody(pokemonBody.slice(match.contentStart, end));
      return {
        heading: match.heading,
        body
      };
    })
    .filter((change) => change.body);
}

function parsePokemonEntries(markdownText) {
  const normalizedText = normalizeNewlines(markdownText);
  const pokemonMatches = collectHeaderMatches(
    normalizedText,
    /^(?:###|####)\s+([^\n]+?)\s*:?\s*$/gm
  );

  return pokemonMatches
    .map((match, index) => {
      const end = index + 1 < pokemonMatches.length ? pokemonMatches[index + 1].start : normalizedText.length;
      const body = normalizedText.slice(match.contentStart, end);

      return {
        pokemon: match.heading,
        changes: parseChangeEntries(body)
      };
    })
    .filter((entry) => entry.changes.length > 0);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeChangeHeading(heading) {
  return normalizeNewlines(String(heading || ""))
    .replace(/\\([\[\]_*`])/g, "$1")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s*\((?:new|buffed|nerfed|bugfix(?:ed)?|adjusted|reworked?)\)\s*$/i, "")
    .replace(/^\s*["']+|["']+\s*$/g, "")
    .replace(/\s*:\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePokemonHeading(heading) {
  return normalizeChangeHeading(heading)
    .replace(/^pok[eé]mon\s*:\s*/i, "")
    .replace(/^map\s*:\s*/i, "Map ")
    .trim();
}

function resolveHeadingKey(heading) {
  const headingKey = normalizeName(heading);
  return CHANGE_HEADING_ALIASES[headingKey] || headingKey;
}

function titleCaseFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function loadOptionalItemHeadingKeys() {
  const itemHeadingKeys = new Set();

  for (const filePath of [BATTLE_ITEMS_JSON_PATH, HELD_ITEMS_JSON_PATH]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const items = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(items)) {
        continue;
      }

      for (const item of items) {
        for (const candidateName of [item?.name, item?.display_name]) {
          if (candidateName) {
            itemHeadingKeys.add(normalizeName(candidateName));
          }
        }
      }
    } catch (error) {
      console.warn(`Unable to load optional item headings from ${filePath}: ${error.message}`);
    }
  }

  return itemHeadingKeys;
}

function buildPokemonNameMap(pokemonDetails) {
  const nameMap = new Map();
  const manualAliases = {
    galarianrapidash: "Rapidash",
    rapidashgalarian: "Rapidash",
    alolanraichu: "Raichu",
    raichualolan: "Raichu",
    megamewtwox: "Mewtwo X",
    megamewtwoy: "Mewtwo Y",
    mewtwowhy: "Mewtwo Y"
  };

  for (const [siteName, details] of Object.entries(pokemonDetails)) {
    const candidateNames = new Set([siteName]);
    const uniteDbName = details["unite-db-name"];

    if (uniteDbName) {
      candidateNames.add(uniteDbName);
      candidateNames.add(titleCaseFromSlug(uniteDbName));
    }

    for (const candidateName of candidateNames) {
      nameMap.set(normalizeName(candidateName), siteName);
    }
  }

  for (const [alias, siteName] of Object.entries(manualAliases)) {
    nameMap.set(alias, siteName);
  }

  return nameMap;
}

function collectLearnedMoveNames(slotData) {
  if (!slotData || typeof slotData !== "object") {
    return [];
  }

  const upgradeKeys = Object.keys(slotData).filter((key) => /^Upgrade/.test(key) && slotData[key] && typeof slotData[key] === "object");
  const moveNames = upgradeKeys
    .map((key) => slotData[key].Name)
    .filter(Boolean);

  if (moveNames.length > 0) {
    return moveNames;
  }

  return slotData.Name ? [slotData.Name] : [];
}

function addHeadingFamilyMap(headingToFamilyNames, headingName, familyNames) {
  const headingKey = resolveHeadingKey(headingName);
  if (!headingKey) {
    return;
  }

  if (!headingToFamilyNames[headingKey]) {
    headingToFamilyNames[headingKey] = new Set();
  }

  for (const familyName of familyNames) {
    headingToFamilyNames[headingKey].add(familyName);
  }
}

function buildPokemonMetadata(pokemonDetails) {
  const metadata = {};

  for (const [pokemonName, details] of Object.entries(pokemonDetails)) {
    const moveFamilies = {};
    const headingToFamilyNames = {};
    const passiveNameKeys = new Set();
    const uniteNameKeys = new Set();

    for (const slotName of ["Move 1", "Move 2"]) {
      const slotData = details[slotName];
      if (!slotData || typeof slotData !== "object") {
        continue;
      }

      const baseMoveName = slotData.Name;
      const learnedMoveNames = collectLearnedMoveNames(slotData);
      const familyNames = learnedMoveNames.length > 0 ? learnedMoveNames : (baseMoveName ? [baseMoveName] : []);

      for (const familyName of familyNames) {
        const familyKey = resolveHeadingKey(familyName);
        if (!familyKey || moveFamilies[familyKey]) {
          continue;
        }

        moveFamilies[familyKey] = {
          familyKey,
          displayName: familyName
        };
      }

      if (baseMoveName) {
        addHeadingFamilyMap(headingToFamilyNames, baseMoveName, familyNames);
      }

      for (const learnedMoveName of learnedMoveNames) {
        addHeadingFamilyMap(headingToFamilyNames, learnedMoveName, [learnedMoveName]);
      }
    }

    const passiveData = details["Passive Ability"] || {};
    for (const passiveName of [passiveData.Name, passiveData["Name 2"]]) {
      if (passiveName) {
        passiveNameKeys.add(resolveHeadingKey(passiveName));
      }
    }

    const uniteMoveData = details["Unite Move"] || {};
    for (const uniteName of [uniteMoveData.Name, uniteMoveData["Name 2"]]) {
      if (uniteName) {
        uniteNameKeys.add(resolveHeadingKey(uniteName));
      }
    }

    metadata[pokemonName] = {
      passiveNameKeys,
      uniteNameKeys,
      moveFamilies,
      headingToFamilyNames: Object.fromEntries(
        Object.entries(headingToFamilyNames).map(([headingKey, familyNames]) => [headingKey, Array.from(familyNames)])
      )
    };
  }

  return metadata;
}

function buildMoveHeadingKeySet(pokemonMetadata) {
  const moveHeadingKeys = new Set();

  for (const metadata of Object.values(pokemonMetadata)) {
    for (const headingKey of Object.keys(metadata.headingToFamilyNames || {})) {
      moveHeadingKeys.add(headingKey);
    }
  }

  return moveHeadingKeys;
}

function shouldIgnorePokemonHeading(heading, ignoredHeadingKeys, moveHeadingKeys) {
  const normalizedHeading = normalizePokemonHeading(heading);
  const headingKey = normalizeName(normalizedHeading);

  if (!headingKey) {
    return true;
  }

  if (ignoredHeadingKeys.has(headingKey) || NON_ROSTER_ENTITY_KEYS.has(headingKey)) {
    return true;
  }

  if (moveHeadingKeys.has(headingKey)) {
    return true;
  }

  if (/^if ko'?d by/i.test(normalizedHeading)) {
    return true;
  }

  if (/^visual effects/i.test(normalizedHeading)) {
    return true;
  }

  return false;
}

function resolvePokemonHeadingTargets(heading, nameMap, ignoredHeadingKeys, moveHeadingKeys) {
  const normalizedHeading = normalizePokemonHeading(heading);
  const headingKey = normalizeName(normalizedHeading);

  if (!headingKey) {
    return { targets: [], ignored: true };
  }

  const directMatch = nameMap.get(headingKey);
  if (directMatch) {
    return { targets: [directMatch], ignored: false };
  }

  const aliasedTargets = MULTI_POKEMON_HEADING_ALIASES[headingKey];
  if (aliasedTargets) {
    return { targets: aliasedTargets, ignored: false };
  }

  const splitParts = normalizedHeading
    .split(/\s*(?:\/|&|,|\band\b)\s*/i)
    .map((part) => normalizePokemonHeading(part))
    .filter(Boolean);

  if (splitParts.length > 1) {
    const resolvedTargets = splitParts.map((part) => nameMap.get(normalizeName(part)));
    if (resolvedTargets.every(Boolean)) {
      return { targets: Array.from(new Set(resolvedTargets)), ignored: false };
    }
  }

  if (shouldIgnorePokemonHeading(normalizedHeading, ignoredHeadingKeys, moveHeadingKeys)) {
    return { targets: [], ignored: true };
  }

  return { targets: [], ignored: false };
}

function buildRawArchive(posts) {
  return posts.map((post) => {
    const fields = post.fields || {};
    return {
      version: extractPatchVersion(fields.title),
      title: fields.title || "",
      slug: fields.slug || "",
      patchDate: fields.patchDate || "",
      patchNoteDetails: fields.patchNoteDetails || ""
    };
  });
}

function isPokemonLevelHeading(pokemonMeta, normalizedHeading, headingKey) {
  const loweredHeading = normalizedHeading.toLowerCase();

  if (!headingKey || GENERAL_POKEMON_HEADING_KEYS.has(headingKey)) {
    return true;
  }

  if (loweredHeading.startsWith("unite move") || loweredHeading === "unite" || loweredHeading === "ult" || loweredHeading.startsWith("ultimate")) {
    return true;
  }

  if (loweredHeading.startsWith("passive") || loweredHeading.startsWith("ability")) {
    return true;
  }

  if (pokemonMeta.passiveNameKeys.has(headingKey) || pokemonMeta.uniteNameKeys.has(headingKey)) {
    return true;
  }

  return false;
}

function buildGroupedPatchHistories(rawArchive, pokemonDetails) {
  const nameMap = buildPokemonNameMap(pokemonDetails);
  const pokemonMetadata = buildPokemonMetadata(pokemonDetails);
  const moveHeadingKeys = buildMoveHeadingKeySet(pokemonMetadata);
  const ignoredHeadingKeys = new Set([
    ...EXPLICIT_NON_POKEMON_HEADING_KEYS,
    ...loadOptionalItemHeadingKeys()
  ]);
  const groupedPokemonHistory = {};
  const groupedMoveHistory = {};
  const unmatchedPokemon = new Set();

  for (const patch of rawArchive) {
    const pokemonEntries = parsePokemonEntries(patch.patchNoteDetails);

    for (const pokemonEntry of pokemonEntries) {
      const resolution = resolvePokemonHeadingTargets(
        pokemonEntry.pokemon,
        nameMap,
        ignoredHeadingKeys,
        moveHeadingKeys
      );
      if (resolution.targets.length === 0) {
        if (!resolution.ignored) {
          unmatchedPokemon.add(normalizePokemonHeading(pokemonEntry.pokemon));
        }
        continue;
      }

      for (const sitePokemonName of resolution.targets) {
        const pokemonMeta = pokemonMetadata[sitePokemonName] || {
          passiveNameKeys: new Set(),
          uniteNameKeys: new Set(),
          moveFamilies: {},
          headingToFamilyNames: {}
        };
        const pokemonChanges = [];
        const moveBuckets = {};

        for (const change of pokemonEntry.changes) {
          const normalizedHeading = normalizeChangeHeading(change.heading);
          const headingKey = resolveHeadingKey(normalizedHeading);
          const matchedFamilyNames = pokemonMeta.headingToFamilyNames[headingKey] || [];

          if (matchedFamilyNames.length > 0 && !isPokemonLevelHeading(pokemonMeta, normalizedHeading, headingKey)) {
            for (const familyName of matchedFamilyNames) {
              if (!moveBuckets[familyName]) {
                moveBuckets[familyName] = [];
              }
              moveBuckets[familyName].push(change);
            }
          } else {
            pokemonChanges.push(change);
          }
        }

        if (pokemonChanges.length > 0) {
          if (!groupedPokemonHistory[sitePokemonName]) {
            groupedPokemonHistory[sitePokemonName] = [];
          }

          groupedPokemonHistory[sitePokemonName].push({
            version: patch.version,
            title: patch.title,
            slug: patch.slug,
            patchDate: patch.patchDate,
            changes: pokemonChanges
          });
        }

        for (const [moveName, changes] of Object.entries(moveBuckets)) {
          if (!groupedMoveHistory[sitePokemonName]) {
            groupedMoveHistory[sitePokemonName] = {};
          }
          if (!groupedMoveHistory[sitePokemonName][moveName]) {
            groupedMoveHistory[sitePokemonName][moveName] = [];
          }

          groupedMoveHistory[sitePokemonName][moveName].push({
            version: patch.version,
            title: patch.title,
            slug: patch.slug,
            patchDate: patch.patchDate,
            changes
          });
        }
      }
    }
  }

  if (unmatchedPokemon.size > 0) {
    console.warn("Unmatched patch-note Pokemon headings:", Array.from(unmatchedPokemon).sort().join(", "));
  }

  const orderedPokemonHistory = {};
  const orderedMoveHistory = {};

  for (const pokemonName of Object.keys(pokemonDetails)) {
    if (groupedPokemonHistory[pokemonName]) {
      orderedPokemonHistory[pokemonName] = groupedPokemonHistory[pokemonName];
    }
    if (groupedMoveHistory[pokemonName]) {
      orderedMoveHistory[pokemonName] = groupedMoveHistory[pokemonName];
    }
  }

  for (const pokemonName of Object.keys(groupedPokemonHistory).sort()) {
    if (!orderedPokemonHistory[pokemonName]) {
      orderedPokemonHistory[pokemonName] = groupedPokemonHistory[pokemonName];
    }
  }

  for (const pokemonName of Object.keys(groupedMoveHistory).sort()) {
    if (!orderedMoveHistory[pokemonName]) {
      orderedMoveHistory[pokemonName] = groupedMoveHistory[pokemonName];
    }
  }

  return {
    pokemonHistory: orderedPokemonHistory,
    moveHistory: orderedMoveHistory
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const pokemonDetails = JSON.parse(fs.readFileSync(SOURCE_JSON_PATH, "utf8"));
  const patchNotesHtml = await fetchText(PATCH_NOTES_URL);
  const payloadUrl = extractPayloadUrl(patchNotesHtml);
  const payloadSource = await fetchText(payloadUrl);
  const payload = loadNuxtPayload(payloadSource);
  const posts = payload.data[0].posts || [];

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error("No patch posts found in UniteDB payload");
  }

  const rawArchive = buildRawArchive(posts);
  const groupedHistories = buildGroupedPatchHistories(rawArchive, pokemonDetails);

  writeJson(RAW_OUTPUT_PATH, rawArchive);
  writeJson(GROUPED_OUTPUT_PATH, groupedHistories.pokemonHistory);
  writeJson(MOVE_OUTPUT_PATH, groupedHistories.moveHistory);

  console.log(`Saved ${rawArchive.length} raw patch entries to ${RAW_OUTPUT_PATH}`);
  console.log(`Saved ${Object.keys(groupedHistories.pokemonHistory).length} Pokemon patch histories to ${GROUPED_OUTPUT_PATH}`);
  console.log(`Saved ${Object.keys(groupedHistories.moveHistory).length} Pokemon move patch histories to ${MOVE_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
