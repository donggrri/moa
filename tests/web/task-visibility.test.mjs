import test from "node:test";
import assert from "node:assert/strict";
import {
  isOverdueTask,
  belongsOnTodayView,
  selectTodayViewTasks,
  countTodayOpen,
  summarizeTodayView
} from "../../task-visibility.js";

const today = "2026-08-17";

function task(overrides) {
  return {
    id: "task",
    title: "할일",
    status: "open",
    dueDate: today,
    ...overrides
  };
}

test("past incomplete tasks are overdue and belong on the today view", () => {
  const overdue = task({ id: "overdue", dueDate: "2026-08-16" });
  assert.equal(isOverdueTask(overdue, today), true);
  assert.equal(belongsOnTodayView(overdue, today), true);
});

test("today's open and done tasks belong on the today view", () => {
  const open = task({ id: "today-open" });
  const done = task({ id: "today-done", status: "done" });
  assert.equal(belongsOnTodayView(open, today), true);
  assert.equal(belongsOnTodayView(done, today), true);
  assert.equal(isOverdueTask(open, today), false);
  assert.equal(isOverdueTask(done, today), false);
});

test("completed past tasks and future tasks stay off the today view", () => {
  const pastDone = task({ id: "past-done", status: "done", dueDate: "2026-08-10" });
  const future = task({ id: "future", dueDate: "2026-08-20" });
  assert.equal(belongsOnTodayView(pastDone, today), false);
  assert.equal(belongsOnTodayView(future, today), false);
  assert.equal(isOverdueTask(pastDone, today), false);
});

test("selectTodayViewTasks keeps overdue work with today's tasks", () => {
  const tasks = [
    task({ id: "overdue", dueDate: "2026-08-15" }),
    task({ id: "today" }),
    task({ id: "today-done", status: "done" }),
    task({ id: "past-done", status: "done", dueDate: "2026-08-01" }),
    task({ id: "future", dueDate: "2026-08-21" })
  ];
  assert.deepEqual(
    selectTodayViewTasks(tasks, today).map((item) => item.id),
    ["overdue", "today", "today-done"]
  );
  assert.equal(countTodayOpen(tasks, today), 2);
});

test("summarizeTodayView counts overdue items as remaining work", () => {
  const summary = summarizeTodayView([
    task({ id: "overdue", title: "쓰레기", dueDate: "2026-08-14" }),
    task({ id: "today-open", title: "설거지" }),
    task({ id: "today-done", title: "세탁", status: "done" }),
    task({ id: "future", dueDate: "2026-08-22" })
  ], today);

  assert.equal(summary.overdue.length, 1);
  assert.equal(summary.dueToday.length, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.openCount, 2);
  assert.equal(summary.total, 3);
  assert.equal(summary.percent, 33);
});

test("empty or incomplete task records do not crash the today view", () => {
  assert.equal(isOverdueTask(null, today), false);
  assert.equal(belongsOnTodayView({ status: "open" }, today), false);
  assert.deepEqual(selectTodayViewTasks(undefined, today), []);
  assert.equal(countTodayOpen([], today), 0);
  const empty = summarizeTodayView([], today);
  assert.equal(empty.total, 0);
  assert.equal(empty.percent, 0);
});
