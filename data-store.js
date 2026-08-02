(function (global) {
  'use strict';

  function StoreError(message, code, cause) {
    this.name = 'StoreError';
    this.message = message;
    this.code = code || 'STORE_ERROR';
    this.cause = cause || null;
    if (Error.captureStackTrace) Error.captureStackTrace(this, StoreError);
  }

  StoreError.prototype = Object.create(Error.prototype);
  StoreError.prototype.constructor = StoreError;

  function createMoaStore(client) {
    if (!client) {
      throw new StoreError('Supabase client is required.', 'CONFIG_REQUIRED');
    }

    var activeSubscription = null;
    var currentUser = null;
    var currentSpaceId = null;

    function normalizeError(error, fallback, code) {
      var message = error && error.message ? error.message : fallback;
      var text = String(message || 'The request failed.');
      if (/jwt|auth|session|not authenticated/i.test(text)) {
        return new StoreError('로그인이 필요하거나 세션이 만료되었습니다.', 'AUTH_REQUIRED', error);
      }
      if (/permission|policy|forbidden|membership|member/i.test(text)) {
        return new StoreError('이 공동 공간에 접근할 권한이 없습니다.', 'FORBIDDEN', error);
      }
      return new StoreError(text, code || 'STORE_ERROR', error);
    }

    function unwrap(result, fallback, code) {
      if (!result || result.error) {
        throw normalizeError(result && result.error, fallback, code);
      }
      return result.data;
    }

    async function callRpc(name, args, fallback) {
      var result = await client.rpc(name, args || {});
      return unwrap(result, fallback || (name + ' failed.'));
    }

    async function getAuthenticatedUser() {
      var result = await client.auth.getUser();
      if (result.error) {
        throw normalizeError(result.error, '로그인 상태를 확인하지 못했습니다.', 'AUTH_REQUIRED');
      }
      currentUser = result.data && result.data.user ? result.data.user : null;
      if (!currentUser) {
        throw new StoreError('로그인이 필요합니다.', 'AUTH_REQUIRED');
      }
      return currentUser;
    }

    function firstRow(value) {
      return Array.isArray(value) ? (value[0] || null) : value;
    }

    function mapProfile(profile) {
      profile = profile || {};
      var displayName = profile.display_name || '모아 사용자';
      return {
        id: profile.id,
        name: displayName,
        role: '멤버',
        initials: profile.initials || displayName.slice(0, 1),
        color: profile.avatar_color || profile.color || 'mint'
      };
    }

    function inviteIsUsable(invite) {
      if (!invite || invite.revoked_at) return false;
      if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) return false;
      if (invite.max_uses != null && Number(invite.use_count || 0) >= Number(invite.max_uses)) return false;
      return true;
    }

    function mapSpace(space, memberships, profiles, invite) {
      var profileMap = (profiles || []).reduce(function (map, profile) {
        map[profile.id] = profile;
        return map;
      }, {});

      return {
        id: space.id,
        name: space.name,
        type: space.type,
        timezone: space.timezone,
        inviteCode: invite ? invite.code : '',
        createdAt: space.created_at,
        members: (memberships || []).map(function (membership) {
          var member = mapProfile(profileMap[membership.user_id]);
          member.id = membership.user_id;
          member.role = membership.role === 'owner' ? '소유자' : (membership.role === 'admin' ? '관리자' : '멤버');
          return member;
        }),
        tasks: [],
        recurring: [],
        ideas: []
      };
    }

    function mapRule(rule) {
      var frequency = rule.frequency;
      var weekdays = Array.isArray(rule.weekdays) ? rule.weekdays.map(Number) : [];
      var names = ['일', '월', '화', '수', '목', '금', '토'];
      var cadence = frequency === 'monthly'
        ? '매월 ' + rule.day_of_month + '일'
        : frequency === 'weekly'
          ? '매주 ' + weekdays.map(function (day) { return names[day]; }).join('·')
          : frequency === 'weekdays' ? '평일' : '매일';

      return {
        id: rule.id,
        title: rule.title,
        frequency: frequency,
        weekdays: weekdays,
        cadence: cadence,
        dayOfMonth: rule.day_of_month,
        defaultTime: rule.default_time ? String(rule.default_time).slice(0, 5) : '',
        assigneeId: rule.assignee_id,
        category: rule.category,
        active: rule.active,
        nextDate: rule.next_due_date
      };
    }

    function mapTask(task, ruleMap) {
      var rule = task.recurrence_rule_id ? ruleMap[task.recurrence_rule_id] : null;
      return {
        id: task.id,
        title: task.title,
        dueDate: task.due_date,
        dueTime: task.due_time ? String(task.due_time).slice(0, 5) : '',
        assigneeId: task.assignee_id,
        category: task.category,
        note: task.note || '',
        status: task.status,
        recurringId: task.recurrence_rule_id,
        repeatType: rule ? rule.frequency : 'none',
        createdAt: task.created_at,
        completedAt: task.completed_at,
        postponedAt: task.postponed_at,
        sourceIdeaId: task.source_idea_id
      };
    }

    function mapIdea(idea) {
      return {
        id: idea.id,
        title: idea.title,
        body: idea.body || '',
        authorId: idea.author_id,
        status: idea.status,
        createdAt: idea.created_at,
        updatedAt: idea.updated_at,
        convertedTaskId: idea.converted_task_id
      };
    }

    async function listSpaces() {
      var membershipsResult = await client
        .from('memberships')
        .select('space_id,user_id,role,status,created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      var memberships = unwrap(membershipsResult, '공동 공간 목록을 불러오지 못했습니다.');
      if (!memberships.length) return [];

      var spaceIds = memberships.map(function (membership) { return membership.space_id; });
      var userIds = memberships.map(function (membership) { return membership.user_id; });
      var [spacesResult, profilesResult, invitesResult] = await Promise.all([
        client.from('spaces').select('id,name,type,timezone,created_by,created_at,updated_at').in('id', spaceIds).order('created_at', { ascending: true }),
        client.from('profiles').select('id,display_name,initials,avatar_color').in('id', userIds),
        client.from('space_invites').select('space_id,code,expires_at,max_uses,use_count,revoked_at,created_at').in('space_id', spaceIds).is('revoked_at', null).order('created_at', { ascending: false })
      ]);
      var spaces = unwrap(spacesResult, '공동 공간을 불러오지 못했습니다.');
      var profiles = unwrap(profilesResult, '멤버 정보를 불러오지 못했습니다.');
      var invites = unwrap(invitesResult, '초대 정보를 불러오지 못했습니다.');

      return spaces.map(function (space) {
        var activeInvite = invites.find(function (invite) {
          return invite.space_id === space.id && inviteIsUsable(invite);
        });
        return mapSpace(
          space,
          memberships.filter(function (membership) { return membership.space_id === space.id; }),
          profiles,
          activeInvite
        );
      });
    }

    async function loadSpace(spaceId) {
      if (!spaceId) throw new StoreError('공동 공간을 선택해주세요.', 'SPACE_REQUIRED');
      var spaces = await listSpaces();
      var space = spaces.find(function (item) { return item.id === spaceId; });
      if (!space) throw new StoreError('선택한 공동 공간을 찾을 수 없습니다.', 'SPACE_NOT_FOUND');

      var results = await Promise.all([
        client.from('tasks').select('*').eq('space_id', spaceId).order('due_date', { ascending: true }).order('due_time', { ascending: true, nullsFirst: false }),
        client.from('recurrence_rules').select('*').eq('space_id', spaceId).order('created_at', { ascending: true }),
        client.from('ideas').select('*').eq('space_id', spaceId).order('updated_at', { ascending: false })
      ]);
      var tasks = unwrap(results[0], '할일을 불러오지 못했습니다.');
      var rules = unwrap(results[1], '반복 일정을 불러오지 못했습니다.');
      var ideas = unwrap(results[2], '아이디어를 불러오지 못했습니다.');
      var mappedRules = rules.map(mapRule);
      var ruleMap = mappedRules.reduce(function (map, rule) {
        map[rule.id] = rule;
        return map;
      }, {});

      space.tasks = tasks.map(function (task) { return mapTask(task, ruleMap); });
      space.recurring = mappedRules;
      space.ideas = ideas.map(mapIdea);
      currentSpaceId = spaceId;
      return space;
    }

    async function loadState(preferredSpaceId) {
      var user = await getAuthenticatedUser();
      var spaces = await listSpaces();
      if (!spaces.length) {
        var created = firstRow(await callRpc('create_space', {
          p_name: '나의 모아',
          p_type: '개인',
          p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'
        }, '첫 공동 공간을 만들지 못했습니다.'));
        if (created && created.id) {
          await callRpc('create_space_invite', { p_space_id: created.id }, '초대 링크를 만들지 못했습니다.');
        }
        spaces = await listSpaces();
      }
      if (!spaces.length) throw new StoreError('공동 공간을 준비하지 못했습니다.', 'SPACE_NOT_FOUND');

      var selectedId = preferredSpaceId || currentSpaceId;
      if (!spaces.some(function (space) { return space.id === selectedId; })) selectedId = spaces[0].id;
      var selected = await loadSpace(selectedId);
      var mergedSpaces = spaces.map(function (space) {
        return space.id === selected.id ? selected : space;
      });
      return {
        version: 3,
        currentSpaceId: selected.id,
        currentUserId: user.id,
        currentUserProfile: user,
        spaces: mergedSpaces
      };
    }

    async function refreshSelected() {
      if (!currentSpaceId) throw new StoreError('공동 공간을 선택해주세요.', 'SPACE_REQUIRED');
      return loadSpace(currentSpaceId);
    }

    async function selectSpace(spaceId) {
      return loadState(spaceId);
    }

    function requireSpaceId() {
      if (!currentSpaceId) throw new StoreError('공동 공간을 선택해주세요.', 'SPACE_REQUIRED');
      return currentSpaceId;
    }

    function taskArgs(spaceId, data) {
      return {
        p_space_id: spaceId,
        p_title: data.title,
        p_due_date: data.dueDate,
        p_due_time: data.dueTime || null,
        p_assignee_id: data.assigneeId || null,
        p_category: data.category || '기타',
        p_note: data.note || null,
        p_frequency: data.repeat || 'none'
      };
    }

    function updateTaskArgs(taskId, data) {
      return {
        p_task_id: taskId,
        p_title: data.title,
        p_due_date: data.dueDate,
        p_due_time: data.dueTime || null,
        p_assignee_id: data.assigneeId || null,
        p_category: data.category || '기타',
        p_note: data.note || null,
        p_frequency: data.repeat || 'none'
      };
    }

    async function createSpace(name, type) {
      var created = firstRow(await callRpc('create_space', {
        p_name: name,
        p_type: type || 'household',
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'
      }, '공동 공간을 만들지 못했습니다.'));
      if (!created || !created.id) throw new StoreError('공동 공간을 만들지 못했습니다.', 'SPACE_CREATE_FAILED');
      await callRpc('create_space_invite', { p_space_id: created.id }, '초대 링크를 만들지 못했습니다.');
      currentSpaceId = created.id;
      return loadSpace(created.id);
    }

    async function joinSpace(inviteCode) {
      var joined = firstRow(await callRpc('join_space', {
        p_invite_code: String(inviteCode || '').trim()
      }, '초대 코드로 참여하지 못했습니다.'));
      if (!joined || !joined.space_id) throw new StoreError('초대 코드로 참여하지 못했습니다.', 'INVITE_FAILED');
      currentSpaceId = joined.space_id;
      return loadSpace(joined.space_id);
    }

    async function createInvite() {
      var spaceId = requireSpaceId();
      await callRpc('create_space_invite', {
        p_space_id: spaceId
      }, '새 초대 링크를 만들지 못했습니다. 관리자 권한이 필요할 수 있습니다.');
      return refreshSelected();
    }

    async function createTask(data) {
      var spaceId = requireSpaceId();
      await callRpc('create_task', taskArgs(spaceId, data), '할일을 저장하지 못했습니다.');
      return refreshSelected();
    }

    async function updateTask(taskId, data) {
      await callRpc('update_task', updateTaskArgs(taskId, data), '할일을 수정하지 못했습니다.');
      return refreshSelected();
    }

    async function completeTask(taskId, completed) {
      await callRpc('complete_task', {
        p_task_id: taskId,
        p_completed: completed !== false
      }, '할일 완료 상태를 변경하지 못했습니다.');
      return refreshSelected();
    }

    async function postponeTask(taskId) {
      await callRpc('postpone_task', { p_task_id: taskId }, '할일을 하루 미루지 못했습니다.');
      return refreshSelected();
    }

    async function createIdea(data) {
      var spaceId = requireSpaceId();
      var result = await client.from('ideas').insert({
        space_id: spaceId,
        title: data.title,
        body: data.body || null,
        author_id: currentUser && currentUser.id
      }).select('*').single();
      unwrap(result, '아이디어를 저장하지 못했습니다.');
      return refreshSelected();
    }

    async function updateIdea(ideaId, data) {
      var spaceId = requireSpaceId();
      var result = await client.from('ideas').update({
        title: data.title,
        body: data.body || null
      }).eq('id', ideaId).eq('space_id', spaceId).select('*').single();
      unwrap(result, '아이디어를 수정하지 못했습니다.');
      return refreshSelected();
    }

    async function archiveIdea(ideaId, archived) {
      await callRpc('archive_idea', {
        p_idea_id: ideaId,
        p_archived: archived === true || archived === 'archived'
      }, '아이디어 보관 상태를 변경하지 못했습니다.');
      return refreshSelected();
    }

    async function convertIdeaToTask(ideaId, data) {
      await callRpc('convert_idea_to_task', {
        p_idea_id: ideaId,
        p_due_date: data.dueDate,
        p_due_time: data.dueTime || null,
        p_assignee_id: data.assigneeId || null,
        p_category: data.category || '기타',
        p_note: data.note || null,
        p_frequency: data.repeat || 'none'
      }, '아이디어를 할일로 전환하지 못했습니다.');
      return refreshSelected();
    }

    async function toggleRecurring(ruleId, active) {
      var spaceId = requireSpaceId();
      var result = await client.from('recurrence_rules')
        .update({ active: Boolean(active) })
        .eq('id', ruleId)
        .eq('space_id', spaceId)
        .select('id')
        .single();
      unwrap(result, '반복 일정을 변경하지 못했습니다.');
      return refreshSelected();
    }

    function subscribe(spaceId, onChange) {
      if (activeSubscription) {
        client.removeChannel(activeSubscription);
        activeSubscription = null;
      }
      var channel = client.channel('moa-space-' + spaceId + '-' + Date.now());
      var refresh = function () {
        if (typeof onChange === 'function') onChange();
      };
      [
        { table: 'spaces', filter: 'id=eq.' + spaceId },
        { table: 'memberships', filter: 'space_id=eq.' + spaceId },
        { table: 'recurrence_rules', filter: 'space_id=eq.' + spaceId },
        { table: 'tasks', filter: 'space_id=eq.' + spaceId },
        { table: 'ideas', filter: 'space_id=eq.' + spaceId }
      ].forEach(function (subscription) {
        channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: subscription.table,
          filter: subscription.filter
        }, refresh);
      });
      activeSubscription = channel;
      channel.subscribe();
      return function () {
        if (activeSubscription === channel) {
          client.removeChannel(channel);
          activeSubscription = null;
        }
      };
    }

    async function destroy() {
      if (activeSubscription) {
        await client.removeChannel(activeSubscription);
        activeSubscription = null;
      }
      currentUser = null;
      currentSpaceId = null;
    }

    return {
      client: client,
      initSession: getAuthenticatedUser,
      getCurrentUser: function () { return currentUser; },
      listSpaces: listSpaces,
      loadSpace: loadSpace,
      loadState: loadState,
      refreshState: loadState,
      selectSpace: selectSpace,
      setCurrentSpace: function (spaceId) { currentSpaceId = spaceId; },
      createSpace: createSpace,
      joinSpace: joinSpace,
      createInvite: createInvite,
      createTask: createTask,
      updateTask: updateTask,
      completeTask: completeTask,
      postponeTask: postponeTask,
      createIdea: createIdea,
      updateIdea: updateIdea,
      archiveIdea: archiveIdea,
      convertIdeaToTask: convertIdeaToTask,
      toggleRecurring: toggleRecurring,
      subscribe: subscribe,
      destroy: destroy,
      StoreError: StoreError
    };
  }

  global.MoaDataStore = {
    create: createMoaStore,
    StoreError: StoreError
  };
}(window));
