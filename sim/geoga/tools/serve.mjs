import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".mp3", "audio/mpeg"]
]);

const server = createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = path.resolve(path.join(root, requestPath === "/" ? "index.html" : requestPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": mime.get(path.extname(filePath).toLowerCase()) || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Geoga scene server: http://127.0.0.1:${port}`);
  for (const address of getLanAddresses()) {
    console.log(`LAN preview: http://${address}:${port}`);
  }
});

function getLanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}
