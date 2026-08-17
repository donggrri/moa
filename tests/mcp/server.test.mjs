import test from "node:test";
import assert from "node:assert/strict";
import {
  callTool,
  createMoaOperations,
  createSupabaseRestClient,
  DEFAULT_MAX_HTTP_BODY_BYTES,
  handleMessage,
  handleHttpMcpRequest,
  loadConfig,
  loadLocalEnvFile,
  loadSupabaseConfig,
  loadHttpServerConfig,
  applyEnvFile,
  jsonRpcHttpBody,
  localTodayIso,
  parseMcpTokens,
  resolveBearerUserId,
  startHttpServer,
  startStdioServer
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

function validEnvironment(overrides = {}) {
  return {
    MOA_SUPABASE_URL: "https://example.supabase.co/",
    MOA_SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    MOA_MCP_USER_ID: userId,
    MOA_MCP_TOKENS: `release-test-token-1234:${userId}`,
    ...overrides
  };
}

function jsonResponse(value, status = 200) {
  return new Response(value === undefined ? "" : JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("Supabase configuration accepts secure and local URLs and rejects unsafe URLs", () => {
  assert.deepEqual(loadSupabaseConfig(validEnvironment()), {
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-test-key"
  });
  assert.equal(
    loadSupabaseConfig(validEnvironment({ MOA_SUPABASE_URL: "http://localhost:54321/" })).url,
    "http://localhost:54321"
  );

  for (const environment of [
    validEnvironment({ MOA_SUPABASE_URL: "" }),
    validEnvironment({ MOA_SUPABASE_URL: "not-a-url" }),
    validEnvironment({ MOA_SUPABASE_URL: "http://example.com" }),
    validEnvironment({ MOA_SUPABASE_URL: "https://example.supabase.co/rest" }),
    validEnvironment({ MOA_SUPABASE_URL: "https://example.supabase.co?x=1" }),
    validEnvironment({ MOA_SUPABASE_URL: "https://example.supabase.co#fragment" }),
    validEnvironment({ MOA_SUPABASE_SERVICE_ROLE_KEY: " " })
  ]) {
    assert.throws(() => loadSupabaseConfig(environment), (error) => error.code === "CONFIGURATION_ERROR");
  }
});

test("loadConfig validates the MCP user UUID and returns an immutable config", () => {
  const config = loadConfig(validEnvironment({ MOA_MCP_USER_ID: `  ${userId}  ` }));
  assert.equal(config.userId, userId);
  assert.equal(Object.isFrozen(config), true);
  assert.throws(
    () => loadConfig(validEnvironment({ MOA_MCP_USER_ID: "not-a-uuid" })),
    (error) => error.code === "CONFIGURATION_ERROR"
  );
});

test("parseMcpTokens handles separators and rejects malformed token entries", () => {
  const secondUser = "55555555-5555-4555-8555-555555555555";
  const tokens = parseMcpTokens(
    `  token-with-colon:value:${userId},\nsecond-token-value:${secondUser},,`
  );
  assert.equal(tokens.size, 2);
  assert.equal(tokens.get("token-with-colon:value"), userId);
  assert.equal(tokens.get("second-token-value"), secondUser);
  assert.equal(parseMcpTokens(" \n").size, 0);

  for (const raw of [
    "missing-separator",
    `short:${userId}`,
    `long-enough-token:not-a-uuid`,
    `long-enough-token:${userId}:extra`
  ]) {
    assert.throws(() => parseMcpTokens(raw), (error) => error.code === "CONFIGURATION_ERROR");
  }
});

test("HTTP configuration trims origins and validates port boundaries", () => {
  const config = loadHttpServerConfig(validEnvironment({
    MOA_MCP_HTTP_HOST: " 127.0.0.1 ",
    MOA_MCP_HTTP_PORT: "9876",
    MOA_MCP_HTTP_ORIGINS: " https://moa.example, ,http://localhost:5173 "
  }));
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 9876);
  assert.deepEqual(config.allowedOrigins, ["https://moa.example", "http://localhost:5173"]);
  assert.equal(loadHttpServerConfig(validEnvironment()).host, "127.0.0.1");

  assert.throws(
    () => loadHttpServerConfig(validEnvironment({ MOA_MCP_TOKENS: "" })),
    (error) => error.code === "CONFIGURATION_ERROR"
  );
  for (const port of ["0", "65536", "not-a-number", "8787.5"]) {
    assert.throws(
      () => loadHttpServerConfig(validEnvironment({ MOA_MCP_HTTP_PORT: port })),
      (error) => error.code === "CONFIGURATION_ERROR"
    );
  }
});

test("HTTP configuration keeps binding local unless remote access is explicitly enabled", () => {
  for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    const config = loadHttpServerConfig(validEnvironment({ MOA_MCP_HTTP_HOST: host }));
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(config.host));
  }

  assert.throws(
    () => loadHttpServerConfig(validEnvironment({ MOA_MCP_HTTP_HOST: "0.0.0.0" })),
    (error) => error.code === "CONFIGURATION_ERROR"
  );
  assert.equal(
    loadHttpServerConfig(validEnvironment({
      MOA_MCP_HTTP_HOST: "0.0.0.0",
      MOA_MCP_ALLOW_REMOTE_HOST: "true"
    })).host,
    "0.0.0.0"
  );
});

test("HTTP configuration validates and exposes the request body limit", () => {
  assert.equal(loadHttpServerConfig(validEnvironment()).maxBodyBytes, DEFAULT_MAX_HTTP_BODY_BYTES);
  assert.equal(
    loadHttpServerConfig(validEnvironment({ MOA_MCP_HTTP_MAX_BODY_BYTES: "4096" })).maxBodyBytes,
    4096
  );
  for (const value of ["0", "-1", "1.5", "not-a-number", "10485761"]) {
    assert.throws(
      () => loadHttpServerConfig(validEnvironment({ MOA_MCP_HTTP_MAX_BODY_BYTES: value })),
      (error) => error.code === "CONFIGURATION_ERROR"
    );
  }
});

test("environment file parsing handles comments, quotes, malformed lines, and missing files", () => {
  const environment = { EXISTING: "keep" };
  applyEnvFile(
    "# comment\nEXISTING=replace\nQUOTED=\"value\"\nSINGLE='single'\nMALFORMED\n=ignored\n",
    environment
  );
  assert.deepEqual(environment, {
    EXISTING: "keep",
    QUOTED: "value",
    SINGLE: "single"
  });
  const sameEnvironment = loadLocalEnvFile(environment, "C:/path/that/does/not/exist/.env");
  assert.equal(sameEnvironment, environment);
});

test("Supabase REST client builds select, insert, and RPC requests safely", async () => {
  const calls = [];
  const client = createSupabaseRestClient(
    { url: "https://example.supabase.co", serviceRoleKey: "service-role" },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url: new URL(url), options });
        return jsonResponse([{ id: taskId }]);
      }
    }
  );

  await client.select("tasks", { status: "eq.open", omitted: undefined, empty: null });
  await client.insert("ideas", { title: "아이디어" });
  await client.rpc("complete_task", { p_task_id: taskId });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.pathname, "/rest/v1/tasks");
  assert.equal(calls[0].url.search, "?status=eq.open");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.apikey, "service-role");
  assert.equal(calls[0].options.headers.Authorization, "Bearer service-role");
  assert.equal(calls[0].options.headers.Prefer, undefined);

  assert.equal(calls[1].url.pathname, "/rest/v1/ideas");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  assert.equal(calls[1].options.headers.Prefer, "return=representation");
  assert.deepEqual(JSON.parse(calls[1].options.body), { title: "아이디어" });

  assert.equal(calls[2].url.pathname, "/rest/v1/rpc/complete_task");
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), { p_task_id: taskId });
});

test("Supabase REST client reports network, timeout, HTTP, and unsafe-path failures", async () => {
  const config = { url: "https://example.supabase.co", serviceRoleKey: "service-role" };
  assert.throws(
    () => createSupabaseRestClient(config, { fetchImpl: "not-a-function" }),
    (error) => error.code === "CONFIGURATION_ERROR"
  );

  const networkClient = createSupabaseRestClient(config, {
    fetchImpl: async () => { throw new Error("offline"); }
  });
  await assert.rejects(networkClient.select("tasks"), (error) => error.status === 0 && error.resource === "tasks");

  const timeoutClient = createSupabaseRestClient(config, {
    timeoutMs: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      const fallback = setTimeout(() => reject(new Error("fallback timeout")), 25);
      options.signal.addEventListener("abort", () => {
        clearTimeout(fallback);
        reject(new Error("aborted"));
      }, { once: true });
    })
  });
  await assert.rejects(timeoutClient.select("tasks"), (error) => error.status === 0);

  for (const status of [401, 403, 404, 409, 500]) {
    const failingClient = createSupabaseRestClient(config, {
      fetchImpl: async () => jsonResponse({ code: "SERVER_CODE" }, status)
    });
    await assert.rejects(failingClient.select("tasks"), (error) => error.status === status && error.resource === "tasks");
  }

  const nonJsonClient = createSupabaseRestClient(config, {
    fetchImpl: async () => new Response("not-json", { status: 200 })
  });
  assert.equal(await nonJsonClient.select("tasks"), null);
  await assert.rejects(
    nonJsonClient.select("../secrets"),
    /Unsafe Supabase resource path/
  );
});

function parserOperations() {
  return {
    listSpaces: async () => "spaces",
    getTodayTasks: async (input) => input,
    listTasks: async (input) => input,
    addTask: async (input) => input,
    completeTask: async (input) => input,
    postponeTask: async (input) => input,
    listIdeas: async (input) => input,
    addIdea: async (input) => input,
    convertIdeaToTask: async (input) => input
  };
}

test("tool input parsers normalize valid inputs and reject invalid boundaries", async () => {
  const operations = parserOperations();
  assert.equal(await callTool("list_spaces", undefined, operations), "spaces");
  assert.deepEqual(await callTool("get_today_tasks", { space_id: spaceId }, operations), { spaceId });
  assert.deepEqual(await callTool("list_tasks", {
    space_id: spaceId,
    due_date: "2026-08-02",
    status: "done"
  }, operations), {
    spaceId,
    dueDate: "2026-08-02",
    status: "done"
  });
  assert.deepEqual(await callTool("add_task", {
    space_id: spaceId,
    title: " 장보기 ",
    due_date: "2026-08-02",
    due_time: "09:30",
    assignee_id: userId,
    category: " 생활 ",
    note: " 메모 ",
    recurrence: "weekly"
  }, operations), {
    spaceId,
    title: "장보기",
    dueDate: "2026-08-02",
    dueTime: "09:30:00",
    assigneeId: userId,
    category: "생활",
    note: "메모",
    recurrence: "weekly"
  });
  assert.deepEqual(await callTool("add_task", {
    space_id: spaceId,
    title: "기본값",
    due_date: "2026-08-02",
    due_time: "",
    category: null,
    note: null
  }, operations), {
    spaceId,
    title: "기본값",
    dueDate: "2026-08-02",
    dueTime: undefined,
    assigneeId: undefined,
    category: undefined,
    note: undefined,
    recurrence: "none"
  });
  assert.deepEqual(await callTool("complete_task", { space_id: spaceId, task_id: taskId }, operations), {
    spaceId,
    taskId
  });
  assert.deepEqual(await callTool("list_ideas", { space_id: spaceId, include_archived: true }, operations), {
    spaceId,
    includeArchived: true
  });
  assert.deepEqual(await callTool("add_idea", { space_id: spaceId, title: "아이디어", body: null }, operations), {
    spaceId,
    title: "아이디어",
    body: undefined
  });
  assert.deepEqual(await callTool("convert_idea_to_task", {
    space_id: spaceId,
    idea_id: ideaId,
    due_date: "2026-08-02",
    due_time: "09:30:15",
    recurrence: "none"
  }, operations), {
    spaceId,
    ideaId,
    dueDate: "2026-08-02",
    dueTime: "09:30:15",
    assigneeId: undefined,
    category: undefined,
    note: undefined,
    recurrence: "none"
  });

  const invalidCalls = [
    ["list_spaces", []],
    ["list_spaces", { unexpected: true }],
    ["get_today_tasks", {}],
    ["get_today_tasks", { space_id: "not-a-uuid" }],
    ["list_tasks", { space_id: spaceId, due_date: "2026-02-30" }],
    ["list_tasks", { space_id: spaceId, status: "pending" }],
    ["add_task", { space_id: spaceId, title: "제목" }],
    ["add_task", { space_id: spaceId, title: " ", due_date: "2026-08-02" }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", due_time: "24:00" }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", recurrence: "yearly" }],
    ["add_task", { space_id: spaceId, title: "x".repeat(201), due_date: "2026-08-02" }],
    ["complete_task", { space_id: spaceId }],
    ["list_ideas", { space_id: spaceId, include_archived: "yes" }],
    ["add_idea", { space_id: spaceId, title: "x".repeat(201) }],
    ["convert_idea_to_task", { space_id: spaceId, idea_id: ideaId, due_date: "2026-08-02", extra: true }]
  ];
  for (const [name, input] of invalidCalls) {
    await assert.rejects(
      callTool(name, input, operations),
      (error) => error.code === "INVALID_PARAMS"
    );
  }
});

test("tool input parsers reject non-object, date, time, UUID, and optional value types", async () => {
  const operations = parserOperations();
  const invalidCalls = [
    ["list_tasks", null],
    ["list_tasks", "text"],
    ["list_tasks", { space_id: spaceId, due_date: "2026/08/02" }],
    ["list_tasks", { space_id: spaceId, due_date: "2026-13-01" }],
    ["add_task", { space_id: spaceId, title: 123, due_date: "2026-08-02" }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", assignee_id: "bad" }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", note: 123 }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", due_time: "09:60" }],
    ["add_task", { space_id: spaceId, title: "제목", due_date: "2026-08-02", category: "x".repeat(81) }],
    ["complete_task", { space_id: spaceId, task_id: [] }],
    ["postpone_task", { space_id: spaceId, task_id: taskId, extra: true }],
    ["list_ideas", { space_id: spaceId, include_archived: 1 }],
    ["add_idea", { space_id: spaceId, title: "제목", body: "x".repeat(5001) }],
    ["convert_idea_to_task", { space_id: spaceId, idea_id: ideaId, due_date: "2026-08-02", due_time: "09" }]
  ];
  for (const [name, input] of invalidCalls) {
    await assert.rejects(
      callTool(name, input, operations),
      (error) => error.code === "INVALID_PARAMS"
    );
  }
});

const secondUserId = "55555555-5555-4555-8555-555555555555";

function createRichDb({ member = true, taskFound = true, ideaFound = true } = {}) {
  const calls = { select: [], rpc: [], insert: [] };
  const db = {
    async select(table, query = {}) {
      calls.select.push({ table, query });
      if (table === "memberships") {
        if (!member && query.user_id === `eq.${userId}`) return [];
        if (query.user_id === `eq.${secondUserId}`) {
          return [{ space_id: spaceId, user_id: secondUserId, role: "member", status: "active" }];
        }
        if (!query.space_id) {
          return [
            { space_id: spaceId, user_id: userId, role: "owner", status: "active" },
            { space_id: spaceId, user_id: userId, role: "owner", status: "active" },
            { space_id: "not-a-uuid", user_id: userId, role: "member", status: "active" }
          ];
        }
        return [{ space_id: spaceId, user_id: userId, role: "owner", status: "active" }];
      }
      if (table === "spaces") {
        return [{ id: spaceId, name: "나의 모아", type: "개인" }];
      }
      if (table === "tasks") {
        if (query.id && !taskFound) return [];
        return [{ id: taskId, space_id: spaceId, title: "테스트", status: "open" }];
      }
      if (table === "ideas") {
        if (query.id && !ideaFound) return [];
        return [{ id: ideaId, space_id: spaceId, title: "아이디어", status: "open" }];
      }
      return [];
    },
    async rpc(name, parameters) {
      calls.rpc.push({ name, parameters });
      return { id: taskId, space_id: spaceId, name };
    },
    async insert(table, body) {
      calls.insert.push({ table, body });
      return { id: ideaId, space_id: spaceId, ...body };
    }
  };
  return { db, calls };
}

test("MCP operations enforce membership, build precise queries, and preserve roles", async () => {
  const { db, calls } = createRichDb();
  const operations = createMoaOperations({
    db,
    userId,
    now: () => new Date(2026, 7, 17, 12, 0, 0)
  });

  const spaces = await operations.listSpaces();
  assert.deepEqual(spaces.spaces, [{ id: spaceId, name: "나의 모아", type: "개인", role: "owner" }]);
  const membershipQuery = calls.select.find((call) => call.table === "memberships" && !call.query.space_id);
  assert.equal(membershipQuery.query.status, "eq.active");
  assert.equal(membershipQuery.query.order, "created_at.asc");
  const spaceQuery = calls.select.find((call) => call.table === "spaces");
  assert.equal(spaceQuery.query.id, `in.(${spaceId})`);

  const today = await operations.getTodayTasks({ spaceId });
  assert.equal(today.date, "2026-08-17");
  assert.equal(today.tasks[0].id, taskId);
  const todayQuery = calls.select.find((call) => call.table === "tasks" && call.query.due_date === "eq.2026-08-17");
  assert.equal(todayQuery.query.order, "due_time.asc.nullslast,created_at.asc");

  const tasks = await operations.listTasks({ spaceId });
  assert.equal(tasks.tasks.length, 1);
  const listQuery = calls.select.filter((call) => call.table === "tasks").at(-1);
  assert.equal(listQuery.query.order, "due_date.asc,due_time.asc.nullslast,created_at.asc");
  assert.equal(listQuery.query.due_date, undefined);
  assert.equal(listQuery.query.status, undefined);

  const ideas = await operations.listIdeas({ spaceId, includeArchived: false });
  assert.equal(ideas.ideas[0].id, ideaId);
  const ideasQuery = calls.select.find((call) => call.table === "ideas");
  assert.equal(ideasQuery.query.status, "neq.archived");

  const allIdeas = await operations.listIdeas({ spaceId, includeArchived: true });
  const allIdeasQuery = calls.select.filter((call) => call.table === "ideas").at(-1);
  assert.equal(allIdeasQuery.query.status, undefined);
  assert.equal(allIdeas.ideas.length, 1);
});

test("MCP operations pass custom assignees and all RPC or insert contracts", async () => {
  const { db, calls } = createRichDb();
  const operations = createMoaOperations({ db, userId });

  await operations.addTask({
    spaceId,
    title: "사용자 지정 할일",
    dueDate: "2026-08-02",
    dueTime: "09:30:00",
    assigneeId: secondUserId,
    category: "청소",
    note: "메모",
    recurrence: "monthly"
  });
  await operations.completeTask({ spaceId, taskId });
  await operations.postponeTask({ spaceId, taskId });
  await operations.addIdea({ spaceId, title: "아이디어", body: "본문" });
  await operations.convertIdeaToTask({
    spaceId,
    ideaId,
    dueDate: "2026-08-03",
    dueTime: "10:00:00",
    assigneeId: secondUserId,
    category: "기타",
    note: "전환 메모",
    recurrence: "daily"
  });

  assert.deepEqual(calls.rpc.map((call) => call.name), [
    "create_task",
    "complete_task",
    "postpone_task",
    "convert_idea_to_task"
  ]);
  assert.deepEqual(calls.rpc[0].parameters, {
    p_space_id: spaceId,
    p_title: "사용자 지정 할일",
    p_due_date: "2026-08-02",
    p_due_time: "09:30:00",
    p_assignee_id: secondUserId,
    p_category: "청소",
    p_note: "메모",
    p_frequency: "monthly",
    p_actor_user_id: userId
  });
  assert.deepEqual(calls.rpc[3].parameters, {
    p_idea_id: ideaId,
    p_due_date: "2026-08-03",
    p_due_time: "10:00:00",
    p_assignee_id: secondUserId,
    p_category: "기타",
    p_note: "전환 메모",
    p_frequency: "daily",
    p_actor_user_id: userId
  });
  assert.deepEqual(calls.insert[0], {
    table: "ideas",
    body: { space_id: spaceId, title: "아이디어", body: "본문", author_id: userId }
  });
});

test("MCP operations reject invalid adapters, denied assignees, and missing resources", async () => {
  assert.throws(
    () => createMoaOperations({ db: {}, userId }),
    (error) => error.code === "CONFIGURATION_ERROR"
  );
  assert.throws(
    () => createMoaOperations({ db: createRichDb().db, userId: "not-a-uuid" }),
    (error) => error.code === "CONFIGURATION_ERROR"
  );

  const deniedAssigneeDb = createRichDb().db;
  deniedAssigneeDb.select = async (table, query = {}) => {
    if (table === "memberships" && query.user_id === `eq.${secondUserId}`) return [];
    return createRichDb().db.select(table, query);
  };
  const deniedAssignee = createMoaOperations({ db: deniedAssigneeDb, userId });
  await assert.rejects(
    deniedAssignee.addTask({ spaceId, title: "차단", dueDate: "2026-08-02", assigneeId: secondUserId, recurrence: "none" }),
    (error) => error.code === "INVALID_PARAMS"
  );

  const missing = createMoaOperations({ db: createRichDb({ taskFound: false, ideaFound: false }).db, userId });
  await assert.rejects(
    missing.completeTask({ spaceId, taskId }),
    (error) => error.code === "RESOURCE_NOT_FOUND"
  );
  await assert.rejects(
    missing.convertIdeaToTask({ spaceId, ideaId, dueDate: "2026-08-02", recurrence: "none" }),
    (error) => error.code === "RESOURCE_NOT_FOUND"
  );
  await assert.rejects(
    createMoaOperations({ db: createRichDb({ member: false }).db, userId }).listTasks({ spaceId }),
    (error) => error.code === "SPACE_ACCESS_DENIED"
  );
});

test("localTodayIso pads month and day deterministically", () => {
  assert.equal(localTodayIso(new Date(2026, 0, 2, 12, 0, 0)), "2026-01-02");
  assert.equal(localTodayIso(new Date(2026, 10, 12, 12, 0, 0)), "2026-11-12");
});

test("JSON-RPC message handling covers initialization, notifications, errors, and tool results", async () => {
  const operations = createRichDb().db;
  const validOperations = createMoaOperations({ db: operations, userId });

  for (const message of [null, [], {}, { jsonrpc: "1.0", method: "ping" }, { jsonrpc: "2.0" }]) {
    assert.deepEqual(await handleMessage(message, validOperations), {
      kind: "error",
      id: null,
      code: -32600,
      message: "Invalid JSON-RPC request."
    });
  }
  for (const message of [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", method: "notifications/cancelled", id: 1 },
    { jsonrpc: "2.0", method: "notifications/progress", id: 2 },
    { jsonrpc: "2.0", method: "ping" }
  ]) {
    assert.deepEqual(await handleMessage(message, validOperations), { kind: "notification" });
  }

  const initialize = await handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26" }
  }, validOperations);
  assert.equal(initialize.result.protocolVersion, "2025-03-26");
  assert.equal(initialize.result.serverInfo.name, "moa-mcp-server");
  const fallbackInitialize = await handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "initialize",
    params: { protocolVersion: "unsupported" }
  }, validOperations);
  assert.equal(fallbackInitialize.result.protocolVersion, "2025-06-18");

  const ping = await handleMessage({ jsonrpc: "2.0", id: 3, method: "ping" }, validOperations);
  assert.deepEqual(ping, { kind: "result", id: 3, result: {} });
  const listed = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, validOperations);
  assert.ok(listed.result.tools.length >= 8);

  const missingCallParams = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call" }, validOperations);
  assert.deepEqual(missingCallParams, {
    kind: "error",
    id: 5,
    code: -32602,
    message: "tools/call requires a tool name."
  });
  const unknown = await handleMessage({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "unknown_tool", arguments: {} }
  }, validOperations);
  assert.deepEqual(unknown, { kind: "error", id: 6, code: -32602, message: "Unknown tool." });
  const invalidToolInput = await handleMessage({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "list_tasks", arguments: {} }
  }, validOperations);
  assert.equal(invalidToolInput.kind, "result");
  assert.equal(invalidToolInput.result.isError, true);
  assert.match(invalidToolInput.result.content[0].text, /space_id/);
  const success = await handleMessage({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "list_spaces", arguments: {} }
  }, validOperations);
  assert.equal(success.result.structuredContent.spaces[0].id, spaceId);
  assert.equal((await handleMessage({ jsonrpc: "2.0", id: 9, method: "not-found" }, validOperations)).code, -32601);
});

test("JSON-RPC HTTP conversion and request handling cover every transport branch", async () => {
  assert.equal(jsonRpcHttpBody({ kind: "notification" }), null);
  assert.deepEqual(jsonRpcHttpBody({ kind: "result", id: 1, result: { ok: true } }), {
    jsonrpc: "2.0",
    id: 1,
    result: { ok: true }
  });
  assert.deepEqual(jsonRpcHttpBody({ kind: "error", id: 2, code: -32600, message: "bad" }), {
    jsonrpc: "2.0",
    id: 2,
    error: { code: -32600, message: "bad" }
  });

  const tokenMap = parseMcpTokens(`local-http-token-value:${userId}`);
  const options = {
    tokenMap,
    allowedOrigins: ["https://allowed.example"],
    createOperations: () => ({})
  };
  const health = await handleHttpMcpRequest({ method: "GET", url: "/health", headers: {} }, options);
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.status, 200);
  const notFound = await handleHttpMcpRequest({ method: "GET", url: "/unknown", headers: {} }, options);
  assert.equal(notFound.status, 404);
  const methodNotAllowed = await handleHttpMcpRequest({ method: "GET", url: "/mcp", headers: {} }, options);
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(methodNotAllowed.headers.Allow, "POST, OPTIONS");
  const preflight = await handleHttpMcpRequest({
    method: "OPTIONS",
    url: "/mcp",
    headers: { origin: "https://allowed.example" }
  }, options);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers["Access-Control-Allow-Headers"], /Authorization/);

  const badJson = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-http-token-value" },
    body: "{bad"
  }, options);
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, -32700);

  const notification = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-http-token-value" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
  }, options);
  assert.equal(notification.status, 202);
  assert.equal(notification.body, null);

  const successfulList = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-http-token-value" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  }, {
    ...options,
    createOperations: () => createMoaOperations({ db: createRichDb().db, userId })
  });
  assert.equal(successfulList.status, 200);
  assert.equal(successfulList.body.result.tools.length >= 8, true);

  const allowedOrigin = await handleHttpMcpRequest({
    method: "POST",
    url: "/mcp",
    headers: { authorization: "Bearer local-http-token-value", origin: "https://allowed.example" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })
  }, options);
  assert.equal(allowedOrigin.status, 200);
});

test("startHttpServer accepts an ephemeral port and serves health checks", async () => {
  const server = startHttpServer({
    host: "127.0.0.1",
    port: 0,
    tokenMap: new Map(),
    allowedOrigins: [],
    createOperations: () => ({})
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address.port > 0);
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("startHttpServer rejects oversized POST bodies with 413 and remains healthy", async () => {
  const server = startHttpServer({
    host: "127.0.0.1",
    port: 0,
    maxBodyBytes: 8,
    tokenMap: new Map(),
    allowedOrigins: [],
    createOperations: () => ({})
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    const response = await fetch("http://127.0.0.1:" + address.port + "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "123456789"
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "request body too large" });

    const health = await fetch("http://127.0.0.1:" + address.port + "/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
