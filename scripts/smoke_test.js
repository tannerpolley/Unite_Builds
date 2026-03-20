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

    await page.click(".view-items");
    await page.waitForSelector("#popup:not(.hidden) .popup-table", { timeout: 30000 });
    await closePopup();

    await page.click(".move-img");
    await page.waitForSelector("#popup:not(.hidden) .move-popup-header", { timeout: 30000 });
    await closePopup();

    await page.click(".table-row .table-cell:first-child img");
    await page.waitForSelector("#popup:not(.hidden) .move-popup-header", { timeout: 30000 });

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
