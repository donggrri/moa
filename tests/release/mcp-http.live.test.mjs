import test from "node:test";
import assert from "node:assert/strict";

const healthUrl = process.env.MOA_MCP_HEALTH_URL || "http://127.0.0.1:8787/health";
const mcpUrl = process.env.MOA_MCP_URL || "http://127.0.0.1:8787/mcp";

import { isStrictMode } from "./helpers.mjs";

export { isStrictMode };

function handleConnectionFailure(t, error) {
  if (isStrictMode()) {
    throw new Error(
      `[STRICT RELEASE TEST ERROR] Live MCP HTTP server is unreachable at ${healthUrl}. ` +
      `Strict release testing requires a running server (e.g. 'npm --prefix mcp-server run http:start' or 'node server.mjs --http'). ` +
      `For optional offline developer smoke checks, run 'npm run test:smoke' (or pass --smoke). ` +
      `Original error: ${error && (error.message || error)}`
    );
  }
  t.skip(
    `[SMOKE MODE] MCP HTTP server is offline at ${healthUrl}; skipping live checks. ` +
    `Start the server and run 'npm run test:release' for strict release verification.`
  );
}

async function getHealth() {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
  const body = await response.json();
  return { status: response.status, body };
}

test("live MCP health endpoint", async (t) => {
  let result;
  try {
    result = await getHealth();
  } catch (error) {
    handleConnectionFailure(t, error);
    return;
  }

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("live MCP POST /mcp without bearer is 401", async (t) => {
  let response;
  try {
    await getHealth();
    response = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (error) {
    handleConnectionFailure(t, error);
    return;
  }

  assert.equal(response.status, 401);
});

test("live MCP OPTIONS /mcp preflight headers", async (t) => {
  let response;
  try {
    await getHealth();
    response = await fetch(mcpUrl, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(2000)
    });
  } catch (error) {
    handleConnectionFailure(t, error);
    return;
  }

  assert.equal(response.status, 204);
  const allowMethods = response.headers.get("access-control-allow-methods") || "";
  const allowHeaders = response.headers.get("access-control-allow-headers") || "";
  assert.ok(allowMethods.includes("POST"));
  assert.ok(allowMethods.includes("OPTIONS"));
  assert.ok(allowHeaders.includes("Authorization"));
});
