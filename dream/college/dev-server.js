const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4179);
const rootDir = __dirname;
const indexPath = path.join(rootDir, "index.html");

const clients = new Set();
let reloadTimer = null;

function injectReloadClient(html) {
  const script = `
<script>
(() => {
  const protocol = location.protocol === "https:" ? "https" : "http";
  const source = new EventSource(\`\${protocol}://\${location.host}/__livereload\`);
  source.onmessage = (event) => {
    if (event.data === "reload") {
      location.reload();
    }
  };
  source.onerror = () => {
    source.close();
    setTimeout(() => location.reload(), 1000);
  };
})();
</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}\n</body>`);
  }

  return `${html}\n${script}`;
}

function sendReload() {
  for (const res of clients) {
    res.write("data: reload\n\n");
  }
}

function serveIndex(res) {
  fs.readFile(indexPath, "utf8", (error, html) => {
    if (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("index.html을 읽지 못했습니다.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(injectReloadClient(html));
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    serveIndex(res);
    return;
  }

  if (url.pathname === "/__livereload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const filePath = path.join(rootDir, decodeURIComponent(url.pathname.replace(/^\/+/, "")));
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon"
    };

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

fs.watch(indexPath, { persistent: true }, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(sendReload, 80);
});

server.listen(port, host, () => {
  console.log(`MyDream dev server: http://${host}:${port}`);
});
