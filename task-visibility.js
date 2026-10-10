function isOverdueTask(task, todayIso) {
  return Boolean(task) && task.status !== "done" && String(task.dueDate || "") < String(todayIso || "");
}

function belongsOnTodayView(task, todayIso) {
  if (!task || !task.dueDate) return false;
  if (String(task.dueDate) === String(todayIso)) return true;
  return isOverdueTask(task, todayIso);
}

function selectTodayViewTasks(tasks, todayIso) {
  return (tasks || []).filter(function (task) {
    return belongsOnTodayView(task, todayIso);
  });
}

function countTodayOpen(tasks, todayIso) {
  return selectTodayViewTasks(tasks, todayIso).filter(function (task) {
    return task.status !== "done";
  }).length;
}

function summarizeTodayView(tasks, todayIso) {
  var visible = selectTodayViewTasks(tasks, todayIso);
  var overdue = visible.filter(function (task) {
    return isOverdueTask(task, todayIso);
  });
  var dueToday = visible.filter(function (task) {
    return String(task.dueDate) === String(todayIso);
  });
  var completed = visible.filter(function (task) {
    return task.status === "done";
  }).length;
  var openCount = visible.length - completed;
  var total = visible.length;
  var percent = total ? Math.round((completed / total) * 100) : 0;
  return {
    visible: visible,
    overdue: overdue,
    dueToday: dueToday,
    completed: completed,
    openCount: openCount,
    total: total,
    percent: percent
  };
}

var api = {
  isOverdueTask: isOverdueTask,
  belongsOnTodayView: belongsOnTodayView,
  selectTodayViewTasks: selectTodayViewTasks,
  countTodayOpen: countTodayOpen,
  summarizeTodayView: summarizeTodayView
};

if (typeof globalThis !== "undefined") {
  globalThis.MoaTaskVisibility = api;
}

export {
  isOverdueTask,
  belongsOnTodayView,
  selectTodayViewTasks,
  countTodayOpen,
  summarizeTodayView
};
