import test from "node:test";
import assert from "node:assert/strict";
import {
  callTool,
  createMoaOperations
} from "./server.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const spaceId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const ideaId = "44444444-4444-4444-8444-444444444444";

function createFakeDb({ member = true } = {}) {
  const calls = { rpc: [], insert: [] };
  const db = {
    async select(table) {
      if (table === "memberships") {
        return member ? [{ space_id: spaceId, user_id: userId, role: "owner", status: "active" }] : [];
      }
      if (table === "tasks") {
        return [{ id: taskId, space_id: spaceId, title: "테스트", status: "open" }];
      }
      if (table === "ideas") {
        return [{ id: ideaId, space_id: spaceId, title: "아이디어" }];
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
