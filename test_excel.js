const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: "new"
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000/inventory.html', { waitUntil: 'domcontentloaded' });
  
  try {
      console.log('Clicking export button...');
      await page.waitForSelector('#btn-export-excel', { timeout: 5000 });
      await page.click('#btn-export-excel');
      
      // Wait a bit to see if there are any errors or downloads triggered
      await new Promise(r => setTimeout(r, 2000));
      console.log('Done waiting.');
  } catch(e) {
      console.log('Test script error:', e);
  }
  
  await browser.close();
})();
