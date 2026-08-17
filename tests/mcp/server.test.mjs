import test from "node:test";
import assert from "node:assert/strict";
import {
  callTool,
  createMoaOperations,
  handleMessage,
  handleHttpMcpRequest,
  loadConfig,
  loadHttpServerConfig,
  applyEnvFile,
  parseMcpTokens,
  resolveBearerUserId
} from "../../mcp-server/server.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const spaceId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const ideaId = "44444444-4444-4444-8444-444444444444";

function createFakeDb({ member = true } = {}) {
  const calls = { rpc: [], insert: [], select: [] };
  const db = {
    async select(table, query) {
      calls.select.push({ table, query: query || {} });
      if (table === "memberships") {
        return member ? [{ space_id: spaceId, user_id: userId, role: "owner", status: "active" }] : [];
      }
      if (table === "tasks") {
        return [{ id: taskId, space_id: spaceId, title: "테스트", status: "open" }];
      }
      if (table === "ideas") {
        return [{ id: ideaId, space_id: spaceId, title: "아이디어" }];
      }
      if (table === "spaces") {
        return [{ id: spaceId, name: "나의 모아", type: "개인" }];
      }
      return [];
    },
    async rpc(name, parameters) {
      calls.rpc.push({ name, parameters });
      return [{ id: taskId, space_id: spaceId, name }];
    },
    async insert(table, body) {
      calls.insert.push({ table, body });
      return [{ id: ideaId, space_id: spaceId, ...body }];
    }
  };
  return { db, calls };
}

test("add_task uses the migration's create_task contract", async () => {
  const { db, calls } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  await callTool("add_task", {
    space_id: spaceId,
    title: "주간 장보기",
    due_date: "2026-08-02",
    recurrence: "weekly"
  }, operations);

  assert.deepEqual(calls.rpc[0], {
    name: "create_task",
    parameters: {
      p_space_id: spaceId,
      p_title: "주간 장보기",
      p_due_date: "2026-08-02",
      p_due_time: null,
      p_assignee_id: userId,
      p_category: "기타",
      p_note: null,
      p_frequency: "weekly",
      p_actor_user_id: userId
    }
  });
});

test("add_idea writes the authenticated MCP user as author", async () => {
  const { db, calls } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  await callTool("add_idea", {
    space_id: spaceId,
    title: "새 아이디어",
    body: "내용"
  }, operations);

  assert.deepEqual(calls.insert[0], {
    table: "ideas",
    body: {
      space_id: spaceId,
      title: "새 아이디어",
      body: "내용",
      author_id: userId
    }
  });
});

test("task actions and idea conversion use shared atomic RPCs", async () => {
  const { db, calls } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  await callTool("complete_task", { space_id: spaceId, task_id: taskId }, operations);
  await callTool("postpone_task", { space_id: spaceId, task_id: taskId }, operations);
  await callTool("convert_idea_to_task", {
    space_id: spaceId,
    idea_id: ideaId,
    due_date: "2026-08-03",
    recurrence: "none"
  }, operations);

  assert.deepEqual(calls.rpc.map((call) => call.name), [
    "complete_task",
    "postpone_task",
    "convert_idea_to_task"
  ]);
  assert.deepEqual(calls.rpc[0].parameters, {
    p_task_id: taskId,
    p_completed: true,
    p_actor_user_id: userId
  });
  assert.deepEqual(calls.rpc[1].parameters, {
    p_task_id: taskId,
    p_actor_user_id: userId
  });
  assert.deepEqual(calls.rpc[2].parameters, {
    p_idea_id: ideaId,
    p_due_date: "2026-08-03",
    p_due_time: null,
    p_assignee_id: userId,
    p_category: "기타",
    p_note: null,
    p_frequency: "none",
    p_actor_user_id: userId
  });
});

test("every tool rejects a space where the MCP user is not an active member", async () => {
  const { db } = createFakeDb({ member: false });
  const operations = createMoaOperations({ db, userId });

  await assert.rejects(
    callTool("get_today_tasks", { space_id: spaceId }, operations),
    (error) => error && error.code === "SPACE_ACCESS_DENIED"
  );
  await assert.rejects(
    callTool("list_tasks", { space_id: spaceId }, operations),
    (error) => error && error.code === "SPACE_ACCESS_DENIED"
  );
  await assert.rejects(
    callTool("add_task", { space_id: spaceId, title: "차단", due_date: "2026-08-13" }, operations),
    (error) => error && error.code === "SPACE_ACCESS_DENIED"
  );
});

test("unsupported recurrence_rule_id input is rejected", async () => {
  const { db } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  await assert.rejects(
    callTool("add_task", {
      space_id: spaceId,
      title: "잘못된 입력",
      due_date: "2026-08-02",
      recurrence_rule_id: "55555555-5555-4555-8555-555555555555"
    }, operations),
    (error) => error && error.code === "INVALID_PARAMS"
  );
});

test("list_tasks returns member space tasks and optional filters", async () => {
  const { db, calls } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  const result = await callTool("list_tasks", {
    space_id: spaceId,
    due_date: "2026-08-13",
    status: "open"
  }, operations);

  assert.equal(result.space_id, spaceId);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].title, "테스트");
  const taskQuery = calls.select.find((call) => call.table === "tasks");
  assert.equal(taskQuery.query.space_id, "eq." + spaceId);
  assert.equal(taskQuery.query.due_date, "eq.2026-08-13");
  assert.equal(taskQuery.query.status, "eq.open");
});

test("list_tasks rejects a space where the MCP user is not an active member", async () => {
  const { db } = createFakeDb({ member: false });
  const operations = createMoaOperations({ db, userId });

  await assert.rejects(
    callTool("list_tasks", { space_id: spaceId }, operations),
    (error) => error && error.code === "SPACE_ACCESS_DENIED"
  );
});

test("MCP tools/list exposes list and add tools for Cursor", async () => {
  const listed = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("list_spaces"));
  assert.ok(names.includes("list_tasks"));
  assert.ok(names.includes("get_today_tasks"));
  assert.ok(names.includes("add_task"));
});

test("MCP tools/call list_spaces then add_task through the public JSON-RPC seam", async () => {
  const { db, calls } = createFakeDb();
  const operations = createMoaOperations({ db, userId });

  const spaces = await handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_spaces", arguments: {} }
  }, operations);
  assert.equal(spaces.result.structuredContent.spaces[0].id, spaceId);

  const added = await handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "add_task",
      arguments: {
        space_id: spaceId,
        title: "MCP 테스트 할일",
        due_date: "2026-08-13"
      }
    }
  }, operations);
  assert.equal(calls.rpc[0].name, "create_task");
  assert.equal(calls.rpc[0].parameters.p_title, "MCP 테스트 할일");
  assert.equal(added.result.structuredContent.task.id, taskId);
});

test("applyEnvFile fills missing MCP variables without overriding existing ones", () => {
  const environment = {
    MOA_SUPABASE_URL: "https://existing.supabase.co"
  };
  applyEnvFile(
    "MOA_SUPABASE_URL=https://ignored.supabase.co\nMOA_MCP_USER_ID=11111111-1111-4111-8111-111111111111\n",
    environment
  );
  assert.equal(environment.MOA_SUPABASE_URL, "https://existing.supabase.co");
  assert.equal(environment.MOA_MCP_USER_ID, "11111111-1111-4111-8111-111111111111");
});

test("loadConfig still requires a service role key after env file load", () => {
  assert.throws(
    () => loadConfig({
      MOA_SUPABASE_URL: "https://rhobkvxtyscwfceiowpx.supabase.co",
      MOA_MCP_USER_ID: userId
    }),
    (error) => error && error.code === "CONFIGURATION_ERROR"
  );
});

test("parseMcpTokens maps bearer secrets to user ids", () => {
  const tokenMap = parseMcpTokens(
    "local-dev-token-aaa:11111111-1111-4111-8111-111111111111,local-dev-token-bbb:55555555-5555-4555-8555-555555555555"
  );
  assert.equal(tokenMap.get("local-dev-token-aaa"), userId);
  assert.equal(
    resolveBearerUserId("Bearer local-dev-token-bbb", tokenMap),
    "55555555-5555-4555-8555-555555555555"
  );
  assert.equal(resolveBearerUserId("Bearer missing-token-value", tokenMap), null);
  assert.equal(resolveBearerUserId("", tokenMap), null);
});

test("HTTP MCP rejects missing or invalid bearer tokens", async () => {
  const tokenMap = parseMcpTokens("local-dev-token-aaa:11111111-1111-4111-8111-111111111111");
  const options = {
    tokenMap,
    allowedOrigins: [],
    createOperations: () => {
      throw new Error("should not create operations");
    }
  };

  const missing = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: {},
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  }, options);
  assert.equal(missing.status, 401);

  const invalid = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-dev-token-zzz" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  }, options);
  assert.equal(invalid.status, 401);
});

test("HTTP MCP uses the token's user id for tool calls", async () => {
  const userB = "55555555-5555-4555-8555-555555555555";
  const tokenMap = parseMcpTokens(
    "local-dev-token-aaa:11111111-1111-4111-8111-111111111111,local-dev-token-bbb:55555555-5555-4555-8555-555555555555"
  );
  const seen = [];
  const db = {
    async select(table, query) {
      if (table === "memberships") {
        seen.push(query.user_id);
        const requested = String(query.user_id || "").slice(3);
        return requested === userB
          ? [{ space_id: spaceId, user_id: userB, role: "member", status: "active" }]
          : [];
      }
      if (table === "spaces") {
        return [{ id: spaceId, name: "나의 모아", type: "개인" }];
      }
      return [];
    },
    async rpc() { return []; },
    async insert() { return []; }
  };

  const listed = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-dev-token-bbb" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_spaces", arguments: {} } })
  }, {
    tokenMap,
    createOperations: (id) => createMoaOperations({ db, userId: id })
  });

  assert.equal(listed.status, 200);
  assert.equal(seen[0], "eq." + userB);
  assert.equal(listed.body.result.structuredContent.spaces[0].id, spaceId);
});

test("HTTP MCP rejects browser origins that are not allowlisted", async () => {
  const tokenMap = parseMcpTokens("local-dev-token-aaa:11111111-1111-4111-8111-111111111111");
  const blocked = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: "Bearer local-dev-token-aaa",
      origin: "https://evil.example"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  }, {
    tokenMap,
    allowedOrigins: ["http://127.0.0.1:8787"],
    createOperations: () => ({})
  });
  assert.equal(blocked.status, 403);
});

test("loadHttpServerConfig requires MCP tokens instead of a fixed user id", () => {
  const config = loadHttpServerConfig({
    MOA_SUPABASE_URL: "https://rhobkvxtyscwfceiowpx.supabase.co",
    MOA_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_key_value",
    MOA_MCP_TOKENS: "local-dev-token-aaa:11111111-1111-4111-8111-111111111111"
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.tokenMap.get("local-dev-token-aaa"), userId);
  assert.equal(config.userId, undefined);
});
