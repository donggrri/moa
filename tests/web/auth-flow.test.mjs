import test from "node:test";
import assert from "node:assert/strict";
import {
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
} from "../../auth-flow.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test("invite codes are 12 alphanumeric characters and ignore oauth codes", () => {
  assert.equal(isInviteCode("ABCDEF123456"), true);
  assert.equal(isInviteCode("abcdef123456"), true);
  assert.equal(isInviteCode("short"), false);
  assert.equal(isInviteCode("this-is-a-long-oauth-authorization-code"), false);
});

test("invite query wins over a colliding code param during kakao return", () => {
  assert.equal(
    readInviteFromLocation("https://donggrri.github.io/moa/?invite=HOME12SPACE9"),
    "HOME12SPACE9"
  );
  assert.equal(
    readInviteFromLocation("http://localhost:5173/?code=HOME12SPACE9"),
    "HOME12SPACE9"
  );
  assert.equal(
    readInviteFromLocation("http://localhost:5173/?code=pkce-auth-code&invite=home12space9"),
    "HOME12SPACE9"
  );
  assert.equal(
    readInviteFromLocation("http://localhost:5173/?code=pkce-auth-code"),
    ""
  );
});

test("oauth callback detection does not treat invite codes as sessions", () => {
  assert.equal(hasAuthCallbackParams("http://localhost:5173/?code=pkce-auth-code"), true);
  assert.equal(hasAuthCallbackParams("http://localhost:5173/?code=HOME12SPACE9"), false);
  assert.equal(hasAuthCallbackParams("http://localhost:5173/#access_token=abc"), true);
  assert.equal(hasAuthCallbackParams("http://localhost:5173/?invite=HOME12SPACE9"), false);
  assert.equal(hasAuthCallbackParams("http://localhost:5173/?error=access_denied"), true);
});

test("kakao redirect keeps the pending invite on the app url", () => {
  assert.equal(
    oauthRedirectUrl("http://localhost:5173/", "home12space9"),
    "http://localhost:5173/?invite=HOME12SPACE9"
  );
  assert.equal(
    oauthRedirectUrl("https://donggrri.github.io/moa/", "HOME12SPACE9"),
    "https://donggrri.github.io/moa/?invite=HOME12SPACE9"
  );
  assert.equal(
    oauthRedirectUrl("http://localhost:5173/", ""),
    "http://localhost:5173/"
  );
});

test("oauth callback errors are parsed and stripped without dropping invite", () => {
  const href = "http://localhost:5173/?error=access_denied&error_code=forbidden&error_description=User+cancelled&invite=HOME12SPACE9";
  assert.deepEqual(parseOAuthCallbackError(href), {
    error: "access_denied",
    description: "User cancelled"
  });
  assert.equal(
    stripOAuthCallbackErrorParams(href),
    "/?invite=HOME12SPACE9"
  );
  assert.equal(parseOAuthCallbackError("http://localhost:5173/?invite=HOME12SPACE9"), null);
});

test("kakao nickname metadata becomes the display name", () => {
  assert.equal(displayNameFromUser({
    user_metadata: { nickname: "서연" }
  }), "서연");
  assert.equal(displayNameFromUser({
    user_metadata: { name: "카카오닉네임" }
  }), "카카오닉네임");
  assert.equal(displayNameFromUser({
    user_metadata: { display_name: "이메일이름" },
    email: "you@example.com"
  }), "이메일이름");
  assert.equal(displayNameFromUser({ email: "you@example.com" }), "you");
  assert.equal(displayNameFromUser({}), "나");
});

test("pending invite survives the kakao round trip in session storage", () => {
  const storage = memoryStorage();
  assert.equal(persistInviteCode(storage, "home12space9"), "HOME12SPACE9");
  assert.equal(readPersistedInviteCode(storage), "HOME12SPACE9");
  clearPersistedInviteCode(storage);
  assert.equal(readPersistedInviteCode(storage), "");
  assert.equal(persistInviteCode(storage, "not-an-invite"), "");
});
