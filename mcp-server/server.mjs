import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SERVER_NAME = "moa-mcp-server";
const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05"
]);
const REQUEST_TIMEOUT_MS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const TABLE_FIELDS = Object.freeze({
  spaces: "id,name,type,timezone,created_by,created_at,updated_at",
  memberships: "space_id,user_id,role,status,created_at",
  tasks: "id,space_id,title,due_date,due_time,assignee_id,category,note,status,completed_at,postponed_at,recurrence_rule_id,source_idea_id,created_by,created_at,updated_at",
  ideas: "id,space_id,title,body,status,converted_task_id,author_id,created_at,updated_at"
});

const RPC_NAMES = Object.freeze({
  createTask: "create_task",
  completeTask: "complete_task",
  postponeTask: "postpone_task",
  convertIdeaToTask: "convert_idea_to_task"
});

class PublicError extends Error {
  constructor(publicMessage, code = "MOA_OPERATION_FAILED", logCode = code) {
    super(publicMessage);
    this.name = "PublicError";
    this.publicMessage = publicMessage;
    this.code = code;
    this.logCode = logCode;
  }
}

class InvalidParamsError extends PublicError {
  constructor(message) {
    super(message, "INVALID_PARAMS");
    this.name = "InvalidParamsError";
  }
}

class ConfigurationError extends PublicError {
  constructor(message) {
    super(message, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
  }
}

class MembershipError extends PublicError {
  constructor(message = "이 공간에 접근할 권한이 없습니다.") {
    super(message, "SPACE_ACCESS_DENIED");
    this.name = "MembershipError";
  }
}

class ResourceNotFoundError extends PublicError {
  constructor(message = "요청한 리소스를 찾을 수 없습니다.") {
    super(message, "RESOURCE_NOT_FOUND");
    this.name = "ResourceNotFoundError";
  }
}

class SupabaseRequestError extends Error {
  constructor({ status, isRpc, resource, code }) {
    super(`Supabase request failed: ${status}`);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.isRpc = isRpc;
    this.resource = resource;
    this.serverCode = code;
  }
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function trimEnvironmentValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateSupabaseUrl(rawUrl) {
  const value = trimEnvironmentValue(rawUrl);
  if (!value) {
    throw new ConfigurationError("MOA_SUPABASE_URL 환경변수가 필요합니다.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError("MOA_SUPABASE_URL 형식이 올바르지 않습니다.");
  }

  const isLocalHttp = parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new ConfigurationError("Supabase URL은 HTTPS 주소여야 합니다.");
  }
  if (parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new ConfigurationError("MOA_SUPABASE_URL에는 경로, 쿼리, 해시를 넣을 수 없습니다.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(environment = process.env) {
  const serviceRoleKey = trimEnvironmentValue(environment.MOA_SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new ConfigurationError("MOA_SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  }

  const userId = trimEnvironmentValue(environment.MOA_MCP_USER_ID);
  if (!UUID_PATTERN.test(userId)) {
    throw new ConfigurationError("MOA_MCP_USER_ID는 유효한 UUID여야 합니다.");
  }

  return Object.freeze({
    url: validateSupabaseUrl(environment.MOA_SUPABASE_URL),
    serviceRoleKey,
    userId
  });
}

function assertSafeResourcePath(path) {
  if (!/^[a-z][a-z0-9_]*(?:\/[a-z][a-z0-9_]*)?$/.test(path)) {
    throw new Error("Unsafe Supabase resource path");
  }
}

export function createSupabaseRestClient(config, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;

  if (typeof fetchImpl !== "function") {
    throw new ConfigurationError("Node.js fetch를 사용할 수 없습니다. Node.js 18 이상이 필요합니다.");
  }

  async function request(path, { method = "GET", query, body, isRpc = false } = {}) {
    assertSafeResourcePath(path);
    const url = new URL(`${config.url}/rest/v1/${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: "application/json",
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (isRpc || method === "POST") {
      headers.Prefer = "return=representation";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch {
      throw new SupabaseRequestError({ status: 0, isRpc, resource: path });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();
    let responseBody = null;
    if (responseText) {
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = null;
      }
    }

    if (!response.ok) {
      throw new SupabaseRequestError({
        status: response.status,
        isRpc,
        resource: path,
        code: responseBody && typeof responseBody.code === "string" ? responseBody.code : undefined
      });
    }

    return responseBody;
  }

  return Object.freeze({
    select(table, query = {}) {
      return request(table, { query });
    },
    insert(table, body) {
      return request(table, { method: "POST", body });
    },
    rpc(name, parameters) {
      return request(`rpc/${name}`, { method: "POST", body: parameters, isRpc: true });
    }
  });
}

function requireObject(value, toolName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidParamsError(`${toolName} 입력은 JSON 객체여야 합니다.`);
  }
  return value;
}

function rejectUnknownKeys(value, allowedKeys, toolName) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new InvalidParamsError(`${toolName}에서 지원하지 않는 입력 필드입니다: ${key}`);
    }
  }
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new InvalidParamsError(`${field}는 문자열이어야 합니다.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new InvalidParamsError(`${field}는 비어 있을 수 없습니다.`);
  }
  if (normalized.length > maxLength) {
    throw new InvalidParamsError(`${field}는 ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return undefined;
  return requiredText(value, field, maxLength);
}

function requiredUuid(value, field) {
  const normalized = requiredText(value, field, 36);
  if (!UUID_PATTERN.test(normalized)) {
    throw new InvalidParamsError(`${field}는 유효한 UUID여야 합니다.`);
  }
  return normalized;
}

function optionalUuid(value, field) {
  if (value === undefined || value === null) return undefined;
  return requiredUuid(value, field);
}

function requiredDate(value, field) {
  const normalized = requiredText(value, field, 10);
  if (!DATE_PATTERN.test(normalized)) {
    throw new InvalidParamsError(`${field}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new InvalidParamsError(`${field}는 유효한 날짜여야 합니다.`);
  }
  return normalized;
}

function requiredTime(value, field) {
  const normalized = requiredText(value, field, 8);
  if (!TIME_PATTERN.test(normalized)) {
    throw new InvalidParamsError(`${field}는 HH:MM 또는 HH:MM:SS 형식이어야 합니다.`);
  }
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function optionalTime(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredTime(value, field);
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new InvalidParamsError(`${field}는 boolean이어야 합니다.`);
  }
  return value;
}

function optionalFrequency(value, field) {
  if (value === undefined || value === null || value === "") return "none";
  if (typeof value !== "string" || !["none", "daily", "weekdays", "weekly", "monthly"].includes(value)) {
    throw new InvalidParamsError(`${field}는 none, daily, weekdays, weekly, monthly 중 하나여야 합니다.`);
  }
  return value;
}

function parseInput(toolName, input, allowedKeys, parser) {
  const object = requireObject(input, toolName);
  rejectUnknownKeys(object, allowedKeys, toolName);
  return parser(object);
}

function parseListSpacesInput(input) {
  const object = input === undefined || input === null ? {} : input;
  return parseInput("list_spaces", object, new Set(), () => ({}));
}

function parseSpaceInput(toolName, input, extraKeys = new Set()) {
  return parseInput(toolName, input, new Set(["space_id", ...extraKeys]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id")
  }));
}

function parseTodayTasksInput(input) {
  return parseSpaceInput("get_today_tasks", input);
}

function parseAddTaskInput(input) {
  return parseInput("add_task", input, new Set([
    "space_id",
    "title",
    "due_date",
    "due_time",
    "assignee_id",
    "category",
    "note",
    "recurrence"
  ]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id"),
    title: requiredText(object.title, "title", 200),
    dueDate: requiredDate(object.due_date, "due_date"),
    dueTime: optionalTime(object.due_time, "due_time"),
    assigneeId: optionalUuid(object.assignee_id, "assignee_id"),
    category: optionalText(object.category, "category", 80),
    note: optionalText(object.note, "note", 2_000),
    recurrence: optionalFrequency(object.recurrence, "recurrence")
  }));
}

function parseTaskActionInput(toolName, input) {
  return parseInput(toolName, input, new Set(["space_id", "task_id"]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id"),
    taskId: requiredUuid(object.task_id, "task_id")
  }));
}

function parseListIdeasInput(input) {
  return parseInput("list_ideas", input, new Set(["space_id", "include_archived"]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id"),
    includeArchived: optionalBoolean(object.include_archived, "include_archived") ?? false
  }));
}

function parseAddIdeaInput(input) {
  return parseInput("add_idea", input, new Set(["space_id", "title", "body"]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id"),
    title: requiredText(object.title, "title", 200),
    body: optionalText(object.body, "body", 5_000)
  }));
}

function parseConvertIdeaInput(input) {
  return parseInput("convert_idea_to_task", input, new Set([
    "space_id",
    "idea_id",
    "due_date",
    "due_time",
    "assignee_id",
    "category",
    "note",
    "recurrence"
  ]), (object) => ({
    spaceId: requiredUuid(object.space_id, "space_id"),
    ideaId: requiredUuid(object.idea_id, "idea_id"),
    dueDate: requiredDate(object.due_date, "due_date"),
    dueTime: optionalTime(object.due_time, "due_time"),
    assigneeId: optionalUuid(object.assignee_id, "assignee_id"),
    category: optionalText(object.category, "category", 80),
    note: optionalText(object.note, "note", 2_000),
    recurrence: optionalFrequency(object.recurrence, "recurrence")
  }));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function localTodayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function asRows(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function firstRpcValue(value) {
  if (Array.isArray(value)) return value.length ? value[0] : null;
  return value ?? null;
}

function throwSupabasePublicError(error) {
  if (error instanceof PublicError) throw error;
  if (error instanceof SupabaseRequestError) {
    if (error.status === 401 || error.status === 403) {
      throw new PublicError("Supabase 인증 설정을 확인할 수 없습니다.", "SUPABASE_AUTH_FAILED");
    }
    if (error.status === 404 && error.isRpc) {
      throw new PublicError(
        "필요한 Supabase RPC 계약을 찾을 수 없습니다. mcp-server/README.md의 함수 이름과 인자를 확인하세요.",
        "SUPABASE_RPC_NOT_FOUND"
      );
    }
    if (error.status === 404) {
      throw new PublicError(
        "필요한 Supabase 테이블 또는 컬럼 계약을 찾을 수 없습니다. mcp-server/README.md를 확인하세요.",
        "SUPABASE_SCHEMA_NOT_FOUND"
      );
    }
    if (error.status === 409) {
      throw new PublicError("동시 변경으로 충돌이 발생했습니다. 잠시 후 다시 시도하세요.", "SUPABASE_CONFLICT");
    }
    if (error.status === 0) {
      throw new PublicError("Supabase에 연결할 수 없습니다. 네트워크와 URL을 확인하세요.", "SUPABASE_UNREACHABLE");
    }
    throw new PublicError("Supabase 요청을 처리하지 못했습니다.", "SUPABASE_REQUEST_FAILED");
  }
  throw new PublicError("요청을 처리하지 못했습니다.", "INTERNAL_ERROR");
}

function logError(error) {
  const safeCode = error instanceof PublicError ? error.code : "INTERNAL_ERROR";
  const logCode = error instanceof PublicError ? error.logCode : error && error.name;
  console.error(JSON.stringify({
    level: "error",
    server: SERVER_NAME,
    code: safeCode,
    detail: typeof logCode === "string" ? logCode : "UNKNOWN_ERROR"
  }));
}

function assertMembershipRow(rows) {
  if (!asRows(rows).length) {
    throw new MembershipError();
  }
}

function buildMembershipQuery(userId, spaceId) {
  return {
    select: TABLE_FIELDS.memberships,
    user_id: `eq.${userId}`,
    ...(spaceId ? { space_id: `eq.${spaceId}` } : {}),
    status: "eq.active",
    limit: "1"
  };
}

export function createMoaOperations({ db, userId, now = () => new Date() }) {
  if (!db || typeof db.select !== "function" || typeof db.rpc !== "function" || typeof db.insert !== "function") {
    throw new ConfigurationError("Supabase 저장소 어댑터가 올바르지 않습니다.");
  }
  if (!UUID_PATTERN.test(userId)) {
    throw new ConfigurationError("MCP 사용자 UUID가 올바르지 않습니다.");
  }

  async function membershipsForCurrentUser(spaceId) {
    const rows = await db.select("memberships", buildMembershipQuery(userId, spaceId));
    assertMembershipRow(rows);
    return asRows(rows)[0];
  }

  async function assertMemberInSpace(spaceId, memberId) {
    if (memberId === userId) return;
    const rows = await db.select("memberships", buildMembershipQuery(memberId, spaceId));
    if (!asRows(rows).length) {
      throw new InvalidParamsError("assignee_id는 해당 공간의 멤버여야 합니다.");
    }
  }

  async function assertTaskInSpace(spaceId, taskId) {
    const rows = await db.select("tasks", {
      select: "id,space_id",
      id: `eq.${taskId}`,
      space_id: `eq.${spaceId}`,
      limit: "1"
    });
    if (!asRows(rows).length) {
      throw new ResourceNotFoundError("해당 공간에서 할일을 찾을 수 없습니다.");
    }
  }

  async function assertIdeaInSpace(spaceId, ideaId) {
    const rows = await db.select("ideas", {
      select: "id,space_id",
      id: `eq.${ideaId}`,
      space_id: `eq.${spaceId}`,
      limit: "1"
    });
    if (!asRows(rows).length) {
      throw new ResourceNotFoundError("해당 공간에서 아이디어를 찾을 수 없습니다.");
    }
  }

  async function listSpaces() {
    const memberships = asRows(await db.select("memberships", {
      select: TABLE_FIELDS.memberships,
      user_id: `eq.${userId}`,
      status: "eq.active",
      order: "created_at.asc"
    }));
    const spaceIds = [...new Set(memberships.map((row) => row && row.space_id).filter((value) => UUID_PATTERN.test(value || "")))];
    if (!spaceIds.length) return { spaces: [] };

    const spaces = asRows(await db.select("spaces", {
      select: TABLE_FIELDS.spaces,
      id: `in.(${spaceIds.join(",")})`,
      order: "created_at.asc"
    }));
    const roleBySpace = new Map(memberships.map((row) => [row.space_id, row.role || "member"]));
    return {
      spaces: spaces.map((space) => ({
        ...space,
        role: roleBySpace.get(space.id) || "member"
      }))
    };
  }

  async function getTodayTasks(input) {
    await membershipsForCurrentUser(input.spaceId);
    const date = localTodayIso(now());
    const tasks = asRows(await db.select("tasks", {
      select: TABLE_FIELDS.tasks,
      space_id: `eq.${input.spaceId}`,
      due_date: `eq.${date}`,
      order: "due_time.asc.nullslast,created_at.asc"
    }));
    return { space_id: input.spaceId, date, tasks };
  }

  async function addTask(input) {
    await membershipsForCurrentUser(input.spaceId);
    const assigneeId = input.assigneeId || userId;
    await assertMemberInSpace(input.spaceId, assigneeId);
    try {
      const task = firstRpcValue(await db.rpc(RPC_NAMES.createTask, {
        p_space_id: input.spaceId,
        p_title: input.title,
        p_due_date: input.dueDate,
        p_due_time: input.dueTime ?? null,
        p_assignee_id: assigneeId,
        p_category: input.category ?? "기타",
        p_note: input.note ?? null,
        p_frequency: input.recurrence,
        p_actor_user_id: userId
      }));
      return { task };
    } catch (error) {
      throwSupabasePublicError(error);
    }
  }

  async function completeTask(input) {
    await membershipsForCurrentUser(input.spaceId);
    await assertTaskInSpace(input.spaceId, input.taskId);
    try {
      const task = firstRpcValue(await db.rpc(RPC_NAMES.completeTask, {
        p_task_id: input.taskId,
        p_completed: true,
        p_actor_user_id: userId
      }));
      return { task };
    } catch (error) {
      throwSupabasePublicError(error);
    }
  }

  async function postponeTask(input) {
    await membershipsForCurrentUser(input.spaceId);
    await assertTaskInSpace(input.spaceId, input.taskId);
    try {
      const task = firstRpcValue(await db.rpc(RPC_NAMES.postponeTask, {
        p_task_id: input.taskId,
        p_actor_user_id: userId
      }));
      return { task };
    } catch (error) {
      throwSupabasePublicError(error);
    }
  }

  async function listIdeas(input) {
    await membershipsForCurrentUser(input.spaceId);
    const ideas = asRows(await db.select("ideas", {
      select: TABLE_FIELDS.ideas,
      space_id: `eq.${input.spaceId}`,
      ...(input.includeArchived ? {} : { status: "neq.archived" }),
      order: "updated_at.desc.nullslast,created_at.desc"
    }));
    return { space_id: input.spaceId, ideas };
  }

  async function addIdea(input) {
    await membershipsForCurrentUser(input.spaceId);
    try {
      const idea = firstRpcValue(await db.insert("ideas", {
        space_id: input.spaceId,
        title: input.title,
        body: input.body ?? null,
        author_id: userId
      }));
      return { idea };
    } catch (error) {
      throwSupabasePublicError(error);
    }
  }

  async function convertIdeaToTask(input) {
    await membershipsForCurrentUser(input.spaceId);
    await assertIdeaInSpace(input.spaceId, input.ideaId);
    const assigneeId = input.assigneeId || userId;
    await assertMemberInSpace(input.spaceId, assigneeId);
    try {
      const task = firstRpcValue(await db.rpc(RPC_NAMES.convertIdeaToTask, {
        p_idea_id: input.ideaId,
        p_due_date: input.dueDate,
        p_due_time: input.dueTime ?? null,
        p_assignee_id: assigneeId,
        p_category: input.category ?? "기타",
        p_note: input.note ?? null,
        p_frequency: input.recurrence,
        p_actor_user_id: userId
      }));
      return { task, source_idea_id: input.ideaId };
    } catch (error) {
      throwSupabasePublicError(error);
    }
  }

  return Object.freeze({
    listSpaces,
    getTodayTasks,
    addTask,
    completeTask,
    postponeTask,
    listIdeas,
    addIdea,
    convertIdeaToTask
  });
}

const EMPTY_INPUT_SCHEMA = Object.freeze({
  type: "object",
  properties: {},
  additionalProperties: false
});

const UUID_SCHEMA = Object.freeze({ type: "string", format: "uuid" });
const DATE_SCHEMA = Object.freeze({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const TIME_SCHEMA = Object.freeze({ type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$" });

const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "list_spaces",
    description: "현재 MOA_MCP_USER_ID가 멤버인 공동 공간만 조회합니다.",
    inputSchema: EMPTY_INPUT_SCHEMA
  },
  {
    name: "get_today_tasks",
    description: "지정한 공간의 오늘 날짜 할일을 조회합니다. 현재 사용자가 멤버인 공간만 접근할 수 있습니다.",
    inputSchema: {
      type: "object",
      properties: { space_id: UUID_SCHEMA },
      required: ["space_id"],
      additionalProperties: false
    }
  },
  {
    name: "add_task",
    description: "멤버인 공동 공간에 할일을 추가합니다. 실제 저장은 create_task Supabase RPC를 통해 수행합니다.",
    inputSchema: {
      type: "object",
      properties: {
        space_id: UUID_SCHEMA,
        title: { type: "string", minLength: 1, maxLength: 200 },
        due_date: DATE_SCHEMA,
        due_time: TIME_SCHEMA,
        assignee_id: UUID_SCHEMA,
        category: { type: "string", maxLength: 80 },
        note: { type: "string", maxLength: 2000 },
        recurrence: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] }
      },
      required: ["space_id", "title", "due_date"],
      additionalProperties: false
    }
  },
  {
    name: "complete_task",
    description: "멤버인 공동 공간의 할일을 완료 처리합니다. 반복 할일의 다음 회차 생성은 RPC가 원자적으로 처리해야 합니다.",
    inputSchema: {
      type: "object",
      properties: { space_id: UUID_SCHEMA, task_id: UUID_SCHEMA },
      required: ["space_id", "task_id"],
      additionalProperties: false
    }
  },
  {
    name: "postpone_task",
    description: "멤버인 공동 공간의 미완료 할일을 하루 연기합니다.",
    inputSchema: {
      type: "object",
      properties: { space_id: UUID_SCHEMA, task_id: UUID_SCHEMA },
      required: ["space_id", "task_id"],
      additionalProperties: false
    }
  },
  {
    name: "list_ideas",
    description: "멤버인 공동 공간의 아이디어를 조회합니다. 기본값은 보관된 아이디어 제외입니다.",
    inputSchema: {
      type: "object",
      properties: { space_id: UUID_SCHEMA, include_archived: { type: "boolean" } },
      required: ["space_id"],
      additionalProperties: false
    }
  },
  {
    name: "add_idea",
    description: "멤버인 공동 공간에 아이디어를 추가합니다. 활성 멤버십을 확인한 뒤 ideas 테이블에 저장합니다.",
    inputSchema: {
      type: "object",
      properties: {
        space_id: UUID_SCHEMA,
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", maxLength: 5000 }
      },
      required: ["space_id", "title"],
      additionalProperties: false
    }
  },
  {
    name: "convert_idea_to_task",
    description: "멤버인 공동 공간의 아이디어를 할일로 원자적으로 전환합니다. 원본 아이디어 보존·연결은 RPC가 처리해야 합니다.",
    inputSchema: {
      type: "object",
      properties: {
        space_id: UUID_SCHEMA,
        idea_id: UUID_SCHEMA,
        due_date: DATE_SCHEMA,
        due_time: TIME_SCHEMA,
        assignee_id: UUID_SCHEMA,
        category: { type: "string", maxLength: 80 },
        note: { type: "string", maxLength: 2000 },
        recurrence: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] }
      },
      required: ["space_id", "idea_id", "due_date"],
      additionalProperties: false
    }
  }
]);

function structuredValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (Array.isArray(value)) return { items: value };
  return { value: value ?? null };
}

function successResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: structuredValue(value)
  };
}

function errorResult(error) {
  const safeError = error instanceof PublicError
    ? error
    : new PublicError("요청을 처리하지 못했습니다.", "INTERNAL_ERROR");
  return {
    isError: true,
    content: [{ type: "text", text: safeError.publicMessage }]
  };
}

function toolArguments(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  return params.arguments === undefined || params.arguments === null ? {} : params.arguments;
}

export async function callTool(name, input, operations) {
  switch (name) {
    case "list_spaces":
      parseListSpacesInput(input);
      return operations.listSpaces();
    case "get_today_tasks":
      return operations.getTodayTasks(parseTodayTasksInput(input));
    case "add_task":
      return operations.addTask(parseAddTaskInput(input));
    case "complete_task":
      return operations.completeTask(parseTaskActionInput("complete_task", input));
    case "postpone_task":
      return operations.postponeTask(parseTaskActionInput("postpone_task", input));
    case "list_ideas":
      return operations.listIdeas(parseListIdeasInput(input));
    case "add_idea":
      return operations.addIdea(parseAddIdeaInput(input));
    case "convert_idea_to_task":
      return operations.convertIdeaToTask(parseConvertIdeaInput(input));
    default:
      throw new InvalidParamsError(`지원하지 않는 MCP 도구입니다: ${name}`);
  }
}

function hasRequestId(message) {
  return hasOwn(message, "id");
}

function sendJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function sendResult(id, result) {
  sendJson({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendJson({ jsonrpc: "2.0", id, error: { code, message } });
}

function negotiatedProtocolVersion(requested) {
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;
}

export async function handleMessage(message, operations) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { kind: "error", id: null, code: -32600, message: "Invalid JSON-RPC request." };
  }

  const id = hasRequestId(message) ? message.id : undefined;
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled" || message.method === "notifications/progress") {
    return { kind: "notification" };
  }

  if (!hasRequestId(message)) {
    return { kind: "notification" };
  }

  if (message.method === "initialize") {
    const params = message.params && typeof message.params === "object" ? message.params : {};
    return {
      kind: "result",
      id,
      result: {
        protocolVersion: negotiatedProtocolVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: "Moa 공동 공간 도구입니다. 모든 도구는 MOA_MCP_USER_ID가 멤버인 공간만 접근합니다."
      }
    };
  }

  if (message.method === "ping") {
    return { kind: "result", id, result: {} };
  }

  if (message.method === "tools/list") {
    return { kind: "result", id, result: { tools: TOOL_DEFINITIONS } };
  }

  if (message.method === "tools/call") {
    const params = message.params;
    if (!params || typeof params !== "object" || typeof params.name !== "string") {
      return { kind: "error", id, code: -32602, message: "tools/call requires a tool name." };
    }
    try {
      const value = await callTool(params.name, toolArguments(params), operations);
      return { kind: "result", id, result: successResult(value) };
    } catch (error) {
      if (error instanceof InvalidParamsError && params.name && !TOOL_DEFINITIONS.some((tool) => tool.name === params.name)) {
        return { kind: "error", id, code: -32602, message: "Unknown tool." };
      }
      if (!(error instanceof PublicError)) logError(error);
      return { kind: "result", id, result: errorResult(error) };
    }
  }

  return { kind: "error", id, code: -32601, message: "Method not found." };
}

export function startStdioServer(operations, input = process.stdin, output = process.stdout) {
  const readline = createInterface({ input, crlfDelay: Infinity });
  let queue = Promise.resolve();

  const write = (value) => {
    output.write(`${JSON.stringify(value)}\n`);
  };

  readline.on("line", (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
        return;
      }

      const response = await handleMessage(message, operations);
      if (response.kind === "result") write({ jsonrpc: "2.0", id: response.id, result: response.result });
      if (response.kind === "error") write({ jsonrpc: "2.0", id: response.id, error: { code: response.code, message: response.message } });
    }).catch((error) => {
      logError(error);
      write({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error." } });
    });
  });

  return readline;
}

async function main() {
  const config = loadConfig();
  const db = createSupabaseRestClient(config);
  const operations = createMoaOperations({ db, userId: config.userId });
  startStdioServer(operations);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    logError(error);
    process.exitCode = 1;
  });
}
