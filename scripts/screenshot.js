const path = require("path");
const puppeteer = require("puppeteer");

const previewPath = path.join(__dirname, "..", "preview.png");

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // optionally reduce memory pressure:
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1080 });
  await page.goto(
    'https://tannerpolley.github.io/Unite_Builds/',
    { waitUntil: 'networkidle2' }
  );
  await page.evaluate(() => {
  document.body.style.zoom = '1.0';
});
  const { setTimeout } = require('node:timers/promises');
  await setTimeout(200);
  await page.screenshot({ path: previewPath });
  await browser.close();
  console.log('✅ preview.png generated');
})();

