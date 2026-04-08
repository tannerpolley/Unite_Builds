document.addEventListener("DOMContentLoaded", async () => {
  const controlsShell = document.querySelector(".controls-shell");
  const tableScrollShell = document.querySelector(".table-scroll-shell");
  const tableContainer = document.getElementById("moveset-table");
  const movesetCards = document.getElementById("moveset-cards");
  const popup = document.getElementById("popup");
  const popupContent = document.getElementById("popupContent");
  const body = document.body;
  const roleFilters = document.querySelectorAll('input[name="role"]');
  const nameSearch = document.getElementById("nameSearch");
  const resetFilters = document.getElementById("resetFilters");
  const filters = document.getElementById("filters");
  const mobileSortButton = document.getElementById("mobileSortButton");
  const mobileFiltersButton = document.getElementById("mobileFiltersButton");
  const mobileHelpButton = document.getElementById("mobileHelpButton");
  const desktopMobilePreviewInlineButton = document.getElementById("desktopMobilePreviewInlineButton");
  const desktopMobilePreviewButton = document.getElementById("desktopMobilePreviewButton");
  const desktopTipsButton = document.getElementById("desktopTipsButton");
  const hideTiersButton = document.getElementById("hideTiersButton");
  const tierInfoButton = document.getElementById("tierInfoButton");
  const debugUiButton = document.getElementById("debugUiButton");
  const userViewButton = document.getElementById("userViewButton");
  const pickRateMin = document.getElementById("pickRateMin");
  const pickRateMax = document.getElementById("pickRateMax");
  const winRateMin = document.getElementById("winRateMin");
  const winRateMax = document.getElementById("winRateMax");
  const mobileSortPanel = document.getElementById("mobileSortPanel");
  const mobileHelpPanel = document.getElementById("mobileHelpPanel");
  const tierHelpPanel = document.getElementById("tierHelpPanel");
  const mobilePanelScrim = document.getElementById("mobilePanelScrim");
  const closeFiltersPanel = document.getElementById("closeFiltersPanel");
  const closeSortPanel = document.getElementById("closeSortPanel");
  const closeHelpPanel = document.getElementById("closeHelpPanel");
  const closeTierHelpPanel = document.getElementById("closeTierHelpPanel");
  const mobileSortColumn = document.getElementById("mobileSortColumn");
  const mobileSortDirection = document.getElementById("mobileSortDirection");
  const tierInfoElements = {
    model: document.getElementById("tierModelValue"),
    trustPivot: document.getElementById("tierTrustPivotValue"),
    trustSharpness: document.getElementById("tierTrustSharpnessValue"),
    winWeight: document.getElementById("tierWinWeightValue"),
    pickWeight: document.getElementById("tierPickWeightValue"),
    banWeight: document.getElementById("tierBanWeightValue"),
    banScale: document.getElementById("tierBanScaleValue"),
    outlierFenceMultiplier: document.getElementById("tierOutlierFenceValue"),
    normalizationCutoff: document.getElementById("tierNormalizationCutoffValue"),
    bandSummary: document.getElementById("tierBandSummary"),
    displayCutoff: document.getElementById("tierDisplayCutoffValue"),
  };
  let assetVersion = "";
  const defaultTierScoreConfig = {
    model: "trusted-gated-log-trust-normalized",
    displayCutoff: 1.0,
    outlierFenceMultiplier: 1.5,
    trustPivot: 1.0,
    trustSharpness: 0.25,
    winWeight: 0.8,
    pickWeight: 0.25,
    banWeight: 0.005,
    banScale: 2.0,
    bands: [
      { label: "A+", threshold: 0.8333333333333334 },
      { label: "A", threshold: 0.6666666666666666 },
      { label: "A-", threshold: 0.5 },
      { label: "B+", threshold: 0.3333333333333333 },
      { label: "B", threshold: 0.16666666666666666 },
      { label: "B-", threshold: 0.0 },
      { label: "C+", threshold: -0.16666666666666666 },
      { label: "C", threshold: -0.3333333333333333 },
      { label: "C-", threshold: -0.5 },
      { label: "D+", threshold: -0.6666666666666666 },
      { label: "D", threshold: -0.8333333333333334 },
      { label: "D-", threshold: -1.0 },
    ],
  };
  const defaultPickRateMin = 1.0;

  let tableItems = [];
  let tableItemsPromise = null;
  let moveDetailsData = null;
  let moveDetailsPromise = null;
  let siteMetadata = null;
  let siteMetadataPromise = null;
  let patchHistoryData = null;
  let patchHistoryPromise = null;
  let movePatchHistoryData = null;
  let movePatchHistoryPromise = null;
  let mobileCardObserver = null;
  const desktopPreviewStorageKey = "desktopMobilePreview";
  const userViewStorageKey = "userViewSimEnabled";
  const desktopControlLayoutClasses = ["desktop-controls-wide", "desktop-controls-compact"];
  const desktopTableLayoutClasses = ["desktop-table-wide", "desktop-table-compact", "desktop-table-narrow"];
  const mobileCardLayoutClasses = ["mobile-card-compact", "mobile-card-wide"];

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(min, max, progress) {
    return min + ((max - min) * progress);
  }

  function setCssPixelVar(element, name, value) {
    element?.style.setProperty(name, `${value.toFixed(2)}px`);
  }

  function setExclusiveClass(element, classNames, activeClass) {
    if (!element) {
      return;
    }

    classNames.forEach((className) => {
      element.classList.toggle(className, className === activeClass);
    });
  }

  function normalizeSortColumn(column) {
    if (column === "Tier" && tierColumnHidden) {
      return "Win Rate";
    }
    return column;
  }

  function parseThresholdValue(input) {
    const value = parseFloat(String(input ?? "").trim());
    return Number.isFinite(value) ? value : null;
  }

  function rangeFilterMatches(value, minThreshold, maxThreshold) {
    if (minThreshold !== null && value < minThreshold) {
      return false;
    }

    if (maxThreshold !== null && value > maxThreshold) {
      return false;
    }

    return true;
  }

  function getTierDisplayData(entry) {
    return {
      label: entry["Tier"],
      rawScore: entry["Tier Raw Score"],
      score: entry["Tier Score"],
    };
  }

  function formatTierConfigNumber(value, digits = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "";
    }
    return digits > 0 ? numeric.toFixed(digits) : String(Math.round(numeric));
  }

  function applyTierInfoText(metadata = {}) {
    const config = {
      ...defaultTierScoreConfig,
      ...(metadata?.tierScoreConfig || {}),
    };

    if (tierInfoElements.model) {
      tierInfoElements.model.textContent = config.model || defaultTierScoreConfig.model;
    }
    if (tierInfoElements.trustPivot) {
      tierInfoElements.trustPivot.textContent = formatTierConfigNumber(config.trustPivot, 1);
    }
    if (tierInfoElements.trustSharpness) {
      tierInfoElements.trustSharpness.textContent = formatTierConfigNumber(config.trustSharpness, 2);
    }
    if (tierInfoElements.winWeight) {
      tierInfoElements.winWeight.textContent = formatTierConfigNumber(config.winWeight, 2);
    }
    if (tierInfoElements.pickWeight) {
      tierInfoElements.pickWeight.textContent = formatTierConfigNumber(config.pickWeight, 2);
    }
    if (tierInfoElements.banWeight) {
      tierInfoElements.banWeight.textContent = formatTierConfigNumber(config.banWeight, 3);
    }
    if (tierInfoElements.banScale) {
      tierInfoElements.banScale.textContent = formatTierConfigNumber(config.banScale, 1);
    }
    if (tierInfoElements.outlierFenceMultiplier) {
      tierInfoElements.outlierFenceMultiplier.textContent = formatTierConfigNumber(config.outlierFenceMultiplier, 1);
    }
    if (tierInfoElements.normalizationCutoff) {
      tierInfoElements.normalizationCutoff.textContent = formatTierConfigNumber(config.displayCutoff, 1);
    }
    if (tierInfoElements.bandSummary) {
      const labels = (config.bands || []).map((band) => `${band.label} >= ${formatTierConfigNumber(band.threshold, 3)}`);
      tierInfoElements.bandSummary.textContent = labels.length ? `${labels.join(", ")}, and F below that` : "";
    }
    if (tierInfoElements.displayCutoff) {
      tierInfoElements.displayCutoff.textContent = formatTierConfigNumber(config.displayCutoff, 1);
    }
  }

  function isLocalDevelopmentOrigin() {
    if (location.protocol === "file:") {
      return true;
    }

    const hostname = String(location.hostname || "").toLowerCase();
    return hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  }

  function clearDesktopAdaptiveLayout() {
    if (controlsShell) {
      controlsShell.classList.remove(...desktopControlLayoutClasses);
      [
        "--controls-role-gap",
        "--controls-role-pad-y",
        "--controls-role-pad-x",
        "--controls-role-font-size",
        "--controls-action-gap",
        "--controls-action-pad-y",
        "--controls-action-pad-x",
        "--controls-action-font-size",
        "--controls-pick-label-size",
        "--controls-search-font-size",
        "--controls-pick-input-width"
      ].forEach((name) => controlsShell.style.removeProperty(name));
    }

    if (tableScrollShell) {
      tableScrollShell.classList.remove("desktop-table-fluid", ...desktopTableLayoutClasses);
    }

    if (tableContainer) {
      [
        "--table-header-size",
        "--table-cell-pad-y",
        "--table-cell-pad-x",
        "--table-image-size",
        "--table-move-gap",
        "--table-name-size",
        "--table-role-size",
        "--table-moveset-size",
        "--table-rate-size",
        "--table-tier-size",
        "--col-pokemon-width",
        "--col-name-width",
        "--col-role-width",
        "--col-moveset-width",
        "--col-moves-width",
        "--col-tier-width",
        "--col-winrate-width",
        "--col-pickrate-width"
      ].forEach((name) => tableContainer.style.removeProperty(name));
    }
  }

  function controlsOverflow(shell) {
    if (!shell || isPhoneView()) {
      return false;
    }

    const shellRect = shell.getBoundingClientRect();
    const measuredNodes = [
      shell.querySelector(".mobile-toolbar-search"),
      shell.querySelector(".control-box-tier-toggle"),
      shell.querySelector(".threshold-filters"),
      shell.querySelector(".role-filters"),
      shell.querySelector(".filter-actions")
    ].filter(Boolean);

    return measuredNodes.filter((node) => node.getClientRects().length > 0).some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < shellRect.left - 1 || rect.right > shellRect.right + 1;
    });
  }

  function distributeWidths(availableWidth, mins, targets, maxes) {
    const widths = targets.map((target, index) => clampNumber(target, mins[index], maxes[index]));
    const currentTotal = () => widths.reduce((sum, width) => sum + width, 0);
    let delta = availableWidth - currentTotal();

    if (Math.abs(delta) < 0.5) {
      return widths;
    }

    const limits = delta > 0 ? maxes : mins;
    const roomForChange = () => widths.reduce((sum, width, index) => {
      const remaining = delta > 0 ? limits[index] - width : width - limits[index];
      return sum + Math.max(0, remaining);
    }, 0);

    let remainingDelta = delta;
    let remainingRoom = roomForChange();

    if (remainingRoom <= 0) {
      return widths;
    }

    widths.forEach((width, index) => {
      if (Math.abs(remainingDelta) < 0.5) {
        return;
      }

      const remaining = delta > 0 ? limits[index] - width : width - limits[index];
      if (remaining <= 0) {
        return;
      }

      const share = remaining / remainingRoom;
      const change = Math.min(Math.abs(remainingDelta) * share, remaining);
      widths[index] = delta > 0 ? width + change : width - change;
      remainingDelta += delta > 0 ? -change : change;
    });

    return widths;
  }

  function applyDesktopAdaptiveLayout() {
    if (!controlsShell || !tableContainer || !tableScrollShell) {
      return;
    }

    if (isPhoneView()) {
      clearDesktopAdaptiveLayout();
      return;
    }

    const controlsWidth = controlsShell.clientWidth;
    const tableWidth = tableScrollShell.clientWidth;
    const desktopUiScale = 0.88;
    const desktopIconScale = 0.9;

    if (!controlsWidth || !tableWidth) {
      return;
    }

    const controlsProgress = clampNumber((controlsWidth - 720) / 920, 0, 1);
    setCssPixelVar(controlsShell, "--controls-role-gap", lerp(6, 10, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-role-pad-y", lerp(6, 8, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-role-pad-x", lerp(8, 14, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-role-font-size", lerp(12.4, 15.8, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-action-gap", lerp(6, 8, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-action-pad-y", lerp(8, 10, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-action-pad-x", lerp(10, 18, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-action-font-size", lerp(12.4, 15.6, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-pick-label-size", lerp(12.6, 16.2, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-search-font-size", lerp(15.2, 17.6, controlsProgress) * desktopUiScale);
    setCssPixelVar(controlsShell, "--controls-pick-input-width", lerp(58, 68, controlsProgress) * desktopUiScale);

    let chosenControlLayout = controlsWidth >= 1460 ? "desktop-controls-wide" : "desktop-controls-compact";
    setExclusiveClass(controlsShell, desktopControlLayoutClasses, chosenControlLayout);
    // Force layout before checking bounds.
    void controlsShell.offsetWidth;
    if (chosenControlLayout === "desktop-controls-wide" && controlsOverflow(controlsShell)) {
      chosenControlLayout = "desktop-controls-compact";
      setExclusiveClass(controlsShell, desktopControlLayoutClasses, chosenControlLayout);
    }

    const tableProgress = clampNumber((tableWidth - 760) / 840, 0, 1);
    const easedProgress = Math.pow(tableProgress, 0.9);
    setCssPixelVar(tableContainer, "--table-header-size", lerp(17.2, 22.2, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-cell-pad-y", lerp(8.4, 10.8, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-cell-pad-x", lerp(2.8, 7.2, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-image-size", lerp(44, 76, easedProgress) * desktopIconScale);
    setCssPixelVar(tableContainer, "--table-move-gap", lerp(0, 5, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-name-size", lerp(16.2, 21.4, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-role-size", lerp(16.2, 21.4, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-moveset-size", lerp(16.0, 20.8, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-tier-size", lerp(14.0, 18.6, easedProgress) * desktopUiScale);
    setCssPixelVar(tableContainer, "--table-rate-size", lerp(16.6, 23.6, easedProgress) * desktopUiScale);

    const availableTableWidth = Math.max(tableWidth - 18, 760);
    const minimumColumnWidths = [64, 104, 102, 126, 80, 72, 108, 108];
    const targetColumnWidths = [
      availableTableWidth * 0.074,
      availableTableWidth * 0.158,
      availableTableWidth * 0.13,
      availableTableWidth * 0.225,
      availableTableWidth * 0.122,
      availableTableWidth * 0.083,
      availableTableWidth * 0.121,
      availableTableWidth * 0.121
    ];
    const maximumColumnWidths = [94, 204, 170, 246, 172, 112, 168, 168];
    const visibleColumnIndexes = tierColumnHidden ? [0, 1, 2, 3, 4, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    const distributedWidths = distributeWidths(
      availableTableWidth,
      visibleColumnIndexes.map((index) => minimumColumnWidths[index]),
      visibleColumnIndexes.map((index) => targetColumnWidths[index]),
      visibleColumnIndexes.map((index) => maximumColumnWidths[index])
    );

    const resolvedWidths = tierColumnHidden
      ? [
          distributedWidths[0],
          distributedWidths[1],
          distributedWidths[2],
          distributedWidths[3],
          distributedWidths[4],
          0,
          distributedWidths[5],
          distributedWidths[6]
        ]
      : distributedWidths;

    setCssPixelVar(tableContainer, "--col-pokemon-width", resolvedWidths[0]);
    setCssPixelVar(tableContainer, "--col-name-width", resolvedWidths[1]);
    setCssPixelVar(tableContainer, "--col-role-width", resolvedWidths[2]);
    setCssPixelVar(tableContainer, "--col-moveset-width", resolvedWidths[3]);
    setCssPixelVar(tableContainer, "--col-moves-width", resolvedWidths[4]);
    setCssPixelVar(tableContainer, "--col-tier-width", resolvedWidths[5]);
    setCssPixelVar(tableContainer, "--col-winrate-width", resolvedWidths[6]);
    setCssPixelVar(tableContainer, "--col-pickrate-width", resolvedWidths[7]);

    tableScrollShell.classList.add("desktop-table-fluid");
    const tableLayoutClass = tableWidth >= 1320
      ? "desktop-table-wide"
      : tableWidth >= 900
        ? "desktop-table-compact"
        : "desktop-table-narrow";
    setExclusiveClass(tableScrollShell, desktopTableLayoutClasses, tableLayoutClass);
  }

  function applyMobileCardSizing(card) {
    if (!card) {
      return;
    }

    const width = card.clientWidth;
    if (!width) {
      return;
    }

    const isWideMobileCard = width >= 460;
    setExclusiveClass(card, mobileCardLayoutClasses, isWideMobileCard ? "mobile-card-wide" : "mobile-card-compact");

    if (isWideMobileCard) {
      const progress = clampNumber((width - 460) / 290, 0, 1);
      const padX = lerp(10, 13, progress);
      const gap = lerp(6, 9, progress);
      const innerWidth = Math.max(width - (padX * 2), 320);
      const contentWidth = Math.max(innerWidth - (gap * 3), 300);
      const metricsMinWidth = lerp(132, 160, progress);
      const metricsMaxWidth = lerp(160, 202, progress);
      const pokemonMinWidth = lerp(108, 120, progress);
      const pokemonMaxWidth = lerp(152, 176, progress);
      const moveColMinWidth = lerp(64, 72, progress);
      const moveColMaxWidth = lerp(96, 108, progress);

      let metricsWidth = clampNumber(contentWidth * lerp(0.31, 0.33, progress), metricsMinWidth, metricsMaxWidth);
      let remainingAfterMetrics = Math.max(contentWidth - metricsWidth, pokemonMinWidth + (moveColMinWidth * 2));
      let pokemonWidth = clampNumber(remainingAfterMetrics * lerp(0.42, 0.4, progress), pokemonMinWidth, pokemonMaxWidth);
      let moveColumnWidth = clampNumber((remainingAfterMetrics - pokemonWidth) / 2, moveColMinWidth, moveColMaxWidth);
      pokemonWidth = clampNumber(contentWidth - metricsWidth - (moveColumnWidth * 2), pokemonMinWidth, pokemonMaxWidth);
      metricsWidth = clampNumber(contentWidth - pokemonWidth - (moveColumnWidth * 2), metricsMinWidth, metricsMaxWidth);

      if (pokemonWidth + (moveColumnWidth * 2) + metricsWidth > contentWidth) {
        const overflow = (pokemonWidth + (moveColumnWidth * 2) + metricsWidth) - contentWidth;
        metricsWidth = Math.max(metricsMinWidth, metricsWidth - overflow);
      }

      pokemonWidth = contentWidth - metricsWidth - (moveColumnWidth * 2);
      const pokemonImgSize = lerp(52, 68, progress);
      const pokemonTextGap = clampNumber(gap + 2, 7, 12);
      const pokemonTextWidth = Math.max(pokemonWidth - pokemonImgSize - pokemonTextGap, 42);
      const metricBubbleWidth = Math.max((metricsWidth - (gap * 2)) / 3, 50);

      setCssPixelVar(card, "--mc-gap", gap);
      setCssPixelVar(card, "--mc-card-pad-x", padX);
      setCssPixelVar(card, "--mc-card-pad-y", lerp(10, 12, progress));
      setCssPixelVar(card, "--mc-pokemon-width", pokemonWidth);
      setCssPixelVar(card, "--mc-pokemon-text-gap", pokemonTextGap);
      setCssPixelVar(card, "--mc-pokemon-text-width", pokemonTextWidth);
      setCssPixelVar(card, "--mc-move-col-width", moveColumnWidth);
      setCssPixelVar(card, "--mc-metrics-width", metricsWidth);
      setCssPixelVar(card, "--mc-pokemon-img", pokemonImgSize);
      setCssPixelVar(card, "--mc-name-size", lerp(13.6, 16.6, progress));
      setCssPixelVar(card, "--mc-role-size", lerp(11.4, 13.2, progress));
      setCssPixelVar(card, "--mc-tier-size", lerp(8.6, 9.8, progress));
      setCssPixelVar(card, "--mc-metric-label-size", clampNumber(metricBubbleWidth * 0.118, 6.8, 8.9));
      setCssPixelVar(card, "--mc-metric-value-size", clampNumber(metricBubbleWidth * 0.19, 10.2, 14.2));
      setCssPixelVar(card, "--mc-metric-pad-x", clampNumber(metricBubbleWidth * 0.075, 3.5, 6));
      setCssPixelVar(card, "--mc-metric-pad-y", clampNumber(metricBubbleWidth * 0.075, 4, 6));
      setCssPixelVar(card, "--mc-metric-gap", clampNumber(metricBubbleWidth * 0.03, 1, 2.25));
      setCssPixelVar(card, "--mc-metric-top-pad", 0);
      setCssPixelVar(card, "--mc-move-icon-gap", 0);
      setCssPixelVar(card, "--mc-move-row-gap", lerp(5, 7, progress));
      setCssPixelVar(card, "--mc-move-icon-shell-size", lerp(40, 56, progress));
      setCssPixelVar(card, "--mc-move-icon-size", lerp(34, 46, progress));
      setCssPixelVar(card, "--mc-move-label-size", lerp(11.6, 13.4, progress));
      setCssPixelVar(card, "--mc-move-label-width", moveColumnWidth);
      return;
    }

    const progress = clampNumber((width - 320) / 180, 0, 1);
    const padX = lerp(8, 11, progress);
    const gap = lerp(6, 9, progress);
    const innerWidth = Math.max(width - (padX * 2), 260);
    const contentWidth = Math.max(innerWidth - (gap * 2), 240);
    const metricsMinWidth = lerp(84, 98, progress);
    const metricsMaxWidth = lerp(100, 120, progress);
    const moveGap = lerp(5, 8, progress);
    const moveColMinWidth = lerp(46, 56, progress);
    const moveGroupMinWidth = (moveColMinWidth * 2) + moveGap;
    const nonMetricsSpace = Math.max(contentWidth - metricsMinWidth, 180);
    const distributedNonMetrics = distributeWidths(
      nonMetricsSpace,
      [76, moveGroupMinWidth],
      [
        nonMetricsSpace * 0.33,
        nonMetricsSpace * 0.67
      ],
      [104, 198]
    );
    const pokemonWidth = distributedNonMetrics[0];
    const moveGroupWidth = distributedNonMetrics[1];
    const metricsWidth = clampNumber(
      contentWidth - pokemonWidth - moveGroupWidth,
      metricsMinWidth,
      metricsMaxWidth
    );
    const moveColWidth = clampNumber((moveGroupWidth - moveGap) / 2, moveColMinWidth, 96);
    const metricBubbleWidth = metricsWidth;

    setCssPixelVar(card, "--mc-gap", gap);
    setCssPixelVar(card, "--mc-card-pad-x", padX);
    setCssPixelVar(card, "--mc-card-pad-y", lerp(9, 11, progress));
    setCssPixelVar(card, "--mc-pokemon-width", pokemonWidth);
    setCssPixelVar(card, "--mc-move-group-width", moveGroupWidth);
    setCssPixelVar(card, "--mc-move-col-width", moveColWidth);
    setCssPixelVar(card, "--mc-metrics-width", metricsWidth);
    setCssPixelVar(card, "--mc-pokemon-img", lerp(52, 66, progress));
    setCssPixelVar(card, "--mc-name-size", lerp(13, 15.4, progress));
    setCssPixelVar(card, "--mc-role-size", lerp(11, 12.8, progress));
    setCssPixelVar(card, "--mc-tier-size", lerp(8.4, 9.4, progress));
    setCssPixelVar(card, "--mc-metric-label-size", clampNumber(metricBubbleWidth * 0.095, 6.6, 8.7));
    setCssPixelVar(card, "--mc-metric-value-size", clampNumber(metricBubbleWidth * 0.155, 10, 13.8));
    setCssPixelVar(card, "--mc-metric-pad-x", clampNumber(metricBubbleWidth * 0.09, 3.5, 6.5));
    setCssPixelVar(card, "--mc-metric-pad-y", clampNumber(metricBubbleWidth * 0.08, 4, 6));
    setCssPixelVar(card, "--mc-metric-gap", clampNumber(metricBubbleWidth * 0.03, 1, 2.5));
    setCssPixelVar(card, "--mc-metric-top-pad", 0);
    setCssPixelVar(card, "--mc-move-icon-gap", 0);
    setCssPixelVar(card, "--mc-move-row-gap", lerp(4.5, 6.5, progress));
    setCssPixelVar(card, "--mc-move-inner-gap", moveGap);
    setCssPixelVar(card, "--mc-move-icon-shell-size", lerp(44, 56, progress));
    setCssPixelVar(card, "--mc-move-icon-size", lerp(37, 48, progress));
    setCssPixelVar(card, "--mc-move-label-size", lerp(12.2, 13.4, progress));
    setCssPixelVar(card, "--mc-move-label-width", moveColWidth);
  }

  function observeMobileCards() {
    const cards = movesetCards.querySelectorAll(".mobile-card");
    cards.forEach((card) => applyMobileCardSizing(card));

    if (!mobileCardObserver) {
      return;
    }

    mobileCardObserver.disconnect();
    cards.forEach((card) => mobileCardObserver.observe(card));
  }

  function isDesktopMobilePreview() {
    return body.classList.contains("desktop-mobile-preview");
  }

  function canUseDesktopMobilePreview() {
    return isLocalDevelopmentOrigin();
  }

  function resetPopupScrollPosition() {
    popup.scrollTop = 0;
    popupContent.scrollTop = 0;
    popupContent.querySelectorAll(".move-popup-body, .popup-tab-panel, .popup-table-container").forEach((node) => {
      node.scrollTop = 0;
    });
  }

  function isPhoneView() {
    return window.matchMedia("(max-width: 750px)").matches || isDesktopMobilePreview();
  }

  function syncDesktopMobilePreviewButton() {
    const active = isDesktopMobilePreview();
    const enabled = canUseDesktopMobilePreview();
    if (desktopMobilePreviewButton) {
      desktopMobilePreviewButton.hidden = !enabled || body.classList.contains("user-view-sim");
      desktopMobilePreviewButton.textContent = active ? "Exit Preview" : "Mobile Preview";
      desktopMobilePreviewButton.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (desktopMobilePreviewInlineButton) {
      desktopMobilePreviewInlineButton.hidden = !enabled || !active || body.classList.contains("user-view-sim");
      desktopMobilePreviewInlineButton.setAttribute("aria-hidden", active ? "false" : "true");
    }
  }

  function removeDesktopPreviewControlsIfDisabled() {
    if (canUseDesktopMobilePreview()) {
      return;
    }
    desktopMobilePreviewButton?.remove();
    desktopMobilePreviewInlineButton?.remove();
    userViewButton?.remove();
    body.classList.remove("desktop-mobile-preview");
    body.classList.remove("user-view-sim");
    try {
      window.localStorage.removeItem(desktopPreviewStorageKey);
      window.localStorage.removeItem(userViewStorageKey);
    } catch (error) {
      console.warn("Unable to clear desktop mobile preview preference", error);
    }
  }

  function syncMobileSortControls() {
    if (mobileSortColumn) {
      mobileSortColumn.value = normalizeSortColumn(currentSort.column);
    }
    if (mobileSortDirection) {
      mobileSortDirection.value = currentSort.order;
    }
  }

  function closeMobilePanels() {
    body.classList.remove("mobile-panel-open", "mobile-panel-filters-open", "mobile-panel-sort-open", "mobile-panel-help-open", "mobile-panel-tier-open", "desktop-help-open", "desktop-tier-help-open");
    if (mobilePanelScrim) {
      mobilePanelScrim.classList.add("hidden");
    }
  }

  function openMobilePanel(panelName) {
    if (!isPhoneView()) {
      return;
    }

    closeMobilePanels();
    body.classList.add("mobile-panel-open");
    body.classList.add(`mobile-panel-${panelName}-open`);
    if (mobilePanelScrim) {
      mobilePanelScrim.classList.remove("hidden");
    }
    syncMobileSortControls();
  }

  function openHelpPanel() {
    closeMobilePanels();
    if (isPhoneView()) {
      body.classList.add("mobile-panel-open", "mobile-panel-help-open");
    } else {
      body.classList.add("desktop-help-open");
    }
    if (mobilePanelScrim) {
      mobilePanelScrim.classList.remove("hidden");
    }
  }

  function openTierHelpPanel() {
    closeMobilePanels();
    if (isPhoneView()) {
      body.classList.add("mobile-panel-open", "mobile-panel-tier-open");
    } else {
      body.classList.add("desktop-tier-help-open");
    }
    if (mobilePanelScrim) {
      mobilePanelScrim.classList.remove("hidden");
    }
  }

  function setDesktopMobilePreview(enabled) {
    if (!canUseDesktopMobilePreview()) {
      body.classList.remove("desktop-mobile-preview");
      syncDesktopMobilePreviewButton();
      return;
    }
    body.classList.toggle("desktop-mobile-preview", enabled);
    syncDesktopMobilePreviewButton();
    closeMobilePanels();
    renderRows(filterItems());
    applyDesktopAdaptiveLayout();

    try {
      window.localStorage.setItem(desktopPreviewStorageKey, enabled ? "true" : "false");
    } catch (error) {
      console.warn("Unable to persist desktop mobile preview preference", error);
    }
  }

  let tierColumnHidden = false;
  let previousSortBeforeTierHide = null;

  function syncHideTiersButton() {
    if (!hideTiersButton) {
      return;
    }

    hideTiersButton.setAttribute("aria-pressed", tierColumnHidden ? "true" : "false");
    hideTiersButton.textContent = tierColumnHidden ? "Show Tiers" : "Hide Tiers";
  }

  function setTierColumnHidden(hidden) {
    if (tierColumnHidden === hidden) {
      syncHideTiersButton();
      return;
    }

    const wasHidden = tierColumnHidden;
    tierColumnHidden = hidden;
    body.classList.toggle("tiers-hidden", hidden);

    if (hidden) {
      previousSortBeforeTierHide = { ...currentSort };
      currentSort = { column: "Win Rate", order: "desc" };
    } else if (wasHidden && previousSortBeforeTierHide) {
      currentSort = { ...previousSortBeforeTierHide };
      previousSortBeforeTierHide = null;
    }

    syncHideTiersButton();
    renderRows(filterItems());
  }

  function initializeTierColumnToggle() {
    if (!hideTiersButton) {
      return;
    }

    syncHideTiersButton();
    hideTiersButton.addEventListener("click", () => {
      setTierColumnHidden(!tierColumnHidden);
    });
  }

  function hasActiveFilters() {
    const pickMinValue = parseThresholdValue(pickRateMin?.value);
    return Boolean(
      activeNameFilter ||
      activeRoleFilters.length > 0 ||
      nameSearch.value.trim() ||
      (pickMinValue !== null && pickMinValue !== defaultPickRateMin) ||
      parseThresholdValue(pickRateMax?.value) !== null ||
      parseThresholdValue(winRateMin?.value) !== null ||
      parseThresholdValue(winRateMax?.value) !== null
    );
  }

  function resetAllFilters() {
    activeNameFilter = null;
    activeRoleFilters = [];

    roleFilters.forEach(filter => {
      filter.checked = false;
      if (filter.closest('.role-option')) {
        filter.closest('.role-option').classList.remove('active-role');
      }
    });

    nameSearch.value = "";
    if (pickRateMin) {
      pickRateMin.value = String(defaultPickRateMin);
    }
    if (pickRateMax) {
      pickRateMax.value = "";
    }
    if (winRateMin) {
      winRateMin.value = "";
    }
    if (winRateMax) {
      winRateMax.value = "";
    }
    currentSort = { column: "Tier", order: 'desc' };
    syncMobileSortControls();
    closeMobilePanels();
    renderRows(filterItems());
  }

  async function fetchJsonAsset(path, fallbackValue, label, options = {}) {
    const { noStore = false, versioned = true } = options;

    try {
      const url = new URL(path, window.location.href);
      if (versioned) {
        const version = await getAssetVersion();
        if (version) {
          url.searchParams.set("v", version);
        }
      }

      const response = await fetch(url.toString(), {
        cache: noStore ? "no-store" : "default"
      });
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error loading ${label}:`, error);
      return fallbackValue;
    }
  }

  async function getAssetVersion() {
    if (assetVersion) {
      return assetVersion;
    }

    const metadata = await loadSiteMetadata();
    assetVersion = metadata.assetVersion || metadata.generatedAt || "";
    return assetVersion;
  }

  async function loadTableItems() {
    if (tableItems.length > 0) {
      return tableItems;
    }

    if (!tableItemsPromise) {
      tableItemsPromise = (async () => {
        tableItems = await fetchJsonAsset("static/json/moveset_rows.json", [], "table rows");
        return tableItems;
      })();
    }

    return tableItemsPromise;
  }

  async function loadMoveDetails() {
    if (moveDetailsData) {
      return moveDetailsData;
    }

    if (!moveDetailsPromise) {
      moveDetailsPromise = (async () => {
        moveDetailsData = await fetchJsonAsset("static/json/pokemon_popup_details.json", {}, "move details");
        return moveDetailsData;
      })();
    }

    return moveDetailsPromise;
  }

  async function loadSiteMetadata() {
    if (siteMetadata) {
      return siteMetadata;
    }

    if (!siteMetadataPromise) {
      siteMetadataPromise = (async () => {
        siteMetadata = await fetchJsonAsset(
          "static/json/site_metadata.json",
          {},
          "site metadata",
          { noStore: true, versioned: false }
        );
        return siteMetadata;
      })();
    }

    return siteMetadataPromise;
  }

  async function loadPatchHistory() {
    if (patchHistoryData) {
      return patchHistoryData;
    }

    if (patchHistoryPromise) {
      return patchHistoryPromise;
    }

    patchHistoryPromise = (async () => {
      patchHistoryData = await fetchJsonAsset(
        "static/json/pokemon_patch_history.json",
        {},
        "patch history"
      );
      return patchHistoryData;
    })();

    return patchHistoryPromise;
  }

  async function loadMovePatchHistory() {
    if (movePatchHistoryData) {
      return movePatchHistoryData;
    }

    if (movePatchHistoryPromise) {
      return movePatchHistoryPromise;
    }

    movePatchHistoryPromise = (async () => {
      movePatchHistoryData = await fetchJsonAsset(
        "static/json/pokemon_move_patch_history.json",
        {},
        "move patch history"
      );
      return movePatchHistoryData;
    })();

    return movePatchHistoryPromise;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePatchText(value) {
    return String(value ?? '')
      .replace(/\\([\[\]_*`])/g, '$1')
      .replace(/\n?\*\*\*\s*$/g, '')
      .trim();
  }

  function normalizePatchHeading(value) {
    return normalizePatchText(value)
      .replace(/\s*\[(?:BUFFED|NERFED|ADJUSTED|BUGFIX(?:ED)?|REWORKED?|NEW)\]\s*$/i, '')
      .replace(/\s*:\s*$/g, '')
      .trim();
  }

  function formatPatchDate(value) {
    if (!value) {
      return '';
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function normalizePatchKey(value) {
    return normalizePatchHeading(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function extractPatchTone(value) {
    const text = normalizePatchText(value);
    const match = text.match(/\[(BUFFED|NERFED|ADJUSTED|BUGFIX(?:ED)?|REWORKED?|NEW)\]\s*$/i);
    const tag = match ? match[1].toUpperCase() : "";

    if (tag === "BUFFED" || tag === "NEW") {
      return "buff";
    }
    if (tag === "NERFED") {
      return "nerf";
    }
    if (tag.startsWith("BUGFIX")) {
      return "bugfix";
    }
    if (tag === "ADJUSTED" || tag.startsWith("REWORK")) {
      return "adjusted";
    }

    return "neutral";
  }

  function isBaseStatPatchHeading(value) {
    return /^(general|stats|natural stats|attack|attacks|auto attack|auto attacks|basic attack|basic attacks|boosted attack|boosted attacks)$/i
      .test(normalizePatchHeading(value));
  }

  function parsePatchHeading(value, options = {}) {
    const rawHeading = normalizePatchHeading(value || 'General') || 'General';
    const tone = extractPatchTone(value);
    const uniteMoveMatch = rawHeading.match(/^Unite Move\s*:\s*(.+)$/i);
    const passiveMatch = rawHeading.match(/^Passive(?: Ability)?\s*[,:\-]\s*(.+)$/i);
    const genericUniteMoveName = /^Unite Move$/i.test(rawHeading) ? normalizePatchText(options.uniteMoveName || '') : '';
    const genericPassiveName = /^Passive(?: Ability)?$/i.test(rawHeading) ? normalizePatchText(options.passiveName || '') : '';
    const resolvedUniteMoveName = uniteMoveMatch ? uniteMoveMatch[1].trim() : genericUniteMoveName;
    const resolvedPassiveName = passiveMatch ? passiveMatch[1].trim() : genericPassiveName;
    const visibleHeading = resolvedUniteMoveName
      ? `${resolvedUniteMoveName} (Unite Move)`
      : (passiveMatch
        ? `${resolvedPassiveName} (Passive)`
        : (resolvedPassiveName
          ? `${resolvedPassiveName} (Passive)`
          : rawHeading));
    const isUniteMove = Boolean(resolvedUniteMoveName);
    const isPassive = Boolean(resolvedPassiveName) || /^Passive(?: Ability)?$/i.test(rawHeading);
    const isPlusVariant = !isUniteMove && /\+\s*$/.test(visibleHeading);
    const baseHeading = isPlusVariant ? visibleHeading.replace(/\+\s*$/, '').trim() : visibleHeading;

    return {
      tone,
      visibleHeading,
      baseHeading: baseHeading || visibleHeading,
      key: normalizePatchKey(baseHeading || visibleHeading || 'General'),
      groupKey: `${normalizePatchKey(baseHeading || visibleHeading || 'General')}::${isPlusVariant ? 'plus' : 'base'}`,
      variantKey: isPlusVariant ? 'plus' : 'base',
      variantLabel: isPlusVariant ? '+ Version' : 'Base',
      isUniteMove,
      isPassive,
      iconHeading: resolvedUniteMoveName
        ? resolvedUniteMoveName
        : (resolvedPassiveName
          ? resolvedPassiveName
          : (baseHeading || visibleHeading || 'General'))
    };
  }

  function getPatchDisplay(patch) {
    const versionLabel = normalizePatchText(patch.version || patch.title || 'Patch');
    const formattedDate = formatPatchDate(patch.patchDate);

    return formattedDate ? `${versionLabel} (${formattedDate})` : versionLabel;
  }

  function getPatchGroupHeadingTone(items) {
    const sectionTones = new Set(
      items
        .map((item) => item.tone)
        .filter((tone) => tone === 'buff' || tone === 'nerf')
    );

    if (sectionTones.size === 1) {
      return Array.from(sectionTones)[0];
    }

    return 'neutral';
  }

  function isNegativePatchMetric(label, text) {
    const value = `${label} ${text}`.toLowerCase();
    return /(cooldown|energy requirement|energy required|unite gauge|distance travel required|distance required|evolution level|aeos energy required|required for reviving)/i
      .test(value);
  }

  function inferPatchToneFromLine(text) {
    const normalized = normalizePatchText(text);
    const lower = normalized.toLowerCase();

    if (!normalized || /^bugfix:/i.test(normalized) || /^bug fix:/i.test(normalized) || /\bbug ?fix(?:ed|es)?\b/i.test(normalized) || /^fixed a bug/i.test(normalized)) {
      return 'neutral';
    }

    if (/harder to accumulate|harder to gain|slower/i.test(lower)) {
      return 'nerf';
    }
    if (/easier to accumulate|faster|increased responsiveness|more responsive/i.test(lower)) {
      return 'buff';
    }

    const label = normalized.includes(':') ? normalized.split(':', 1)[0] : '';
    const isNegativeMetric = isNegativePatchMetric(label, normalized);
    const numbers = Array.from(normalized.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));

    if ((normalized.includes('→') || normalized.includes('->')) && numbers.length >= 2 && numbers[0] !== numbers[1]) {
      const increased = numbers[1] > numbers[0];
      if (isNegativeMetric) {
        return increased ? 'nerf' : 'buff';
      }
      return increased ? 'buff' : 'nerf';
    }

    if (/\b(increase|increased|longer|more)\b/i.test(lower) && !/\b(decrease|decreased|reduced|less)\b/i.test(lower)) {
      return isNegativeMetric ? 'nerf' : 'buff';
    }

    if (/\b(decrease|decreased|reduced|shorter|less)\b/i.test(lower)) {
      return isNegativeMetric ? 'buff' : 'nerf';
    }

    return 'neutral';
  }

  function buildPatchGroups(patch, options = {}) {
    const groups = [];
    const groupsByKey = new Map();

    (patch.changes || []).forEach((change, changeIndex) => {
      const heading = parsePatchHeading(change.heading || 'General', options);
      const groupKey = heading.groupKey || `general-${changeIndex}`;

      let group = groupsByKey.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          baseKey: heading.key,
          iconHeading: heading.iconHeading || heading.baseHeading || 'General',
          displayHeading: heading.visibleHeading || 'General',
          isUniteMove: heading.isUniteMove,
          isPassive: heading.isPassive,
          items: []
        };
        groupsByKey.set(groupKey, group);
        groups.push(group);
      }

      (Array.isArray(change.lines) ? change.lines : []).forEach((rawLine) => {
        const text = normalizePatchText(rawLine);
        if (!text) {
          return;
        }

        group.items.push({
          text,
          sectionTone: heading.tone,
          tone: /^BUGFIX:/i.test(text) || /^Bug fix:/i.test(text) || /^Fixed a bug/i.test(text) || /\bbug ?fix(?:ed|es)?\b/i.test(text)
            ? 'neutral'
            : (heading.tone === 'bugfix'
              ? 'neutral'
            : (heading.tone === 'neutral' || heading.tone === 'adjusted'
              ? inferPatchToneFromLine(text)
              : heading.tone)),
          variantKey: heading.variantKey,
          variantLabel: heading.variantLabel
        });
      });
    });

    const allowedHeadingKeys = options.allowedPatchHeadingKeys || null;

    return groups
      .map((group) => {
        return {
          ...group,
          headingTone: getPatchGroupHeadingTone(group.items),
          items: group.items.map((item) => ({
            ...item,
            displayText: item.text
          }))
        };
      })
      .filter((group) => !allowedHeadingKeys || allowedHeadingKeys.has(group.baseKey))
      .filter((group) => group.items.length > 0);
  }

  function shouldShowPatchMoveIcon(groupHeading, options) {
    if (options.forceShowUniteIcons && options.isUniteMoveGroup) {
      return true;
    }

    if (!options.showMoveIcons) {
      return false;
    }

    return !isBaseStatPatchHeading(groupHeading);
  }

  function getPatchMoveIconSrc(pokemonName, group, options) {
    if (!shouldShowPatchMoveIcon(group.iconHeading, {
      ...options,
      isUniteMoveGroup: group.isUniteMove
    })) {
      return '';
    }

    if (group.isUniteMove) {
      return `static/img/Unite_Moves/${pokemonName} - ${group.iconHeading}.png`;
    }

    return `static/img/Moves/${pokemonName} - ${group.iconHeading}.png`;
  }

  let popupTabGroupCounter = 0;

  function renderPopupPanels(panels, options = {}) {
    const validPanels = (panels || []).filter((panel) => panel && panel.label && panel.content != null);
    if (validPanels.length === 0) {
      return '';
    }

    if (validPanels.length === 1) {
      return validPanels[0].content;
    }

    popupTabGroupCounter += 1;
    const groupId = `popup-tab-group-${popupTabGroupCounter}`;
    const groupLabel = escapeHtml(options.ariaLabel || 'Popup sections');

    return `
      <div class="popup-tab-group" data-popup-tab-group="${groupId}">
        <div class="popup-tab-list" role="tablist" aria-label="${groupLabel}">
          ${validPanels.map((panel, index) => `
            <button
              type="button"
              class="popup-tab-button${index === 0 ? ' active' : ''}"
              role="tab"
              aria-selected="${index === 0 ? 'true' : 'false'}"
              data-popup-tab-target="${panel.id}"
            >
              ${escapeHtml(panel.label)}
            </button>
          `).join('')}
        </div>
        ${validPanels.map((panel, index) => `
          <section
            class="popup-tab-panel${index === 0 ? ' active' : ''}"
            data-popup-tab-panel="${panel.id}"
            ${index === 0 ? '' : 'hidden'}
          >
            ${panel.content}
          </section>
        `).join('')}
      </div>
    `;
  }

  function renderPatchHistorySection(pokemonName, patchHistory, options = {}) {
    const renderedPatches = (patchHistory || [])
      .map((patch) => {
          const patchDisplay = getPatchDisplay(patch);
          const groupedChanges = buildPatchGroups(patch, options);
          if (groupedChanges.length === 0) {
            return '';
          }
          return `
            <article class="patch-history-card">
              <div class="patch-history-meta">
                <div class="patch-history-version">${escapeHtml(patchDisplay)}</div>
              </div>
              <div class="patch-history-changes">
                ${groupedChanges.map((group) => `
                  <div class="patch-change patch-change--${group.headingTone}">
                    <div class="patch-change-heading-row">
                      ${getPatchMoveIconSrc(pokemonName, group, options) ? `
                        <img src="${escapeHtml(getPatchMoveIconSrc(pokemonName, group, options))}" alt="${escapeHtml(group.displayHeading)}" class="patch-change-icon" onerror="this.style.display='none'">
                      ` : ''}
                      <h6 class="patch-change-heading">${escapeHtml(group.displayHeading || 'General')}</h6>
                    </div>
                    <ul class="patch-change-list">
                      ${group.items.map((item) => `
                        <li class="patch-change-line patch-change-line--${item.tone}">${escapeHtml(item.displayText)}</li>
                      `).join('')}
                    </ul>
                  </div>
                `).join('')}
              </div>
            </article>
          `;
        })
      .filter(Boolean);

    const historyMarkup = renderedPatches.length > 0
      ? renderedPatches.join('')
      : `<p class="patch-history-empty">${escapeHtml(options.emptyMessage || `No patch history available for ${pokemonName}.`)}</p>`;

    return `
      <div class="move-detail-section patch-history-section">
        ${options.sectionHeading === null ? '' : `<h4 class="move-detail-heading">${escapeHtml(options.sectionHeading || 'Patches')}</h4>`}
        ${historyMarkup}
      </div>
    `;
  }
  function getOrdinalSuffix(day) {
    const j = day % 10,
          k = day % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
}
  async function injectHeaderText() {
    try {
      const metadata = await loadSiteMetadata();
      applyTierInfoText(metadata);
      const rawDate = metadata.date;
      const matchesRaw = metadata.matches;

      if (!rawDate || matchesRaw == null) {
        return;
      }

      const d = new Date(rawDate);
      const day   = d.getDate();
      const month = d.toLocaleString('default',{ month: 'long' });
      const year  = d.getFullYear();
      const suffix = getOrdinalSuffix(day);
      const hasExplicitYear = /\b\d{4}\b/.test(String(rawDate));
      const formattedDate = Number.isNaN(d.getTime())
        ? rawDate
        : hasExplicitYear
          ? `${month} ${day}${suffix}, ${year}`
          : `${month} ${day}${suffix}`;

      const matches = Number(matchesRaw)
                         .toLocaleString(undefined,{ maximumFractionDigits: 0 });

      document.getElementById('header-text')
        .textContent = `Data comes from Unite API as of ${formattedDate} with ${matches} total games analyzed.`;
    } catch(e) {
      console.error(e);
    }
  }

  await Promise.all([
    loadMoveDetails(),
    loadTableItems(),
    injectHeaderText()
  ]);

  // Keep Tier as the default sort column
  let currentSort = { column: "Tier", order: 'desc' };
  let activeNameFilter = null;
  let activeRoleFilters = []; // Change to array to store multiple roles
  
  // Calculate the global win rate range once at the start
  const globalWinRateRange = calculateGlobalWinRateRange();
  
  // Print a visual representation of the color scale to help with debugging
  logWinRateColorScale();
  
  function logWinRateColorScale() {
    console.log("Win Rate Color Scale (Exponential from 50%):");
    
    // Test very small deviations from 50%
    console.log("Small deviations from 50%:");
    const smallDeviation = [49, 49.25, 49.5, 49.75, 50, 50.25, 50.5, 50.75, 51];
    smallDeviation.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate.toFixed(2)}% `, `background: ${color}; color: black; padding: 3px 6px;`);
      console.log(`Small deviation ${rate.toFixed(2)}%: ${color}`);
    });
    
    // Test medium range
    console.log("\nMedium range deviations:");
    const mediumRange = [45, 46, 47, 48, 50, 52, 53, 54, 55];
    mediumRange.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate}% `, `background: ${color}; color: ${rate >= 55 || rate <= 45 ? 'white' : 'black'}; padding: 3px 6px;`);
      console.log(`Medium deviation ${rate}%: ${color}`);
    });
    
    // Test full range
    console.log("\nFull range:");
    const fullRange = [35, 40, 45, 47.5, 50, 52.5, 55, 60, 65];
    fullRange.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate}% `, `background: ${color}; color: ${rate >= 60 || rate <= 40 ? 'white' : 'black'}; padding: 3px 6px;`);
      console.log(`Full range ${rate}%: ${color}`);
    });
  }
  
  // Function to calculate the global min, max, and middle win rates from all items
  function calculateGlobalWinRateRange() {
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    let validRatesCount = 0;
    let maxEntry = null;
    let minEntry = null;
    
    // Process all items to get the absolute min and max
    tableItems.forEach(entry => {
      const rate = parseFloat(entry["Win Rate"]);
      if (!isNaN(rate)) {
        if (rate < min) {
          min = rate;
          minEntry = `${entry.Name} - ${entry["Move Set"]}`;
        }
        if (rate > max) {
          max = rate;
          maxEntry = `${entry.Name} - ${entry["Move Set"]}`;
        }
        validRatesCount++;
      }
    });
    
    console.log(`Found ${validRatesCount} valid win rates`);
    console.log(`Min win rate: ${min.toFixed(2)}% for ${minEntry}`);
    console.log(`Max win rate: ${max.toFixed(2)}% for ${maxEntry}`);
    
    // If no valid rates found (should never happen), provide defaults
    if (min === Number.MAX_VALUE || max === Number.MIN_VALUE) {
      min = 40;
      max = 60;
      console.log("Using default win rate range");
    }
    
    // Calculate middle as the average of min and max
    const middle = (min + max) / 2;
    
    // Log the results for debugging
    console.log(`Global win rate range: min=${min.toFixed(2)}, middle=${middle.toFixed(2)}, max=${max.toFixed(2)}`);
    
    return { min, middle, max };
  }

  roleFilters.forEach(filter => {
    filter.addEventListener("change", (e) => {
      // Clear name filter when roles are selected
      activeNameFilter = null;
      
      if (e.target.checked) {
        // Add role to the activeRoleFilters array if not already present
        if (!activeRoleFilters.includes(e.target.value)) {
          activeRoleFilters.push(e.target.value);
        }
        
        // Add active class to the selected role label
        if (e.target.closest('.role-option')) {
          e.target.closest('.role-option').classList.add('active-role');
        }
      } else {
        // Remove role from the activeRoleFilters array
        activeRoleFilters = activeRoleFilters.filter(role => role !== e.target.value);
        
        // Remove active class
        if (e.target.closest('.role-option')) {
          e.target.closest('.role-option').classList.remove('active-role');
        }
      }
      
      renderRows(filterItems());
    });
  });
  pickRateMin?.addEventListener("input", () => renderRows(filterItems()));
  pickRateMax?.addEventListener("input", () => renderRows(filterItems()));
  winRateMin?.addEventListener("input", () => renderRows(filterItems()));
  winRateMax?.addEventListener("input", () => renderRows(filterItems()));
  nameSearch.addEventListener("input", () => renderRows(filterItems()));

  function format(val) {
    const num = parseFloat(val);
    return isNaN(num) ? "?" : `${num.toFixed(2)}%`;
  }

  function formatTierScore(val) {
    const num = parseFloat(val);
    return Number.isFinite(num) ? num.toFixed(2) : "?";
  }

  function getAssetFileName(assetPath) {
    return String(assetPath || "").split("/").pop() || "";
  }

  function getAssetLabel(assetPath) {
    return getAssetFileName(assetPath).replace(/\.[^.]+$/, "").trim();
  }

  function getMoveLabelFromAsset(assetPath, pokemonName) {
    const label = getAssetLabel(assetPath);
    const prefix = `${pokemonName} - `;
    return label.startsWith(prefix) ? label.slice(prefix.length) : label;
  }

  function renderMoveLabel(label, className) {
    const words = String(label || "").trim().split(/\s+/).filter(Boolean);
    const firstLine = words.length > 1 ? words[0] : (words[0] || "");
    const secondLine = words.length > 1 ? words.slice(1).join(" ") : "&nbsp;";
    return `
      <span class="${escapeHtml(className)}">
        <span class="${escapeHtml(className)}-line">${escapeHtml(firstLine)}</span>
        <span class="${escapeHtml(className)}-line">${secondLine === "&nbsp;" ? "&nbsp;" : escapeHtml(secondLine)}</span>
      </span>
    `;
  }

  function hexToRgb(hex) {
    const normalized = String(hex || "").replace("#", "");
    if (normalized.length !== 6) {
      return null;
    }

    const value = Number.parseInt(normalized, 16);
    if (!Number.isFinite(value)) {
      return null;
    }

    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((channel) => Math.round(clampNumber(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
  }

  function mixColors(startHex, endHex, progress) {
    const start = hexToRgb(startHex);
    const end = hexToRgb(endHex);
    if (!start || !end) {
      return endHex || startHex || "#ffffff";
    }

    const eased = clampNumber(progress, 0, 1);
    return rgbToHex({
      r: start.r + ((end.r - start.r) * eased),
      g: start.g + ((end.g - start.g) * eased),
      b: start.b + ((end.b - start.b) * eased),
    });
  }

  function getTierColor(tierLabel, tierScore) {
    const label = normalizeTierDisplayLabel(tierLabel);
    if (label === "S") {
      return "#d4af37";
    }

    const score = Number.parseFloat(tierScore);
    if (!Number.isFinite(score)) {
      return "#f0f0f0";
    }

    const clamped = clampNumber(score, -1, 1);
    const eased = clamped >= 0
      ? Math.pow(clamped, 0.85)
      : -Math.pow(Math.abs(clamped), 0.85);

    if (eased >= 0) {
      return mixColors("#f5f5f5", "#0f8a44", eased);
    }

    return mixColors("#b6282f", "#f5f5f5", 1 + eased);
  }

  function normalizeTierDisplayLabel(tierLabel) {
    const label = String(tierLabel || "").trim().toUpperCase();
    if (!label) {
      return "F";
    }

    if (label.startsWith("S")) {
      return "S";
    }

    const match = label.match(/^([SABCD])([+-])?$/);
    if (match) {
      return `${match[1]}${match[2] || ""}`;
    }

    if (label.startsWith("F")) {
      return "F";
    }

    return "F";
  }

  function renderTierBadge(tierLabel, tierScore, className = "") {
    const label = normalizeTierDisplayLabel(tierLabel);
    const classes = ["tier-badge"];
    if (className) {
      classes.push(className);
    }
    return `
      <span class="${classes.map((name) => escapeHtml(name)).join(" ")}" style="color: ${escapeHtml(getTierColor(label, tierScore))};">${escapeHtml(label)}</span>
    `;
  }

  function renderTierScoreDebug(tierRawScore, tierScore, className = "") {
    const classes = ["tier-score-debug"];
    if (className) {
      classes.push(className);
    }
    return `
      <span class="${classes.map((name) => escapeHtml(name)).join(" ")}">Raw ${escapeHtml(formatTierScore(tierRawScore))} / Norm ${escapeHtml(formatTierScore(tierScore))}</span>
    `;
  }

  function renderBattleItemCard(item) {
    const itemWinRateColor = getWinRateColor(item.winRate);
    return `
      <article class="battle-item-card">
        <img src="static/img/${escapeHtml(item.item)}" class="battle-item-card-img" alt="${escapeHtml(item.name)}">
        <div class="battle-item-card-body">
          <div class="battle-item-card-metric">
            <span class="battle-item-card-label">Win Rate</span>
            <span class="battle-item-card-value" style="color: ${escapeHtml(itemWinRateColor)};">${escapeHtml(format(item.winRate))}</span>
          </div>
          <div class="battle-item-card-metric">
            <span class="battle-item-card-label">Pick Rate</span>
            <span class="battle-item-card-value">${escapeHtml(format(item.pickRate))}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderPopupCloseButton(label = "Close popup") {
    return `<button class="popup-close-button" type="button" aria-label="${escapeHtml(label)}">×</button>`;
  }

  function renderHeldItemIcon(itemName) {
    return `
      <div class="held-item-slot" title="${escapeHtml(itemName)}" aria-label="${escapeHtml(itemName)}">
        <img
          src="static/img/Held_Items/${escapeHtml(itemName)}.png"
          alt="${escapeHtml(itemName)}"
          class="held-item-img"
          loading="lazy"
        >
      </div>
    `;
  }

  function renderDesktopMovesetLabel(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return "";
    }

    const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length <= 1) {
      return `<span class="moveset-label-inline">${escapeHtml(text)}</span>`;
    }

    return `
      <span class="moveset-label-stacked">
        ${parts.map((part) => `<span class="moveset-label-line">${escapeHtml(part)}</span>`).join("")}
      </span>
    `;
  }
  
  // Calculate color based on win rate with EXACTLY 50% as white
  // Using an exponential scale to make small deviations visible
  function getWinRateColor(winRate) {
    // Convert win rate to a number if it's not already
    const rate = parseFloat(winRate);
    
    // Return default color if not a valid number
    if (isNaN(rate)) return "white";
    
    // Fixed values
    const MIDDLE = 50; // 50% is middle point
    const MAX_GREEN = 65; // Upper bound for full green
    const MIN_RED = 35;   // Lower bound for full red
    
    // If we're at exactly 50%, return pure white
    if (Math.abs(rate - MIDDLE) < 0.001) {
      return "rgb(255, 255, 255)";
    }
    
    // Calculate the exponential factor
    // This determines how quickly the colors intensify as we move away from 50%
    const expFactor = 2.5; // Higher values make color changes more pronounced near 50%
    
    // For values below 50%
    if (rate < MIDDLE) {
      // Calculate linear percentage first (0 to 1)
      const linearPercentage = Math.min(1, (MIDDLE - rate) / (MIDDLE - MIN_RED));
      
      // Apply exponential transformation
      // This makes values close to 50% have noticeable but subtle colors
      // and intensifies as we move toward the extremes
      // We use a function of form: 1 - (1 - x)^expFactor
      // This gives a more rapid initial change from 50%
      const expPercentage = 1 - Math.pow(1 - linearPercentage, expFactor);
      
      // Ensure even tiny deviations from 50% have a slight tint
      // For values very close to 50%, give a minimal tint
      const finalPercentage = rate >= 49 
        ? Math.max(0.05, expPercentage) // Min 5% color for values just below 50%
        : expPercentage;
      
      // Red to white gradient
      const r = 255;
      const g = Math.round((1 - finalPercentage) * 255);
      const b = Math.round((1 - finalPercentage) * 255);
      
      return `rgb(${r}, ${g}, ${b})`;
    } 
    // For values above 50%
    else {
      // Calculate linear percentage first (0 to 1)
      const linearPercentage = Math.min(1, (rate - MIDDLE) / (MAX_GREEN - MIDDLE));
      
      // Apply exponential transformation
      const expPercentage = 1 - Math.pow(1 - linearPercentage, expFactor);
      
      // Ensure even tiny deviations from 50% have a slight tint
      const finalPercentage = rate <= 51 
        ? Math.max(0.05, expPercentage) // Min 5% color for values just above 50%
        : expPercentage;
      
      // White to green gradient (using darker green #009900)
      const r = Math.round((1 - finalPercentage) * 255);
      const g = Math.round(255 - finalPercentage * 102); // 255 to 153
      const b = Math.round((1 - finalPercentage) * 255);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  function renderMoves(moves) {
    if (Array.isArray(moves)) {
      return moves.map(m => `<img src="static/img/${m}" alt="${m}" class="move-img">`).join('');
    }
    return `<img src="static/img/${moves}" alt="${moves}" class="move-img">`;
  }

  function parseMovePath(imgElement) {
    const src = imgElement.getAttribute('src');
    const filename = src.split('/').pop();
    const nameWithoutExt = filename.replace('.png', '');
    const parts = nameWithoutExt.split(' - ');

    if (parts.length !== 2) {
      console.error('Invalid move filename format:', filename);
      return null;
    }

    return {
      pokemonName: parts[0].trim(),
      moveName: parts[1].trim()
    };
  }

  function findMoveData(pokemonName, moveName) {
    if (!moveDetailsData || !moveDetailsData[pokemonName]) {
      console.error(`Pokemon "${pokemonName}" not found`);
      return null;
    }

    const pokemonData = moveDetailsData[pokemonName];

    // Search through Move 1 and Move 2
    for (const moveSlot of ['Move 1', 'Move 2']) {
      if (!pokemonData[moveSlot]) continue;

      // Search through Upgrade 1 and Upgrade 2
      for (const upgrade of ['Upgrade 1', 'Upgrade 2', 'Upgrade 3', 'Upgrade']) {
        const moveData = pokemonData[moveSlot][upgrade];

        if (moveData && moveData.Name === moveName) {
          return moveData;
        }
      }
    }

    console.error(`Move "${moveName}" not found for ${pokemonName}`);
    return null;
  }

  function renderMobileCard(entry) {
    const entryIndex = tableItems.indexOf(entry);
    const tierData = getTierDisplayData(entry);
    const tierBadge = renderTierBadge(tierData.label, tierData.score, "mobile-card-tier");
    const tierScoreDebug = renderTierScoreDebug(tierData.rawScore, tierData.score, "mobile-tier-score-debug");
    const winRate = parseFloat(entry["Win Rate"]);
    const winRateColor = getWinRateColor(winRate);
    const move1Img = Array.isArray(entry["Move 1"]) ? entry["Move 1"][0] : entry["Move 1"];
    const move2Img = Array.isArray(entry["Move 2"]) ? entry["Move 2"][0] : entry["Move 2"];
    const move1Label = getMoveLabelFromAsset(move1Img, entry["Name"]);
    const move2Label = getMoveLabelFromAsset(move2Img, entry["Name"]);

    return `
      <article class="mobile-card">
        <div class="mobile-card-top">
          <button class="mobile-card-pokemon-button" type="button">
            <img src="static/img/${entry["Pokemon"]}" alt="${escapeHtml(entry["Name"])}" class="mobile-card-pokemon-img">
            <span class="mobile-card-pokemon-text">
              <span class="mobile-card-name">${escapeHtml(entry["Name"])}</span>
              <span class="mobile-card-role">${escapeHtml(entry["Role"])}</span>
            </span>
          </button>
          <div class="mobile-card-move-list">
            <button class="mobile-move-button mobile-move-button-1" type="button">
              <span class="mobile-card-move-icon-shell">
                <img src="static/img/${move1Img}" alt="${escapeHtml(move1Label)}" class="mobile-card-move-img">
              </span>
              ${renderMoveLabel(move1Label, "mobile-card-move-label")}
            </button>
            <button class="mobile-move-button mobile-move-button-2" type="button">
              <span class="mobile-card-move-icon-shell">
                <img src="static/img/${move2Img}" alt="${escapeHtml(move2Label)}" class="mobile-card-move-img">
              </span>
              ${renderMoveLabel(move2Label, "mobile-card-move-label")}
            </button>
          </div>
          <div class="mobile-card-metrics">
            <div class="mobile-card-metric mobile-card-tier-metric">
              <span class="mobile-card-metric-label">Tier</span>
              <span class="mobile-card-tier-value">${tierBadge}${tierScoreDebug}</span>
            </div>
            <button class="mobile-view-items mobile-card-metric" type="button" data-index="${entryIndex}" data-win-rate="${entry["Win Rate"]}" style="color: ${winRateColor};">
              <span class="mobile-card-metric-label">Win Rate</span>
              <span class="mobile-card-metric-value">${escapeHtml(format(entry["Win Rate"]))}</span>
            </button>
            <div class="mobile-card-metric">
              <span class="mobile-card-metric-label">Pick Rate</span>
              <span class="mobile-card-metric-value">${escapeHtml(format(entry["Pick Rate"]))}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function sortItems(items) {
    if (!currentSort.column) {
      return items;
    }

    return [...items].sort((a, b) => {
      const col = normalizeSortColumn(currentSort.column);
      if (col === "Tier") {
        const aTier = getTierDisplayData(a);
        const bTier = getTierDisplayData(b);
        const aScore = parseFloat(aTier.score ?? a["Tier Score"] ?? "0");
        const bScore = parseFloat(bTier.score ?? b["Tier Score"] ?? "0");
        if (aScore === bScore) {
          return currentSort.order === 'asc'
            ? String(a["Name"] || "").localeCompare(String(b["Name"] || ""))
            : String(b["Name"] || "").localeCompare(String(a["Name"] || ""));
        }
        return currentSort.order === 'asc' ? aScore - bScore : bScore - aScore;
      }

      const aVal = a[col] ?? "";
      const bVal = b[col] ?? "";
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return currentSort.order === 'asc' ? aNum - bNum : bNum - aNum;
      }

      return currentSort.order === 'asc'
        ? aVal.toString().localeCompare(bVal)
        : bVal.toString().localeCompare(aVal);
    });
  }

  function renderRows(filteredItems) {
    const tableBody = document.querySelector('.table-row-group');
    const sortedItems = sortItems(filteredItems);
    tableBody.innerHTML = '';
    movesetCards.innerHTML = '';

    updateSortArrows();
    syncMobileSortControls();

    sortedItems.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'table-row';

      const isActive = activeNameFilter === entry["Name"];
      const nameClass = isActive ? "filter-name active" : "filter-name";

      const isRoleActive = activeRoleFilters.includes(entry["Role"]);
      const roleClass = isRoleActive ? "filter-role active" : "filter-role";
      const tierData = getTierDisplayData(entry);
      const tierBadge = renderTierBadge(tierData.label, tierData.score);
      const tierScoreDebug = renderTierScoreDebug(tierData.rawScore, tierData.score, "table-tier-score-debug");

      const winRate = parseFloat(entry["Win Rate"]);
      const winRateColor = getWinRateColor(winRate);

      row.innerHTML = `
        <div class="table-cell"><img src="static/img/${entry["Pokemon"]}" alt="${escapeHtml(entry["Name"])}"></div>
        <div class="table-cell"><span class="${nameClass}" data-name="${escapeHtml(entry["Name"])}">${escapeHtml(entry["Name"])}</span></div>
        <div class="table-cell"><span class="${roleClass}" data-role="${escapeHtml(entry["Role"])}">${escapeHtml(entry["Role"])}</span></div>
        <div class="table-cell table-cell-moveset">${renderDesktopMovesetLabel(entry["Move Set"])}</div>
        <div class="table-cell table-cell-move-icons">
          <span class="move-wrapper">${renderMoves(entry["Move 1"])}</span>
          <span class="move-wrapper">${renderMoves(entry["Move 2"])}</span>
        </div>
        <div class="table-cell table-cell-tier"><span class="table-tier-value">${tierBadge}${tierScoreDebug}</span></div>
        <div class="table-cell">
          <button class="view-items" type="button" data-index="${tableItems.indexOf(entry)}"
                  style="color: ${winRateColor}; font-weight: bold; background: none; border: none;"
                  data-win-rate="${entry["Win Rate"]}">
            ${format(entry["Win Rate"])}
          </button>
        </div>
        <div class="table-cell">${format(entry["Pick Rate"])}</div>
      `;

      tableBody.appendChild(row);
    });

    movesetCards.innerHTML = sortedItems.map((entry) => renderMobileCard(entry)).join("");
    attachEventHandlers();
    observeMobileCards();
    applyDesktopAdaptiveLayout();
  }

  function attachEventHandlers() {
    document.querySelectorAll(".view-items, .mobile-view-items").forEach(button => {
      button.addEventListener("mouseleave", () => {
        const winRate = parseFloat(button.dataset.winRate || "50");
        button.style.color = getWinRateColor(winRate);
        button.style.textShadow = "none";
      });

      button.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.dataset.index, 10);
        showPopup(tableItems[index]);
      });
    });

    document.querySelectorAll(".filter-name").forEach(el => {
      // Ensure no text-decoration
      el.style.textDecoration = "none";

      el.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent document click from immediately clearing
        activeNameFilter = el.dataset.name;
        activeRoleFilters = []; // Clear role filters when setting name filter
        renderRows(filterItems());
      });
    });


    document.querySelectorAll(".filter-role").forEach(el => {
      // Ensure no text-decoration
      el.style.textDecoration = "none";

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const clickedRole = el.dataset.role;
        activeNameFilter = null; // Clear name filter when setting role filter

        // Toggle the role in activeRoleFilters
        if (activeRoleFilters.includes(clickedRole)) {
          // If already active, remove it
          activeRoleFilters = activeRoleFilters.filter(role => role !== clickedRole);
        } else {
          // If not active, add it
          activeRoleFilters.push(clickedRole);
        }

        updateRoleCheckboxes();
        renderRows(filterItems());
      });
    });

    document.querySelectorAll(".move-img").forEach(img => {
      img.addEventListener("click", e => {
        e.stopPropagation();
        showMovePopup(img);
      });
      img.style.cursor = "pointer";
    });

    document.querySelectorAll(".table-row .table-cell:first-child img").forEach(img => {
      img.addEventListener("click", e => {
        e.stopPropagation();
        showPokemonPopup(img);
      });
      img.style.cursor = "pointer";
    });

    document.querySelectorAll(".mobile-card-pokemon-button").forEach(button => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const img = button.querySelector("img");
        if (img) {
          showPokemonPopup(img);
        }
      });
    });

    document.querySelectorAll(".mobile-move-button").forEach(button => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const img = button.querySelector("img");
        if (img) {
          showMovePopup(img);
        }
      });
    });
  }


  function showPopup(entry) {
    const items = [];
    for (let i = 1; i <= 3; i++) {
      if (entry[`Item ${i}`]) {
        items.push({
          item: entry[`Item ${i}`],
          name: getAssetLabel(entry[`Item ${i}`]),
          pickRate: parseFloat(entry[`Pick Rate ${i}`]) || 0,
          winRate: parseFloat(entry[`Win Rate ${i}`]) || 0,
          index: i
        });
      }
    }

    items.sort((a, b) => b.pickRate - a.pickRate);

    const move1Img = Array.isArray(entry["Move 1"]) ? entry["Move 1"][0] : entry["Move 1"];
    const move2Img = Array.isArray(entry["Move 2"]) ? entry["Move 2"][0] : entry["Move 2"];
    const move1Label = getMoveLabelFromAsset(move1Img, entry["Name"]);
    const move2Label = getMoveLabelFromAsset(move2Img, entry["Name"]);
    const recommendedBuild = entry.recommendedBuild || {};
    const heldItems = Array.isArray(recommendedBuild.heldItems) ? recommendedBuild.heldItems.filter(Boolean) : [];
    const altHeldItems = Array.isArray(recommendedBuild.altHeldItems)
      ? recommendedBuild.altHeldItems.filter(Boolean)
      : (recommendedBuild.altHeldItem ? [recommendedBuild.altHeldItem] : []);
    const combinedHeldItems = [...heldItems, ...altHeldItems.filter((itemName) => !heldItems.includes(itemName))];
    const heldItemsMarkup = combinedHeldItems.map((itemName) => renderHeldItemIcon(itemName));
    const heldItemsMarkupHtml = heldItemsMarkup.length > 0
      ? heldItemsMarkup.join("")
      : '<p class="build-empty-state">No recommended held items available for this build yet.</p>';
    const heldItemsCount = Math.max(combinedHeldItems.length, 1);

    popupContent.classList.add("build-popup-content");
    popupContent.innerHTML = `
      ${renderPopupCloseButton("Close build popup")}
      <div class="build-popup-header build-popup-shell">
        <div class="build-popup-top-row">
          <div class="build-popup-identity">
            <img src="static/img/${entry["Pokemon"]}" alt="${entry["Name"]}" class="popup-pokemon-img">
            <div class="build-popup-title-stack">
              <h3 class="popup-title build-popup-title-inline">${entry["Name"]}</h3>
              <span class="build-popup-role">${escapeHtml(entry["Role"])}</span>
            </div>
          </div>
          <div class="build-popup-move-icons">
            <div class="build-popup-inline-move">
              <img src="static/img/${move1Img}" alt="${escapeHtml(move1Label)}" class="build-summary-move-img">
              ${renderMoveLabel(move1Label, "build-summary-move-label")}
            </div>
            <div class="build-popup-inline-move">
              <img src="static/img/${move2Img}" alt="${escapeHtml(move2Label)}" class="build-summary-move-img">
              ${renderMoveLabel(move2Label, "build-summary-move-label")}
            </div>
          </div>
        </div>
      </div>

      <section class="build-popup-section build-popup-shell">
        <h4 class="build-popup-section-title">Battle Items</h4>
        <div class="battle-item-grid">
          ${items.map((item) => renderBattleItemCard(item)).join("")}
        </div>
      </section>

      <section class="build-popup-section build-popup-shell">
        <h4 class="build-popup-section-title">Recommended Held Items</h4>
        <div class="held-item-combined-layout">
          <div class="held-item-strip held-item-strip--combined" style="--held-item-count: ${heldItemsCount};">
            ${heldItemsMarkupHtml}
          </div>
        </div>
      </section>
    `;
    resetPopupScrollPosition();
    body.classList.add("popup-open");
    popup.classList.remove("hidden");
  }

  async function showMovePopup(imgElement) {
    // Parse the image path
    const parsed = parseMovePath(imgElement);
    if (!parsed) {
      alert('Unable to load move details: Invalid move image format');
      return;
    }

    const { pokemonName, moveName } = parsed;

    // Find move data
    const moveData = findMoveData(pokemonName, moveName);
    if (!moveData) {
      alert(`Unable to load details for ${moveName}`);
      return;
    }

    const allMovePatchHistory = await loadMovePatchHistory();
    const movePatchHistory = (allMovePatchHistory[pokemonName] && allMovePatchHistory[pokemonName][moveName]) || [];
    const pokemonUniteMoveName = moveDetailsData?.[pokemonName]?.['Unite Move']?.Name || '';
    const normalizedMoveHeading = parsePatchHeading(moveName, {
      uniteMoveName: pokemonUniteMoveName
    });
    const patchPanelMarkup = renderPatchHistorySection(pokemonName, movePatchHistory, {
      showMoveIcons: true,
      forceShowUniteIcons: true,
      uniteMoveName: pokemonUniteMoveName,
      allowedPatchHeadingKeys: new Set([normalizedMoveHeading.key]),
      sectionHeading: null,
      emptyMessage: `No patch notes available for ${moveName} yet.`
    });
    const descriptionPanelMarkup = `
      <div class="move-detail-row">
        <span class="move-detail-label">Level:</span>
        <span class="move-detail-value">${moveData.Level}</span>
      </div>

      <div class="move-detail-row">
        <span class="move-detail-label">Cooldown:</span>
        <span class="move-detail-value">${moveData.Cooldown}</span>
      </div>

      <div class="move-detail-section">
        <h4 class="move-detail-heading">Description</h4>
        <p class="move-description">${moveData.Description}</p>
      </div>

      ${moveData['Enhanced Level'] ? `
        <div class="move-detail-section enhanced-section">
          <h4 class="move-detail-heading">Enhanced (Level ${moveData['Enhanced Level']})</h4>
          <p class="move-description">${moveData['Enhanced Description'] || ''}</p>
        </div>
      ` : ''}
    `;

    // Build popup HTML
    const moveImgSrc = imgElement.getAttribute('src');

    popupContent.classList.remove("build-popup-content");
    popupContent.innerHTML = `
      ${renderPopupCloseButton(`Close ${moveName} popup`)}
      <div class="move-popup-header">
        <img src="${moveImgSrc}" alt="${moveName}" class="move-popup-img">
        <h3 class="popup-title">${moveName}</h3>
      </div>

      <div class="move-popup-body">
        ${renderPopupPanels([
          { id: 'description', label: 'Description', content: descriptionPanelMarkup },
          { id: 'patches', label: 'Patches', content: patchPanelMarkup }
        ], {
          ariaLabel: `${moveName} popup sections`
        })}
      </div>
    `;

    // Show popup
    resetPopupScrollPosition();
    body.classList.add("popup-open");
    popup.classList.remove("hidden");
  }

  async function showPokemonPopup(imgElement) {
    // Parse the Pokemon name from the image alt text
    const pokemonName = imgElement.getAttribute('alt');

    if (!pokemonName) {
      alert('Unable to load Pokemon details: Invalid image');
      return;
    }

    // Find Pokemon data
    if (!moveDetailsData || !moveDetailsData[pokemonName]) {
      alert(`Unable to load details for ${pokemonName}`);
      return;
    }

    const pokemonData = moveDetailsData[pokemonName];
    const pokemonImgSrc = imgElement.getAttribute('src');
    const allPatchHistory = await loadPatchHistory();
    const pokemonPatchHistory = allPatchHistory[pokemonName] || [];
    const overviewPanelMarkup = `
      ${pokemonData['Passive Ability'] ? `
        <div class="move-detail-section">
          <h4 class="move-detail-heading">Passive Ability: ${pokemonData['Passive Ability'].Name || ''}</h4>
          <p class="move-description">${pokemonData['Passive Ability'].Description || ''}</p>
        </div>
      ` : ''}
      ${pokemonData['Passive Ability']['Name 2'] && pokemonData['Passive Ability']['Description 2'] ? `
        <div class="move-detail-section">
          <h4 class="move-detail-heading">Passive Ability: ${pokemonData['Passive Ability']['Name 2'] || ''}</h4>
          <p class="move-description">${pokemonData['Passive Ability']['Description 2'] || ''}</p>
        </div>
      ` : ''}

      ${pokemonData['Attack'] ? `
        <div class="move-detail-section">
          <h4 class="move-detail-heading">Attack</h4>
          <p class="move-description">${pokemonData['Attack']}</p>
        </div>
      ` : ''}

      ${pokemonData['Unite Move'] ? `
        <div class="move-detail-section enhanced-section">
          <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
            ${pokemonData['Unite Move'].Name ? `
              <img src="static/img/Unite_Moves/${pokemonName} - ${pokemonData['Unite Move'].Name}.png"
                   alt="${pokemonData['Unite Move'].Name}"
                   style="max-height: 100px; width: auto;"
                   onerror="this.style.display='none'">
            ` : ''}
            <h4 class="move-detail-heading" style="margin: 0;">Unite Move: ${pokemonData['Unite Move'].Name || ''}</h4>
          </div>

          <div class="move-detail-row">
            <span class="move-detail-label">Level:</span>
            <span class="move-detail-value">${pokemonData['Unite Move'].Level || ''}</span>
          </div>

          <div class="move-detail-row">
            <span class="move-detail-label">Cooldown:</span>
            <span class="move-detail-value">${pokemonData['Unite Move'].Cooldown || ''}</span>
          </div>

          ${pokemonData['Unite Move']['Buff Duration'] ? `
            <div class="move-detail-row">
              <span class="move-detail-label">Buff Duration:</span>
              <span class="move-detail-value">${pokemonData['Unite Move']['Buff Duration']}</span>
            </div>
          ` : ''}

          ${pokemonData['Unite Move']['Buff Stats'] ? `
            <div class="move-detail-row">
              <span class="move-detail-label">Buff Stats:</span>
              <span class="move-detail-value">${pokemonData['Unite Move']['Buff Stats']}</span>
            </div>
          ` : ''}

          <p class="move-description" style="margin-top: 15px;">${pokemonData['Unite Move'].Description || ''}</p>
        </div>
      ` : ''}
    `;
    const pokemonPatchMarkup = renderPatchHistorySection(pokemonName, pokemonPatchHistory, {
      forceShowUniteIcons: true,
      uniteMoveName: pokemonData['Unite Move']?.Name || '',
      passiveName: pokemonData['Passive Ability']?.Name || '',
      sectionHeading: null,
      emptyMessage: `No patch notes available for ${pokemonName} yet.`
    });

    // Build popup HTML
    popupContent.classList.remove("build-popup-content");
    popupContent.innerHTML = `
      ${renderPopupCloseButton(`Close ${pokemonName} popup`)}
      <div class="move-popup-header">
        <img src="${pokemonImgSrc}" alt="${pokemonName}" class="move-popup-img">
        <h3 class="popup-title">${pokemonName}</h3>
      </div>

      <div class="move-popup-body">
        ${renderPopupPanels([
          { id: 'overview', label: 'Overview', content: overviewPanelMarkup },
          { id: 'patches', label: 'Patches', content: pokemonPatchMarkup }
        ], {
          ariaLabel: `${pokemonName} popup sections`
        })}
      </div>
    `;

    // Show popup
    resetPopupScrollPosition();
    body.classList.add("popup-open");
    popup.classList.remove("hidden");
  }

  popup.addEventListener("click", (e) => {
    if (e.target === popup) {
      resetPopupScrollPosition();
      body.classList.remove("popup-open");
      popup.classList.add("hidden");
      e.stopPropagation();
    }
  });

  popupContent.addEventListener("click", (event) => {
    const closeButton = event.target.closest(".popup-close-button");
    if (closeButton) {
      resetPopupScrollPosition();
      body.classList.remove("popup-open");
      popup.classList.add("hidden");
      return;
    }

    const tabButton = event.target.closest(".popup-tab-button");
    if (!tabButton) {
      return;
    }

    const tabGroup = tabButton.closest(".popup-tab-group");
    if (!tabGroup) {
      return;
    }

    const targetPanelId = tabButton.dataset.popupTabTarget;
    if (!targetPanelId) {
      return;
    }

    tabGroup.querySelectorAll(".popup-tab-button").forEach((button) => {
      const isActive = button === tabButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    tabGroup.querySelectorAll(".popup-tab-panel").forEach((panel) => {
      const isActive = panel.dataset.popupTabPanel === targetPanelId;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  });

  // Add event listener for resetting all filters
  resetFilters.addEventListener("click", resetAllFilters);

  document.addEventListener("click", (event) => {
    if (isPhoneView() || popup.classList.contains("hidden") === false || body.classList.contains("desktop-help-open")) {
      return;
    }

    if (!hasActiveFilters()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest(".controls-shell") || target.closest(".table-scroll-shell") || target.closest("#tooltip")) {
      return;
    }

    resetAllFilters();
  });
  
  function updateRoleCheckboxes() {
    const checkboxes = document.querySelectorAll('input[name="role"]');

    checkboxes.forEach(checkbox => {
      const isActive = activeRoleFilters.includes(checkbox.value);
      checkbox.checked = isActive;

      const roleOption = checkbox.closest('.role-option');
      if (roleOption) {
        if (isActive) {
          roleOption.classList.add('active-role');
        } else {
          roleOption.classList.remove('active-role');
        }
      }
    });
  }
  
  function filterItems() {
    // Split search query into individual terms and remove empty strings
    const searchTerms = nameSearch.value.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    const pickMin = parseThresholdValue(pickRateMin?.value);
    const pickMax = parseThresholdValue(pickRateMax?.value);
    const winMin = parseThresholdValue(winRateMin?.value);
    const winMax = parseThresholdValue(winRateMax?.value);
  
    return tableItems.filter(entry => {
      // If there's an active name filter, only show entries matching that name
      if (activeNameFilter && entry["Name"] !== activeNameFilter) {
        return false;
      }
  
      // If there are active role filters, only show entries matching any of those roles
      if (activeRoleFilters.length > 0 && !activeRoleFilters.includes(entry["Role"])) {
        return false;
      }
  
      const entryPickRate = parseFloat(entry["Pick Rate"]);
      const entryWinRate = parseFloat(entry["Win Rate"]);

      // Check pick rate threshold
      if (!rangeFilterMatches(entryPickRate, pickMin, pickMax)) {
        return false;
      }

      // Check win rate threshold
      if (!rangeFilterMatches(entryWinRate, winMin, winMax)) {
        return false;
      }
  
      // We don't need to check selectedRoles separately since we're now using activeRoleFilters
  
      // Enhanced search across multiple fields with multiple terms
      if (searchTerms.length > 0) {
        // For each search term, check if it exists in any field
        return searchTerms.every(term => {
          // Create a searchable text from all relevant fields
          const nameText = entry["Name"].toLowerCase();
          const moveSetText = entry["Move Set"].toLowerCase();
          const roleText = entry["Role"].toLowerCase();
          
          // Process moves - convert to lowercase strings for searching
          const move1List = Array.isArray(entry["Move 1"]) 
            ? entry["Move 1"].map(m => m.toLowerCase())
            : [entry["Move 1"].toString().toLowerCase()];
          
          const move2List = Array.isArray(entry["Move 2"]) 
            ? entry["Move 2"].map(m => m.toLowerCase())
            : [entry["Move 2"].toString().toLowerCase()];
          
          // Check if this term appears in any field
          return nameText.includes(term) ||
                 moveSetText.includes(term) ||
                 roleText.includes(term) ||
                 move1List.some(move => move.includes(term)) ||
                 move2List.some(move => move.includes(term));
        });
      }
      
      // If no search query, include this entry
      return true;
    });
  }

    function attachSortHandlers() {
    document.querySelectorAll(".table-header-group .table-cell[data-sort]").forEach(div => {
      // Only process if we haven't already created the sort-text span
      if (!div.querySelector('.header-text')) {
        // Get the text content (excluding any spans)
        let textContent = '';

        // Get all text nodes directly inside the div (excluding spans)
        div.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textContent += node.textContent;
          }
        });

        // Clean up the text content
        textContent = textContent.trim();

        // Remove all text nodes from the div
        div.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            div.removeChild(node);
          }
        });

        // Create a sortable/selectable span for the text
        const textSpan = document.createElement('span');
        textSpan.className = 'header-text';
        textSpan.textContent = textContent;

        // Place the text span at the beginning of div
        if (div.firstChild) {
          div.insertBefore(textSpan, div.firstChild);
        } else {
          div.appendChild(textSpan);
        }

        // Add click event only to the new span
        textSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          const col = div.getAttribute("data-sort");
          const isSame = currentSort.column === col;
          currentSort.column = normalizeSortColumn(col);
          currentSort.order = isSame && currentSort.order === 'desc' ? 'asc' : 'desc';
          renderRows(filterItems());
        });
      }
      
      // Remove click handler from the div itself
      div.onclick = null;
    });
  }

  function updateSortArrows() {
    document.querySelectorAll(".table-header-group .table-cell[data-sort]").forEach(div => {
      const col = div.getAttribute("data-sort");
      const arrow = document.getElementById(`arrow-${col}`);
      if (arrow) {
        arrow.textContent =
          normalizeSortColumn(currentSort.column) === col
            ? currentSort.order === "asc" ? "▲" : "▼"
            : "";
      }
    });
  }

  const debugUiStorageKey = "uiDebugEnabled";

  function setDebugUiState(enabled) {
    body.classList.toggle("ui-debug", enabled);
    if (debugUiButton) {
      debugUiButton.setAttribute("aria-pressed", enabled ? "true" : "false");
      debugUiButton.textContent = enabled ? "Debug On" : "Debug";
    }
    renderRows(filterItems());

    if (isLocalDevelopmentOrigin()) {
      try {
        localStorage.setItem(debugUiStorageKey, enabled ? "1" : "0");
      } catch (error) {
        // Ignore storage failures in restricted environments.
      }
    }
  }

  function setUserViewSimState(enabled) {
    if (!canUseDesktopMobilePreview()) {
      body.classList.remove("user-view-sim");
      syncDesktopMobilePreviewButton();
      syncUserViewButton();
      return;
    }

    body.classList.toggle("user-view-sim", enabled);
    if (enabled) {
      setDesktopMobilePreview(false);
    }
    syncDesktopMobilePreviewButton();
    syncUserViewButton();

    try {
      localStorage.setItem(userViewStorageKey, enabled ? "1" : "0");
    } catch (error) {
      console.warn("Unable to persist user view preference", error);
    }
  }

  function syncUserViewButton() {
    const enabled = canUseDesktopMobilePreview();
    if (userViewButton) {
      userViewButton.hidden = !enabled;
      const active = body.classList.contains("user-view-sim");
      userViewButton.setAttribute("aria-pressed", active ? "true" : "false");
      userViewButton.textContent = active ? "Local View" : "User View";
    }
  }

  function initializeDebugUiControl() {
    if (!debugUiButton || !isLocalDevelopmentOrigin()) {
      return;
    }

    debugUiButton.hidden = false;

    let debugEnabled = false;
    try {
      debugEnabled = localStorage.getItem(debugUiStorageKey) === "1";
    } catch (error) {
      debugEnabled = false;
    }

    setDebugUiState(debugEnabled);
    debugUiButton.addEventListener("click", () => {
      setDebugUiState(!body.classList.contains("ui-debug"));
    });
  }

  function initializeUserViewControl() {
    if (!userViewButton || !isLocalDevelopmentOrigin()) {
      return;
    }

    userViewButton.hidden = false;

    let userViewEnabled = false;
    try {
      userViewEnabled = localStorage.getItem(userViewStorageKey) === "1";
    } catch (error) {
      userViewEnabled = false;
    }

    setUserViewSimState(userViewEnabled);
    userViewButton.addEventListener("click", () => {
      setUserViewSimState(!body.classList.contains("user-view-sim"));
    });
  }


  mobileSortButton?.addEventListener("click", () => openMobilePanel("sort"));
  mobileFiltersButton?.addEventListener("click", () => openMobilePanel("filters"));
  mobileHelpButton?.addEventListener("click", openHelpPanel);
  desktopMobilePreviewInlineButton?.addEventListener("click", () => setDesktopMobilePreview(false));
  desktopMobilePreviewButton?.addEventListener("click", () => setDesktopMobilePreview(!isDesktopMobilePreview()));
  desktopTipsButton?.addEventListener("click", openHelpPanel);
  tierInfoButton?.addEventListener("click", openTierHelpPanel);
  initializeDebugUiControl();
  initializeTierColumnToggle();
  initializeUserViewControl();
  closeFiltersPanel?.addEventListener("click", closeMobilePanels);
  closeSortPanel?.addEventListener("click", closeMobilePanels);
  closeHelpPanel?.addEventListener("click", closeMobilePanels);
  closeTierHelpPanel?.addEventListener("click", closeMobilePanels);
  mobilePanelScrim?.addEventListener("click", closeMobilePanels);

  mobileSortColumn?.addEventListener("change", () => {
    currentSort.column = normalizeSortColumn(mobileSortColumn.value);
    renderRows(filterItems());
  });

  mobileSortDirection?.addEventListener("change", () => {
    currentSort.order = mobileSortDirection.value;
    renderRows(filterItems());
  });

  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 750px)").matches && !isDesktopMobilePreview()) {
      closeMobilePanels();
    }
    applyDesktopAdaptiveLayout();
  });

  if (typeof ResizeObserver !== "undefined") {
    const desktopLayoutObserver = new ResizeObserver(() => {
      applyDesktopAdaptiveLayout();
    });
    desktopLayoutObserver.observe(controlsShell);
    desktopLayoutObserver.observe(tableScrollShell);

    mobileCardObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        applyMobileCardSizing(entry.target);
      });
    });
  }

  removeDesktopPreviewControlsIfDisabled();

  try {
    if (canUseDesktopMobilePreview() && window.localStorage.getItem(desktopPreviewStorageKey) === "true" && !window.matchMedia("(max-width: 750px)").matches) {
      body.classList.add("desktop-mobile-preview");
    }
  } catch (error) {
    console.warn("Unable to read desktop mobile preview preference", error);
  }

  attachSortHandlers();
  syncMobileSortControls();
  syncDesktopMobilePreviewButton();
  renderRows(filterItems());
  applyDesktopAdaptiveLayout();
});





