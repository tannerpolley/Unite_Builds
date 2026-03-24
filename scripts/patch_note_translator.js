const FORMULA_COMPONENT_KEYS = new Set([
  "base",
  "maxhp",
  "maxhp%",
  "perlevel",
  "ratio",
  "slider"
]);

const DEFAULT_LEVELS = [1, 9, 15];

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeHeading(value) {
  return normalizeNewlines(String(value || ""))
    .replace(/\\([\[\]_*`])/g, "$1")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s*\((?:new|buffed|nerfed|bugfix(?:ed)?|adjusted|reworked?)\)\s*$/i, "")
    .replace(/^\s*["']+|["']+\s*$/g, "")
    .replace(/\s*:\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimBlankLines(text) {
  return String(text || "").replace(/^\s*\n+|\n+\s*$/g, "");
}

function cleanText(text) {
  return trimBlankLines(
    normalizeNewlines(String(text || ""))
      .replace(/\u00A0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value || "");
  }

  if (Math.abs(numeric - Math.round(numeric)) < 0.001) {
    return `${Math.round(numeric)}`;
  }

  return `${numeric.toFixed(1).replace(/\.0$/, "")}`;
}

function formatLevelLabel(startLevel, endLevel) {
  if (!Number.isFinite(startLevel) || !Number.isFinite(endLevel)) {
    return "Levels";
  }
  if (startLevel === endLevel) {
    return `Level ${startLevel}`;
  }
  return `Levels ${startLevel}-${endLevel}`;
}

function normalizeUnitKey(unit) {
  return String(unit || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeUnit(rawUnit) {
  return String(rawUnit || "")
    .replace(/\bLvl\b/gi, "Level")
    .replace(/\bSpAtk\b/gi, "Sp. Atk")
    .replace(/\bSp Atk\b/gi, "Sp. Atk")
    .replace(/\bSp Attack\b/gi, "Sp. Atk")
    .replace(/\bSpA\b/gi, "Sp. Atk")
    .replace(/\bAtk\b/gi, "Attack")
    .replace(/\bAtk Spd\b/gi, "Attack Speed")
    .replace(/\bSpDef\b/gi, "Sp. Def")
    .replace(/\bSp Defense\b/gi, "Sp. Def")
    .replace(/\bDef\b/gi, "Defense")
    .replace(/\bHP\b/gi, "HP")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function buildLevelMetadata(pokemonDetails) {
  const metadata = {};

  for (const [pokemonName, details] of Object.entries(pokemonDetails || {})) {
    const headingLevels = new Map();

    function setLevels(name, unlockLevel, enhancedLevel) {
      const key = normalizeName(name);
      if (!key) {
        return;
      }
      headingLevels.set(key, {
        unlockLevel: unlockLevel || null,
        enhancedLevel: enhancedLevel || null
      });
    }

    setLevels("Attack", 1, null);
    setLevels("Basic Attack", 1, null);
    setLevels("Auto Attack", 1, null);
    setLevels("Boosted Attack", 1, null);
    setLevels("Normal Attack", 1, null);
    setLevels("Stats", 1, null);
    setLevels("Natural Stats", 1, null);

    if (details["Passive Ability"]) {
      setLevels(details["Passive Ability"].Name, 1, null);
      setLevels(details["Passive Ability"]["Name 2"], 1, null);
    }

    if (details["Unite Move"]) {
      setLevels(details["Unite Move"].Name, Number(details["Unite Move"].Level) || 9, null);
      setLevels("Unite Move", Number(details["Unite Move"].Level) || 9, null);
    }

    for (const slotName of ["Move 1", "Move 2"]) {
      const slotData = details[slotName];
      if (!slotData || typeof slotData !== "object") {
        continue;
      }

      const baseUnlock = slotName === "Move 1" ? 1 : 3;
      setLevels(slotData.Name, baseUnlock, null);

      for (const key of Object.keys(slotData)) {
        if (!/^Upgrade/.test(key)) {
          continue;
        }

        const upgrade = slotData[key];
        if (!upgrade || typeof upgrade !== "object") {
          continue;
        }

        setLevels(
          upgrade.Name,
          Number(upgrade.Level) || null,
          Number(upgrade["Enhanced Level"]) || null
        );
      }
    }

    metadata[pokemonName] = headingLevels;
  }

  return metadata;
}

function buildStatsMap(statsEntries) {
  const statsMap = new Map();

  for (const entry of statsEntries || []) {
    const key = normalizeName(entry?.name || entry?.pokemon);
    const levelMap = new Map();

    for (const levelEntry of entry?.level || []) {
      levelMap.set(Number(levelEntry.level), levelEntry);
    }

    if (key && levelMap.size > 0) {
      statsMap.set(key, levelMap);
    }
  }

  return statsMap;
}

function parseModernSections(body) {
  const normalizedBody = cleanText(body);
  const sectionRegex = /(?:^|\n)\*\*([^*]+)\*\*:?\s*\n?([\s\S]*?)(?=(?:\n\*\*[^*]+\*\*:?\s*\n?)|$)/g;
  const sections = [];
  let match;

  while ((match = sectionRegex.exec(normalizedBody)) !== null) {
    sections.push({
      label: match[1].trim(),
      content: cleanText(match[2])
    });
  }

  return sections;
}

function parseLegacyLabel(firstLine) {
  const trimmed = String(firstLine || "").trim();
  const underlineMatch = trimmed.match(/^_{1,2}(.+?)_{1,2}:?$/);
  if (underlineMatch) {
    return underlineMatch[1].trim();
  }

  const simpleMatch = trimmed.match(/^([^:]+):\s*$/);
  if (simpleMatch && !/(?:->|→)/.test(trimmed)) {
    return simpleMatch[1].trim();
  }

  return "";
}

function parseValueParts(rawValue) {
  const cleaned = String(rawValue || "")
    .replace(/\(unchanged\)/gi, "")
    .trim();

  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(/\s*,\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const multiplierMatch = segment.match(/\(x\s*(\d+(?:\.\d+)?)\)/i) || segment.match(/x\s*(\d+(?:\.\d+)?)/i);
      const multiplier = multiplierMatch ? Number(multiplierMatch[1]) : 1;
      const numericMatch = segment.match(/[+-]?\d[\d,]*(?:\.\d+)?/);
      if (!numericMatch) {
        return null;
      }

      const value = Number(numericMatch[0].replace(/,/g, ""));
      const unit = segment
        .replace(multiplierMatch ? multiplierMatch[0] : "", "")
        .replace(numericMatch[0], "")
        .replace(/[()]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        raw: segment,
        value,
        multiplier,
        unit,
        unitKey: normalizeUnitKey(unit)
      };
    })
    .filter(Boolean);
}

function aggregatePartValues(parts) {
  return parts.reduce((total, part) => total + part.value * part.multiplier, 0);
}

function parseChangeLine(line) {
  const match = String(line || "").trim().match(/^([^:]+):\s*(.+?)\s*(?:->|→)\s*(.+)$/);
  if (!match) {
    return null;
  }

  return {
    label: match[1].trim(),
    beforeRaw: match[2].trim(),
    afterRaw: match[3].trim()
  };
}

function parseFormulaComponents(lines) {
  const componentMap = {};
  const directLines = [];

  for (const line of lines) {
    const parsed = parseChangeLine(line);
    if (!parsed) {
      continue;
    }

    const key = normalizeName(parsed.label);
    if (!FORMULA_COMPONENT_KEYS.has(key)) {
      directLines.push(parsed);
      continue;
    }

    const beforeParts = parseValueParts(parsed.beforeRaw);
    const afterParts = parseValueParts(parsed.afterRaw);
    componentMap[key] = {
      label: parsed.label,
      beforeRaw: parsed.beforeRaw,
      afterRaw: parsed.afterRaw,
      beforeParts,
      afterParts
    };
  }

  return {
    components: componentMap,
    directLines
  };
}

function inferStatKeyFromRatio(component) {
  const units = [
    ...component.beforeParts.map((part) => part.unitKey),
    ...component.afterParts.map((part) => part.unitKey)
  ];
  const joined = units.join(" ");

  if (joined.includes("enemy max hp") || joined.includes("enemy missing hp") || joined.includes("received damage")) {
    return null;
  }

  if (joined.includes("max hp") || joined === "% hp" || joined === "hp") {
    return "hp";
  }

  if (joined.includes("spatk") || joined.includes("sp atk") || joined.includes("special attack")) {
    return "sp_attack";
  }

  if (joined.includes("atk") || joined.includes("attack")) {
    return "attack";
  }

  return null;
}

function hasStableUnits(component) {
  if (!component.beforeParts.length || component.beforeParts.length !== component.afterParts.length) {
    return false;
  }

  return component.beforeParts.every((part, index) => part.unitKey === component.afterParts[index].unitKey);
}

function computeComponentPercent(component) {
  const beforeValue = aggregatePartValues(component.beforeParts);
  const afterValue = aggregatePartValues(component.afterParts);

  if (!Number.isFinite(beforeValue) || beforeValue === 0 || !Number.isFinite(afterValue)) {
    return null;
  }

  return ((afterValue - beforeValue) / beforeValue) * 100;
}

function humanizeLabel(label) {
  const normalized = String(label || "").trim();
  const mapped = normalized
    .replace(/^Unite Buff:\s*/i, "")
    .replace(/\bSpAtk\b/gi, "Sp. Atk")
    .replace(/\bSp Atk\b/gi, "Sp. Atk")
    .replace(/\bSp Attack\b/gi, "Sp. Atk")
    .replace(/\bSpA\b/gi, "Sp. Atk")
    .replace(/\bAtk Spd\b/gi, "Attack Speed")
    .replace(/\bAttack Speed\b/gi, "Attack Speed")
    .replace(/\bAtk\b/gi, "Attack")
    .replace(/\bSpDef\b/gi, "Sp. Def")
    .replace(/\bSp Def\b/gi, "Sp. Def")
    .replace(/\bSp Defense\b/gi, "Sp. Def")
    .replace(/\bDef\b/gi, "Defense")
    .replace(/\bCDR\b/g, "Cooldown Reduction")
    .replace(/\bHP\b/g, "HP")
    .replace(/\s+/g, " ")
    .trim();

  const splitMatch = mapped.match(/^(.+?)\s*-\s*(.+)$/);
  if (splitMatch) {
    return `${splitMatch[1].trim()} (${splitMatch[2].trim()})`;
  }

  return mapped;
}

function summaryLabelForSection(label) {
  const normalized = normalizeName(label);
  if (normalized === "healing") {
    return "Health recovery";
  }
  if (normalized === "shield" || normalized === "uniteshield") {
    return "Shield amount";
  }
  if (normalized === "burn") {
    return "Burn damage";
  }
  if (normalized === "energyrequired" || normalized === "energyneeded") {
    return "Unite Gauge energy required";
  }
  return humanizeLabel(label);
}

function formatDeltaSummary(percentDelta) {
  const rounded = Math.round(Math.abs(percentDelta));
  const direction = percentDelta >= 0 ? "Increase" : "Decrease";
  return `${rounded}% ${direction}`;
}

function parseSingleStatValue(rawValue) {
  const cleaned = String(rawValue || "")
    .replace(/[,+]/g, "")
    .replace(/\s*-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return null;
  }

  return {
    value: Number(match[1]),
    unit: humanizeUnit(match[2].trim())
  };
}

function extractPendingLabels(line) {
  const cleaned = cleanText(line)
    .replace(/\bPrevious\b/gi, "")
    .replace(/\bUpdated\b/gi, "")
    .replace(/\bBefore\b\s*(?:->|→)?\s*\bAfter\b/gi, "")
    .trim();

  const colonMatch = cleaned.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const directLabels = colonMatch[1]
      .split("/")
      .map((part) => summaryLabelForSection(part))
      .filter(Boolean);
    const detail = cleanText(colonMatch[2]);
    const nestedDetail = detail.replace(/^\/\s*/, "");
    const compositeLabels = `${colonMatch[1]}${detail.startsWith("/") ? ` ${detail.replace(/\bstat.*$/i, "").trim()}` : ""}`.trim();
    const compositeParts = compositeLabels
      .split("/")
      .map((part) => summaryLabelForSection(part))
      .filter(Boolean);

    if (compositeParts.length > 1 && /^\/?.*\bstat(?:\.| increased| reduced| decreased| adjusted| buffed| nerfed)?/i.test(detail)) {
      return compositeParts;
    }

    if (directLabels.length > 0 && /^stat(?:\.| increased| reduced| decreased| adjusted| buffed| nerfed)?/i.test(detail)) {
      return directLabels;
    }

    if (normalizeName(colonMatch[1]) === "general") {
      const nestedLabels = nestedDetail
        .split("/")
        .map((part) => summaryLabelForSection(part))
        .filter(Boolean);
      if (nestedLabels.length > 1) {
        return nestedLabels;
      }
    }
  }

  const slashMatch = cleaned.match(/^([A-Za-z .]+(?:\s*\/\s*[A-Za-z .]+)+)$/);
  if (slashMatch) {
    return slashMatch[1]
      .split("/")
      .map((part) => summaryLabelForSection(part))
      .filter(Boolean);
  }

  return null;
}

function splitCompositeStatValues(rawValue) {
  return String(rawValue || "")
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function inferCompositeStatLabels(sectionLabel, beforeSegments, afterSegments) {
  if (beforeSegments.length !== afterSegments.length) {
    return null;
  }

  const normalizedSection = normalizeName(sectionLabel);
  if (!/stats|naturalstats|basestats/.test(normalizedSection)) {
    return null;
  }

  const beforeValues = beforeSegments.map(parseSingleStatValue);
  const afterValues = afterSegments.map(parseSingleStatValue);
  if (beforeValues.some((entry) => !entry) || afterValues.some((entry) => !entry)) {
    return null;
  }

  if (beforeSegments.length === 3) {
    const first = beforeValues[0]?.value || 0;
    const second = beforeValues[1]?.value || 0;
    if (first > second * 10) {
      return ["HP", "Defense", "Special Defense"];
    }
  }

  if (beforeSegments.length === 2) {
    return ["Defense", "Special Defense"];
  }

  return null;
}

function buildSingleValueText(value, unit) {
  if (!unit) {
    return `${formatNumber(value)}`.trim();
  }

  if (unit === "%") {
    return `${formatNumber(value)}%`;
  }

  return `${formatNumber(value)} ${unit}`.trim();
}

function buildValueRangeText(startValue, endValue, unit) {
  const startText = buildSingleValueText(startValue, unit);
  const endText = buildSingleValueText(endValue, unit);
  if (Math.abs(startValue - endValue) < 0.001) {
    return startText;
  }
  return `${startText}–${endText}`;
}

function parseLevelSeriesLines(sectionLabel, lines) {
  const seriesMap = new Map();
  let pendingLabels = null;

  for (const rawLine of lines) {
    const line = String(rawLine || "")
      .replace(/\t+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!line) {
      continue;
    }

    const match = line.match(/^(?:(.+?):\s*)?(?:Level|Lvl|Lv)\.?\s*(\d+)\s*:?\s*(.+?)\s*(?:->|→)\s*(.+)$/i);
    if (!match) {
      const labels = extractPendingLabels(line);
      if (labels && labels.length > 0) {
        pendingLabels = labels;
      }
      continue;
    }

    const explicitLabel = cleanText(match[1] || "");
    const beforeRaw = cleanText(match[3]);
    const afterRaw = cleanText(match[4]);

    const beforeSegments = splitCompositeStatValues(beforeRaw);
    const afterSegments = splitCompositeStatValues(afterRaw);

    let labelCandidates;
    if (explicitLabel && !/^level$/i.test(explicitLabel)) {
      labelCandidates = explicitLabel.split("/").map((part) => summaryLabelForSection(part)).filter(Boolean);
    } else if (pendingLabels && pendingLabels.length > 0) {
      labelCandidates = [...pendingLabels];
    } else {
      labelCandidates = [summaryLabelForSection(sectionLabel)];
    }

    if (beforeSegments.length !== afterSegments.length) {
      return null;
    }

    if (beforeSegments.length > 1 && labelCandidates.length !== beforeSegments.length) {
      return null;
    }

    const resolvedLabels = beforeSegments.length > 1
      ? (labelCandidates.length === beforeSegments.length
        ? labelCandidates
        : (inferCompositeStatLabels(sectionLabel, beforeSegments, afterSegments) || labelCandidates))
      : [labelCandidates[0] || summaryLabelForSection(sectionLabel)];

    if (beforeSegments.length > 1 && resolvedLabels.length !== beforeSegments.length) {
      return null;
    }

    for (let index = 0; index < beforeSegments.length; index += 1) {
      const label = resolvedLabels[index];
      const beforeValue = parseSingleStatValue(beforeSegments[index]);
      const afterValue = parseSingleStatValue(afterSegments[index]);
      if (!label || !beforeValue || !afterValue || beforeValue.unit !== afterValue.unit) {
        return null;
      }

      const key = normalizeName(label);
      if (!key) {
        return null;
      }

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          label,
          unit: beforeValue.unit,
          entries: []
        });
      }

      seriesMap.get(key).entries.push({
        level: Number(match[2]),
        before: beforeValue.value,
        after: afterValue.value
      });
    }
  }

  const seriesList = Array.from(seriesMap.values())
    .map((series) => ({
      ...series,
      entries: series.entries.sort((a, b) => a.level - b.level)
    }))
    .filter((series) => series.entries.length >= 2);

  return seriesList.length > 0 ? seriesList : null;
}

function buildStepSummaries(entries, unit) {
  const changedEntries = entries.filter((entry) => Math.abs(entry.before - entry.after) > 0.001);
  if (changedEntries.length === 0) {
    return [];
  }

  const segments = [];
  let current = null;

  for (const entry of changedEntries) {
    const segmentKey = `${buildSingleValueText(entry.before, unit)}|${buildSingleValueText(entry.after, unit)}`;
    if (
      current &&
      current.key === segmentKey &&
      entry.level === current.endLevel + 1
    ) {
      current.endLevel = entry.level;
      continue;
    }

    current = {
      key: segmentKey,
      startLevel: entry.level,
      endLevel: entry.level,
      before: entry.before,
      after: entry.after
    };
    segments.push(current);
  }

  return segments;
}

function summarizeSeriesEntries(label, unit, entries) {
  const changedEntries = entries.filter((entry) => Math.abs(entry.before - entry.after) > 0.001);

  if (changedEntries.length === 0) {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const unchangedRange = buildValueRangeText(first.before, last.before, unit);
    return {
      text: `${label}: Unchanged at ${unchangedRange} by level.`,
      kind: "level_series_unchanged",
      baseLabel: normalizeName(label),
      valueText: unchangedRange
    };
  }

  const segments = buildStepSummaries(entries, unit);
  const distinctSegmentKeys = new Set(segments.map((segment) => segment.key));
  if (distinctSegmentKeys.size > 1 && distinctSegmentKeys.size <= 3 && segments.length <= 3) {
    const segmentText = segments
      .map((segment) => `${formatLevelLabel(segment.startLevel, segment.endLevel)}: ${buildSingleValueText(segment.before, unit)} → ${buildSingleValueText(segment.after, unit)}`)
      .join("; ");
    return {
      text: `${label}: ${segmentText}.`,
      kind: "level_series_steps",
      baseLabel: normalizeName(label),
      valueText: segmentText
    };
  }

  const percentDeltas = changedEntries
    .filter((entry) => Number.isFinite(entry.before) && Math.abs(entry.before) > 0.001)
    .map((entry) => ((entry.after - entry.before) / entry.before) * 100)
    .filter((value) => Number.isFinite(value));

  if (percentDeltas.length > 0) {
    const minDelta = Math.min(...percentDeltas);
    const maxDelta = Math.max(...percentDeltas);
    const startLevel = changedEntries[0].level;
    const endLevel = changedEntries[changedEntries.length - 1].level;
    const sameDirection = minDelta >= 0 || maxDelta <= 0;
    if (sameDirection) {
      const direction = maxDelta >= 0 ? "increase" : "decrease";
      const minRounded = Math.round(Math.abs(minDelta));
      const maxRounded = Math.round(Math.abs(maxDelta));
      const deltaText = minRounded === maxRounded
        ? `${maxRounded}% ${direction}`
        : `${minRounded}%–${maxRounded}% ${direction}`;
      return {
        text: `${label}: ${deltaText} by level (${formatLevelLabel(startLevel, endLevel)}).`,
        kind: "level_series_percent_range",
        baseLabel: normalizeName(label),
        valueText: deltaText
      };
    }
  }

  const firstChanged = changedEntries[0];
  const lastChanged = changedEntries[changedEntries.length - 1];
  return {
    text: `${label}: ${buildSingleValueText(firstChanged.before, unit)} → ${buildSingleValueText(firstChanged.after, unit)} at ${formatLevelLabel(firstChanged.level, firstChanged.level)}; ${buildSingleValueText(lastChanged.before, unit)} → ${buildSingleValueText(lastChanged.after, unit)} at ${formatLevelLabel(lastChanged.level, lastChanged.level)}.`,
    kind: "level_series_fallback",
    baseLabel: normalizeName(label),
    valueText: `${buildSingleValueText(firstChanged.before, unit)} → ${buildSingleValueText(firstChanged.after, unit)}`
  };
}

function summarizeLevelSeries(sectionLabel, lines) {
  const seriesList = parseLevelSeriesLines(sectionLabel, lines);
  if (!seriesList || seriesList.length === 0) {
    return null;
  }

  return seriesList.map((series) => summarizeSeriesEntries(series.label, series.unit, series.entries));
}

function summarizeUnlabeledCompositeLevelSeries(sectionLabel, lines) {
  const parsedEntries = [];

  for (const rawLine of lines) {
    const line = String(rawLine || "")
      .replace(/\t+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^(?:Level|Lvl|Lv)\.?\s*(\d+)\s*:?\s*(.+?)\s*(?:->|→)\s*(.+)$/i);
    if (!match) {
      return null;
    }

    const beforeSegments = splitCompositeStatValues(match[2]);
    const afterSegments = splitCompositeStatValues(match[3]);
    if (beforeSegments.length < 2 || beforeSegments.length !== afterSegments.length) {
      return null;
    }

    const inferredLabels = inferCompositeStatLabels(sectionLabel, beforeSegments, afterSegments);
    if (!inferredLabels || inferredLabels.length !== beforeSegments.length) {
      return null;
    }

    parsedEntries.push({
      level: Number(match[1]),
      beforeSegments,
      afterSegments,
      labels: inferredLabels
    });
  }

  if (parsedEntries.length < 2) {
    return null;
  }

  const seriesMap = new Map();
  for (const entry of parsedEntries) {
    entry.labels.forEach((label, index) => {
      const beforeValue = parseSingleStatValue(entry.beforeSegments[index]);
      const afterValue = parseSingleStatValue(entry.afterSegments[index]);
      if (!beforeValue || !afterValue || beforeValue.unit !== afterValue.unit) {
        return;
      }

      const key = normalizeName(label);
      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          label,
          unit: beforeValue.unit,
          entries: []
        });
      }

      seriesMap.get(key).entries.push({
        level: entry.level,
        before: beforeValue.value,
        after: afterValue.value
      });
    });
  }

  if (seriesMap.size === 0) {
    return null;
  }

  return Array.from(seriesMap.values()).map((series) => summarizeSeriesEntries(series.label, series.unit, series.entries));
}

function summarizePreviousUpdatedSeries(lines) {
  const seriesMap = new Map();
  let pendingDescriptor = null;

  function ensureSeries(label) {
    const key = normalizeName(label);
    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        label: summaryLabelForSection(label),
        previous: null,
        updated: null
      });
    }
    return seriesMap.get(key);
  }

  function applyValues(mode, label, valueText) {
    const cleanedValues = cleanText(valueText).replace(/[.。]\s*$/g, "").trim();
    if (!cleanedValues || !/\d/.test(cleanedValues) || !cleanedValues.includes("/")) {
      return false;
    }

    const values = cleanedValues
      .split("/")
      .map((part) => parseSingleStatValue(part))
      .filter(Boolean);

    if (values.length < 2 || values.some((entry) => entry.unit !== values[0].unit)) {
      return false;
    }

    const series = ensureSeries(label);
    series[mode] = values;
    return true;
  }

  for (const rawLine of lines) {
    const line = cleanText(rawLine).replace(/\s+/g, " ").trim();
    if (!line) {
      continue;
    }

    if (pendingDescriptor && applyValues(pendingDescriptor.mode, pendingDescriptor.label, line)) {
      pendingDescriptor = null;
      continue;
    }

    const descriptorMatch = line.match(/^(Previous|Updated)\s+([^:]+):\s*(.*)$/i);
    if (!descriptorMatch) {
      continue;
    }

    const mode = descriptorMatch[1].toLowerCase() === "previous" ? "previous" : "updated";
    const label = descriptorMatch[2].trim();
    const trailing = descriptorMatch[3].trim();

    if (applyValues(mode, label, trailing)) {
      pendingDescriptor = null;
      continue;
    }

    if (/^(Previous|Updated)\s+[^:]+:\.?$/i.test(trailing)) {
      pendingDescriptor = {
        mode,
        label
      };
      continue;
    }

    pendingDescriptor = {
      mode,
      label
    };
  }

  const outputs = [];
  for (const series of seriesMap.values()) {
    if (!Array.isArray(series.previous) || !Array.isArray(series.updated) || series.previous.length !== series.updated.length) {
      continue;
    }

    const entries = series.previous.map((beforeEntry, index) => ({
      level: index + 1,
      before: beforeEntry.value,
      after: series.updated[index].value
    }));

    outputs.push(summarizeSeriesEntries(series.label, series.previous[0].unit, entries));
  }

  return outputs.length > 0 ? outputs : null;
}

function compressTranslatedStatLines(sectionLabel, lines) {
  const levelSeriesSummary = summarizePreviousUpdatedSeries(lines)
    || summarizeLevelSeries(sectionLabel, lines)
    || summarizeUnlabeledCompositeLevelSeries(sectionLabel, lines);
  if (!levelSeriesSummary) {
    return lines;
  }

  const helperLinePatterns = [
    /^(?:Lvl|Level|Lv)\.?\s*\d/i,
    /: (?:Lvl|Level|Lv)\.?\s*\d/i,
    /:\s*(?:\/\s*)?.*\bStat\.?$/i,
    /\bStat\.?$/i,
    /^General:\s*[A-Za-z .]+(?:\/[A-Za-z .]+)+/i
  ];

  const remainingLines = lines
    .filter((line) => !helperLinePatterns.some((pattern) => pattern.test(String(line || "").trim())))
    .map((line) => {
      const match = String(line || "").trim().match(/^General:\s*([^:]+):\s*(.+)$/i);
      if (!match) {
        return line;
      }
      return `${summaryLabelForSection(match[1])}: ${normalizeSentence(match[2])}`;
    });
  return [...levelSeriesSummary.map((entry) => entry.text), ...remainingLines];
}

function getRepresentativeLevels(levelMetadata, sitePokemonName, heading, familyName) {
  const headingLevels = levelMetadata[sitePokemonName];
  const lookupKeys = [heading, familyName]
    .map((value) => normalizeName(normalizeHeading(value)))
    .filter(Boolean);

  const levels = [];
  for (const key of lookupKeys) {
    const metadataEntry = headingLevels?.get(key);
    if (!metadataEntry) {
      continue;
    }

    if (Number.isFinite(metadataEntry.unlockLevel)) {
      levels.push(metadataEntry.unlockLevel);
    }
    if (Number.isFinite(metadataEntry.enhancedLevel)) {
      levels.push(metadataEntry.enhancedLevel);
    }
  }

  levels.push(15);

  const normalizedLevels = Array.from(
    new Set(
      levels
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 15)
        .map((value) => Number(value))
    )
  ).sort((a, b) => a - b);

  return normalizedLevels.length > 0 ? normalizedLevels : [...DEFAULT_LEVELS];
}

function computeRepresentativeFormulaPercent({ components, sitePokemonName, heading, familyName, levelMetadata, statsMap }) {
  const ratioComponent = components.ratio || components.maxhp || components["maxhp%"];
  const sliderComponent = components.slider || components.perlevel;
  const baseComponent = components.base;

  if (!ratioComponent && !sliderComponent && !baseComponent) {
    return null;
  }

  const ratioBefore = ratioComponent ? aggregatePartValues(ratioComponent.beforeParts) : 0;
  const ratioAfter = ratioComponent ? aggregatePartValues(ratioComponent.afterParts) : 0;
  const sliderBefore = sliderComponent ? aggregatePartValues(sliderComponent.beforeParts) : 0;
  const sliderAfter = sliderComponent ? aggregatePartValues(sliderComponent.afterParts) : 0;
  const baseBefore = baseComponent ? aggregatePartValues(baseComponent.beforeParts) : 0;
  const baseAfter = baseComponent ? aggregatePartValues(baseComponent.afterParts) : 0;

  const statKey = ratioComponent ? inferStatKeyFromRatio(ratioComponent) : null;
  const pokemonStats = statsMap.get(normalizeName(sitePokemonName));
  const representativeLevels = getRepresentativeLevels(levelMetadata, sitePokemonName, heading, familyName);

  const deltas = [];
  for (const level of representativeLevels) {
    const levelStats = pokemonStats?.get(level);
    const statValue = statKey && levelStats ? Number(levelStats[statKey]) || 0 : 0;

    if (ratioComponent && statKey && !levelStats) {
      continue;
    }

    const beforeValue = (ratioBefore / 100) * statValue + sliderBefore * level + baseBefore;
    const afterValue = (ratioAfter / 100) * statValue + sliderAfter * level + baseAfter;

    if (!Number.isFinite(beforeValue) || beforeValue === 0 || !Number.isFinite(afterValue)) {
      continue;
    }

    deltas.push(((afterValue - beforeValue) / beforeValue) * 100);
  }

  return deltas.length > 0 ? median(deltas) : null;
}

function createPercentSummary(sectionLabel, percentDelta) {
  const label = summaryLabelForSection(sectionLabel);
  return {
    text: `${label}: ${formatDeltaSummary(percentDelta)}`,
    kind: "formula_percent",
    baseLabel: normalizeName(label),
    valueText: formatDeltaSummary(percentDelta)
  };
}

function createFallbackSummary(sectionLabel, beforeRaw, afterRaw) {
  return {
    text: `${summaryLabelForSection(sectionLabel)}: ${humanizeUnit(beforeRaw)} → ${humanizeUnit(afterRaw)}`,
    kind: "fallback_direct",
    baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
    valueText: `${humanizeUnit(beforeRaw)} → ${humanizeUnit(afterRaw)}`
  };
}

function translateFormulaSection(sectionLabel, lines, context) {
  const { components } = parseFormulaComponents(lines);
  const componentEntries = Object.values(components);

  if (componentEntries.length === 0) {
    return null;
  }

  const ratioComponent = components.ratio || components.maxhp || components["maxhp%"];
  if (ratioComponent && !hasStableUnits(ratioComponent)) {
    const beforePrimary = ratioComponent.beforeParts[0];
    const afterPrimary = ratioComponent.afterParts[0];
    if (beforePrimary && afterPrimary) {
      const beforeText = beforePrimary.unitKey.includes("spatk") || beforePrimary.unitKey.includes("sp atk")
        ? "Sp. Atk scaling"
        : humanizeUnit(beforePrimary.raw);
      const afterText = humanizeUnit(afterPrimary.raw);

      return [{
        text: `${summaryLabelForSection(sectionLabel)}: ${beforeText} replaced with ${afterText}.`,
        kind: "scaling_change",
        baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
        valueText: `${beforeText} replaced with ${afterText}`
      }];
    }
  }

  const stablePercentDeltas = componentEntries
    .filter(hasStableUnits)
    .map(computeComponentPercent)
    .filter((value) => Number.isFinite(value));

  if (stablePercentDeltas.length > 0) {
    const minDelta = Math.min(...stablePercentDeltas);
    const maxDelta = Math.max(...stablePercentDeltas);
    if (Math.abs(maxDelta - minDelta) <= 4) {
      return [createPercentSummary(sectionLabel, median(stablePercentDeltas))];
    }
  }

  const representativeDelta = computeRepresentativeFormulaPercent({
    components,
    sitePokemonName: context.sitePokemonName,
    heading: context.heading,
    familyName: context.familyName,
    levelMetadata: context.levelMetadata,
    statsMap: context.statsMap
  });

  if (Number.isFinite(representativeDelta)) {
    return [createPercentSummary(sectionLabel, representativeDelta)];
  }

  if (stablePercentDeltas.length === 1) {
    return [createPercentSummary(sectionLabel, stablePercentDeltas[0])];
  }

  const ratioFallback = components.ratio || components.maxhp || components["maxhp%"] || components.base || components.slider || components.perlevel;
  if (ratioFallback) {
    return [createFallbackSummary(sectionLabel, ratioFallback.beforeRaw, ratioFallback.afterRaw)];
  }

  return null;
}

function translateStatSection(sectionLabel, lines) {
  const levelSeriesSummary = summarizePreviousUpdatedSeries(lines) || summarizeLevelSeries(sectionLabel, lines);
  if (levelSeriesSummary) {
    return levelSeriesSummary;
  }

  const parsedLevels = lines
    .map((line) => String(line || "").trim())
    .map((line) => {
      const match = line.replace(/,/g, "").match(/^Lv(?:l)?\s*(\d+).*?(-?\d+(?:\.\d+)?)\s*(?:->|→)\s*(-?\d+(?:\.\d+)?)/i);
      if (!match) {
        return null;
      }

      return {
        level: Number(match[1]),
        before: Number(match[2]),
        after: Number(match[3])
      };
    })
    .filter(Boolean);

  if (parsedLevels.length < 2) {
    return null;
  }

  const changedLevels = parsedLevels.filter((entry) => Math.abs(entry.before - entry.after) > 0.001);
  if (changedLevels.length === 0) {
    const firstEntry = parsedLevels[0];
    const lastEntry = parsedLevels[parsedLevels.length - 1];
    return [{
      text: `${summaryLabelForSection(sectionLabel)}: ${formatNumber(firstEntry.before)}–${formatNumber(lastEntry.before)} → ${formatNumber(firstEntry.after)}–${formatNumber(lastEntry.after)}`,
      kind: "stat_range",
      baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
      valueText: `${formatNumber(firstEntry.before)}–${formatNumber(lastEntry.before)} → ${formatNumber(firstEntry.after)}–${formatNumber(lastEntry.after)}`
    }];
  }

  const first = changedLevels[0];
  const last = changedLevels[changedLevels.length - 1];
  return [{
    text: `${summaryLabelForSection(sectionLabel)}: ${formatNumber(first.before)}–${formatNumber(last.before)} → ${formatNumber(first.after)}–${formatNumber(last.after)}`,
    kind: "stat_range",
    baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
    valueText: `${formatNumber(first.before)}–${formatNumber(last.before)} → ${formatNumber(first.after)}–${formatNumber(last.after)}`
  }];
}

function translateEnergyLine(beforeRaw, afterRaw) {
  const beforeMatch = String(beforeRaw || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  const afterMatch = String(afterRaw || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!beforeMatch || !afterMatch) {
    return null;
  }

  const beforeValue = Number(beforeMatch[1]);
  const afterValue = Number(afterMatch[1]);
  if (!Number.isFinite(beforeValue) || beforeValue === 0 || !Number.isFinite(afterValue)) {
    return null;
  }

  return `Unite Gauge energy required: ${formatDeltaSummary(((afterValue - beforeValue) / beforeValue) * 100)}`;
}

function translateDirectChange(label, beforeRaw, afterRaw, parentLabel = "") {
  const normalizedLabel = normalizeName(label || parentLabel);
  if (normalizedLabel === "energyrequired" || normalizedLabel === "energyneeded") {
    const energySummary = translateEnergyLine(beforeRaw, afterRaw);
    if (energySummary) {
      return energySummary;
    }
  }

  const chosenLabel = label || parentLabel || "General";
  return `${summaryLabelForSection(chosenLabel)}: ${humanizeUnit(beforeRaw)} → ${humanizeUnit(afterRaw)}`;
}

function normalizeSentence(text) {
  const trimmed = cleanText(text)
    .replace(/\*\*/g, "")
    .replace(/\bLvl\b/gi, "Level")
    .replace(/^BUGFIX:?\s*/i, "Bug fix: ")
    .replace(/^NEW:?\s*/i, "New: ")
    .replace(/^NOTES?:?\s*/i, "")
    .replace(/^EFFECT\s*(?:->|:)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!trimmed) {
    return "";
  }

  const firstChar = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1);
  const normalized = `${firstChar}${rest}`;
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function summarizeFormulaOnlySection(sectionLabel, heading) {
  const headingText = String(heading || "");
  const label = summaryLabelForSection(sectionLabel);

  if (/\[(?:ADDED|NEW)\]/i.test(headingText) || /\bADDED\b/i.test(sectionLabel) || /\bNEW\b/i.test(sectionLabel)) {
    return `${label}: Added.`;
  }
  if (/\[BUFFED\]/i.test(headingText)) {
    return `${label}: Increased.`;
  }
  if (/\[NERFED\]/i.test(headingText)) {
    return `${label}: Decreased.`;
  }
  if (/\[(?:ADJUSTED|REWORKED?)\]/i.test(headingText)) {
    return `${label}: Adjusted.`;
  }

  return `${label}: Adjusted.`;
}

function translateGenericSection(sectionLabel, lines, context) {
  const levelSeriesSummary = summarizeLevelSeries(sectionLabel, lines);
  if (levelSeriesSummary) {
    return levelSeriesSummary;
  }

  if (lines.length > 0 && lines.every((line) => /^(Ratio|Slider|Base|Per Level|Max HP%):/i.test(line))) {
    return [{
      text: summarizeFormulaOnlySection(sectionLabel, context.heading),
      kind: "formula_only",
      baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
      valueText: summarizeFormulaOnlySection(sectionLabel, context.heading)
    }];
  }

  const outputs = [];
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) {
      continue;
    }

    if (/^Fixed a bug/i.test(line) || /^Bug fix/i.test(line)) {
      outputs.push({
        text: normalizeSentence(line),
        kind: "bugfix",
        baseLabel: "bugfix",
        valueText: normalizeSentence(line)
      });
      continue;
    }

    const parsed = parseChangeLine(line);
    if (parsed) {
      outputs.push({
        text: translateDirectChange(parsed.label, parsed.beforeRaw, parsed.afterRaw),
        kind: "direct",
        baseLabel: normalizeName(summaryLabelForSection(parsed.label)),
        valueText: `${humanizeUnit(parsed.beforeRaw)} → ${humanizeUnit(parsed.afterRaw)}`
      });
      continue;
    }

    if (/^(stats|naturalstats|basestats)$/i.test(normalizeName(sectionLabel))) {
      const statInfo = line.match(/^([^:]+):\s*(.+)$/);
      if (statInfo) {
        let statLabel = summaryLabelForSection(statInfo[1]);
        let statText = cleanText(statInfo[2]);
        const nestedStatInfo = statLabel === "General" ? statText.match(/^([^:]+):\s*(.+)$/) : null;
        if (nestedStatInfo) {
          statLabel = summaryLabelForSection(nestedStatInfo[1]);
          statText = cleanText(nestedStatInfo[2]);
        }
        if (!/^stat\.?$/i.test(statText)) {
          outputs.push({
            text: `${statLabel}: ${normalizeSentence(statText)}`,
            kind: "prose",
            baseLabel: normalizeName(statLabel),
            valueText: normalizeSentence(statText)
          });
        }
        continue;
      }
    }

    if (/(?:->|→)/.test(line)) {
      const [beforeRaw, afterRaw] = line.split(/(?:->|→)/, 2).map((part) => part.trim());
      outputs.push({
        text: translateDirectChange("", beforeRaw, afterRaw, sectionLabel),
        kind: "direct",
        baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
        valueText: `${humanizeUnit(beforeRaw)} → ${humanizeUnit(afterRaw)}`
      });
      continue;
    }

    outputs.push({
      text: `${summaryLabelForSection(sectionLabel)}: ${normalizeSentence(line)}`,
      kind: "prose",
      baseLabel: normalizeName(summaryLabelForSection(sectionLabel)),
      valueText: normalizeSentence(line)
    });
  }

  return outputs;
}

function translateSection(sectionLabel, content, context) {
  const lines = cleanText(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const statTranslation = translateStatSection(sectionLabel, lines);
  if (statTranslation) {
    return statTranslation;
  }

  const formulaTranslation = translateFormulaSection(sectionLabel, lines, context);
  if (formulaTranslation) {
    return formulaTranslation;
  }

  return translateGenericSection(sectionLabel, lines, context);
}

function translateLegacyBody(body, context, reportEntries) {
  const normalizedBody = cleanText(body);
  const paragraphs = normalizedBody.split(/\n{2,}/).filter(Boolean);
  const outputs = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const previousUpdatedLineCount = lines.filter((line) => /^(Previous|Updated)\s+[^:]+:/i.test(line)).length;
    const startsWithPreviousUpdatedBlock = previousUpdatedLineCount >= 2 && /^(Previous|Updated)\s+[^:]+:/i.test(lines[0]);
    let sectionLabel = startsWithPreviousUpdatedBlock ? normalizeHeading(context.heading || "General") : parseLegacyLabel(lines[0]);
    let sectionLines = lines;

    if (sectionLabel && !startsWithPreviousUpdatedBlock) {
      sectionLines = lines.slice(1);
    }

    if (!sectionLabel) {
      sectionLabel = lines.some((line) => /^(Ratio|Slider|Base|Per Level|Max HP%)/i.test(line))
        ? "Damage"
        : "General";
    }

    const translated = translateSection(sectionLabel, sectionLines.join("\n"), context);
    if (translated.length > 0) {
      outputs.push(...translated);
    } else {
      const fallbackLine = normalizeSentence(paragraph);
      outputs.push({
        text: fallbackLine,
        kind: "fallback",
        baseLabel: "fallback",
        valueText: fallbackLine
      });
      reportEntries.push({
        reason: "legacy_fallback",
        body: paragraph
      });
    }
  }

  return outputs;
}

function collapseLineObjects(lineObjects) {
  const collapsed = [];

  for (let index = 0; index < lineObjects.length; index += 1) {
    const current = lineObjects[index];

    if (current.kind === "formula_percent") {
      const related = [current];
      let cursor = index + 1;
      while (
        cursor < lineObjects.length &&
        lineObjects[cursor].kind === "formula_percent" &&
        lineObjects[cursor].baseLabel === current.baseLabel &&
        lineObjects[cursor].valueText === current.valueText
      ) {
        related.push(lineObjects[cursor]);
        cursor += 1;
      }

      if (related.length > 1) {
        const label = toTitleCase(current.baseLabel.replace(/amount$/, "amount"));
        collapsed.push(`${label}: ${current.valueText}`);
        index = cursor - 1;
        continue;
      }
    }

    collapsed.push(current.text);
  }

  return Array.from(new Set(collapsed));
}

function createPatchNoteTranslator({ pokemonDetails, statsEntries = [] }) {
  const levelMetadata = buildLevelMetadata(pokemonDetails);
  const statsMap = buildStatsMap(statsEntries);
  const reportEntries = [];

  function translateChange(sitePokemonName, change, options = {}) {
    const normalizedHeading = normalizeHeading(change.heading);
    const body = cleanText(change.body);
    const sections = parseModernSections(body);
    const localReport = [];

    let lineObjects;
    if (sections.length > 0) {
      lineObjects = sections.flatMap((section) =>
        translateSection(section.label, section.content, {
          sitePokemonName,
          heading: normalizedHeading,
          familyName: options.familyName || "",
          levelMetadata,
          statsMap
        })
      );
      if (lineObjects.length === 0) {
        lineObjects = translateLegacyBody(body, {
          sitePokemonName,
          heading: normalizedHeading,
          familyName: options.familyName || "",
          levelMetadata,
          statsMap
        }, localReport);
      }
    } else {
      lineObjects = translateLegacyBody(body, {
        sitePokemonName,
        heading: normalizedHeading,
        familyName: options.familyName || "",
        levelMetadata,
        statsMap
      }, localReport);
    }

    const lines = compressTranslatedStatLines(normalizedHeading, collapseLineObjects(lineObjects));
    if (lines.length === 0) {
      const fallbackText = normalizeSentence(body);
      lines.push(fallbackText);
      localReport.push({
        reason: "empty_translation",
        body
      });
    }

    if (localReport.length > 0) {
      for (const entry of localReport) {
        reportEntries.push({
          pokemon: sitePokemonName,
          heading: change.heading,
          reason: entry.reason,
          body: entry.body
        });
      }
    }

    return {
      heading: change.heading,
      lines
    };
  }

  function getReport() {
    return [...reportEntries];
  }

  return {
    translateChange,
    getReport
  };
}

module.exports = {
  createPatchNoteTranslator
};
