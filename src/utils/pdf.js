// ─── HTML → PDF via headless Chromium (puppeteer) ────────────────────────────
// The letter's `resolvedContent` is print-ready HTML (A4 pages, letterhead,
// tables). We render it to a real PDF so candidates can download → print → sign.
//
// A single browser instance is reused across calls (launching Chromium per
// request is slow). It is lazily started and gracefully closed on shutdown.

let _browserPromise = null;

const _getBrowser = async () => {
  const puppeteer = require('puppeteer');
  if (!_browserPromise) {
    _browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((err) => {
      // Reset so a later call can retry after a transient launch failure
      _browserPromise = null;
      throw err;
    });
  }
  return _browserPromise;
};

/**
 * Render an HTML string to a PDF buffer (A4).
 * @param {string} html  Full HTML document (as produced by _buildPrintHtml)
 * @returns {Promise<Buffer>}
 */
const htmlToPdfBuffer = async (html) => {
  if (!html || typeof html !== 'string') {
    throw new Error('htmlToPdfBuffer: html string is required');
  }
  const browser = await _getBrowser();
  const page = await browser.newPage();
  try {
    // `networkidle0` lets remote images (company logo) finish loading
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
};

const closeBrowser = async () => {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      await b.close();
    } catch { /* ignore */ }
    _browserPromise = null;
  }
};

module.exports = { htmlToPdfBuffer, closeBrowser };
