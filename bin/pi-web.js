#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");
const wsProxyEntry = path.join(pkgDir, "server", "ws-events-proxy.js");

// Resolve next's CLI entry directly to avoid relying on .bin symlinks (which
// may not exist when installed via npx).
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
} catch {
  // Fallback: locate next package root and derive the bin path manually.
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
    nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
  } catch {
    nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
  }
}

const { values: cliArgs } = parseArgs({
  options: {
    port:     { type: "string", short: "p" },
    hostname: { type: "string", short: "H" },
  },
  strict: false,
});

const port     = cliArgs.port     ?? process.env.PORT     ?? "30141";
const hostname = cliArgs.hostname ?? process.env.HOSTNAME ?? null;
const wsPort   = process.env.PI_WEB_WS_PORT ?? "30142";

if (!fs.existsSync(nextDir)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

const nextArgs = ["start", "-p", port];
if (hostname) nextArgs.push("-H", hostname);

// Always run next's JS entry with node directly — avoids .bin symlink issues
// and path-with-spaces problems on Windows when shell: true is used.
const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: pkgDir,
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env },
});

const wsChild = spawn(process.execPath, [wsProxyEntry], {
  cwd: pkgDir,
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    PI_WEB_WS_PORT: wsPort,
    PI_WEB_NEXT_ORIGIN: process.env.PI_WEB_NEXT_ORIGIN || `http://127.0.0.1:${port}`,
  },
});

let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill("SIGTERM");
  wsChild.kill("SIGTERM");
  setTimeout(() => process.exit(code), 2000).unref();
}

let browserOpened = false;
const openBrowser = process.env.PI_WEB_OPEN_BROWSER !== "false";
const browserHost = !hostname || hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname;
const url = `http://${browserHost}:${port}`;

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (openBrowser && !browserOpened && text.includes("Ready")) {
    browserOpened = true;
    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
    const opener = spawn(openCmd, [url], { shell: isWindows, stdio: "ignore", detached: true });
    opener.on("error", () => {});
    opener.unref();
  }
});

child.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

wsChild.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
