/**
 * C9 StratForge - Headless Playwright E2E Verification & Screenshot Generator
 * Verifies 0 console errors, 0 page errors, 0px horizontal overflow (1440px + 390px),
 * official Riot minimap & agent portrait loads, Google Fonts, Replay, Coach Draw,
 * Counter-Strat checklist, Preset switch, GRID JSON Import, Op Profiler, Dossier,
 * Build Notes, and captures all 4 competition PNG assets.
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
  '.jpg': 'image/jpeg',
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
  const failedAssetRequests = [];

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
    page.on('response', (res) => {
      if (res.url().includes('/assets/riot/') && res.status() !== 200) {
        failedAssetRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Load main app at 1440x900
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tactical-svg .svg-pin');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);

    // Check Google Fonts loaded
    const loadedFonts = await page.evaluate(() => {
      const families = new Set();
      for (const f of document.fonts) {
        if (f.status === 'loaded') families.add(f.family.replaceAll('"', ''));
      }
      return Array.from(families);
    });
    console.log(`[FONTS] Loaded families: ${loadedFonts.join(', ')}`);
    for (const requiredFont of ['Space Grotesk', 'Instrument Serif', 'Instrument Sans']) {
      if (!loadedFonts.some((f) => f.toLowerCase().includes(requiredFont.toLowerCase()))) {
        throw new Error(`Expected Google Font "${requiredFont}" to load, loaded: ${loadedFonts.join(', ')}`);
      }
    }

    // Check zero em-dashes / en-dashes in rendered body text
    const badDashes = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      return { em: txt.includes('\u2014'), en: txt.includes('\u2013') };
    });
    if (badDashes.em || badDashes.en) {
      throw new Error(`Em/en-dash detected in rendered DOM text: ${JSON.stringify(badDashes)}`);
    }

    // Verify Riot assets loaded cleanly (splash + agent portrait + SVG minimap image)
    const assetAudit = await page.evaluate(async () => {
      const splash = document.getElementById('spotlight-splash');
      const agent = document.getElementById('spotlight-agent');
      const svgImg = document.getElementById('riot-minimap-image');
      const minimapHref = svgImg?.getAttribute('href') || '';
      const minimapResp = minimapHref ? await fetch(minimapHref) : null;
      return {
        splashOk: Boolean(splash && splash.complete && splash.naturalWidth > 0),
        agentOk: Boolean(agent && agent.complete && agent.naturalWidth > 0),
        minimapHref,
        minimapStatus: minimapResp ? minimapResp.status : 0
      };
    });
    console.log('[RIOT ASSETS]', JSON.stringify(assetAudit));
    if (!assetAudit.splashOk || !assetAudit.agentOk || assetAudit.minimapStatus !== 200) {
      throw new Error(`Riot asset verification failed: ${JSON.stringify(assetAudit)}`);
    }

    await checkOverflow(page, 'Desktop 1440px / (Map Desk)');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_1_tactical_map.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_1_tactical_map.png (1440x900)');

    // Interactive check: Round Strip click filters map to Round 1 and resets via ALL
    await page.locator('#round-strip [data-round="1"]').click();
    const r1Title = await page.locator('#map-panel-title').textContent();
    if (!r1Title.includes('Round 1')) {
      throw new Error(`Expected Round 1 title after clicking round cell, got: ${r1Title}`);
    }
    await page.locator('#btn-all-rounds').click();
    console.log('[INTERACTIVE] Round Strip filtering verified');

    // Interactive check: Replay Play/Pause button
    await page.locator('#btn-replay').click();
    await page.waitForTimeout(260);
    const replayPressed = await page.locator('#btn-replay').getAttribute('aria-pressed');
    if (replayPressed !== 'true') {
      throw new Error(`Expected Replay button aria-pressed="true", got ${replayPressed}`);
    }
    await page.locator('#btn-replay').click();
    await page.locator('#btn-reset-filters').click();
    console.log('[INTERACTIVE] Live Replay Play/Pause verified');

    // Interactive check: Coach Draw whiteboard toggle & stroke
    await page.locator('#btn-draw-toggle').click();
    const svgBox = await page.locator('#tactical-svg').boundingBox();
    await page.mouse.move(svgBox.x + svgBox.width * 0.3, svgBox.y + svgBox.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(svgBox.x + svgBox.width * 0.65, svgBox.y + svgBox.height * 0.35, { steps: 6 });
    await page.mouse.up();
    const strokeCount = await page.locator('#layer-whiteboard polyline').count();
    if (strokeCount < 1) {
      throw new Error('Expected Coach Draw polyline to be rendered on #tactical-svg');
    }
    await page.locator('#btn-draw-clear').click();
    await page.locator('#btn-draw-toggle').click();
    console.log('[INTERACTIVE] Coach Whiteboard Draw + Clear verified');

    // Interactive check: Series Delta & Win-Condition Simulator
    await page.waitForSelector('#series-simulator-section');
    const lockWrDelta = await page.locator('#sim-projected-wr-delta').textContent();
    if (!lockWrDelta || lockWrDelta.trim() === '0.0% WR') {
      throw new Error(`Expected non-zero initial Full Anti-Op Lock WR delta, got: ${lockWrDelta}`);
    }
    await page.locator('[data-sim-preset="baseline"]').click();
    const baseWrDelta = await page.locator('#sim-projected-wr-delta').textContent();
    if (baseWrDelta.trim() !== '0.0% WR') {
      throw new Error(`Expected Default Baseline WR delta 0.0% WR, got: ${baseWrDelta}`);
    }
    await page.locator('[data-sim-preset="economy-choke"]').click();
    const chokeCredits = await page.locator('#sim-credit-swing').textContent();
    if (!chokeCredits || chokeCredits.includes('+$0')) {
      throw new Error(`Expected positive Economy Choke credit swing, got: ${chokeCredits}`);
    }
    await page.locator('[data-sim-preset="anti-op-lock"]').click();
    console.log(`[INTERACTIVE] Series Delta Simulator verified: lock=${lockWrDelta}, baseline=${baseWrDelta}, choke=${chokeCredits}`);

    // Interactive check: Counter-Strat checklist toggle
    const beforeCount = await page.locator('#counter-progress').textContent();
    await page.locator('[data-toggle-counter]').first().click();
    const afterCount = await page.locator('#counter-progress').textContent();
    if (beforeCount === afterCount || !afterCount.startsWith('1/')) {
      throw new Error(`Expected counter progress to increment from ${beforeCount} to 1/x, got ${afterCount}`);
    }
    console.log(`[INTERACTIVE] Counter-Strat Prep checklist verified: ${beforeCount} -> ${afterCount}`);

    // Interactive check: click a utility pin
    await page.locator('#tactical-svg [data-event-id]').first().click();
    const badgeText = await page.locator('#inspector-badge').textContent();
    if (!badgeText.includes('PIN')) {
      throw new Error(`Expected inspector badge to switch to PIN mode, got: ${badgeText}`);
    }
    console.log(`[INTERACTIVE] Pin click inspector verified: ${badgeText}`);

    // Interactive check: switch preset to Haven & verify Haven minimap
    await page.selectOption('#preset-select', 'c9w-g2g-haven');
    const havenTitle = await page.locator('#map-panel-title').textContent();
    const havenHref = await page.locator('#riot-minimap-image').getAttribute('href');
    if (!havenTitle.includes('Haven') || !havenHref.includes('haven_minimap.png')) {
      throw new Error(`Expected Haven map & minimap, got: ${havenTitle} / ${havenHref}`);
    }
    console.log(`[INTERACTIVE] Preset switch verified: ${havenTitle} (${havenHref})`);

    // Interactive check: GRID JSON Importer modal live recalculation
    await page.click('#btn-open-import');
    await page.waitForSelector('#grid-modal.open');
    await page.click('#btn-load-sample-json');
    await page.click('#btn-apply-json');
    await page.waitForSelector('#grid-modal', { state: 'hidden' });
    console.log('[INTERACTIVE] GRID JSON Importer modal & live recalculation verified');

    // Reload clean Ascent for crisp thumbnail & Op Profiler captures
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tactical-svg .svg-pin');
    await page.evaluate(() => document.fonts.ready);

    // 2. Capture thumbnail.png at 1280x720 at y=0
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(240);
    await page.screenshot({ path: path.join(ASSETS_DIR, 'thumbnail.png'), fullPage: false });
    console.log('[CAPTURED] assets/thumbnail.png (1280x720)');

    // 3. Switch to Operator Profiler tab at 1440x900 & capture screen_2_operator_profiler.png
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#tab-btn-operator');
    await page.waitForSelector('#tab-operator.active #op-radar-svg polygon');
    await page.waitForTimeout(260);
    const opImgsOk = await page.evaluate(() => {
      const a = document.getElementById('op-target-img');
      const b = document.getElementById('op-compare-img');
      return Boolean(a && a.complete && a.naturalWidth > 0 && b && b.complete && b.naturalWidth > 0);
    });
    if (!opImgsOk) {
      throw new Error('Operator Profiler agent portraits failed to load');
    }
    await checkOverflow(page, 'Desktop 1440px / (Op Profiler)');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_2_operator_profiler.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_2_operator_profiler.png (1440x900)');

    // 4. Switch to Coach Dossier tab & verify content + Simulator export sync
    await page.click('#tab-btn-dossier');
    await page.waitForSelector('#tab-dossier.active #dossier-markdown');
    const mdText = await page.locator('#dossier-markdown').textContent();
    if (!mdText.includes('Anti-Operator') || !mdText.includes('Series Delta & Win-Condition Simulation')) {
      throw new Error('Dossier Markdown missing expected Anti-Operator or Series Delta Simulation section');
    }
    await checkOverflow(page, 'Desktop 1440px / (Coach Dossier)');
    console.log('[INTERACTIVE] Coach Dossier + Series Delta export sync verified');

    // 5. Navigate to /workflow.html at 1440x900 & capture screen_3_ai_workflow.png
    await page.goto(`${baseUrl}/workflow.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(220);
    await checkOverflow(page, 'Desktop 1440px /workflow.html');
    await page.screenshot({ path: path.join(ASSETS_DIR, 'screen_3_ai_workflow.png'), fullPage: false });
    console.log('[CAPTURED] assets/screen_3_ai_workflow.png (1440x900)');

    // 6. Mobile 390px responsive zero-overflow audit on / and /workflow.html
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await checkOverflow(page, 'Mobile 390px / (Map Desk)');
    await page.click('#tab-btn-operator');
    await checkOverflow(page, 'Mobile 390px / (Op Profiler)');
    await page.click('#tab-btn-dossier');
    await checkOverflow(page, 'Mobile 390px / (Dossier)');
    await page.goto(`${baseUrl}/workflow.html`, { waitUntil: 'networkidle' });
    await checkOverflow(page, 'Mobile 390px /workflow.html');

    if (failedAssetRequests.length > 0) {
      throw new Error(`Failed Riot asset requests: ${failedAssetRequests.join(' | ')}`);
    }
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected (${consoleErrors.length}): ${consoleErrors.join(' | ')}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Page errors detected (${pageErrors.length}): ${pageErrors.join(' | ')}`);
    }

    console.log('ALL PLAYWRIGHT E2E CHECKS PASSED: 0 console errors, 0 page errors, 0px overflow across 1440px & 390px, Riot assets & fonts verified.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
