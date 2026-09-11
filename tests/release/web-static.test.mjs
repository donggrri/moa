import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function startWebServer() {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, MOA_WEB_HOST: "127.0.0.1", MOA_WEB_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    let output = "";
    const timer = setTimeout(() => {
      rejectReady(new Error(`web server did not start: ${output}`));
    }, 5000);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.removeListener("data", onOutput);
      child.stderr?.removeListener("data", onOutput);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    };
    const onOutput = (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        cleanup();
        resolveReady(Number(match[1]));
      }
    };
    const onError = (error) => {
      cleanup();
      rejectReady(error);
    };
    const onExit = (code) => {
      cleanup();
      rejectReady(new Error(`web server exited before readiness: ${code}`));
    };

    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.once("error", onError);
    child.once("exit", onExit);
  });

  return { child, ready };
}

async function stopWebServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveExit) => setTimeout(resolveExit, 1000))
  ]);
}

test("static web server serves the release asset set", async () => {
  const { child, ready } = startWebServer();
  try {
    const port = await ready;
    const assets = [
      ["/", "text/html"],
      ["/styles.css", "text/css"],
      ["/app.js", "text/javascript"],
      ["/data-store.js", "text/javascript"],
      ["/task-visibility.js", "text/javascript"],
      ["/auth-flow.js", "text/javascript"],
      ["/supabase-client.js", "text/javascript"],
      ["/supabase-config.js", "text/javascript"]
    ];

    for (const [path, contentType] of assets) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, `${path} should be served`);
      assert.match(response.headers.get("content-type") || "", new RegExp(contentType));
    }

    const index = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(index, /supabase-config\.js/);
    assert.match(index, /app\.js/);
    assert.match(index, /type="module"/);

    const app = await (await fetch(`http://127.0.0.1:${port}/app.js`)).text();
    assert.match(app, /task-visibility\.js/);
    assert.match(app, /auth-flow\.js/);
    assert.match(app, /signInWithOAuth/);
    assert.match(app, /provider:\s*['"]kakao['"]/);
    assert.match(app, /카카오 로그인/);

    const authFlow = await (await fetch(`http://127.0.0.1:${port}/auth-flow.js`)).text();
    assert.match(authFlow, /oauthRedirectUrl/);
    assert.doesNotMatch(authFlow, /service_role/i);

    const config = await (await fetch(`http://127.0.0.1:${port}/supabase-config.js`)).text();
    assert.doesNotMatch(config, /service_role/i);

    const missing = await fetch(`http://127.0.0.1:${port}/does-not-exist.js`);
    assert.equal(missing.status, 404);
  } finally {
    await stopWebServer(child);
  }
});
