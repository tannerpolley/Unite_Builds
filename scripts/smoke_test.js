const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const puppeteer = require("puppeteer");

const repoRoot = path.resolve(__dirname, "..");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function resolveRequestPath(requestUrl) {
  const parsed = new URL(requestUrl, "http://127.0.0.1");
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }
  return path.join(repoRoot, pathname);
}

function createStaticServer() {
  return http.createServer((req, res) => {
    const targetPath = resolveRequestPath(req.url || "/");

    if (!targetPath.startsWith(repoRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(targetPath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(targetPath).pipe(res);
    });
  });
}

async function main() {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const logStep = (message) => console.log(`[smoke] ${message}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      protocolTimeout: 300000,
    });
    logStep("browser launched");

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".table-row-group .table-row", { timeout: 120000 });
    logStep("base page ready");

    const rowCount = await page.$$eval(".table-row-group .table-row", (rows) => rows.length);
    if (rowCount === 0) {
      throw new Error("Smoke test failed: no table rows rendered");
    }

    const headerText = await page.$eval("#header-text", (node) => node.textContent.trim());
    if (!headerText) {
      throw new Error("Smoke test failed: header text did not load");
    }
    if (/non-mobile devices/i.test(headerText)) {
      throw new Error(`Smoke test failed: header still includes desktop-only messaging ("${headerText}")`);
    }

    const desktopControls = await page.evaluate(() => {
      const tipsButton = document.getElementById("desktopTipsButton");
      const helpPanel = document.getElementById("mobileHelpPanel");
      return {
        tipsButtonVisible: !!tipsButton && getComputedStyle(tipsButton).display !== "none",
        helpPanelHidden: !!helpPanel && getComputedStyle(helpPanel).display === "none",
      };
    });
    if (!desktopControls.tipsButtonVisible || !desktopControls.helpPanelHidden) {
      throw new Error(`Smoke test failed: desktop controls did not initialize correctly (${JSON.stringify(desktopControls)})`);
    }

    await page.click("#desktopTipsButton");
    await page.waitForFunction(() => document.body.classList.contains("desktop-help-open"), { timeout: 30000 });
    const desktopHelpState = await page.evaluate(() => ({
      panelVisible: getComputedStyle(document.getElementById("mobileHelpPanel")).display !== "none",
      helpItems: document.querySelectorAll("#mobileHelpPanel .mobile-help-list li").length,
      panelTitle: document.querySelector("#mobileHelpPanel .mobile-panel-header h3")?.textContent?.trim() || "",
    }));
    if (!desktopHelpState.panelVisible || desktopHelpState.helpItems < 9 || desktopHelpState.panelTitle !== "Info") {
      throw new Error(`Smoke test failed: desktop Info panel did not render correctly (${JSON.stringify(desktopHelpState)})`);
    }
    await page.click("#closeHelpPanel");
    await page.waitForFunction(() => !document.body.classList.contains("desktop-help-open"), { timeout: 30000 });

    await page.click("#desktopMobilePreviewButton");
    await page.waitForFunction(() => document.body.classList.contains("desktop-mobile-preview"), { timeout: 30000 });
    const desktopPreviewState = await page.evaluate(() => ({
      cardsVisible: getComputedStyle(document.getElementById("moveset-cards")).display !== "none",
      tableHidden: getComputedStyle(document.querySelector(".table-scroll-shell")).display === "none",
      inlineExitVisible: !document.getElementById("desktopMobilePreviewInlineButton").hidden,
    }));
    if (!desktopPreviewState.cardsVisible || !desktopPreviewState.tableHidden || !desktopPreviewState.inlineExitVisible) {
      throw new Error(`Smoke test failed: desktop mobile preview did not activate correctly (${JSON.stringify(desktopPreviewState)})`);
    }
    await page.click("#desktopMobilePreviewInlineButton");
    await page.waitForFunction(() => !document.body.classList.contains("desktop-mobile-preview"), { timeout: 30000 });

    async function checkDesktopWidth(width, expectation) {
      const widthPage = await browser.newPage();
      const widthErrors = [];
      widthPage.on("pageerror", (error) => widthErrors.push(error.message));
      await widthPage.setViewport({ width, height: 1200, deviceScaleFactor: 1 });
      await widthPage.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
      await widthPage.waitForSelector(".table-row-group .table-row", { timeout: 120000 });

      const state = await widthPage.evaluate(() => {
        const controls = document.querySelector(".controls-shell");
        const filters = document.getElementById("filters");
        const search = document.getElementById("nameSearch");
        const roles = document.querySelector(".role-filters");
        const pick = document.querySelector(".pick-rate-container");
        const actions = document.querySelector(".filter-actions");
        const roleOptions = Array.from(document.querySelectorAll(".role-filters .role-option"));
        const roleTops = roleOptions.map((node) => Math.round(node.getBoundingClientRect().top));
        const headerCells = Array.from(document.querySelectorAll(".table-header-group .table-cell"));
        const headerFontSizes = headerCells.map((node) => getComputedStyle(node).fontSize);
        const firstRow = document.querySelector(".table-row-group .table-row");
        const moveImages = firstRow ? Array.from(firstRow.querySelectorAll(".move-img")) : [];
        const moveImageTops = moveImages.map((node) => Math.round(node.getBoundingClientRect().top));
        const movesetInline = firstRow?.querySelector(".moveset-label-inline");
        const movesetStacked = firstRow?.querySelector(".moveset-label-stacked");
        const tierHeader = headerCells[5];
        const winRateHeader = headerCells[6];
        const pickRateHeader = headerCells[7];
        const tierCell = firstRow?.querySelector(".table-cell:nth-child(6)");
        const winRateCell = firstRow?.querySelector(".table-cell:nth-child(7)");
        const pickRateCell = firstRow?.querySelector(".table-cell:nth-child(8)");
        const controlsRect = controls?.getBoundingClientRect();
        const filtersRect = filters?.getBoundingClientRect();
        const searchRect = search?.getBoundingClientRect();
        const rolesRect = roles?.getBoundingClientRect();
        const pickRect = pick?.getBoundingClientRect();
        const actionsRect = actions?.getBoundingClientRect();
        const rects = [pickRect, rolesRect, actionsRect].filter(Boolean);
        const groupRect = rects.length
          ? {
              left: Math.min(...rects.map((rect) => rect.left)),
              right: Math.max(...rects.map((rect) => rect.right)),
              top: Math.min(...rects.map((rect) => rect.top)),
              bottom: Math.max(...rects.map((rect) => rect.bottom)),
            }
          : null;
        const within = (rect, outer) => !!rect && !!outer &&
          rect.left >= outer.left - 1 &&
          rect.right <= outer.right + 1 &&
          rect.top >= outer.top - 1 &&
          rect.bottom <= outer.bottom + 1;
        return {
          cardsHidden: getComputedStyle(document.getElementById("moveset-cards")).display === "none",
          tableVisible: getComputedStyle(document.querySelector(".table-scroll-shell")).display !== "none",
          searchSameRowAsFilters: !!searchRect && !!filtersRect && Math.abs(searchRect.top - filtersRect.top) <= 6,
          searchAboveFilters: !!searchRect && !!filtersRect && searchRect.top < filtersRect.top,
          roleRowCount: Array.from(new Set(roleTops)).length,
          roleCenterDelta: rolesRect && filtersRect ? Math.abs((rolesRect.left + rolesRect.right) / 2 - (filtersRect.left + filtersRect.right) / 2) : 999,
          controlGroupCenterDelta: groupRect && filtersRect ? Math.abs((groupRect.left + groupRect.right) / 2 - (filtersRect.left + filtersRect.right) / 2) : 999,
          filtersWithinShell: within(filtersRect, controlsRect),
          filterChildrenWithinBounds: [pickRect, rolesRect, actionsRect].every((rect) => within(rect, filtersRect)),
          uniqueHeaderFontSizes: Array.from(new Set(headerFontSizes)).length,
          tierHeaderVisible: !!tierHeader && tierHeader.textContent.includes("Tier") && tierHeader.getBoundingClientRect().width > 0,
          pickRateHeaderVisible: !!pickRateHeader && pickRateHeader.textContent.includes("Pick Rate") && pickRateHeader.getBoundingClientRect().width > 0,
          winRateHeaderVisible: !!winRateHeader && winRateHeader.textContent.includes("Win Rate") && winRateHeader.getBoundingClientRect().width > 0,
          tierCellVisible: !!tierCell && tierCell.getBoundingClientRect().width > 0 && tierCell.textContent.trim().length > 0,
          pickRateCellVisible: !!pickRateCell && pickRateCell.getBoundingClientRect().width > 0 && pickRateCell.textContent.trim().length > 0,
          winRateCellVisible: !!winRateCell && winRateCell.getBoundingClientRect().width > 0 && winRateCell.textContent.trim().length > 0,
          moveImagesHorizontal: moveImageTops.length >= 2 && moveImageTops.every((top) => Math.abs(top - moveImageTops[0]) <= 2),
          inlineMovesetVisible: !!movesetInline && getComputedStyle(movesetInline).display !== "none",
          stackedMovesetVisible: !!movesetStacked && getComputedStyle(movesetStacked).display !== "none",
        };
      });

      const failures = [];
      if (!state.cardsHidden || !state.tableVisible) failures.push("desktop table visibility");
      if (expectation.searchMode === "same-row" && !state.searchSameRowAsFilters) failures.push("search/filter row merge");
      if (expectation.searchMode === "stacked" && !state.searchAboveFilters) failures.push("search/filter row split");
      if (expectation.searchMode === "separate" && state.searchSameRowAsFilters) failures.push("search/filter row merge");
      if (state.roleRowCount > expectation.maxRoleRows) failures.push("role row count");
      if (state.uniqueHeaderFontSizes !== 1) failures.push("header font uniformity");
      if (!state.tierHeaderVisible || !state.tierCellVisible) failures.push("tier visibility");
      if (!state.pickRateHeaderVisible || !state.pickRateCellVisible) failures.push("pick rate visibility");
      if (!state.winRateHeaderVisible || !state.winRateCellVisible) failures.push("win rate visibility");
      if (!state.moveImagesHorizontal) failures.push("horizontal move icons");
      if (expectation.moveset === "inline" && (!state.inlineMovesetVisible || state.stackedMovesetVisible)) failures.push("inline moveset state");
      if (expectation.moveset === "stacked" && state.inlineMovesetVisible) failures.push("stacked moveset state");
      if (expectation.moveset === "stacked" && !state.stackedMovesetVisible) failures.push("stacked moveset state");

      await widthPage.close();
      if (widthErrors.length > 0) {
        throw new Error(`Smoke test failed: page errors at ${width}px (${widthErrors.join("; ")})`);
      }
      if (failures.length > 0) {
        throw new Error(`Smoke test failed at ${width}px: ${failures.join(", ")} (${JSON.stringify(state)})`);
      }
    }

    const desktopWidths = [
      { width: 1600, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 70, maxControlCenterDelta: 40, moveset: "inline" },
      { width: 1586, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 70, maxControlCenterDelta: 40, moveset: "inline" },
      { width: 1540, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 24, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 1230, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 24, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 1180, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 24, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 1120, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 24, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 960, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 20, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 890, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 20, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 800, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 20, maxControlCenterDelta: 24, moveset: "stacked" },
      { width: 760, searchMode: "separate", maxRoleRows: 1, maxRoleCenterDelta: 20, maxControlCenterDelta: 24, moveset: "stacked" },
    ];

    for (const config of desktopWidths) {
      await checkDesktopWidth(config.width, config);
    }
    logStep("desktop widths passed");

    async function checkMobileWidth(width, expectation) {
      const widthPage = await browser.newPage();
      const widthErrors = [];
      widthPage.on("pageerror", (error) => widthErrors.push(error.message));
      await widthPage.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await widthPage.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
      await widthPage.waitForSelector("#moveset-cards .mobile-card", { timeout: 120000 });

      const state = await widthPage.evaluate(() => {
        const cards = document.getElementById("moveset-cards");
        const tableShell = document.querySelector(".table-scroll-shell");
        const firstCard = document.querySelector("#moveset-cards .mobile-card");
        const metrics = firstCard?.querySelector(".mobile-card-metrics");
        const firstMoveButton = firstCard?.querySelector(".mobile-move-button");
        const secondMoveButton = firstCard?.querySelector(".mobile-move-button-2");
        const moveLabel = firstMoveButton?.querySelector(".mobile-card-move-label");
        const moveIconShell = firstMoveButton?.querySelector(".mobile-card-move-icon-shell");
        const pokemonText = firstCard?.querySelector(".mobile-card-pokemon-text");
        const pokemonName = firstCard?.querySelector(".mobile-card-name");
        const pokemonRole = firstCard?.querySelector(".mobile-card-role");
        const tierMetric = firstCard?.querySelector(".mobile-card-tier-metric");
        const labelRect = moveLabel?.getBoundingClientRect();
        const iconRect = moveIconShell?.getBoundingClientRect();
        const cardRect = firstCard?.getBoundingClientRect();
        const metricsRect = metrics?.getBoundingClientRect();
        const move1Rect = firstMoveButton?.getBoundingClientRect();
        const move2Rect = secondMoveButton?.getBoundingClientRect();
        const metricNodes = Array.from(firstCard?.querySelectorAll(".mobile-card-metric, .mobile-view-items") || []);
        const metricContentWithinBounds = metricNodes.every((node) => {
          const nodeRect = node.getBoundingClientRect();
          return Array.from(node.children).every((child) => {
            const childRect = child.getBoundingClientRect();
            return childRect.left >= nodeRect.left - 3 &&
              childRect.right <= nodeRect.right + 3 &&
              childRect.top >= nodeRect.top - 3 &&
              childRect.bottom <= nodeRect.bottom + 3;
          });
        });
        const pokemonTextRect = pokemonText?.getBoundingClientRect();
        const pokemonNameRect = pokemonName?.getBoundingClientRect();
        const pokemonRoleRect = pokemonRole?.getBoundingClientRect();

        return {
          cardsVisible: !!cards && getComputedStyle(cards).display !== "none",
          tableHidden: !!tableShell && getComputedStyle(tableShell).display === "none",
          docScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          wideCard: !!firstCard && firstCard.classList.contains("mobile-card-wide"),
          compactCard: !!firstCard && firstCard.classList.contains("mobile-card-compact"),
          metricsDirection: metrics ? getComputedStyle(metrics).flexDirection : "",
          labelBelowIcon: !!labelRect && !!iconRect && labelRect.top > iconRect.top - 1,
          metricsWithinCard: !!cardRect && !!metricsRect && metricsRect.right <= cardRect.right + 3 && metricsRect.left >= cardRect.left - 3,
          metricContentWithinBounds,
          moveColumnsEqual: !!move1Rect && !!move2Rect && Math.abs(move1Rect.width - move2Rect.width) <= 4,
          compactMoveWithinMetricsBoundary: !!move2Rect && !!metricsRect ? move2Rect.right <= metricsRect.left + 3 : true,
          pokemonTextAligned: !!pokemonTextRect && !!pokemonNameRect && !!pokemonRoleRect &&
            pokemonNameRect.left >= pokemonTextRect.left - 4 &&
            pokemonRoleRect.left >= pokemonTextRect.left - 4 &&
            Math.abs(pokemonNameRect.left - pokemonRoleRect.left) <= 4,
          tierMetricVisible: !!tierMetric && tierMetric.getBoundingClientRect().width > 0 && tierMetric.textContent.includes("Tier"),
        };
      });

      const failures = [];
      if (!state.cardsVisible || !state.tableHidden) failures.push("mobile layout visibility");
      if (state.docScrollWidth > state.viewportWidth + 2) failures.push("mobile overflow");
      if (expectation.layout === "wide" && !state.wideCard) failures.push("wide mobile card mode");
      if (expectation.layout === "compact" && !state.compactCard) failures.push("compact mobile card mode");
      if (expectation.metricsDirection === "row" && state.metricsDirection !== "row") failures.push("wide mobile metrics direction");
      if (expectation.metricsDirection === "column" && state.metricsDirection !== "column") failures.push("compact mobile metrics direction");
      if (!state.labelBelowIcon) failures.push("mobile move label position");
      if (!state.metricsWithinCard) failures.push("mobile metrics bounds");
      if (!state.metricContentWithinBounds) failures.push("mobile metric content bounds");
      if (!state.tierMetricVisible) failures.push("mobile tier metric");
      if (expectation.layout === "compact" && !state.compactMoveWithinMetricsBoundary) failures.push("compact move overlap");
      if (expectation.layout === "wide" && !state.pokemonTextAligned) failures.push("wide mobile pokemon text alignment");

      await widthPage.close();
      if (widthErrors.length > 0) {
        throw new Error(`Smoke test failed: mobile page errors at ${width}px (${widthErrors.join("; ")})`);
      }
      if (failures.length > 0) {
        throw new Error(`Smoke test failed at mobile width ${width}px: ${failures.join(", ")} (${JSON.stringify(state)})`);
      }
    }

    const mobileWidths = [
      { width: 750, layout: "wide", metricsDirection: "row" },
      { width: 680, layout: "wide", metricsDirection: "row" },
      { width: 600, layout: "wide", metricsDirection: "row" },
      { width: 500, layout: "wide", metricsDirection: "row" },
      { width: 390, layout: "compact", metricsDirection: "column" },
      { width: 360, layout: "compact", metricsDirection: "column" },
      { width: 320, layout: "compact", metricsDirection: "column" },
    ];

    for (const config of mobileWidths) {
      await checkMobileWidth(config.width, config);
    }
    logStep("mobile widths passed");

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "Absol";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(
      () => document.getElementById("nameSearch").value === "Absol",
      { timeout: 30000 }
    );
    await page.click(".main-header h1");
    await page.waitForFunction(
      () => document.getElementById("nameSearch").value === "" && document.querySelectorAll(".table-row-group .table-row").length > 1,
      { timeout: 30000 }
    );

    async function closePopup(pageRef = page) {
      await pageRef.evaluate(() => {
        const closeButton = document.querySelector("#popup:not(.hidden) .popup-close-button");
        if (closeButton) {
          closeButton.click();
          return;
        }
        const popup = document.getElementById("popup");
        popup.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await pageRef.waitForFunction(
        () => document.getElementById("popup").classList.contains("hidden"),
        { timeout: 30000 }
      );
    }

    async function assertPopupTabs(expectedLabels, expectedActiveLabel, pageRef = page) {
      const tabLabels = await pageRef.$$eval(
        "#popup:not(.hidden) .popup-tab-button",
        (nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean)
      );
      if (tabLabels.length !== expectedLabels.length || tabLabels.some((label, index) => label !== expectedLabels[index])) {
        throw new Error(`Smoke test failed: expected popup tabs ${expectedLabels.join(", ")} but found ${tabLabels.join(", ")}`);
      }

      const activeLabel = await pageRef.$eval(
        "#popup:not(.hidden) .popup-tab-button.active",
        (node) => node.textContent.trim()
      );
      if (activeLabel !== expectedActiveLabel) {
        throw new Error(`Smoke test failed: expected active popup tab "${expectedActiveLabel}" but found "${activeLabel}"`);
      }
    }

    async function openPopupTab(label, pageRef = page) {
      const clicked = await pageRef.evaluate((targetLabel) => {
        const buttons = Array.from(document.querySelectorAll("#popup:not(.hidden) .popup-tab-button"));
        const target = buttons.find((button) => button.textContent.trim() === targetLabel);
        if (!target) {
          return false;
        }
        target.click();
        return true;
      }, label);

      if (!clicked) {
        throw new Error(`Smoke test failed: could not find popup tab "${label}"`);
      }

      await pageRef.waitForFunction(
        (targetLabel) => {
          const active = document.querySelector("#popup:not(.hidden) .popup-tab-button.active");
          return active && active.textContent.trim() === targetLabel;
        },
        { timeout: 30000 },
        label
      );
    }

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "Absol";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      return rows.some((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Absol";
      });
    }, { timeout: 30000 });

    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const absolRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Absol";
      });
      const button = absolRow && absolRow.querySelector(".view-items");
      if (!button) {
        throw new Error("Smoke test failed: could not find Absol winrate button");
      }
      button.click();
    });
    await page.waitForSelector("#popup:not(.hidden) .build-popup-top-row", { timeout: 30000 });
    const removedSummaryMetrics = await page.$$eval(
      "#popup:not(.hidden) .build-summary-grid, #popup:not(.hidden) .build-metric-card",
      (nodes) => nodes.length
    );
    if (removedSummaryMetrics !== 0) {
      throw new Error("Smoke test failed: legacy build summary metrics still render in the popup");
    }
    const battleCardCount = await page.$$eval(
      "#popup:not(.hidden) .battle-item-card",
      (nodes) => nodes.length
    );
    if (battleCardCount !== 3) {
      throw new Error(`Smoke test failed: expected 3 battle item cards, found ${battleCardCount}`);
    }
    const battleMetricLabels = await page.$$eval(
      "#popup:not(.hidden) .battle-item-card:first-of-type .battle-item-card-label",
      (nodes) => nodes.map((node) => node.textContent.trim())
    );
    if (battleMetricLabels.join("|") !== "Win Rate|Pick Rate") {
      throw new Error(`Smoke test failed: battle item metrics rendered in the wrong order (${battleMetricLabels.join(", ")})`);
    }
    const buildHeaderState = await page.evaluate(() => {
      const row = document.querySelector("#popup:not(.hidden) .build-popup-top-row");
      const moves = Array.from(document.querySelectorAll("#popup:not(.hidden) .build-popup-inline-move")).map((node) => node.textContent.trim());
      return {
        rowExists: !!row,
        moveCount: moves.length,
        moves,
      };
    });
    if (!buildHeaderState.rowExists || buildHeaderState.moveCount !== 2) {
      throw new Error(`Smoke test failed: build popup header layout is invalid (${JSON.stringify(buildHeaderState)})`);
    }
    const heldItemNames = await page.$$eval(
      "#popup:not(.hidden) .held-item-img",
      (nodes) => nodes.map((node) => node.getAttribute("alt")).filter(Boolean)
    );
    const expectedHeldItems = ["Razor Claw", "Scope Lens", "Accel Bracer"];
    for (const itemName of expectedHeldItems) {
      if (!heldItemNames.includes(itemName)) {
        throw new Error(`Smoke test failed: expected held item "${itemName}" was not rendered`);
      }
    }
    await page.waitForFunction(
      () => {
        const nodes = Array.from(document.querySelectorAll("#popup:not(.hidden) .held-item-img"));
        return nodes.length > 0 && nodes.every((node) => node.complete && node.naturalWidth > 0);
      },
      { timeout: 30000 }
    );
    const heldImagesLoaded = await page.$$eval(
      "#popup:not(.hidden) .held-item-img",
      (nodes) => nodes.every((node) => node.complete && node.naturalWidth > 0)
    );
    if (!heldImagesLoaded) {
      throw new Error("Smoke test failed: one or more held item icons failed to load");
    }
    await closePopup();
    logStep("absol build popup passed");

    await page.click(".move-img");
    await page.waitForSelector("#popup:not(.hidden) .move-popup-header", { timeout: 30000 });
    await assertPopupTabs(["Description", "Patches"], "Description");
    await openPopupTab("Patches");
    await page.waitForSelector("#popup:not(.hidden) .patch-change-line", { timeout: 30000 });
    await page.waitForSelector("#popup:not(.hidden) .patch-history-version", { timeout: 30000 });
    const movePatchLines = await page.$$eval("#popup:not(.hidden) .patch-change-line", (nodes) =>
      nodes.map((node) => node.textContent.trim()).filter(Boolean)
    );
    if (movePatchLines.length === 0) {
      throw new Error("Smoke test failed: move popup patch lines did not render");
    }
    if (movePatchLines.some((line) => /\bRatio:|\bSlider:|\bBase:\s*[+-]?\d|\bLvl\s*\d/i.test(line))) {
      throw new Error("Smoke test failed: move popup still shows raw patch math");
    }

    const genericPatchHeader = await page.$eval(
      "#popup:not(.hidden) .patch-history-version",
      (node) => node.textContent.trim()
    );
    if (genericPatchHeader.startsWith("Patch ")) {
      throw new Error("Smoke test failed: patch header still includes the Patch prefix");
    }
    if (!/^\d+(?:\.\d+)+ \([A-Za-z]+ \d{1,2}, \d{4}\)$/.test(genericPatchHeader)) {
      throw new Error(`Smoke test failed: unexpected patch header format "${genericPatchHeader}"`);
    }
    const genericTitleCount = await page.$$eval(
      "#popup:not(.hidden) .patch-history-title",
      (nodes) => nodes.length
    );
    if (genericTitleCount !== 0) {
      throw new Error("Smoke test failed: patch subtitle/title is still rendering");
    }

    await page.evaluate(() => {
      const popupContent = document.getElementById("popupContent");
      popupContent.scrollTop = popupContent.scrollHeight;
      const body = popupContent.querySelector(".move-popup-body");
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    });
    await closePopup();
    logStep("move popup passed");

    await page.click(".move-img");
    await page.waitForSelector("#popup:not(.hidden) .move-popup-header", { timeout: 30000 });
    const reopenedScrollState = await page.evaluate(() => {
      const popupContent = document.getElementById("popupContent");
      const body = popupContent.querySelector(".move-popup-body");
      return {
        popupContent: popupContent.scrollTop,
        body: body ? body.scrollTop : 0
      };
    });
    if (reopenedScrollState.popupContent !== 0 || reopenedScrollState.body !== 0) {
      throw new Error(`Smoke test failed: popup scroll did not reset to the top (${JSON.stringify(reopenedScrollState)})`);
    }
    await assertPopupTabs(["Description", "Patches"], "Description");
    await closePopup();
    logStep("move popup reopen passed");

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "Venusaur";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      return rows.some((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Venusaur";
      });
    }, { timeout: 30000 });
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const venusaurRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Venusaur";
      });
      const solarBeamImage = venusaurRow && Array.from(venusaurRow.querySelectorAll(".move-img")).find((img) => {
        const alt = img.getAttribute("alt") || "";
        const src = img.getAttribute("src") || "";
        return alt.includes("Venusaur - Solar Beam.png")
          || src.includes("Venusaur - Solar Beam.png")
          || src.includes("Venusaur%20-%20Solar%20Beam.png");
      });
      if (!solarBeamImage) {
        throw new Error("Smoke test failed: could not find Venusaur Solar Beam image");
      }
      solarBeamImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForSelector("#popup:not(.hidden) .patch-change-heading", { timeout: 30000 });
    await assertPopupTabs(["Description", "Patches"], "Description");
    await openPopupTab("Patches");
    const solarBeamHeadings = await page.$$eval(
      "#popup:not(.hidden) .patch-history-card:first-of-type .patch-change-heading",
      (nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean)
    );
    if (solarBeamHeadings.filter((heading) => heading === "Solar Beam").length !== 1) {
      throw new Error("Smoke test failed: Solar Beam base heading did not render correctly");
    }
    if (solarBeamHeadings.filter((heading) => heading === "Solar Beam+").length !== 1) {
      throw new Error("Smoke test failed: Solar Beam+ should render as its own section");
    }
    const solarBeamLines = await page.$$eval(
      "#popup:not(.hidden) .patch-history-card:first-of-type .patch-change-line",
      (nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean)
    );
    if (solarBeamLines.some((line) => line.startsWith("+ Version:") || line.startsWith("Base:"))) {
      throw new Error("Smoke test failed: base and plus sections should not use variant-prefixed bullets anymore");
    }
    const solarBeamIconCount = await page.$$eval(
      "#popup:not(.hidden) .patch-history-card:first-of-type .patch-change-icon",
      (nodes) => nodes.length
    );
    if (solarBeamIconCount === 0) {
      throw new Error("Smoke test failed: move patch sections did not render move icons");
    }
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("#popup:not(.hidden) .patch-history-card:first-of-type .patch-change-icon"))
        .some((node) => node.clientWidth > 0 && node.naturalWidth > 0),
      { timeout: 30000 }
    );
    const solarBeamLoadedIconCount = await page.$$eval(
      "#popup:not(.hidden) .patch-history-card:first-of-type .patch-change-icon",
      (nodes) => nodes.filter((node) => node.clientWidth > 0 && node.naturalWidth > 0).length
    );
    if (solarBeamLoadedIconCount === 0) {
      throw new Error("Smoke test failed: move patch icons rendered but did not load");
    }
    await closePopup();
    logStep("solar beam popup passed");

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "Greninja";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      return rows.some((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Greninja";
      });
    }, { timeout: 30000 });
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const greninjaRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Greninja";
      });
      const moveImage = greninjaRow && greninjaRow.querySelector(".move-img");
      if (!moveImage) {
      throw new Error("Smoke test failed: could not find Greninja move image");
      }
      moveImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForSelector("#popup:not(.hidden) .popup-tab-button", { timeout: 30000 });
    await assertPopupTabs(["Description", "Patches"], "Description");
    await openPopupTab("Patches");
    await page.waitForSelector("#popup:not(.hidden) .patch-change-heading", { timeout: 30000 });
    const greninjaMoveHeadings = await page.$$eval(
      "#popup:not(.hidden) .patch-change-heading",
      (nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean)
    );
    if (greninjaMoveHeadings.includes("Bubble")) {
      throw new Error("Smoke test failed: earlier-path Bubble changes are still shown in the Greninja move popup");
    }
    const greninjaEmptyPatchCards = await page.$$eval(
      "#popup:not(.hidden) .patch-history-card",
      (cards) => cards.filter((card) => card.querySelectorAll(".patch-change-heading").length === 0).length
    );
    if (greninjaEmptyPatchCards > 0) {
      throw new Error("Smoke test failed: move popup still shows empty patch headers with no remaining changes");
    }
    await closePopup();
    logStep("greninja move popup passed");

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    logStep("no-history move popup skipped");

    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const greninjaRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Greninja";
      });
      const pokemonImage = greninjaRow && greninjaRow.querySelector(".table-cell:first-child img");
      if (!pokemonImage) {
        throw new Error("Smoke test failed: could not find Greninja row image");
      }
      pokemonImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForSelector("#popup:not(.hidden) .popup-tab-button", { timeout: 30000 });
    await assertPopupTabs(["Overview", "Patches"], "Overview");
    await openPopupTab("Patches");
    await page.waitForSelector("#popup:not(.hidden) .patch-change", { timeout: 30000 });
    const greninjaLegacyTones = await page.$$eval(
      "#popup:not(.hidden) .patch-change",
      (sections) => sections
        .filter((section) => {
          const heading = section.querySelector(".patch-change-heading");
          return heading && heading.textContent.trim() === "Waterburst Shuriken";
        })
        .flatMap((section) => Array.from(section.querySelectorAll(".patch-change-line")).map((line) => line.className))
    );
    if (!greninjaLegacyTones.some((className) => className.includes("patch-change-line--buff") || className.includes("patch-change-line--nerf"))) {
      throw new Error("Smoke test failed: older neutral-heading Greninja entries did not pick up buff/nerf tone classes");
    }
    await closePopup();
    logStep("greninja pokemon popup passed");

    await page.evaluate(() => {
      const input = document.getElementById("nameSearch");
      input.value = "Absol";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      return rows.some((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Absol";
      });
    }, { timeout: 30000 });
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const absolRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Absol";
      });
      const pokemonImage = absolRow && absolRow.querySelector(".table-cell:first-child img");
      if (!pokemonImage) {
        throw new Error("Smoke test failed: could not find Absol row image");
      }
      pokemonImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForSelector("#popup:not(.hidden) .move-popup-header", { timeout: 30000 });
    await assertPopupTabs(["Overview", "Patches"], "Overview");
    await openPopupTab("Patches");
    await page.waitForSelector("#popup:not(.hidden) .patch-change-line", { timeout: 30000 });

    const pokemonPatchLines = await page.$$eval("#popup:not(.hidden) .patch-change-line", (nodes) =>
      nodes.map((node) => node.textContent.trim()).filter(Boolean)
    );
    if (pokemonPatchLines.length === 0) {
      throw new Error("Smoke test failed: Pokemon popup patch lines did not render");
    }
    if (pokemonPatchLines.some((line) => /\bRatio:|\bSlider:|\bBase:\s*[+-]?\d|\bLvl\s*\d/i.test(line))) {
      throw new Error("Smoke test failed: Pokemon popup still shows raw patch math");
    }

    await closePopup();
    logStep("absol pokemon popup passed");

    const mobilePage = await browser.newPage();
    const mobileErrors = [];
    mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await mobilePage.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await mobilePage.waitForSelector("#moveset-cards .mobile-card", { timeout: 120000 });
    logStep("phone page ready");

    const mobileLayout = await mobilePage.evaluate(() => {
      const cards = document.getElementById("moveset-cards");
      const tableShell = document.querySelector(".table-scroll-shell");
      const mobileToolbar = document.querySelector(".mobile-toolbar");
      return {
        viewportWidth: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        cardsVisible: !!cards && getComputedStyle(cards).display !== "none",
        tableHidden: !!tableShell && getComputedStyle(tableShell).display === "none",
        toolbarButtons: Array.from(document.querySelectorAll(".mobile-toolbar-actions .mobile-toolbar-button")).map((node) => node.textContent.trim()),
        headerText: document.getElementById("header-text")?.textContent?.trim() || "",
      };
    });
    if (!mobileLayout.cardsVisible || !mobileLayout.tableHidden) {
      throw new Error(`Smoke test failed: phone layout did not switch to cards (${JSON.stringify(mobileLayout)})`);
    }
    if (mobileLayout.docScrollWidth > mobileLayout.viewportWidth + 2) {
      throw new Error(`Smoke test failed: phone layout still has horizontal page overflow (${JSON.stringify(mobileLayout)})`);
    }
    if (!mobileLayout.toolbarButtons.includes("Sort") || !mobileLayout.toolbarButtons.includes("Filters") || !mobileLayout.toolbarButtons.includes("Help")) {
      throw new Error(`Smoke test failed: mobile toolbar buttons are missing (${mobileLayout.toolbarButtons.join(", ")})`);
    }
    if (/non-mobile devices/i.test(mobileLayout.headerText)) {
      throw new Error("Smoke test failed: mobile header still includes desktop-only messaging");
    }
    logStep("phone layout passed");

    await mobilePage.evaluate(() => {
      document.getElementById("nameSearch").value = "Absol";
      document.getElementById("nameSearch").dispatchEvent(new Event("input", { bubbles: true }));
    });
    await mobilePage.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll("#moveset-cards .mobile-card-name"));
      return cards.some((node) => node.textContent.trim() === "Absol");
    }, { timeout: 30000 });

    const absolMobileRates = await mobilePage.evaluate(() => {
      const firstCard = Array.from(document.querySelectorAll("#moveset-cards .mobile-card")).find((card) => {
        const name = card.querySelector(".mobile-card-name");
        return name && name.textContent.trim() === "Absol";
      });
      if (!firstCard) {
        throw new Error("Smoke test failed: could not find Absol mobile card");
      }
      const values = Array.from(firstCard.querySelectorAll(".mobile-card-metric-value")).map((node) => node.textContent.trim());
      return {
        pickRate: values[1] || ""
      };
    });
    if (!absolMobileRates.pickRate) {
      throw new Error("Smoke test failed: mobile card metrics did not render");
    }
    logStep("phone absol card passed");

    await mobilePage.click("#mobileSortButton");
    await mobilePage.waitForFunction(() => document.body.classList.contains("mobile-panel-sort-open"), { timeout: 30000 });
    await mobilePage.select("#mobileSortColumn", "Win Rate");
    await mobilePage.select("#mobileSortDirection", "asc");
    await mobilePage.waitForFunction(() => {
      const card = document.querySelector("#moveset-cards .mobile-card");
      return !!card;
    }, { timeout: 30000 });
    await mobilePage.evaluate(() => document.getElementById("closeSortPanel").click());
    await mobilePage.waitForFunction(() => !document.body.classList.contains("mobile-panel-open"), { timeout: 30000 });
    logStep("phone sort panel passed");

    await mobilePage.click("#mobileFiltersButton");
    await mobilePage.waitForFunction(() => document.body.classList.contains("mobile-panel-filters-open"), { timeout: 30000 });
    const initialFilterCardCount = await mobilePage.$$eval("#moveset-cards .mobile-card", (cards) => cards.length);
    await mobilePage.evaluate(() => {
      const pickRateMin = document.getElementById("pickRateMin");
      const pickRateMax = document.getElementById("pickRateMax");
      const winRateMin = document.getElementById("winRateMin");
      const winRateMax = document.getElementById("winRateMax");
      pickRateMin.value = "0.5";
      pickRateMax.value = "4";
      pickRateMax.dispatchEvent(new Event("input", { bubbles: true }));
      winRateMin.value = "51";
      winRateMin.dispatchEvent(new Event("input", { bubbles: true }));
      winRateMax.value = "";
    });
    await mobilePage.evaluate(() => document.getElementById("closeFiltersPanel").click());
    await mobilePage.waitForFunction(() => !document.body.classList.contains("mobile-panel-open"), { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const filteredFilterCardCount = await mobilePage.$$eval("#moveset-cards .mobile-card", (cards) => cards.length);
    if (filteredFilterCardCount > initialFilterCardCount) {
      throw new Error(`Smoke test failed: mobile threshold filters did not apply correctly (${filteredFilterCardCount} of ${initialFilterCardCount})`);
    }
    logStep("phone filters panel passed");
    await mobilePage.evaluate(() => {
      const pickRateMin = document.getElementById("pickRateMin");
      const pickRateMax = document.getElementById("pickRateMax");
      const winRateMin = document.getElementById("winRateMin");
      const winRateMax = document.getElementById("winRateMax");
      pickRateMin.value = "0.5";
      pickRateMin.dispatchEvent(new Event("input", { bubbles: true }));
      pickRateMax.value = "";
      pickRateMax.dispatchEvent(new Event("input", { bubbles: true }));
      winRateMin.value = "";
      winRateMin.dispatchEvent(new Event("input", { bubbles: true }));
      winRateMax.value = "";
      winRateMax.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await mobilePage.waitForFunction(() => document.querySelectorAll("#moveset-cards .mobile-card").length > 0, { timeout: 30000 });

    await mobilePage.click("#mobileHelpButton");
    await mobilePage.waitForFunction(() => document.body.classList.contains("mobile-panel-help-open"), { timeout: 30000 });
    const helpItemCount = await mobilePage.$$eval("#mobileHelpPanel .mobile-help-list li", (items) => items.length);
    if (helpItemCount < 6) {
      throw new Error("Smoke test failed: mobile help sheet did not render expected content");
    }
    await mobilePage.evaluate(() => document.getElementById("closeHelpPanel").click());
    await mobilePage.waitForFunction(() => !document.body.classList.contains("mobile-panel-open"), { timeout: 30000 });
    logStep("phone help panel passed");

    await mobilePage.click("#moveset-cards .mobile-view-items");
    await mobilePage.waitForSelector("#popup:not(.hidden) .build-popup-top-row", { timeout: 30000 });
    const mobilePopupState = await mobilePage.evaluate(() => ({
      popupOpen: !document.getElementById("popup").classList.contains("hidden"),
      bodyLocked: document.body.classList.contains("popup-open"),
      heldIcons: document.querySelectorAll("#popup:not(.hidden) .held-item-img").length,
      legacyMetrics: document.querySelectorAll("#popup:not(.hidden) .build-summary-grid, #popup:not(.hidden) .build-metric-card").length,
      buildPopupNoScroll: (() => {
        const popupContent = document.getElementById("popupContent");
        return popupContent ? popupContent.scrollHeight <= popupContent.clientHeight + 1 : false;
      })(),
    }));
    if (!mobilePopupState.popupOpen || !mobilePopupState.bodyLocked || mobilePopupState.heldIcons === 0 || mobilePopupState.legacyMetrics !== 0 || !mobilePopupState.buildPopupNoScroll) {
      throw new Error(`Smoke test failed: mobile build popup state is invalid (${JSON.stringify(mobilePopupState)})`);
    }
    await closePopup(mobilePage);

    await mobilePage.click("#moveset-cards .mobile-move-button");
    await mobilePage.waitForSelector("#popup:not(.hidden) .popup-tab-button", { timeout: 30000 });
    await assertPopupTabs(["Description", "Patches"], "Description", mobilePage);
    await openPopupTab("Patches", mobilePage);
    await mobilePage.waitForSelector("#popup:not(.hidden) .patch-history-section", { timeout: 30000 });
    await closePopup(mobilePage);

    await mobilePage.click("#moveset-cards .mobile-card-pokemon-button");
    await mobilePage.waitForSelector("#popup:not(.hidden) .popup-tab-button", { timeout: 30000 });
    await assertPopupTabs(["Overview", "Patches"], "Overview", mobilePage);
    await openPopupTab("Patches", mobilePage);
    await mobilePage.waitForSelector("#popup:not(.hidden) .patch-history-section", { timeout: 30000 });
    await closePopup(mobilePage);

    const tabletPage = await browser.newPage();
    const tabletErrors = [];
    tabletPage.on("pageerror", (error) => tabletErrors.push(error.message));
    await tabletPage.setViewport({ width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await tabletPage.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await tabletPage.waitForSelector(".table-row-group .table-row", { timeout: 120000 });
    const tabletLayout = await tabletPage.evaluate(() => {
      const tableShell = document.querySelector(".table-scroll-shell");
      const cards = document.getElementById("moveset-cards");
      return {
        viewportWidth: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        tableVisible: !!tableShell && getComputedStyle(tableShell).display !== "none",
        cardsHidden: !!cards && getComputedStyle(cards).display === "none",
      };
    });
    if (!tabletLayout.tableVisible || !tabletLayout.cardsHidden) {
      throw new Error(`Smoke test failed: tablet layout should keep the table visible (${JSON.stringify(tabletLayout)})`);
    }
    if (tabletLayout.docScrollWidth > tabletLayout.viewportWidth + 2) {
      throw new Error(`Smoke test failed: tablet page shell still overflows horizontally (${JSON.stringify(tabletLayout)})`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Smoke test failed with page errors: ${pageErrors.join(" | ")}`);
    }
    if (mobileErrors.length > 0) {
      throw new Error(`Smoke test failed with mobile page errors: ${mobileErrors.join(" | ")}`);
    }
    if (tabletErrors.length > 0) {
      throw new Error(`Smoke test failed with tablet page errors: ${tabletErrors.join(" | ")}`);
    }

    console.log(`Smoke test passed against ${baseUrl}`);
    console.log(`Rendered rows: ${rowCount}`);
    console.log(`Header: ${headerText}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
