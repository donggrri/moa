function isInviteCode(value) {
  return /^[A-Z0-9]{12}$/i.test(String(value || '').trim());
}

function readInviteFromLocation(href) {
  try {
    var url = new URL(href);
    var invite = url.searchParams.get('invite') || '';
    var code = url.searchParams.get('code') || '';
    if (isInviteCode(invite)) return invite.trim().toUpperCase();
    if (isInviteCode(code)) return code.trim().toUpperCase();
    return '';
  } catch (error) {
    return '';
  }
}

function hasAuthCallbackParams(href) {
  try {
    var url = new URL(href);
    var code = url.searchParams.get('code') || '';
    var error = url.searchParams.get('error') || '';
    return Boolean(
      (code && !isInviteCode(code)) ||
      error ||
      url.hash.indexOf('access_token') !== -1
    );
  } catch (error) {
    return false;
  }
}

function oauthRedirectUrl(appUrl, inviteCode) {
  try {
    var parsed = new URL(String(appUrl || ''));
    if (isInviteCode(inviteCode)) {
      parsed.searchParams.set('invite', String(inviteCode).trim().toUpperCase());
    }
    return parsed.toString();
  } catch (error) {
    return String(appUrl || '');
  }
}

function parseOAuthCallbackError(href) {
  try {
    var url = new URL(href);
    var error = url.searchParams.get('error') || '';
    var description = String(url.searchParams.get('error_description') || '').replace(/\+/g, ' ');
    if (!error && !description) return null;
    return { error: error, description: description };
  } catch (error) {
    return null;
  }
}

function stripOAuthCallbackErrorParams(href) {
  try {
    var url = new URL(href);
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    return url.pathname + (url.search ? url.search : '') + url.hash;
  } catch (error) {
    return href;
  }
}

function displayNameFromUser(user) {
  user = user || {};
  var metadata = user.user_metadata || {};
  var candidates = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.nickname,
    metadata.preferred_username
  ];
  for (var index = 0; index < candidates.length; index += 1) {
    var value = String(candidates[index] || '').trim();
    if (value) return value;
  }
  if (user.email) {
    var local = String(user.email).split('@')[0];
    if (local) return local;
  }
  return '나';
}

function persistInviteCode(storage, code) {
  if (!storage || !isInviteCode(code)) return '';
  var normalized = String(code).trim().toUpperCase();
  try {
    storage.setItem('moa-pending-invite', normalized);
    return normalized;
  } catch (error) {
    return normalized;
  }
}

function readPersistedInviteCode(storage) {
  if (!storage) return '';
  try {
    var stored = storage.getItem('moa-pending-invite') || '';
    return isInviteCode(stored) ? stored.trim().toUpperCase() : '';
  } catch (error) {
    return '';
  }
}

function clearPersistedInviteCode(storage) {
  if (!storage) return;
  try {
    storage.removeItem('moa-pending-invite');
  } catch (error) {
    /* private mode may block storage */
  }
}

var api = {
  isInviteCode: isInviteCode,
  readInviteFromLocation: readInviteFromLocation,
  hasAuthCallbackParams: hasAuthCallbackParams,
  oauthRedirectUrl: oauthRedirectUrl,
  parseOAuthCallbackError: parseOAuthCallbackError,
  stripOAuthCallbackErrorParams: stripOAuthCallbackErrorParams,
  displayNameFromUser: displayNameFromUser,
  persistInviteCode: persistInviteCode,
  readPersistedInviteCode: readPersistedInviteCode,
  clearPersistedInviteCode: clearPersistedInviteCode
};

if (typeof globalThis !== 'undefined') {
  globalThis.MoaAuthFlow = api;
}

export {
  isInviteCode,
  readInviteFromLocation,
  hasAuthCallbackParams,
  oauthRedirectUrl,
  parseOAuthCallbackError,
  stripOAuthCallbackErrorParams,
  displayNameFromUser,
  persistInviteCode,
  readPersistedInviteCode,
  clearPersistedInviteCode
};
