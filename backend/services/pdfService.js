// backend/services/pdfService.js
const fs = require('fs');
const path = require('path');

async function renderPdfFromHtml(html, options = {}) {
  // Lazy require, damit Puppeteer nicht beim App-Start zwingend geladen wird
  const puppeteer = require('puppeteer');

  const {
    format = 'A4',
    margin = { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    printBackground = true,
  } = options;

const browser = await puppeteer.launch({
    headless: true, // 'new' ist in aktuellen Puppeteer-Versionen obsolet, 'true' ist der Standard
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Greift den Docker-Pfad ab
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage' // Wichtig für Docker: Verhindert Abstürze bei großen PDFs
    ],
  });

  try {
    const page = await browser.newPage();

    // Simple print CSS (für PDF-Optik)
    const printCss = `
      <style>
        @page { size: ${format}; margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left}; }
        body { background: white !important; }
        a { color: #111; text-decoration: underline; word-break: break-word; }
        h1, h2, h3, h4 { page-break-after: avoid; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; }
      </style>
    `;

    await page.setContent(printCss + html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format, printBackground });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function writePdfToDisk(pdfBuffer, absolutePath) {
  ensureDir(path.dirname(absolutePath));
  await fs.promises.writeFile(absolutePath, pdfBuffer);
  return absolutePath;
}

module.exports = {
  renderPdfFromHtml,
  writePdfToDisk,
};