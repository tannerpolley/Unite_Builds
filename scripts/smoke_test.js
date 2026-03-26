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

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".table-row-group .table-row", { timeout: 120000 });

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
    const expectedHeldItems = ["Razor Claw", "Scope Lens", "Accel Bracer", "Charging Charm"];
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

    const noHistoryMoveName = await page.evaluate(async () => {
      const input = document.getElementById("nameSearch");
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const patchHistoryUrl = new URL("static/json/pokemon_move_patch_history.json", window.location.href).toString();
      const patchHistory = await fetch(patchHistoryUrl, { cache: "no-store" }).then((response) => response.json());
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));

      for (const row of rows) {
        const pokemonName = row.querySelector(".table-cell:nth-child(2)")?.textContent?.trim();
        const moveImages = Array.from(row.querySelectorAll(".move-img"));

        for (const moveImage of moveImages) {
          const src = decodeURIComponent(moveImage.getAttribute("src") || "");
          const filename = src.split("/").pop() || "";
          const parts = filename.replace(/\.png$/i, "").split(" - ");
          if (parts.length !== 2) {
            continue;
          }

          const moveName = parts[1].trim();
          const hasHistory = !!(pokemonName && patchHistory[pokemonName] && patchHistory[pokemonName][moveName] && patchHistory[pokemonName][moveName].length);
          if (!hasHistory) {
            moveImage.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            return moveName;
          }
        }
      }

      throw new Error("Smoke test failed: could not find any visible move without patch history");
    });
    await page.waitForSelector("#popup:not(.hidden) .popup-tab-button", { timeout: 30000 });
    await assertPopupTabs(["Description", "Patches"], "Description");
    await openPopupTab("Patches");
    const emptyPatchMessage = await page.$eval(
      "#popup:not(.hidden) .patch-history-empty",
      (node) => node.textContent.trim()
    );
    if (emptyPatchMessage !== `No patch notes available for ${noHistoryMoveName} yet.`) {
      throw new Error(`Smoke test failed: unexpected empty patch message "${emptyPatchMessage}"`);
    }
    await closePopup();

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

    const mobilePage = await browser.newPage();
    const mobileErrors = [];
    mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await mobilePage.goto(baseUrl, { waitUntil: "networkidle2", timeout: 120000 });
    await mobilePage.waitForSelector("#moveset-cards .mobile-card", { timeout: 120000 });

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

    await mobilePage.click("#mobileFiltersButton");
    await mobilePage.waitForFunction(() => document.body.classList.contains("mobile-panel-filters-open"), { timeout: 30000 });
    await mobilePage.evaluate(() => {
      const minPickRate = document.getElementById("minPickRate");
      minPickRate.value = "5";
      minPickRate.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await mobilePage.evaluate(() => document.getElementById("closeFiltersPanel").click());
    await mobilePage.waitForFunction(() => !document.body.classList.contains("mobile-panel-open"), { timeout: 30000 });
    await mobilePage.evaluate(() => {
      const minPickRate = document.getElementById("minPickRate");
      minPickRate.value = "1";
      minPickRate.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await mobilePage.waitForFunction(() => document.querySelectorAll("#moveset-cards .mobile-card").length > 0, { timeout: 30000 });

    await mobilePage.click("#mobileHelpButton");
    await mobilePage.waitForFunction(() => document.body.classList.contains("mobile-panel-help-open"), { timeout: 30000 });
    const helpItemCount = await mobilePage.$$eval("#mobileHelpPanel .mobile-help-list li", (items) => items.length);
    if (helpItemCount < 4) {
      throw new Error("Smoke test failed: mobile help sheet did not render expected content");
    }
    await mobilePage.evaluate(() => document.getElementById("closeHelpPanel").click());
    await mobilePage.waitForFunction(() => !document.body.classList.contains("mobile-panel-open"), { timeout: 30000 });

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
