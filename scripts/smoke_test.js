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

    async function closePopup() {
      await page.evaluate(() => {
        const popup = document.getElementById("popup");
        popup.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForFunction(
        () => document.getElementById("popup").classList.contains("hidden"),
        { timeout: 30000 }
      );
    }

    async function assertPopupTabs(expectedLabels, expectedActiveLabel) {
      const tabLabels = await page.$$eval(
        "#popup:not(.hidden) .popup-tab-button",
        (nodes) => nodes.map((node) => node.textContent.trim()).filter(Boolean)
      );
      if (tabLabels.length !== expectedLabels.length || tabLabels.some((label, index) => label !== expectedLabels[index])) {
        throw new Error(`Smoke test failed: expected popup tabs ${expectedLabels.join(", ")} but found ${tabLabels.join(", ")}`);
      }

      const activeLabel = await page.$eval(
        "#popup:not(.hidden) .popup-tab-button.active",
        (node) => node.textContent.trim()
      );
      if (activeLabel !== expectedActiveLabel) {
        throw new Error(`Smoke test failed: expected active popup tab "${expectedActiveLabel}" but found "${activeLabel}"`);
      }
    }

    async function openPopupTab(label) {
      const clicked = await page.evaluate((targetLabel) => {
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

      await page.waitForFunction(
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

    const absolRowPickRate = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".table-row-group .table-row"));
      const absolRow = rows.find((row) => {
        const nameCell = row.querySelector(".table-cell:nth-child(2)");
        return nameCell && nameCell.textContent.trim() === "Absol";
      });
      if (!absolRow) {
        throw new Error("Smoke test failed: could not find Absol row");
      }
      const pickRateCell = absolRow.querySelector(".table-cell:nth-child(7)");
      return pickRateCell ? pickRateCell.textContent.trim() : "";
    });

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
    await page.waitForSelector("#popup:not(.hidden) .build-summary-grid", { timeout: 30000 });
    const metricLabels = await page.$$eval(
      "#popup:not(.hidden) .build-metric-label",
      (nodes) => nodes.map((node) => node.textContent.trim())
    );
    if (metricLabels.length < 2 || metricLabels[0] !== "Win Rate" || metricLabels[1] !== "Pick Rate") {
      throw new Error(`Smoke test failed: winrate popup metric order is incorrect (${metricLabels.join(", ")})`);
    }
    const summaryPickRate = await page.$eval(
      "#popup:not(.hidden) .build-metric-card:nth-child(2) .build-metric-value",
      (node) => node.textContent.trim()
    );
    if (summaryPickRate !== absolRowPickRate) {
      throw new Error(`Smoke test failed: popup pick rate "${summaryPickRate}" did not match table value "${absolRowPickRate}"`);
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

    if (pageErrors.length > 0) {
      throw new Error(`Smoke test failed with page errors: ${pageErrors.join(" | ")}`);
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
