/**
 * End-to-end UI test (puppeteer) for Leave + WFH.
 *
 * Flow:
 *   1. Employee logs in.
 *   2. LEAVE  → applied via the Dashboard (/dashboard/leave/my-leaves?apply=1).
 *   3. WFH    → applied via the Portal (the only place self-apply exists; needs
 *              geolocation, which we grant + fake so the portal renders).
 *   4. Manager logs in → Dashboard → approves the Leave → approves the WFH.
 * Captures screenshots, console errors, and failed network calls at every step.
 *
 * Run:
 *   cd backend
 *   BASE_URL=http://localhost:3000 \
 *   EMP_EMAIL=... EMP_PASS=... MGR_EMAIL=... MGR_PASS=... \
 *   node scripts/e2e-leave-wfh.js
 */
const fs   = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CFG = {
  baseUrl:  process.env.BASE_URL  || 'http://localhost:3000',
  empEmail: process.env.EMP_EMAIL || 'employee@example.com',
  empPass:  process.env.EMP_PASS  || 'Password123',
  mgrEmail: process.env.MGR_EMAIL || 'manager@example.com',
  mgrPass:  process.env.MGR_PASS  || 'Password123',
  headless: process.env.HEADLESS !== 'false',
};

const ART = path.join(__dirname, '..', 'e2e-artifacts');
fs.mkdirSync(ART, { recursive: true });
const problems = [];
let stepNo = 0;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const futureWeekday = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return ymd(d);
};

const watch = (page, who) => {
  // Ignore expected auth-handshake noise: pre-login 401s on /me and /refresh,
  // and Next's aborted RSC prefetches during fast client redirects.
  const isAuthNoise = (u) => /\/auth\/(me|refresh)/.test(u);
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (/Failed to load resource/.test(t)) return; problems.push(`[${who}] console.error: ${t}`); } });
  page.on('pageerror', (e) => problems.push(`[${who}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (/_rsc=/.test(r.url())) return; problems.push(`[${who}] request FAILED: ${r.method()} ${r.url()} — ${r.failure()?.errorText}`); });
  page.on('response', (r) => { const s = r.status(); const u = r.url(); if (s >= 400 && /\/api\//.test(u)) { if (s === 401 && isAuthNoise(u)) return; problems.push(`[${who}] HTTP ${s}: ${r.request().method()} ${u}`); } });
};
const shot = async (page, label) => {
  stepNo += 1;
  const file = path.join(ART, `${pad(stepNo)}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  📸 ${path.basename(file)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickByText = async (page, text, tag = 'button') => {
  await page.waitForFunction((text, tag) => [...document.querySelectorAll(tag)].some((e) => e.textContent.trim().includes(text) && !e.disabled), { timeout: 15000 }, text, tag);
  await page.evaluate((text, tag) => [...document.querySelectorAll(tag)].find((e) => e.textContent.trim().includes(text) && !e.disabled)?.click(), text, tag);
};
const clickPrimarySubmit = async (page) => {
  const ok = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /bg-primary|bg-orange-500/.test(b.className) && !b.disabled && !/cancel/i.test(b.textContent));
    const b = btns[btns.length - 1];
    if (b) { b.click(); return b.textContent.trim(); }
    return null;
  });
  if (!ok) throw new Error('No enabled primary submit button found');
  return ok;
};
const setDate = async (page, index, value) => {
  await page.evaluate((index, value) => {
    const input = [...document.querySelectorAll('input[type="date"]')][index];
    if (!input) throw new Error(`date input #${index} not found`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, index, value);
};
const selectLastRealOption = async (page) => {
  const picked = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].at(-1);
    if (!sel) return null;
    const opt = [...sel.options].find((o) => o.value);
    if (!opt) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.textContent.trim();
  });
  return picked;
};
const readToasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => ({ type: t.getAttribute('data-type'), text: t.textContent })));
const expectNoError = async (page) => {
  await sleep(1500);
  const err = (await readToasts(page)).find((t) => t.type === 'error');
  if (err) throw new Error(`UI error toast: "${err.text}"`);
};

const login = async (page, email, password, who) => {
  await page.goto(`${CFG.baseUrl}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.type('#email', email, { delay: 12 });
  await page.type('#password', password, { delay: 12 });
  await clickByText(page, 'Sign in');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 })
    .catch(async () => { await shot(page, `${who}-login-failed`); throw new Error(`${who}: login did not redirect`); });
  await sleep(1500); // let auth settle
  console.log(`  ✅ ${who} logged in`);
};

async function employeeFlow(browser) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(CFG.baseUrl, ['geolocation']);
  const page = await ctx.newPage();
  await page.setGeolocation({ latitude: 19.076, longitude: 72.8777 }); // Mumbai
  await page.setViewport({ width: 1200, height: 900 });
  watch(page, 'EMP');

  console.log('\n▶ Employee: apply Leave (dashboard) + WFH (portal)');
  await login(page, CFG.empEmail, CFG.empPass, 'EMP');

  // ── LEAVE via dashboard ──
  try {
    await page.goto(`${CFG.baseUrl}/dashboard/leave/my-leaves?apply=1`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => [...document.querySelectorAll('h2,h3')].some((e) => e.textContent.includes('Apply for Leave')), { timeout: 15000 });
    const type = await selectLastRealOption(page);
    if (!type) throw new Error('No leave type with balance in the dropdown (seed a balance for this employee)');
    await setDate(page, 0, futureWeekday(10));
    await setDate(page, 1, futureWeekday(10));
    await shot(page, 'dash-leave-form');
    const btn = await clickPrimarySubmit(page);
    await expectNoError(page);
    console.log(`  ✅ Leave applied (type: ${type}, via "${btn}")`);
  } catch (e) {
    problems.push(`[EMP] leave apply: ${e.message}`);
    console.log(`  ⚠ Leave apply failed: ${e.message}`);
    await shot(page, 'dash-leave-error');
  }

  // ── WFH via portal (needs geolocation) ──
  try {
    await page.goto(`${CFG.baseUrl}/portal`, { waitUntil: 'networkidle2' });
    await sleep(2500); // portal resolves geolocation + auth
    await shot(page, 'portal-home');
    // Apply Leave + WFH buttons live on the "Leaves" tab, not the Home/clock tab
    await clickByText(page, 'Leaves');
    await sleep(1200);
    await shot(page, 'portal-leaves-tab');
    await clickByText(page, 'WFH');
    await page.waitForFunction(() => [...document.querySelectorAll('h3')].some((e) => e.textContent.includes('Work From Home')), { timeout: 10000 });
    await setDate(page, 0, futureWeekday(12));
    await setDate(page, 1, futureWeekday(12));
    await shot(page, 'portal-wfh-form');
    await clickByText(page, 'Submit');
    await expectNoError(page);
    console.log('  ✅ WFH applied');
  } catch (e) {
    problems.push(`[EMP] wfh apply: ${e.message}`);
    console.log(`  ⚠ WFH apply failed: ${e.message}`);
    await shot(page, 'portal-wfh-error');
  }

  await ctx.close();
}

async function managerFlow(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  watch(page, 'MGR');

  console.log('\n▶ Manager: dashboard approvals');
  await login(page, CFG.mgrEmail, CFG.mgrPass, 'MGR');

  // Leave approval
  await page.goto(`${CFG.baseUrl}/dashboard/leave/approvals`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await shot(page, 'dash-leave-approvals');
  try {
    await clickByText(page, 'Approve').catch(async () => {
      await page.evaluate(() => document.querySelector('[class*="cursor-pointer"]')?.click());
      await sleep(500);
      await clickByText(page, 'Approve');
    });
    await expectNoError(page);
    console.log('  ✅ Leave approved');
  } catch (e) { problems.push(`[MGR] leave approve: ${e.message}`); console.log(`  ⚠ Leave approve: ${e.message}`); }
  await shot(page, 'dash-leave-approved');

  // WFH approval
  await page.goto(`${CFG.baseUrl}/dashboard/wfh-requests`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await shot(page, 'dash-wfh-requests');
  try {
    await clickByText(page, 'Approve');
    await expectNoError(page);
    console.log('  ✅ WFH approved');
  } catch (e) { problems.push(`[MGR] wfh approve: ${e.message}`); console.log(`  ⚠ WFH approve: ${e.message}`); }
  await shot(page, 'dash-wfh-approved');

  await ctx.close();
}

(async () => {
  console.log(`\n=== E2E Leave + WFH ===\nBASE_URL=${CFG.baseUrl}  headless=${CFG.headless}\nArtifacts → ${ART}\n`);
  const browser = await puppeteer.launch({ headless: CFG.headless ? 'new' : false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    await employeeFlow(browser);
    await managerFlow(browser);
  } catch (e) {
    problems.push(`FATAL: ${e.message}`);
    console.error(`\n❌ ${e.message}`);
  } finally {
    await browser.close();
  }
  console.log('\n─── SUMMARY ───');
  if (problems.length === 0) console.log('✅ No console errors, failed requests, or UI errors detected.');
  else { console.log(`❌ ${problems.length} issue(s):`); for (const p of problems) console.log(`   - ${p}`); }
  console.log(`Screenshots in ${ART}\n`);
  process.exit(problems.length ? 1 : 0);
})();
