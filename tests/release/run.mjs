import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testFile = resolve(__dirname, "mcp-http.live.test.mjs");
const isSmoke = process.argv.includes("--smoke");
const mode = isSmoke ? "smoke" : "strict";

const result = spawnSync(process.execPath, ["--test", testFile], {
  stdio: "inherit",
  env: {
    ...process.env,
    MOA_MCP_LIVE_MODE: mode
  }
});

process.exit(result.status ?? 1);
