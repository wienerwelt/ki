const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const puppeteer = require('puppeteer');

async function run() {
    if (['NODE_ENV', 'APP_ENV', 'DEPLOY_ENV', 'REPORT_ENV'].some(key => process.env[key] === 'production')) {
        throw new Error('Nur im lokalen DEV-Scraping-Container ausführen.');
    }
    assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Node 24 LTS must run inside the container.');
    assert.match(readFileSync('/proc/1/cmdline', 'utf8'), /docker-init|tini|dumb-init/, 'The scraping container needs an init process.');
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 20000,
        });
        const page = await browser.newPage();
        await page.goto('data:text/html,<title>Dashboard runtime check</title><p>Local test only</p>');
        assert.equal(await page.title(), 'Dashboard runtime check');
    } finally {
        if (browser) await browser.close();
    }
    console.log(`Container runtime: ${process.version}, init and Chromium launch/close OK. No external requests, DB writes or AI calls.`);
}

run().catch(error => { console.error('[smoke:container-runtime]', error.message); process.exitCode = 1; });
