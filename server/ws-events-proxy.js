"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("http");
const { StringDecoder } = require("string_decoder");
const { WebSocketServer } = require("ws");

const port = Number(process.env.PI_WEB_WS_PORT || 30142);
const nextOrigin = process.env.PI_WEB_NEXT_ORIGIN || `http://127.0.0.1:${process.env.PORT || 30141}`;
const heartbeatMs = Number(process.env.PI_WEB_WS_HEARTBEAT_MS || 15000);

function sendClose(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
    "Connection: close\r\n" +
    "\r\n"
  );
  socket.destroy();
}

function parseSseProxyTarget(pathname) {
  if (pathname === "/api/agent/running/ws") {
    return { method: "GET", path: "/api/agent/running/events" };
  }

  const match = pathname.match(/^\/api\/agent\/([^/]+)\/ws$/);
  if (!match) return null;
  try {
    const sessionId = decodeURIComponent(match[1]);
    return { method: "POST", path: `/api/agent/${encodeURIComponent(sessionId)}/events` };
  } catch {
    return null;
  }
}

function parseSseFrames(buffer, onFrame) {
  buffer.value = buffer.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let boundary = buffer.value.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = buffer.value.slice(0, boundary);
    buffer.value = buffer.value.slice(boundary + 2);
    boundary = buffer.value.indexOf("\n\n");

    let eventName = "message";
    const dataLines = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trimStart();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (dataLines.length > 0) onFrame(eventName, dataLines.join("\n"));
  }
}

function proxyEventsToWebSocket(ws, req, proxyTarget) {
  const target = new URL(proxyTarget.path, nextOrigin);
  const decoder = new StringDecoder("utf8");
  const sseBuffer = { value: "" };
  let upstreamReq = null;
  let upstreamRes = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    upstreamReq?.destroy();
    upstreamRes?.destroy();
  };

  const closeWs = (code, reason) => {
    cleanup();
    if (ws.readyState === ws.OPEN) ws.close(code, reason);
  };

  upstreamReq = http.request(target, {
    method: proxyTarget.method,
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Cookie: req.headers.cookie || "",
      "User-Agent": "pi-web-ws-events-proxy",
      "X-Forwarded-Proto": req.headers["x-forwarded-proto"] || "https",
      "X-Forwarded-For": req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    },
  }, (res) => {
    upstreamRes = res;
    if (res.statusCode !== 200) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          event: "message",
          data: JSON.stringify({ type: "transport_error", status: res.statusCode || 0 }),
        }));
      }
      res.resume();
      closeWs(res.statusCode === 401 ? 1008 : 1011, `Upstream HTTP ${res.statusCode || 0}`);
      return;
    }

    res.on("data", (chunk) => {
      if (ws.readyState !== ws.OPEN) return;
      sseBuffer.value += decoder.write(chunk);
      parseSseFrames(sseBuffer, (eventName, data) => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ event: eventName, data }));
      });
    });

    res.on("end", () => {
      sseBuffer.value += decoder.end();
      parseSseFrames(sseBuffer, (eventName, data) => {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(JSON.stringify({ event: eventName, data }));
      });
      closeWs(1000, "Upstream ended");
    });

    res.on("error", () => closeWs(1011, "Upstream stream error"));
  });

  upstreamReq.on("error", () => closeWs(1011, "Upstream request error"));
  upstreamReq.end();

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const proxyTarget = parseSseProxyTarget(url.pathname);
  if (!proxyTarget) {
    sendClose(socket, 404, "Not Found");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    proxyEventsToWebSocket(ws, req, proxyTarget);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.ping();
  }
}, heartbeatMs);

server.listen(port, "0.0.0.0", () => {
  console.log(`[pi-web] ws events proxy listening on 0.0.0.0:${port}, upstream ${nextOrigin}`);
});

function shutdown() {
  clearInterval(heartbeat);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
