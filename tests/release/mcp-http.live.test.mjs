import test from "node:test";
import assert from "node:assert/strict";

const healthUrl = process.env.MOA_MCP_HEALTH_URL || "http://127.0.0.1:8787/health";
const mcpUrl = process.env.MOA_MCP_URL || "http://127.0.0.1:8787/mcp";
const requireLive = process.env.MOA_MCP_REQUIRE_LIVE === "1";

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
    if (requireLive) throw error;
    t.skip("MCP HTTP 서버가 꺼져 있으면 skip. 릴리즈 전에는 서버를 켜고 다시 실행한다.");
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
    if (requireLive) throw error;
    t.skip("MCP HTTP 서버가 꺼져 있으면 skip.");
    return;
  }

  assert.equal(response.status, 401);
});

test("live MCP POST /mcp with an invalid bearer is 401", async (t) => {
  let response;
  try {
    await getHealth();
    response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer ci-invalid-token"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (error) {
    if (requireLive) throw error;
    t.skip("MCP HTTP 서버가 꺼져 있으면 skip.");
    return;
  }

  assert.equal(response.status, 401);
});
