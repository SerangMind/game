import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = 0;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"]
]);
const server = createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
  const filePath = normalize(join(root, requested === "/" ? "index.html" : requested));
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types.get(extname(filePath)) || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
});

async function loadPlaywright() {
  try {
    const module = await import("playwright");
    return module.default || module;
  } catch {
    const module = await import("../../GoldenGate/node_modules/playwright/index.js");
    return module.default || module;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch(
    existsSync(chromePath) ? { executablePath: chromePath } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const playfield = await page.locator("#playfield").boundingBox();
  assert(playfield && playfield.width > 700 && playfield.height > 300, "Playfield should render at desktop size.");
  const characterImage = await page.locator("#basket img").getAttribute("src");
  assert(characterImage.includes("assets/") && decodeURIComponent(characterImage).endsWith("병아리.png"), "Character should render from the chick PNG asset.");
  const calloutCount = await page.locator("#chickCallout").count();
  assert(calloutCount === 0, "Character should not show a speech bubble.");
  const roundText = await page.locator("#round").textContent();
  assert(roundText === "0/6", "Game should show zero of six rounds before starting.");
  const bgmSelectCount = await page.locator("#bgmSelect option").count();
  assert(bgmSelectCount >= 1, "HUD should offer selectable background music.");
  const padModeCount = await page.locator("#padModeSelect option").count();
  assert(padModeCount === 3, "HUD should offer three gamepad control modes.");
  const bgmVolumeCount = await page.locator("#bgmVolumeControl").count();
  const sfxVolumeCount = await page.locator("#sfxVolumeControl").count();
  assert(bgmVolumeCount === 1 && sfxVolumeCount === 1, "HUD should expose separate BGM and SFX volume controls.");
  const questionFontSize = await page.locator("#questionText").evaluate((node) => {
    return Number.parseFloat(getComputedStyle(node).fontSize);
  });
  assert(questionFontSize >= 18, "Question text should remain clearly visible in the top strip.");
  const overlayHudCount = await page.locator(".overlay-top .top-strip").count();
  assert(overlayHudCount === 1, "HUD should render as a single top strip overlay inside the playfield.");
  const startTitle = await page.locator("#questionText").textContent();
  assert(startTitle === "바이브 코딩 용어 게임", "Before starting, the question panel should show the game title.");
  const modePillCount = await page.locator("#modeLabel").count();
  assert(modePillCount === 0, "Question panel should not show the mode label.");

  await page.click("#startButton");
  const startedQuestion = await page.locator("#questionText").textContent();
  assert(startedQuestion !== "바이브 코딩 용어 게임", "After starting, the current question should be shown.");
  const orderIsPermutation = await page.evaluate(() => {
    const order = window.__vibeGame.state.termOrder;
    return order.length === window.__vibeGame.TERMS.length && new Set(order).size === order.length;
  });
  assert(orderIsPermutation, "Questions should be selected from a shuffled non-repeating order.");
  await page.waitForSelector(".rice-cake", { timeout: 2500 });
  const cakeCount = await page.locator(".rice-cake").count();
  assert(cakeCount > 0, "Starting the game should spawn falling cakes.");
  const firstCakeCorrect = await page.locator(".rice-cake").first().getAttribute("data-correct");
  assert(firstCakeCorrect === "false", "The first falling cake should be a decoy, not the answer.");
  await page.evaluate(() => {
    window.__vibeGame.state.roundSpawnCount = window.__vibeGame.state.minWrongBeforeCorrect;
    for (let i = 0; i < 8; i += 1) window.__vibeGame.spawnCake();
  });
  const fallingCorrectCount = await page.locator('.rice-cake[data-correct="true"]').count();
  assert(fallingCorrectCount <= 1, "Only one correct cake should be falling at a time.");
  const livesBeforeMiss = Number(await page.locator("#lives").textContent());
  await page.evaluate(() => {
    const correctCake = window.__vibeGame.state.cakes.find((cake) => cake.correct);
    correctCake.x = document.querySelector("#playfield").clientWidth + correctCake.width + 48;
  });
  await page.waitForTimeout(80);
  const livesAfterMiss = Number(await page.locator("#lives").textContent());
  assert(livesAfterMiss === livesBeforeMiss, "Missing a correct cake should not cost a life.");

  const beforeX = Number(await page.locator("#basket").getAttribute("data-x"));
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(260);
  await page.keyboard.up("ArrowRight");
  const afterX = Number(await page.locator("#basket").getAttribute("data-x"));
  assert(afterX > beforeX, "Keyboard movement should move the character right.");
  const beforeY = Number(await page.locator("#basket").getAttribute("data-y"));
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(260);
  await page.keyboard.up("ArrowUp");
  const afterY = Number(await page.locator("#basket").getAttribute("data-y"));
  assert(afterY < beforeY, "Keyboard movement should move the character up.");

  const beforeScore = Number(await page.locator("#score").textContent());
  await page.evaluate(() => window.__vibeGame.forceCollectCorrect());
  const afterScore = Number(await page.locator("#score").textContent());
  assert(afterScore > beforeScore, "Collecting a correct cake should increase score.");
  await page.evaluate(() => window.__vibeGame.forceSpawnCorrect());
  const answerTrack = await page.locator("#answerTrack").count();
  assert(answerTrack === 0, "Choice-only mode should not render a collection track.");

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(120);
  const hud = await page.locator(".overlay-top").boundingBox();
  const actionBar = await page.locator(".action-bar").boundingBox();
  assert(hud && actionBar, "Mobile layout should render the top HUD and action buttons.");

  await browser.close();
  console.log("Playtest passed: VibeCoding game loads, spawns cakes, moves, scores, and fits mobile.");
} finally {
  server.close();
}
