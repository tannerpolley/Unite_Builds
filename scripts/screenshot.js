// screenshot.js
const path      = require('path');
const puppeteer = require('puppeteer');

;(async () => {
  const browser = await puppeteer.launch({
    // you can also pass the window-size here:
    args: ['--window-size=1900,1080']
  });
  const page    = await browser.newPage();

  // explicitly set the viewport
  await page.setViewport({ width: 1900, height: 1080 });

  await page.goto(
    'https://tannerpolley.github.io/Unite_Builds/',
    { waitUntil: 'networkidle2' }
  );

  const outPath = path.resolve(__dirname, 'preview.png');
  await page.screenshot({ path: outPath });
  console.log(`✅ Wrote ${outPath}`);
  await browser.close();
})();

