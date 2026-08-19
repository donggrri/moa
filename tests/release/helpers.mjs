export function isStrictMode(argv = process.argv, env = process.env) {
  if (argv.includes("--smoke")) return false;
  if (argv.includes("--strict")) return true;
  const mode = (env.MOA_MCP_LIVE_MODE || "").toLowerCase();
  if (mode === "smoke") return false;
  if (mode === "strict") return true;
  const strictEnv = (env.MOA_MCP_STRICT_LIVE || env.MOA_STRICT_LIVE || "").toLowerCase();
  if (strictEnv === "true" || strictEnv === "1") return true;
  if (strictEnv === "false" || strictEnv === "0") return false;
  return true;
}
