const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = 'C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\2d15674c-c406-4667-becb-938254e75b96\\scratch';

(async () => {
    console.log('Starting Headless QA Session...');
    
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        defaultViewport: { width: 1280, height: 800 }
    });
    
    const page = await browser.newPage();
    const errors = [];
    
    page.on('pageerror', err => {
        errors.push(`[PAGE ERROR]: ${err.toString()}`);
    });
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(`[CONSOLE ERROR]: ${msg.text()}`);
        }
    });

    try {
        console.log('-> Navigating to Login...');
        await page.goto('http://localhost:3000/login.html', { waitUntil: 'networkidle0' });
        await page.screenshot({ path: `${OUT_DIR}\\01_login.png`, fullPage: true });

        console.log('-> Attempting Admin Login...');
        // Click 'Admin' user toggle
        await page.evaluate(() => {
            document.querySelector('[data-user="admin"]').click();
        });
        
        // Enter 1234
        for (let digit of '1234') {
            await page.evaluate((d) => document.querySelector(`button[data-val="${d}"]`).click(), digit);
            await new Promise(r => setTimeout(r, 100)); // wait for UI update
        }
        
        // Click Login
        await page.click('#btn-login-submit');
        
        console.log('-> Waiting for POS redirect...');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        await page.screenshot({ path: `${OUT_DIR}\\02_pos.png`, fullPage: true });
        
        const pagesToTest = [
            { name: 'Inventory', href: '/inventory.html' },
            { name: 'Customers', href: '/customers.html' },
            { name: 'Users', href: '/users.html' },
            { name: 'Admin', href: '/admin.html' },
            { name: 'Analytics', href: '/analytics.html' }
        ];

        let index = 3;
        for (const p of pagesToTest) {
            console.log(`-> Testing ${p.name}...`);
            await page.goto(`http://localhost:3000${p.href}`, { waitUntil: 'networkidle0' });
            
            // Check for unhandled exceptions or blank rendering
            const bodyHtml = await page.evaluate(() => document.body.innerHTML);
            if (!bodyHtml || bodyHtml.length < 100) {
                errors.push(`[RENDER ERROR]: ${p.name} appears blank!`);
            }
            
            await page.screenshot({ path: `${OUT_DIR}\\0${index}_${p.name.toLowerCase()}.png`, fullPage: true });
            index++;
        }
        
        console.log('-> Testing complete.');
    } catch (e) {
        console.error('QA Script Exception:', e);
        errors.push(`[SCRIPT EXCEPTION]: ${e.message}`);
    } finally {
        await browser.close();
    }
    
    console.log('\n--- QA RESULTS ---');
    if (errors.length === 0) {
        console.log('✅ Zero JS or Console Errors detected.');
    } else {
        console.log('❌ Errors found:');
        errors.forEach(e => console.log(e));
    }
})();
