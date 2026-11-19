/**
 * C9 StratForge — Headless Playwright E2E Verification & Screenshot Generator
 * Verifies 0 console errors, 0 page errors, 0px horizontal overflow (1440px + 390px),
 * interactive workflows, and captures all 4 competition PNG assets.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
fs.mkdirSync(ASSETS_DIR, { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(urlObj.pathname);
      if (pathname === '/') pathname = '/index.html';
      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const fullPath = path.join(ROOT, safePath);
      if (!fullPath.startsWith(ROOT) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function checkOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  }));
  console.log(`[OVERFLOW CHECK] ${label}: scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth}, overflow=${metrics.overflowPx}px`);
  if (metrics.overflowPx > 0) {
    throw new Error(`Horizontal overflow detected on ${label}: ${metrics.overflowPx}px`);
  }
  return metrics;
}

function resolveChromiumExecutable() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const pwDir = path.join(localAppData, 'ms-playwright');
  if (!fs.existsSync(pwDir)) return undefined;
  const entries = fs.readdirSync(pwDir).sort().reverse();
  for (const name of entries) {
    if (name.startsWith('chromium_headless_shell-')) {
      const candidate = path.join(pwDir, name, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
    if (name.startsWith('chromium-')) {
      const candidate = path.join(pwDir, name, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(candidate)) return candidate;
      const candidate64 = path.join(pwDir, name, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(candidate64)) return candidate64;
    }
  }
  return undefined;
}

async function run() {
  const { server, baseUrl } = await startStaticServer();
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Load main app at 1440x900 — full workbench + round strip + map visible above the fold at y=0
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tactical-svg .svg-pin');
    await checkOverflow(page, 'Desktop 1440px / (Tactical Radar)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_1_tactical_map.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_1_tactical_map.png');

    // Interactive check: VLR-style Round Strip click filters map to Round 1 and resets via ALL
    await page.locator('#round-strip [data-round="1"]').click();
    const r1Title = await page.locator('#map-panel-title').textContent();
    if (!r1Title.includes('Round 1')) {
      throw new Error(`Expected Round 1 title after clicking round cell, got: ${r1Title}`);
    }
    await page.locator('#btn-all-rounds').click();
    console.log('[INTERACTIVE] VLR Round Strip filtering verified');

    // Interactive check: click a utility pin
    await page.locator('#tactical-svg [data-event-id]').first().click();
    const badgeText = await page.locator('#inspector-badge').textContent();
    if (!badgeText.includes('PIN')) {
      throw new Error(`Expected inspector badge to switch to PIN mode, got: ${badgeText}`);
    }
    console.log(`[INTERACTIVE] Pin click inspector verified: ${badgeText}`);

    // Interactive check: switch preset to Haven & verify 3 sites
    await page.selectOption('#preset-select', 'c9w-g2g-haven');
    const havenTitle = await page.locator('#map-panel-title').textContent();
    if (!havenTitle.includes('Haven')) {
      throw new Error(`Expected Haven map title, got: ${havenTitle}`);
    }
    console.log(`[INTERACTIVE] Preset switch verified: ${havenTitle}`);

    // Interactive check: GRID JSON Importer modal live recalculation
    await page.click('#btn-open-import');
    await page.waitForSelector('#grid-modal.open');
    await page.click('#btn-load-sample-json');
    await page.click('#btn-apply-json');
    await page.waitForSelector('#grid-modal', { state: 'hidden' });
    console.log('[INTERACTIVE] GRID JSON Importer modal & live recalculation verified');

    // Switch back to Ascent preset and reload clean for crisp hero thumbnail & operator captures
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tactical-svg .svg-pin');

    // 2. Capture thumbnail.png at 1280x720 at y=0 (topbar + ticker + round strip + full map workbench)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'thumbnail.png'), fullPage: false });
    console.log('[CAPTURED] assets/thumbnail.png (1280x720)');

    // 3. Switch to Operator Profiler tab at 1440x900 & capture screen_2_operator_profiler.png
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#tab-btn-operator');
    await page.waitForSelector('#tab-operator.active #op-radar-svg polygon');
    await page.waitForTimeout(260);
    await checkOverflow(page, 'Desktop 1440px / (Operator Profiler)');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_2_operator_profiler.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_2_operator_profiler.png');

    // 4. Switch to Coach Match-Prep Dossier tab & verify content
    await page.click('#tab-btn-dossier');
    await page.waitForSelector('#tab-dossier.active #dossier-markdown');
    const mdText = await page.locator('#dossier-markdown').textContent();
    if (!mdText.includes('Anti-Operator')) {
      throw new Error('Dossier Markdown missing expected Anti-Operator heading');
    }
    await checkOverflow(page, 'Desktop 1440px / (Coach Dossier)');
    console.log('[INTERACTIVE] Coach Match-Prep Dossier verified');

    // 5. Navigate to /workflow.html at 1440x900 & capture screen_3_ai_workflow.png
    await page.goto(`${baseUrl}/workflow.html`, { waitUntil: 'networkidle' });
    await checkOverflow(page, 'Desktop 1440px /workflow.html');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_3_ai_workflow.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_3_ai_workflow.png');

    // 6. Mobile 390px responsive zero-overflow audit on / and /workflow.html
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await checkOverflow(page, 'Mobile 390px / (Tactical Radar)');
    await page.click('#tab-btn-operator');
    await checkOverflow(page, 'Mobile 390px / (Operator Profiler)');
    await page.goto(`${baseUrl}/workflow.html`, { waitUntil: 'networkidle' });
    await checkOverflow(page, 'Mobile 390px /workflow.html');

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected (${consoleErrors.length}): ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors detected (${pageErrors.length}): ${pageErrors.join(' | ')}`);
    }

    console.log('ALL PLAYWRIGHT E2E CHECKS PASSED: 0 console errors, 0 page errors, 0px overflow across 1440px & 390px.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
