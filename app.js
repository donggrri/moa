(function () {
  'use strict';

  var STORAGE_KEY = 'moa-shared-tasks-mvp-v1';
  var activeView = 'today';
  var taskFilter = 'all';
  var ideaFilter = 'all';
  var ideaQuery = '';
  var toastTimer;
  var state = loadState();

  var iconPaths = {
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path>',
    repeat: '<path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2v-.48A1.7 1.7 0 0 0 12.38 18a1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.42 15a1.7 1.7 0 0 0-1.56-1.03H7v-2h.86A1.7 1.7 0 0 0 9.42 11a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.42-1.42.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 13.41 6.5V6h2v.5A1.7 1.7 0 0 0 16.44 8a1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06A1.7 1.7 0 0 0 19.4 11c.24.61.83 1.03 1.49 1.03H22v2h-1.11c-.66 0-1.25.41-1.49 1.03Z"></path>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    more: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
    sparkle: '<path d="m12 3-1.3 5.7L5 10l5.7 1.3L12 17l1.3-5.7L19 10l-5.7-1.3L12 3Z"></path>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    pencil: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
    userPlus: '<path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path>',
    tag: '<path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.83 0l3.35-3.35a2 2 0 0 0 0-2.83Z"></path><path d="M7 7h.01"></path>'
  };

  function icon(name, size) {
    var path = iconPaths[name] || iconPaths.sparkle;
    var iconSize = size || 18;
    return '<svg width=\"' + iconSize + '\" height=\"' + iconSize + '\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">' + path + '</svg>';
  }

  function uid(prefix) {
    var base = '';
    if (window.crypto && window.crypto.randomUUID) {
      base = window.crypto.randomUUID();
    } else {
      base = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return (prefix || 'id') + '-' + base;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateToIso(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function todayIso() {
    return dateToIso(new Date());
  }

  function dateFromIso(iso) {
    var parts = String(iso).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(iso, amount) {
    var date = dateFromIso(iso);
    date.setDate(date.getDate() + amount);
    return dateToIso(date);
  }

  function dayOfWeek(iso) {
    return dateFromIso(iso).getDay();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatLongDate(iso) {
    var date = dateFromIso(iso);
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일 ' + days[date.getDay()] + '요일';
  }

  function formatShortDate(iso) {
    var date = dateFromIso(iso);
    return (date.getMonth() + 1) + '/' + date.getDate();
  }

  function relativeDate(iso) {
    var today = todayIso();
    if (iso === today) return '오늘';
    if (iso === addDays(today, 1)) return '내일';
    if (iso === addDays(today, -1)) return '어제';
    if (iso < today) return formatShortDate(iso) + ' 지남';
    return formatShortDate(iso);
  }

  function currentTimeLabel() {
    var now = new Date();
    return pad(now.getHours()) + ':' + pad(now.getMinutes());
  }

  function colorClass(value) {
    var map = {
      mint: 'mint',
      peach: 'peach',
      lavender: 'lavender',
      yellow: 'yellow'
    };
    return map[value] || 'mint';
  }

  function categoryClass(category) {
    if (category === '집안일') return 'green';
    if (category === '장보기') return 'yellow';
    if (category === '일정') return 'lavender';
    return '';
  }

  function recurrenceLabel(frequency, weekdays) {
    if (frequency === 'daily') return '매일';
    if (frequency === 'weekdays') return '평일';
    if (frequency === 'monthly') return '매월';
    if (frequency === 'weekly') {
      var names = ['일', '월', '화', '수', '목', '금', '토'];
      var days = (weekdays || []).map(function (day) { return names[day]; });
      return days.length ? '매주 ' + days.join('·') : '매주';
    }
    return '';
  }

  function nextDateForRule(rule, afterIso) {
    var cursor = dateFromIso(afterIso);
    if (rule.frequency === 'daily') return addDays(afterIso, 1);

    if (rule.frequency === 'weekdays') {
      for (var i = 1; i <= 8; i += 1) {
        var weekdayDate = addDays(afterIso, i);
        var weekday = dayOfWeek(weekdayDate);
        if (weekday >= 1 && weekday <= 5) return weekdayDate;
      }
    }

    if (rule.frequency === 'weekly') {
      var wanted = rule.weekdays && rule.weekdays.length ? rule.weekdays : [cursor.getDay()];
      for (var j = 1; j <= 8; j += 1) {
        var weeklyDate = addDays(afterIso, j);
        if (wanted.indexOf(dayOfWeek(weeklyDate)) !== -1) return weeklyDate;
      }
    }

    if (rule.frequency === 'monthly') {
      var nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      var lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
      nextMonth.setDate(Math.min(rule.dayOfMonth || cursor.getDate(), lastDay));
      return dateToIso(nextMonth);
    }

    return null;
  }

  function makeInviteCode() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function createSeedState() {
    var today = todayIso();
    var tomorrow = addDays(today, 1);
    var inTwoDays = addDays(today, 2);
    var inFiveDays = addDays(today, 5);
    var spaceId = 'space-home';
    var recurring = [
      {
        id: 'rec-recycle',
        title: '분리수거 내놓기',
        frequency: 'weekly',
        weekdays: [2, 5],
        cadence: '매주 화·금',
        dayOfMonth: null,
        defaultTime: '19:30',
        assigneeId: 'user-seoyeon',
        category: '집안일',
        active: true,
        nextDate: addDays(today, 3)
      },
      {
        id: 'rec-meal',
        title: '주간 식단 정하기',
        frequency: 'weekly',
        weekdays: [0],
        cadence: '매주 일',
        dayOfMonth: null,
        defaultTime: '10:00',
        assigneeId: 'user-junho',
        category: '일정',
        active: true,
        nextDate: addDays(today, 1)
      },
      {
        id: 'rec-bedding',
        title: '침구 세탁하기',
        frequency: 'weekly',
        weekdays: [6],
        cadence: '매주 토',
        dayOfMonth: null,
        defaultTime: '11:00',
        assigneeId: 'user-seoyeon',
        category: '집안일',
        active: true,
        nextDate: addDays(today, 7)
      },
      {
        id: 'rec-bills',
        title: '관리비 확인하기',
        frequency: 'monthly',
        weekdays: [],
        cadence: '매월 5일',
        dayOfMonth: 5,
        defaultTime: '09:00',
        assigneeId: 'user-junho',
        category: '일정',
        active: true,
        nextDate: inFiveDays
      }
    ];

    var tasks = [
      {
        id: 'task-recycle-today',
        title: '분리수거 내놓기',
        dueDate: today,
        dueTime: '19:30',
        assigneeId: 'user-seoyeon',
        category: '집안일',
        note: '현관 앞에 모아두기',
        status: 'open',
        recurringId: 'rec-recycle',
        createdAt: today
      },
      {
        id: 'task-grocery-today',
        title: '저녁 장보기',
        dueDate: today,
        dueTime: '18:00',
        assigneeId: 'user-junho',
        category: '장보기',
        note: '두부, 계란, 바나나',
        status: 'open',
        recurringId: null,
        createdAt: today
      },
      {
        id: 'task-bathroom-today',
        title: '욕실 세면대 정리',
        dueDate: today,
        dueTime: '12:00',
        assigneeId: 'user-seoyeon',
        category: '집안일',
        note: '',
        status: 'done',
        recurringId: null,
        createdAt: today,
        completedAt: today + 'T12:10:00'
      },
      {
        id: 'task-meal-tomorrow',
        title: '주간 식단 정하기',
        dueDate: tomorrow,
        dueTime: '10:00',
        assigneeId: 'user-junho',
        category: '일정',
        note: '',
        status: 'open',
        recurringId: 'rec-meal',
        createdAt: today
      },
      {
        id: 'task-bedding',
        title: '침구 세탁하기',
        dueDate: inTwoDays,
        dueTime: '11:00',
        assigneeId: 'user-seoyeon',
        category: '집안일',
        note: '',
        status: 'open',
        recurringId: 'rec-bedding',
        createdAt: today
      },
      {
        id: 'task-bills',
        title: '관리비 확인하기',
        dueDate: inFiveDays,
        dueTime: '09:00',
        assigneeId: 'user-junho',
        category: '일정',
        note: '',
        status: 'open',
        recurringId: 'rec-bills',
        createdAt: today
      }
    ];

    var ideas = [
      {
        id: 'idea-weekend-market',
        title: '주말에 동네 장터 가보기',
        body: '이번 달 안에 가까운 플리마켓이나 장터를 찾아서 같이 가보고 싶어요.',
        authorId: 'user-junho',
        status: 'inbox',
        createdAt: today,
        updatedAt: today,
        convertedTaskId: null
      },
      {
        id: 'idea-fridge-routine',
        title: '냉장고 정리 루틴 만들어보기',
        body: '한 달에 한 번 유통기한을 확인하고 다음 장보기 목록을 정리해요.',
        authorId: 'user-seoyeon',
        status: 'inbox',
        createdAt: today,
        updatedAt: today,
        convertedTaskId: null
      }
    ];

    return {
      version: 2,
      currentSpaceId: spaceId,
      currentUserId: 'user-seoyeon',
      spaces: [
        {
          id: spaceId,
          name: '우리 집',
          type: '신혼부부',
          inviteCode: 'MOA824',
          createdAt: today,
          members: [
            { id: 'user-seoyeon', name: '서연', role: '나', initials: '서', color: 'yellow' },
            { id: 'user-junho', name: '준호', role: '파트너', initials: '준', color: 'mint' }
          ],
          tasks: tasks,
          recurring: recurring,
          ideas: ideas
        }
      ]
    };
  }

  function normalizeState(parsed) {
    if (!parsed || !Array.isArray(parsed.spaces) || !parsed.spaces.length) return null;
    parsed.version = Math.max(Number(parsed.version) || 1, 2);
    parsed.spaces.forEach(function (space) {
      space.tasks = Array.isArray(space.tasks) ? space.tasks : [];
      space.recurring = Array.isArray(space.recurring) ? space.recurring : [];
      space.ideas = Array.isArray(space.ideas) ? space.ideas : [];
      space.ideas = space.ideas.map(function (idea) {
        return Object.assign({
          id: uid('idea'),
          title: '',
          body: '',
          authorId: parsed.currentUserId || null,
          status: 'inbox',
          createdAt: todayIso(),
          updatedAt: todayIso(),
          convertedTaskId: null
        }, idea);
      });
    });
    return parsed;
  }

  function loadState() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        var normalized = normalizeState(parsed);
        if (normalized) return normalized;
      }
    } catch (error) {
      console.warn('로컬 저장 데이터를 읽지 못했습니다.', error);
    }
    return createSeedState();
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('로컬 저장에 실패했습니다.', error);
    }
  }

  function getCurrentSpace() {
    return state.spaces.find(function (space) { return space.id === state.currentSpaceId; }) || state.spaces[0];
  }

  function getCurrentUser() {
    var space = getCurrentSpace();
    return space.members.find(function (member) { return member.id === state.currentUserId; }) || space.members[0];
  }

  function getMember(space, memberId) {
    return space.members.find(function (member) { return member.id === memberId; }) || space.members[0];
  }

  function getRecurring(space, recurringId) {
    return space.recurring.find(function (item) { return item.id === recurringId; });
  }

  function getIdea(space, ideaId) {
    return space.ideas.find(function (idea) { return idea.id === ideaId; });
  }

  function sortTasks(tasks) {
    return tasks.slice().sort(function (a, b) {
      var aKey = a.dueDate + 'T' + (a.dueTime || '23:59');
      var bKey = b.dueDate + 'T' + (b.dueTime || '23:59');
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }

  function applyTaskFilter(tasks) {
    var currentUserId = state.currentUserId;
    if (taskFilter === 'open') return tasks.filter(function (task) { return task.status !== 'done'; });
    if (taskFilter === 'done') return tasks.filter(function (task) { return task.status === 'done'; });
    if (taskFilter === 'mine') return tasks.filter(function (task) { return task.assigneeId === currentUserId; });
    if (taskFilter === 'partner') return tasks.filter(function (task) { return task.assigneeId !== currentUserId; });
    return tasks;
  }

  function sortIdeas(ideas) {
    return ideas.slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
  }

  function applyIdeaFilter(ideas) {
    var filtered = ideas.slice();
    if (ideaFilter === 'inbox') filtered = filtered.filter(function (idea) { return idea.status === 'inbox'; });
    if (ideaFilter === 'converted') filtered = filtered.filter(function (idea) { return idea.status === 'converted'; });
    if (ideaFilter === 'archived') filtered = filtered.filter(function (idea) { return idea.status === 'archived'; });
    if (ideaQuery.trim()) {
      var query = ideaQuery.trim().toLowerCase();
      filtered = filtered.filter(function (idea) {
        return [idea.title, idea.body].join(' ').toLowerCase().indexOf(query) !== -1;
      });
    }
    return filtered;
  }

  function ideaStatusLabel(status) {
    if (status === 'converted') return '할일로 전환됨';
    if (status === 'archived') return '보관됨';
    return '보관 중';
  }

  function taskDueMarkup(task) {
    var dateText = relativeDate(task.dueDate);
    var timeText = task.dueTime ? ' · ' + escapeHtml(task.dueTime) : '';
    var isLate = task.status !== 'done' && task.dueDate < todayIso();
    if (isLate) return '<span class=\"late\">' + dateText + timeText + '</span>';
    return '<span>' + dateText + timeText + '</span>';
  }

  function taskRow(task, space) {
    var member = getMember(space, task.assigneeId);
    var recurring = getRecurring(space, task.recurringId);
    var doneClass = task.status === 'done' ? ' done' : '';
    var checkedClass = task.status === 'done' ? ' completed' : '';
    var repeatMark = recurring ? '<span title=\"반복 일정\">' + icon('repeat', 11) + '</span>' : '';

    return [
      '<article class=\"task-row\">',
      '<button class=\"task-check' + checkedClass + '\" data-action=\"toggle-task\" data-task-id=\"' + escapeHtml(task.id) + '\" type=\"button\" aria-label=\"' + (task.status === 'done' ? '완료 취소' : '완료 처리') + '\">',
      task.status === 'done' ? icon('check', 13) : '',
      '</button>',
      '<div class=\"task-main\">',
      '<div class=\"task-title-line\">',
      '<span class=\"task-title' + doneClass + '\">' + escapeHtml(task.title) + '</span>',
      repeatMark,
      '</div>',
      '<div class=\"task-meta\">',
      taskDueMarkup(task),
      '<span>·</span>',
      '<span class=\"task-chip ' + categoryClass(task.category) + '\">' + escapeHtml(task.category || '기타') + '</span>',
      task.note ? '<span class=\"task-note\">· 메모 있음</span>' : '',
      '</div>',
      '</div>',
      '<div class=\"task-side\">',
      '<div class=\"task-assignee\">',
      '<span class=\"avatar ' + colorClass(member.color) + '\">' + escapeHtml(member.initials) + '</span>',
      '<span>' + escapeHtml(member.name) + '</span>',
      '</div>',
      task.status !== 'done' ? '<button class=\"task-action-button\" data-action=\"postpone-task\" data-task-id=\"' + escapeHtml(task.id) + '\" type=\"button\" aria-label=\"내일로 연기\" title=\"내일로 연기\">' + icon('clock', 14) + '</button>' : '',
      '<button class=\"task-menu\" data-action=\"edit-task\" data-task-id=\"' + escapeHtml(task.id) + '\" type=\"button\" aria-label=\"할일 수정\">' + icon('more', 16) + '</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function taskListMarkup(tasks, space) {
    if (!tasks.length) {
      return [
        '<div class=\"empty-state\">',
        '<div>',
        '<div class=\"empty-state-icon\">' + icon('sparkle', 18) + '</div>',
        '<strong>아직 표시할 할일이 없어요</strong>',
        '<p>새 할일을 추가해서 우리 생활을<br />조금씩 모아보세요.</p>',
        '</div>',
        '</div>'
      ].join('');
    }
    return '<div class=\"task-list\">' + sortTasks(tasks).map(function (task) { return taskRow(task, space); }).join('') + '</div>';
  }

  function ideaCard(idea, space) {
    var author = getMember(space, idea.authorId);
    var isArchived = idea.status === 'archived';
    var primaryAction = idea.status === 'inbox'
      ? '<button class=\"button soft small\" data-action=\"convert-idea\" data-idea-id=\"' + escapeHtml(idea.id) + '\" type=\"button\">' + icon('arrow', 13) + '<span>할일로 전환</span></button>'
      : '';
    var archiveLabel = isArchived ? '다시 꺼내기' : '보관';
    var convertedNote = idea.convertedTaskId ? '<span class=\"idea-linked\">할일과 연결됨</span>' : '';

    return [
      '<article class=\"idea-card' + (isArchived ? ' archived' : '') + '\">',
      '<div class=\"idea-icon\">' + icon('sparkle', 17) + '</div>',
      '<div class=\"idea-body\">',
      '<div class=\"idea-card-head\"><h3 class=\"idea-title\">' + escapeHtml(idea.title) + '</h3><span class=\"idea-status ' + escapeHtml(idea.status) + '\">' + ideaStatusLabel(idea.status) + '</span></div>',
      idea.body ? '<p class=\"idea-note\">' + escapeHtml(idea.body) + '</p>' : '',
      '<div class=\"idea-meta\"><span>' + escapeHtml(author.name) + '님이 기록</span><span>·</span><span>' + escapeHtml(formatShortDate(idea.createdAt || todayIso())) + '</span>' + convertedNote + '</div>',
      '<div class=\"idea-actions\">',
      primaryAction,
      '<button class=\"idea-action-link\" data-action=\"edit-idea\" data-idea-id=\"' + escapeHtml(idea.id) + '\" type=\"button\">수정</button>',
      '<button class=\"idea-action-link\" data-action=\"toggle-idea-archive\" data-idea-id=\"' + escapeHtml(idea.id) + '\" type=\"button\">' + archiveLabel + '</button>',
      '</div>',
      '</div>',
      '</article>'
    ].join('');
  }

  function ideaListMarkup(ideas, space) {
    if (!ideas.length) {
      return '<div class=\"empty-state\"><div><div class=\"empty-state-icon\">' + icon('sparkle', 18) + '</div><strong>아직 남겨둔 아이디어가 없어요</strong><p>나중에 해보고 싶은 생각을 가볍게 적어보세요.</p></div></div>';
    }
    return '<div class=\"idea-list\">' + sortIdeas(ideas).map(function (idea) { return ideaCard(idea, space); }).join('') + '</div>';
  }

  function ideaFilterMarkup() {
    var filters = [
      { id: 'all', label: '전체' },
      { id: 'inbox', label: '보관 중' },
      { id: 'converted', label: '할일로 전환됨' },
      { id: 'archived', label: '보관됨' }
    ];
    return '<div class=\"filter-bar\">' + filters.map(function (filter) {
      return '<button class=\"filter-pill' + (ideaFilter === filter.id ? ' active' : '') + '\" data-idea-filter=\"' + filter.id + '\" type=\"button\">' + filter.label + '</button>';
    }).join('') + '</div>';
  }

  function filterMarkup() {
    var filters = [
      { id: 'all', label: '전체' },
      { id: 'open', label: '남은 일' },
      { id: 'mine', label: '내 담당' },
      { id: 'partner', label: '파트너 담당' },
      { id: 'done', label: '완료' }
    ];
    return '<div class=\"filter-bar\">' + filters.map(function (filter) {
      return '<button class=\"filter-pill' + (taskFilter === filter.id ? ' active' : '') + '\" data-task-filter=\"' + filter.id + '\" type=\"button\">' + filter.label + '</button>';
    }).join('') + '</div>';
  }

  function memberMiniMarkup(space) {
    return '<div class=\"member-mini-list\">' + space.members.map(function (member) {
      var tasks = space.tasks.filter(function (task) { return task.assigneeId === member.id; });
      var completed = tasks.filter(function (task) { return task.status === 'done'; }).length;
      var percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
      return [
        '<div class=\"member-mini\">',
        '<span class=\"avatar ' + colorClass(member.color) + '\">' + escapeHtml(member.initials) + '</span>',
        '<div class=\"member-mini-copy\"><strong>' + escapeHtml(member.name) + '</strong><span>' + completed + '개 완료 · ' + tasks.length + '개 담당</span></div>',
        '<div class=\"member-mini-progress\"><span style=\"width:' + percent + '%\"></span></div>',
        '<span class=\"member-mini-percent\">' + percent + '%</span>',
        '</div>'
      ].join('');
    }).join('') + '</div>';
  }

  function upcomingMarkup(space) {
    var upcoming = sortTasks(space.tasks.filter(function (task) {
      return task.status !== 'done' && task.dueDate > todayIso();
    })).slice(0, 3);
    if (!upcoming.length) {
      return '<div class=\"empty-state\"><div><div class=\"empty-state-icon\">' + icon('calendar', 18) + '</div><strong>다가오는 할일이 없어요</strong><p>오늘을 잘 보내고 있네요.</p></div></div>';
    }
    return '<div class=\"task-list\">' + upcoming.map(function (task) { return taskRow(task, space); }).join('') + '</div>';
  }

  function renderToday(space) {
    var todayTasks = space.tasks.filter(function (task) { return task.dueDate === todayIso(); });
    var visibleTasks = applyTaskFilter(todayTasks);
    var completed = todayTasks.filter(function (task) { return task.status === 'done'; }).length;
    var openCount = todayTasks.length - completed;
    var percent = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;
    var activeRecurring = space.recurring.filter(function (item) { return item.active; }).length;
    var currentUser = getCurrentUser();

    return [
      '<section class=\"page-header\">',
      '<div><p class=\"page-kicker\">' + escapeHtml(space.name) + ' · ' + escapeHtml(space.type) + '</p>',
      '<h1 class=\"page-title\">오늘을 모아볼까요?</h1>',
      '<p class=\"page-description\">' + formatLongDate(todayIso()) + ' · 서로의 하루를 조금씩 나눠서 가볍게 시작해요.</p></div>',
      '<button class=\"button outline\" data-action=\"open-task-modal\" type=\"button\">' + icon('plus', 15) + '<span>새 할일</span></button>',
      '</section>',
      '<section class=\"hero-card\">',
      '<div class=\"hero-copy\">',
      '<p class=\"page-kicker\">GOOD MORNING, ' + escapeHtml(currentUser.name.toUpperCase()) + '</p>',
      '<h2 class=\"hero-title\">작은 약속이<br />우리의 하루가 돼요.</h2>',
      '<p class=\"hero-subtitle\">오늘은 ' + openCount + '개의 할일이 남아 있어요.</p>',
      '<div class=\"hero-meta\"><span>' + completed + '개 완료</span><span class=\"hero-meta-divider\"></span><span>반복 일정 ' + activeRecurring + '개</span></div>',
      '</div>',
      '<div class=\"hero-art\" aria-hidden=\"true\"><div class=\"art-sun\"></div><div class=\"art-roof\"></div><div class=\"art-house\"></div><div class=\"art-window\"></div><div class=\"art-door\"></div></div>',
      '</section>',
      '<section class=\"metric-grid\">',
      '<article class=\"metric-card\"><div><div class=\"metric-label\">오늘 남은 할일</div><div class=\"metric-value\">' + openCount + '</div><div class=\"metric-note\">' + (openCount ? '천천히 하나씩 해봐요' : '오늘 할 일을 모두 마쳤어요') + '</div></div><div class=\"metric-icon green\">' + icon('check', 18) + '</div></article>',
      '<article class=\"metric-card\"><div><div class=\"metric-label\">오늘 완료율</div><div class=\"metric-value\">' + percent + '<small>%</small></div><div class=\"metric-note positive\">' + (percent >= 50 ? '좋은 리듬이에요' : '이제 시작해도 충분해요') + '</div></div><div class=\"metric-icon yellow\">' + icon('sun', 18) + '</div></article>',
      '<article class=\"metric-card\"><div><div class=\"metric-label\">활성 반복 일정</div><div class=\"metric-value\">' + activeRecurring + '</div><div class=\"metric-note\">매일의 흐름을 자동으로</div></div><div class=\"metric-icon lavender\">' + icon('repeat', 18) + '</div></article>',
      '</section>',
      '<section class=\"content-grid\">',
      '<div>',
      '<article class=\"panel\">',
      '<div class=\"panel-head\"><div><h2 class=\"panel-title\">오늘 할일</h2><p class=\"panel-subtitle\">함께 확인하고, 끝난 일은 가볍게 체크해요.</p></div><button class=\"panel-action\" data-action=\"open-task-modal\" type=\"button\">추가 ' + icon('plus', 13) + '</button></div>',
      filterMarkup(),
      taskListMarkup(visibleTasks, space),
      '</article>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">다가오는 할일</h2><p class=\"panel-subtitle\">이번 주에 예정된 일</p></div><button class=\"panel-action\" data-view=\"all\" type=\"button\">전체 보기 ' + icon('arrow', 13) + '</button></div>' + upcomingMarkup(space) + '</article>',
      '</div>',
      '<div>',
      '<article class=\"panel progress-panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">오늘의 리듬</h2><p class=\"panel-subtitle\">우리 공간의 작은 진행률</p></div><span class=\"progress-percent\">' + percent + '%</span></div><div class=\"progress-bar\"><div class=\"progress-fill\" style=\"width:' + percent + '%\"></div></div><div class=\"stat-row\"><span>완료한 할일</span><strong>' + completed + ' / ' + todayTasks.length + '</strong></div><div class=\"stat-row\"><span>가장 바쁜 사람</span><strong>' + busiestMember(space) + '</strong></div><div class=\"stat-row\"><span>다음 알림</span><strong>' + nextReminder(space) + '</strong></div></article>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">우리 팀</h2><p class=\"panel-subtitle\">담당 일을 나눠서 보고 있어요.</p></div><button class=\"panel-action\" data-view=\"members\" type=\"button\">멤버 ' + icon('arrow', 13) + '</button></div>' + memberMiniMarkup(space) + '</article>',
      '</div>',
      '</section>'
    ].join('');
  }

  function busiestMember(space) {
    var counts = space.members.map(function (member) {
      return {
        member: member,
        count: space.tasks.filter(function (task) { return task.assigneeId === member.id && task.status !== 'done'; }).length
      };
    }).sort(function (a, b) { return b.count - a.count; });
    if (!counts.length || !counts[0].count) return '비슷하게 나눔';
    return counts[0].member.name + '님';
  }

  function nextReminder(space) {
    var next = sortTasks(space.tasks.filter(function (task) { return task.status !== 'done' && task.dueDate >= todayIso(); }))[0];
    return next ? relativeDate(next.dueDate) + (next.dueTime ? ' ' + next.dueTime : '') : '없음';
  }

  function renderAll(space) {
    var tasks = applyTaskFilter(space.tasks);
    return [
      '<section class=\"page-header\"><div><p class=\"page-kicker\">ALL TASKS</p><h1 class=\"page-title\">전체 할일</h1><p class=\"page-description\">' + escapeHtml(space.name) + '에서 함께 관리하는 모든 약속이에요.</p></div><button class=\"button primary\" data-action=\"open-task-modal\" type=\"button\">' + icon('plus', 15) + '<span>할일 추가</span></button></section>',
      '<article class=\"panel\"><div class=\"view-toolbar\"><div><h2 class=\"panel-title\">우리의 할일 보관함</h2><p class=\"panel-subtitle\">총 ' + space.tasks.length + '개의 할일</p></div><select class=\"select-control\" data-sort-select aria-label=\"정렬 기준\"><option value=\"date\">마감일순</option><option value=\"created\">최근 추가순</option></select></div>',
      filterMarkup(),
      taskListMarkup(tasks, space),
      '</article>'
    ].join('');
  }

  function renderIdeas(space) {
    var ideas = applyIdeaFilter(space.ideas);
    var inboxCount = space.ideas.filter(function (idea) { return idea.status === 'inbox'; }).length;
    var convertedCount = space.ideas.filter(function (idea) { return idea.status === 'converted'; }).length;
    return [
      '<section class=\"page-header\"><div><p class=\"page-kicker\">IDEA BOX</p><h1 class=\"page-title\">아이디어 보관함</h1><p class=\"page-description\">아직 할일로 정하지 않은 생각을 공동 공간에 가볍게 남겨두세요.</p></div><button class=\"button primary\" data-action=\"open-idea-modal\" type=\"button\">' + icon('plus', 15) + '<span>아이디어 저장</span></button></section>',
      '<section class=\"content-grid idea-content-grid\">',
      '<div>',
      '<article class=\"panel\">',
      '<div class=\"view-toolbar\"><div><h2 class=\"panel-title\">우리의 아이디어</h2><p class=\"panel-subtitle\">총 ' + space.ideas.length + '개 · 아직 구체화하지 않은 생각</p></div><input class=\"idea-search\" data-idea-search type=\"search\" value=\"' + escapeHtml(ideaQuery) + '\" placeholder=\"아이디어 검색\" aria-label=\"아이디어 검색\" /></div>',
      ideaFilterMarkup(),
      ideaListMarkup(ideas, space),
      '</article>',
      '</div>',
      '<div>',
      '<article class=\"panel idea-guide-panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">아이디어를 쓰는 방법</h2><p class=\"panel-subtitle\">생각은 가볍게, 실행은 필요할 때</p></div><div class=\"metric-icon lavender\">' + icon('sparkle', 18) + '</div></div><div class=\"stat-row\"><span>보관 중</span><strong>' + inboxCount + '개</strong></div><div class=\"stat-row\"><span>할일로 전환</span><strong>' + convertedCount + '개</strong></div><div class=\"stat-row\"><span>다음 단계</span><strong>필요할 때 전환</strong></div></article>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">기억해둘 규칙</h2><p class=\"panel-subtitle\">아이디어와 할일은 서로 다른 약속이에요.</p></div></div><div class=\"stat-row\"><span>아이디어</span><strong>담당자·마감 없음</strong></div><div class=\"stat-row\"><span>할일 전환</span><strong>원본 보존</strong></div><div class=\"stat-row\"><span>공개 범위</span><strong>' + escapeHtml(space.name) + ' 구성원</strong></div></article>',
      '</div>',
      '</section>'
    ].join('');
  }

  function recurringCard(item, space) {
    var member = getMember(space, item.assigneeId);
    var style = categoryClass(item.category) || 'green';
    return [
      '<article class=\"recurring-card\">',
      '<div class=\"recurring-icon ' + style + '\">' + icon('repeat', 17) + '</div>',
      '<div class=\"recurring-body\">',
      '<div class=\"recurring-card-top\"><h3 class=\"recurring-title\">' + escapeHtml(item.title) + '</h3><button class=\"toggle' + (item.active ? ' active' : '') + '\" data-action=\"toggle-recurring\" data-recurring-id=\"' + escapeHtml(item.id) + '\" type=\"button\" aria-label=\"반복 일정 ' + (item.active ? '끄기' : '켜기') + '\"></button></div>',
      '<div class=\"recurring-meta\">' + escapeHtml(item.cadence || recurrenceLabel(item.frequency, item.weekdays)) + ' · ' + escapeHtml(item.defaultTime || '시간 미정') + '<br />담당: ' + escapeHtml(member.name) + '</div>',
      item.active ? '<div class=\"recurring-next\">' + icon('calendar', 12) + '<span>다음 일정 ' + relativeDate(item.nextDate) + '</span></div>' : '<div class=\"recurring-next\" style=\"color:var(--muted)\">' + icon('clock', 12) + '<span>잠시 멈춤</span></div>',
      '</div>',
      '</article>'
    ].join('');
  }

  function renderRecurring(space) {
    var active = space.recurring.filter(function (item) { return item.active; }).length;
    return [
      '<section class=\"page-header\"><div><p class=\"page-kicker\">RHYTHM</p><h1 class=\"page-title\">반복 일정</h1><p class=\"page-description\">반복되는 일을 한 번 정해두면, 다음 약속이 자연스럽게 이어져요.</p></div><button class=\"button primary\" data-action=\"open-task-modal\" type=\"button\">' + icon('plus', 15) + '<span>반복 일정 추가</span></button></section>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">우리 집의 리듬</h2><p class=\"panel-subtitle\">현재 ' + active + '개의 반복 일정이 켜져 있어요.</p></div><span class=\"task-chip green\">자동 생성 ON</span></div>',
      space.recurring.length ? '<div class=\"recurring-grid\">' + space.recurring.map(function (item) { return recurringCard(item, space); }).join('') + '</div>' : '<div class=\"empty-state\"><div><div class=\"empty-state-icon\">' + icon('repeat', 18) + '</div><strong>반복 일정이 아직 없어요</strong><p>매주 돌아오는 집안일을 등록해보세요.</p></div></div>',
      '</article>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">반복 일정은 이렇게 작동해요</h2><p class=\"panel-subtitle\">완료하면 다음 회차가 자동으로 준비됩니다.</p></div></div><div class=\"stat-row\"><span>다음 회차 생성</span><strong>할일 완료 시 자동</strong></div><div class=\"stat-row\"><span>담당자 변경</span><strong>언제든 수정 가능</strong></div><div class=\"stat-row\"><span>알림 방식</span><strong>앱 푸시 · 메신저 연동 예정</strong></div></article>'
    ].join('');
  }

  function memberStats(space, memberId) {
    var tasks = space.tasks.filter(function (task) { return task.assigneeId === memberId; });
    var done = tasks.filter(function (task) { return task.status === 'done'; }).length;
    return { total: tasks.length, done: done, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }

  function renderMembers(space) {
    return [
      '<section class=\"page-header\"><div><p class=\"page-kicker\">PEOPLE</p><h1 class=\"page-title\">우리 멤버</h1><p class=\"page-description\">누가 무엇을 맡고 있는지 한눈에 보고, 필요한 일은 함께 조율해요.</p></div><button class=\"button primary\" data-action=\"open-invite-modal\" type=\"button\">' + icon('userPlus', 15) + '<span>멤버 초대</span></button></section>',
      '<div class=\"members-grid\">',
      space.members.map(function (member) {
        var stats = memberStats(space, member.id);
        return [
          '<article class=\"member-card\">',
          '<div class=\"member-summary\"><span class=\"avatar ' + colorClass(member.color) + '\">' + escapeHtml(member.initials) + '</span><div class=\"member-card-copy\"><strong>' + escapeHtml(member.name) + '</strong><span>' + escapeHtml(member.role) + '</span></div>',
          member.id === state.currentUserId ? '<span class=\"task-chip green\">나</span>' : '',
          '</div>',
          '<div class=\"member-card-stats\"><div class=\"member-stat\"><span>담당 할일</span><strong>' + stats.total + '</strong></div><div class=\"member-stat\"><span>완료율</span><strong>' + stats.percent + '%</strong></div></div>',
          '</article>'
        ].join('');
      }).join(''),
      '<button class=\"member-card\" data-action=\"open-invite-modal\" type=\"button\" style=\"text-align:left;border-style:dashed;background:#fbfcf9;\"><div class=\"member-summary\"><span class=\"avatar lavender\">+</span><div class=\"member-card-copy\"><strong>새 멤버 초대하기</strong><span>초대 코드 또는 링크 공유</span></div></div><div class=\"member-card-stats\"><div class=\"member-stat\"><span>현재 멤버</span><strong>' + space.members.length + '명</strong></div></div></button>',
      '</div>',
      '<article class=\"panel\"><div class=\"panel-head\"><div><h2 class=\"panel-title\">함께 쓰는 규칙</h2><p class=\"panel-subtitle\">모아는 일의 양보다 서로의 흐름을 봅니다.</p></div></div><div class=\"stat-row\"><span>현재 공간</span><strong>' + escapeHtml(space.name) + '</strong></div><div class=\"stat-row\"><span>공간 유형</span><strong>' + escapeHtml(space.type) + '</strong></div><div class=\"stat-row\"><span>초대 코드</span><strong>' + escapeHtml(space.inviteCode) + '</strong></div></article>'
    ].join('');
  }

  function render() {
    var space = getCurrentSpace();
    var currentUser = getCurrentUser();
    var todayOpen = space.tasks.filter(function (task) { return task.dueDate === todayIso() && task.status !== 'done'; }).length;
    var content = document.getElementById('appContent');

    document.getElementById('sidebarSpaceName').textContent = space.name;
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserAvatar').textContent = currentUser.initials;
    document.getElementById('todayNavCount').textContent = todayOpen;
    var ideasNavCount = document.getElementById('ideasNavCount');
    if (ideasNavCount) ideasNavCount.textContent = space.ideas.filter(function (idea) { return idea.status === 'inbox'; }).length;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-view') === activeView);
    });

    if (activeView === 'all') content.innerHTML = renderAll(space);
    else if (activeView === 'recurring') content.innerHTML = renderRecurring(space);
    else if (activeView === 'members') content.innerHTML = renderMembers(space);
    else if (activeView === 'ideas') content.innerHTML = renderIdeas(space);
    else content.innerHTML = renderToday(space);

    hydrateIcons(document);
  }

  function hydrateIcons(root) {
    root.querySelectorAll('[data-icon]').forEach(function (element) {
      var name = element.getAttribute('data-icon');
      element.innerHTML = icon(name, element.classList.contains('nav-icon') ? 17 : 16);
    });
  }

  function openModal(markup) {
    document.getElementById('modalRoot').innerHTML = markup;
    hydrateIcons(document.getElementById('modalRoot'));
    var firstInput = document.querySelector('#modalRoot input, #modalRoot textarea, #modalRoot select');
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 30);
  }

  function closeModal() {
    document.getElementById('modalRoot').innerHTML = '';
  }

  function showIdeaModal(ideaId) {
    var space = getCurrentSpace();
    var idea = ideaId ? getIdea(space, ideaId) : null;
    var title = idea ? '아이디어 수정' : '아이디어 저장';
    var submitLabel = idea ? '변경 저장' : '아이디어 남기기';

    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal compact\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"ideaModalTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"ideaModalTitle\">' + title + '</h2><p class=\"modal-description\">아직 할일로 정하지 않은 생각을 편하게 적어두세요.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<form id=\"ideaForm\" data-idea-id=\"' + (idea ? escapeHtml(idea.id) : '') + '\">',
      '<div class=\"form-grid\">',
      '<label class=\"form-field full\"><span class=\"form-label\">아이디어 제목</span><input class=\"field-input\" name=\"title\" required maxlength=\"100\" placeholder=\"예: 주말에 해보고 싶은 것\" value=\"' + escapeHtml(idea ? idea.title : '') + '\" /></label>',
      '<label class=\"form-field full\"><span class=\"form-label\">내용 <small>(선택)</small></span><textarea class=\"field-textarea\" name=\"body\" maxlength=\"500\" placeholder=\"나중에 기억하고 싶은 생각이나 이유를 적어주세요.\">' + escapeHtml(idea && idea.body ? idea.body : '') + '</textarea></label>',
      '</div>',
      '<div class=\"modal-footer\"><button class=\"button outline\" data-action=\"close-modal\" type=\"button\">취소</button><button class=\"button primary\" type=\"submit\">' + submitLabel + '</button></div>',
      '</form>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function showTaskModal(taskId, sourceIdeaId) {
    var space = getCurrentSpace();
    var task = taskId ? space.tasks.find(function (item) { return item.id === taskId; }) : null;
    var sourceIdea = sourceIdeaId ? getIdea(space, sourceIdeaId) : null;
    var recurring = task && task.recurringId ? getRecurring(space, task.recurringId) : null;
    var repeatValue = recurring ? recurring.frequency : 'none';
    var title = task ? '할일 수정' : (sourceIdea ? '아이디어를 할일로 바꾸기' : '새 할일 추가');
    var submitLabel = task ? '변경 저장' : '할일 만들기';
    var assigneeOptions = space.members.map(function (member) {
      return '<option value=\"' + escapeHtml(member.id) + '\"' + ((task ? task.assigneeId : state.currentUserId) === member.id ? ' selected' : '') + '>' + escapeHtml(member.name) + '</option>';
    }).join('');
    var categoryOptions = ['집안일', '장보기', '일정', '기타'].map(function (category) {
      return '<option value=\"' + category + '\"' + ((task ? task.category : '집안일') === category ? ' selected' : '') + '>' + category + '</option>';
    }).join('');
    var repeatOptions = [
      { value: 'none', label: '반복 없음' },
      { value: 'daily', label: '매일' },
      { value: 'weekdays', label: '평일마다' },
      { value: 'weekly', label: '매주' },
      { value: 'monthly', label: '매월' }
    ].map(function (option) {
      return '<option value=\"' + option.value + '\"' + (repeatValue === option.value ? ' selected' : '') + '>' + option.label + '</option>';
    }).join('');

    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"taskModalTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"taskModalTitle\">' + title + '</h2><p class=\"modal-description\">우리 공간에 남겨둘 약속을 적어주세요.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<form id=\"taskForm\" data-task-id=\"' + (task ? escapeHtml(task.id) : '') + '\" data-idea-id=\"' + (sourceIdea ? escapeHtml(sourceIdea.id) : '') + '\">',
      '<div class=\"form-grid\">',
      '<label class=\"form-field full\"><span class=\"form-label\">할일 이름</span><input class=\"field-input\" name=\"title\" required maxlength=\"80\" placeholder=\"예: 장보기 목록 확인\" value=\"' + escapeHtml(task ? task.title : (sourceIdea ? sourceIdea.title : '')) + '\" /></label>',
      '<label class=\"form-field\"><span class=\"form-label\">마감 날짜</span><input class=\"field-input\" type=\"date\" name=\"dueDate\" required value=\"' + escapeHtml(task ? task.dueDate : todayIso()) + '\" /></label>',
      '<label class=\"form-field\"><span class=\"form-label\">시간 <small>(선택)</small></span><input class=\"field-input\" type=\"time\" name=\"dueTime\" value=\"' + escapeHtml(task && task.dueTime ? task.dueTime : '') + '\" /></label>',
      '<label class=\"form-field\"><span class=\"form-label\">담당자</span><select class=\"field-select\" name=\"assigneeId\">' + assigneeOptions + '</select></label>',
      '<label class=\"form-field\"><span class=\"form-label\">분류</span><select class=\"field-select\" name=\"category\">' + categoryOptions + '</select></label>',
      '<label class=\"form-field full\"><span class=\"form-label\">반복</span><select class=\"field-select\" name=\"repeat\">' + repeatOptions + '</select></label>',
      '<label class=\"form-field full\"><span class=\"form-label\">메모 <small>(선택)</small></span><textarea class=\"field-textarea\" name=\"note\" maxlength=\"240\" placeholder=\"장보기 품목이나 서로 알아둘 내용을 적어주세요.\">' + escapeHtml(task ? (task.note || '') : (sourceIdea ? (sourceIdea.body || '') : '')) + '</textarea></label>',
      '</div>',
      '<div class=\"modal-footer\"><button class=\"button outline\" data-action=\"close-modal\" type=\"button\">취소</button><button class=\"button primary\" type=\"submit\">' + submitLabel + '</button></div>',
      '</form>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function showInviteModal() {
    var space = getCurrentSpace();
    var inviteLink = 'https://moa.example/join/' + encodeURIComponent(space.id) + '?code=' + encodeURIComponent(space.inviteCode);
    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal compact\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"inviteModalTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"inviteModalTitle\">' + escapeHtml(space.name) + '에 초대하기</h2><p class=\"modal-description\">코드나 링크를 상대방에게 보내면 함께 시작할 수 있어요.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<div class=\"invite-box\"><div class=\"invite-code-label\">초대 코드</div><div class=\"invite-code\">' + escapeHtml(space.inviteCode) + '</div><p class=\"invite-code-help\">초대받는 사람이 모아에서 입력할 코드예요.</p></div>',
      '<div class=\"invite-link-row\"><input class=\"invite-link-input\" id=\"inviteLinkInput\" readonly value=\"' + escapeHtml(inviteLink) + '\" /><button class=\"button soft small\" data-action=\"copy-invite\" type=\"button\">' + icon('copy', 14) + '<span>복사</span></button></div>',
      '<div class=\"modal-footer\"><button class=\"button outline\" data-action=\"close-modal\" type=\"button\">닫기</button><button class=\"button primary\" data-action=\"share-invite\" type=\"button\">' + icon('link', 14) + '<span>공유하기</span></button></div>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function showSpacePickerModal() {
    var spacesMarkup = state.spaces.map(function (space) {
      return [
        '<button class=\"space-list-item' + (space.id === state.currentSpaceId ? ' current' : '') + '\" data-action=\"switch-space\" data-space-id=\"' + escapeHtml(space.id) + '\" type=\"button\">',
        '<span class=\"space-list-icon\">⌂</span><span class=\"space-list-copy\"><strong>' + escapeHtml(space.name) + '</strong><span>' + escapeHtml(space.type) + ' · ' + space.members.length + '명</span></span>',
        space.id === state.currentSpaceId ? '<span class=\"space-list-check\">✓</span>' : '',
        '</button>'
      ].join('');
    }).join('');

    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal compact\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"spaceModalTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"spaceModalTitle\">공동 공간 선택</h2><p class=\"modal-description\">생활 단위별로 공간을 나눠 관리할 수 있어요.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<div class=\"space-list\">' + spacesMarkup + '</div>',
      '<button class=\"button outline\" data-action=\"open-create-space\" type=\"button\" style=\"width:100%\">' + icon('plus', 14) + '<span>새 공동 공간 만들기</span></button>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function showCreateSpaceModal() {
    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal compact\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"createSpaceTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"createSpaceTitle\">새 공동 공간</h2><p class=\"modal-description\">우리 집, 커플, 자취방처럼 생활 단위를 만들어보세요.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<form id=\"spaceForm\"><div class=\"form-grid\">',
      '<label class=\"form-field full\"><span class=\"form-label\">공간 이름</span><input class=\"field-input\" name=\"name\" required maxlength=\"30\" placeholder=\"예: 주말 자취방\" /></label>',
      '<label class=\"form-field full\"><span class=\"form-label\">공간 유형</span><select class=\"field-select\" name=\"type\"><option>커플</option><option>신혼부부</option><option>자취</option><option>룸메이트</option><option>가족</option></select></label>',
      '</div><div class=\"modal-footer\"><button class=\"button outline\" data-action=\"close-modal\" type=\"button\">취소</button><button class=\"button primary\" type=\"submit\">공간 만들기</button></div></form>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function showResetModal() {
    openModal([
      '<div class=\"modal-backdrop\" data-action=\"backdrop-close\">',
      '<section class=\"modal compact\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"resetModalTitle\">',
      '<div class=\"modal-head\"><div><h2 class=\"modal-title\" id=\"resetModalTitle\">데모 데이터 초기화</h2><p class=\"modal-description\">현재 브라우저에 저장된 할일, 반복 일정, 아이디어를 처음 상태로 되돌립니다.</p></div><button class=\"modal-close\" data-action=\"close-modal\" type=\"button\" aria-label=\"닫기\">' + icon('close', 16) + '</button></div>',
      '<div class=\"reset-warning\"><strong>이 브라우저의 변경 내용만 초기화돼요.</strong><span>실서비스에서는 서버 데이터와 별도의 기능이 됩니다.</span></div>',
      '<div class=\"modal-footer\"><button class=\"button outline\" data-action=\"close-modal\" type=\"button\">취소</button><button class=\"button primary\" data-action=\"reset-demo\" type=\"button\">초기화하고 다시 시작</button></div>',
      '</section>',
      '</div>'
    ].join(''));
  }

  function createRecurringFromForm(data, task) {
    if (data.repeat === 'none') {
      task.recurringId = null;
      return null;
    }

    var existing = task.recurringId ? getRecurring(getCurrentSpace(), task.recurringId) : null;
    var rule = existing || {
      id: uid('rec'),
      title: data.title,
      frequency: data.repeat,
      weekdays: [],
      cadence: '',
      dayOfMonth: null,
      defaultTime: data.dueTime,
      assigneeId: data.assigneeId,
      category: data.category,
      active: true,
      nextDate: null
    };

    rule.title = data.title;
    rule.frequency = data.repeat;
    rule.defaultTime = data.dueTime || '';
    rule.assigneeId = data.assigneeId;
    rule.category = data.category;
    rule.weekdays = data.repeat === 'weekly' ? [dayOfWeek(data.dueDate)] : [];
    rule.dayOfMonth = data.repeat === 'monthly' ? dateFromIso(data.dueDate).getDate() : null;
    rule.cadence = data.repeat === 'monthly'
      ? '매월 ' + rule.dayOfMonth + '일'
      : recurrenceLabel(data.repeat, rule.weekdays);
    rule.nextDate = nextDateForRule(rule, data.dueDate);

    if (!existing) getCurrentSpace().recurring.push(rule);
    task.recurringId = rule.id;
    return rule;
  }

  function handleTaskSubmit(form) {
    var space = getCurrentSpace();
    var formData = new FormData(form);
    var sourceIdeaId = form.getAttribute('data-idea-id');
    var data = {
      title: String(formData.get('title') || '').trim(),
      dueDate: String(formData.get('dueDate') || todayIso()),
      dueTime: String(formData.get('dueTime') || ''),
      assigneeId: String(formData.get('assigneeId') || state.currentUserId),
      category: String(formData.get('category') || '기타'),
      repeat: String(formData.get('repeat') || 'none'),
      note: String(formData.get('note') || '').trim()
    };
    if (!data.title) return;

    var taskId = form.getAttribute('data-task-id');
    if (taskId) {
      var task = space.tasks.find(function (item) { return item.id === taskId; });
      if (task) {
        task.title = data.title;
        task.dueDate = data.dueDate;
        task.dueTime = data.dueTime;
        task.assigneeId = data.assigneeId;
        task.category = data.category;
        task.note = data.note;
        task.repeatType = data.repeat;
        createRecurringFromForm(data, task);
        saveState();
        closeModal();
        render();
        showToast('할일을 수정했어요.');
      }
      return;
    }

    var newTask = {
      id: uid('task'),
      title: data.title,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      assigneeId: data.assigneeId,
      category: data.category,
      note: data.note,
      status: 'open',
      recurringId: null,
      repeatType: data.repeat,
      createdAt: todayIso(),
      sourceIdeaId: sourceIdeaId || null
    };
    space.tasks.push(newTask);
    createRecurringFromForm(data, newTask);
    if (sourceIdeaId) {
      var sourceIdea = getIdea(space, sourceIdeaId);
      if (sourceIdea) {
        sourceIdea.status = 'converted';
        sourceIdea.convertedTaskId = newTask.id;
        sourceIdea.updatedAt = todayIso();
      }
    }
    saveState();
    closeModal();
    render();
    showToast(sourceIdeaId ? '아이디어를 할일로 바꿨어요.' : (data.repeat === 'none' ? '새 할일을 추가했어요.' : '반복 일정과 첫 할일을 만들었어요.'));
  }

  function handleIdeaSubmit(form) {
    var space = getCurrentSpace();
    var formData = new FormData(form);
    var title = String(formData.get('title') || '').trim();
    var body = String(formData.get('body') || '').trim();
    if (!title) return;

    var ideaId = form.getAttribute('data-idea-id');
    if (ideaId) {
      var idea = getIdea(space, ideaId);
      if (idea) {
        idea.title = title;
        idea.body = body;
        idea.updatedAt = todayIso();
        saveState();
        closeModal();
        render();
        showToast('아이디어를 수정했어요.');
      }
      return;
    }

    space.ideas.push({
      id: uid('idea'),
      title: title,
      body: body,
      authorId: state.currentUserId,
      status: 'inbox',
      createdAt: todayIso(),
      updatedAt: todayIso(),
      convertedTaskId: null
    });
    saveState();
    closeModal();
    render();
    showToast('아이디어를 남겨두었어요.');
  }

  function ensureNextOccurrence(task) {
    var space = getCurrentSpace();
    var recurring = getRecurring(space, task.recurringId);
    if (!recurring || !recurring.active) return;
    var nextDate = nextDateForRule(recurring, task.dueDate);
    if (!nextDate) return;
    var alreadyExists = space.tasks.some(function (item) {
      return item.recurringId === recurring.id && item.dueDate === nextDate;
    });
    recurring.nextDate = nextDate;
    if (alreadyExists) return;
    space.tasks.push({
      id: uid('task'),
      title: recurring.title,
      dueDate: nextDate,
      dueTime: recurring.defaultTime || '',
      assigneeId: recurring.assigneeId,
      category: recurring.category,
      note: '',
      status: 'open',
      recurringId: recurring.id,
      repeatType: recurring.frequency,
      createdAt: todayIso()
    });
  }

  function toggleTask(taskId) {
    var space = getCurrentSpace();
    var task = space.tasks.find(function (item) { return item.id === taskId; });
    if (!task) return;
    if (task.status === 'done') {
      task.status = 'open';
      task.completedAt = null;
      showToast('완료 표시를 되돌렸어요.');
    } else {
      task.status = 'done';
      task.completedAt = new Date().toISOString();
      ensureNextOccurrence(task);
      showToast('잘했어요. 하나를 모았어요 ✦');
    }
    saveState();
    render();
  }

  function postponeTask(taskId) {
    var space = getCurrentSpace();
    var task = space.tasks.find(function (item) { return item.id === taskId; });
    if (!task || task.status === 'done') return;
    var baseDate = task.dueDate < todayIso() ? todayIso() : task.dueDate;
    task.dueDate = addDays(baseDate, 1);
    task.postponedAt = new Date().toISOString();
    saveState();
    render();
    showToast('할일을 하루 미뤘어요.');
  }

  function toggleIdeaArchive(ideaId) {
    var space = getCurrentSpace();
    var idea = getIdea(space, ideaId);
    if (!idea) return;
    if (idea.status === 'archived') {
      idea.status = idea.convertedTaskId ? 'converted' : 'inbox';
      showToast('아이디어를 다시 꺼냈어요.');
    } else {
      idea.status = 'archived';
      showToast('아이디어를 보관했어요.');
    }
    idea.updatedAt = todayIso();
    saveState();
    render();
  }

  function resetDemoData() {
    state = createSeedState();
    activeView = 'today';
    taskFilter = 'all';
    ideaFilter = 'all';
    ideaQuery = '';
    saveState();
    closeModal();
    render();
    showToast('데모 데이터를 초기화했어요.');
  }

  function toggleRecurring(recurringId) {
    var space = getCurrentSpace();
    var recurring = getRecurring(space, recurringId);
    if (!recurring) return;
    recurring.active = !recurring.active;
    saveState();
    render();
    showToast(recurring.active ? '반복 일정을 다시 켰어요.' : '반복 일정을 잠시 멈췄어요.');
  }

  function createSpace(form) {
    var formData = new FormData(form);
    var name = String(formData.get('name') || '').trim();
    var type = String(formData.get('type') || '커플');
    if (!name) return;
    var user = getCurrentUser();
    var newSpace = {
      id: uid('space'),
      name: name,
      type: type,
      inviteCode: makeInviteCode(),
      createdAt: todayIso(),
      members: [{ id: user.id, name: user.name, role: '나', initials: user.initials, color: user.color }],
      tasks: [],
      recurring: [],
      ideas: []
    };
    state.spaces.push(newSpace);
    state.currentSpaceId = newSpace.id;
    saveState();
    closeModal();
    render();
    showToast('새 공동 공간을 만들었어요.');
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    var helper = document.createElement('textarea');
    helper.value = value;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy'); } catch (error) { /* no-op */ }
    document.body.removeChild(helper);
    return Promise.resolve();
  }

  function showToast(message) {
    var region = document.getElementById('toastRegion');
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class=\"toast-icon\">' + icon('check', 13) + '</span><span>' + escapeHtml(message) + '</span>';
    region.appendChild(toast);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      window.setTimeout(function () { toast.remove(); }, 180);
    }, 2700);
  }

  function closeMobileMenu() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mobileScrim').classList.remove('visible');
  }

  function handleClick(event) {
    var viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      activeView = viewButton.getAttribute('data-view');
      taskFilter = 'all';
      closeMobileMenu();
      render();
      return;
    }

    var filterButton = event.target.closest('[data-task-filter]');
    if (filterButton) {
      taskFilter = filterButton.getAttribute('data-task-filter');
      render();
      return;
    }

    var ideaFilterButton = event.target.closest('[data-idea-filter]');
    if (ideaFilterButton) {
      ideaFilter = ideaFilterButton.getAttribute('data-idea-filter');
      render();
      return;
    }

    if (event.target.closest('#topAddButton')) {
      showTaskModal();
      return;
    }
    if (event.target.closest('#inviteButton')) {
      showInviteModal();
      return;
    }
    if (event.target.closest('#spaceSwitcher')) {
      showSpacePickerModal();
      return;
    }
    if (event.target.closest('#mobileMenu')) {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('mobileScrim').classList.toggle('visible');
      return;
    }
    if (event.target.closest('#mobileScrim')) {
      closeMobileMenu();
      return;
    }

    var actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    var action = actionTarget.getAttribute('data-action');

    if (action === 'backdrop-close' && event.target === actionTarget) {
      closeModal();
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'open-task-modal') {
      showTaskModal();
    } else if (action === 'open-idea-modal') {
      showIdeaModal();
    } else if (action === 'open-invite-modal') {
      showInviteModal();
    } else if (action === 'toggle-task') {
      toggleTask(actionTarget.getAttribute('data-task-id'));
    } else if (action === 'postpone-task') {
      postponeTask(actionTarget.getAttribute('data-task-id'));
    } else if (action === 'edit-task') {
      showTaskModal(actionTarget.getAttribute('data-task-id'));
    } else if (action === 'convert-idea') {
      showTaskModal(null, actionTarget.getAttribute('data-idea-id'));
    } else if (action === 'edit-idea') {
      showIdeaModal(actionTarget.getAttribute('data-idea-id'));
    } else if (action === 'toggle-idea-archive') {
      toggleIdeaArchive(actionTarget.getAttribute('data-idea-id'));
    } else if (action === 'toggle-recurring') {
      toggleRecurring(actionTarget.getAttribute('data-recurring-id'));
    } else if (action === 'copy-invite') {
      var input = document.getElementById('inviteLinkInput');
      if (input) copyText(input.value).then(function () { showToast('초대 링크를 복사했어요.'); });
    } else if (action === 'share-invite') {
      var space = getCurrentSpace();
      var link = 'https://moa.example/join/' + encodeURIComponent(space.id) + '?code=' + encodeURIComponent(space.inviteCode);
      if (navigator.share) {
        navigator.share({ title: '모아 공동 공간 초대', text: space.name + '에 함께 참여해요.', url: link }).catch(function () {});
      } else {
        copyText(link).then(function () { showToast('초대 링크를 복사했어요.'); });
      }
    } else if (action === 'switch-space') {
      state.currentSpaceId = actionTarget.getAttribute('data-space-id');
      saveState();
      closeModal();
      render();
      showToast('공동 공간을 바꿨어요.');
    } else if (action === 'open-create-space') {
      showCreateSpaceModal();
    } else if (action === 'open-reset-modal') {
      showResetModal();
    } else if (action === 'reset-demo') {
      resetDemoData();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === 'taskForm') {
      event.preventDefault();
      handleTaskSubmit(event.target);
    } else if (event.target.id === 'ideaForm') {
      event.preventDefault();
      handleIdeaSubmit(event.target);
    } else if (event.target.id === 'spaceForm') {
      event.preventDefault();
      createSpace(event.target);
    }
  }

  function handleInput(event) {
    if (!event.target.matches('[data-idea-search]')) return;
    ideaQuery = event.target.value;
    render();
    var searchInput = document.querySelector('[data-idea-search]');
    if (searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(ideaQuery.length, ideaQuery.length);
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  function init() {
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('input', handleInput);
    document.addEventListener('keydown', handleKeydown);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
