#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const appDir = path.resolve(import.meta.dirname, "..");
const workerPath = path.join(appDir, ".open-next", "worker.js");
const serverHandlerPath = path.join(appDir, ".open-next", "server-functions", "default", "handler.mjs");
const sourcePath = path.join(appDir, "scripts", "worker-incident-resolution-sync.mjs");
const targetDir = path.join(appDir, ".open-next", "worker-cron");
const targetPath = path.join(targetDir, "incident-resolution-sync.mjs");

if (!fs.existsSync(workerPath)) {
  throw new Error(`OpenNext worker not found at ${workerPath}`);
}

if (!fs.existsSync(serverHandlerPath)) {
  throw new Error(`OpenNext server handler not found at ${serverHandlerPath}`);
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Cron source not found at ${sourcePath}`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

let worker = fs.readFileSync(workerPath, "utf8");

if (!worker.includes("./worker-cron/incident-resolution-sync.mjs")) {
  worker = worker.replace(
    "import { maybeGetSkewProtectionResponse } from \"./cloudflare/skew-protection.js\";\n",
    "import { maybeGetSkewProtectionResponse } from \"./cloudflare/skew-protection.js\";\nimport { runIncidentResolutionSync } from \"./worker-cron/incident-resolution-sync.mjs\";\n"
  );
}

if (!worker.includes("async scheduled(event, env, ctx)")) {
  worker = worker.replace(
    "export default {\n    async fetch(request, env, ctx) {",
    `export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(runIncidentResolutionSync(env, {
            cron: event.cron,
            scheduledTime: event.scheduledTime,
        }));
    },
    async fetch(request, env, ctx) {`
  );
}

fs.writeFileSync(workerPath, worker, "utf8");

let serverHandler = fs.readFileSync(serverHandlerPath, "utf8");
const middlewareManifestRequire =
  "getMiddlewareManifest(){return this.minimalMode?null:require(this.middlewareManifestPath)}";

if (serverHandler.includes(middlewareManifestRequire)) {
  serverHandler = serverHandler.replace(middlewareManifestRequire, "getMiddlewareManifest(){return null}");
  fs.writeFileSync(serverHandlerPath, serverHandler, "utf8");
}

console.log("Patched OpenNext worker with SSFitness 5PM issue-tracking cron and Cloudflare middleware manifest guard.");
