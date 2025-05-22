const puppeteer = require('puppeteer');

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
  await page.screenshot({ path: '../preview.png' });
  await browser.close();
  console.log('✅ preview.png generated');
})();

