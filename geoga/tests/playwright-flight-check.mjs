import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"]
]);

const server = createServer(async (req, res) => {
  try {
    const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = path.join(projectRoot, reqPath === "/" ? "index.html" : reqPath);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(projectRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { "content-type": mime.get(ext) || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise((resolve) => server.listen(port, host, resolve));
console.log(`Server started: http://${host}:${port}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = [];
const pageErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    logs.push(`${msg.type().toUpperCase()}: ${msg.text()}`);
  }
});
page.on("pageerror", (err) => pageErrors.push(String(err)));

await page.goto(`http://${host}:${port}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => window.__ggReady === true, null, { timeout: 30000 });

const snapshots = [];
for (const preset of [1, 2, 3, 4]) {
  await page.evaluate((id) => window.__ggDebug.jumpToPreset(id), preset);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__ggDebug.setInput({ throttle: 0.72, boost: true, ascend: 0.08 }));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__ggDebug.setInput({ throttle: 0, boost: false, ascend: 0 }));
  snapshots.push(await page.evaluate(() => window.__ggDebug.getTelemetry()));
}

for (let i = 0; i < 4; i += 1) {
  await page.evaluate((mode) => window.__ggDebug.setViewMode(mode), i);
  await page.waitForTimeout(400);
}

const finalTelemetry = await page.evaluate(() => window.__ggDebug.getTelemetry());
const ignorableWarnings = [
  "CONTEXT_LOST_WEBGL",
  "GPU stall due to ReadPixels"
];
const actionableLogs = logs.filter((line) => !ignorableWarnings.some((token) => line.includes(token)));

const screenshotPath = path.join(projectRoot, "tests", "playtest-shot.png");
await page.screenshot({ path: screenshotPath, fullPage: false });

const report = {
  timestamp: new Date().toISOString(),
  logs,
  actionableLogs,
  pageErrors,
  snapshots,
  finalTelemetry,
  checks: {
    noPageErrors: pageErrors.length === 0,
    noConsoleErrors: actionableLogs.length === 0,
    finiteTelemetry:
      Number.isFinite(finalTelemetry.fps) &&
      finalTelemetry.position.every(Number.isFinite) &&
      finalTelemetry.velocity.every(Number.isFinite),
    stableFpsFloor: finalTelemetry.fps > 20
  }
};

const reportPath = path.join(projectRoot, "tests", "playtest-report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Report written: ${reportPath}`);
console.log(`Screenshot written: ${screenshotPath}`);
console.log(JSON.stringify(report.checks, null, 2));

await browser.close();
await new Promise((resolve) => server.close(resolve));
