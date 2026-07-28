const puppeteer = require('puppeteer');
const BASE = 'http://localhost:3000';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  p.on('response', (r) => { if (/\/api\/auth\//.test(r.url())) console.log('  resp', r.status(), r.request().method(), r.url()); });

  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#email');
  await p.type('#email', 'yash1@olioglobaladtech.com');
  await p.type('#password', 'Test@12345');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sign in'))?.click());
  await new Promise(r => setTimeout(r, 4000));
  console.log('\nAfter login, URL:', p.url());
  const cookies = await p.cookies(`${BASE}`, 'http://localhost:5000');
  console.log('Cookies:', cookies.map(c => `${c.name}(dom=${c.domain};sameSite=${c.sameSite};http=${c.httpOnly})`).join(', ') || '(none)');

  console.log('\n-- goto /portal --');
  await p.goto(`${BASE}/portal`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  console.log('portal URL now:', p.url());
  const hasApply = await p.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Apply Leave')));
  console.log('Apply Leave button present:', hasApply);

  await b.close();
})();
