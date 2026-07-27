// Verifies the HTML → PDF utility produces a real PDF (end-to-end, uses puppeteer).
const test   = require('node:test');
const assert = require('node:assert');
const { htmlToPdfBuffer, closeBrowser } = require('../src/utils/pdf');

test.after(async () => { await closeBrowser(); });

test('htmlToPdfBuffer returns a valid PDF buffer', async () => {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{margin:0}</style></head>
    <body><h1>Offer Letter</h1><p>This is a test offer letter for signing.</p>
    <table><tr><th>Component</th><th>Amount</th></tr><tr><td>Basic</td><td>50000</td></tr></table>
    </body></html>`;

  const buf = await htmlToPdfBuffer(html);

  assert.ok(Buffer.isBuffer(buf), 'should return a Buffer');
  assert.ok(buf.length > 500, 'PDF should be non-trivial in size');
  // Every PDF file starts with the "%PDF-" magic header
  assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-', 'should start with %PDF- header');
});

test('htmlToPdfBuffer rejects empty input', async () => {
  await assert.rejects(() => htmlToPdfBuffer(''), /html string is required/);
});
