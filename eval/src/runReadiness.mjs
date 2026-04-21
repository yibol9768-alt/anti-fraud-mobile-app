import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { healthCheck, statusProbe, API_BASE_URL } from "./client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, "..", "results");

async function main() {
  await mkdir(RESULTS_DIR, { recursive: true });

  const checks = [];

  const serverOk = await healthCheck();
  checks.push({
    name: "server health",
    required: true,
    ok: serverOk,
    detail: serverOk ? `reachable at ${API_BASE_URL}/api/health` : `unreachable at ${API_BASE_URL}`,
  });

  let status = null;
  if (serverOk) {
    try {
      status = await statusProbe();
      checks.push({
        name: "antiFraud.status",
        required: true,
        ok: true,
        detail: `mode=${status.mode} ragProvider=${status.ragProvider}`,
      });
    } catch (err) {
      checks.push({
        name: "antiFraud.status",
        required: true,
        ok: false,
        detail: String(err?.message ?? err),
      });
    }
  }

  const arkReady = Boolean(status?.arkReady);
  checks.push({
    name: "ark chat runtime",
    required: false,
    ok: arkReady,
    detail: arkReady
      ? "configured"
      : "missing ARK_API_KEY/ARK_MODEL — analyze will fall back to local RAG only",
  });

  const envFlags = {
    ARK_API_KEY: Boolean(process.env.ARK_API_KEY),
    ARK_MODEL: Boolean(process.env.ARK_MODEL),
    ARK_EMBEDDING_MODEL: Boolean(process.env.ARK_EMBEDDING_MODEL),
    VOLC_SPEECH_APP_ID: Boolean(process.env.VOLC_SPEECH_APP_ID),
    VOLC_SPEECH_ACCESS_KEY: Boolean(process.env.VOLC_SPEECH_ACCESS_KEY),
    DIFY_API_KEY: Boolean(process.env.DIFY_API_KEY),
  };
  for (const [name, ok] of Object.entries(envFlags)) {
    checks.push({ name, required: false, ok, detail: ok ? "present" : "missing" });
  }

  const ready = checks.filter((c) => c.required).every((c) => c.ok);
  const report = {
    timestamp: new Date().toISOString(),
    ready,
    api_base_url: API_BASE_URL,
    checks,
    status,
  };
  const out = resolve(RESULTS_DIR, "readiness.json");
  await writeFile(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`readiness ${ready ? "OK" : "NOT READY"} — wrote ${out}`);
  for (const c of checks) {
    console.log(`  [${c.ok ? "x" : " "}] ${c.required ? "*" : " "} ${c.name}: ${c.detail}`);
  }
  if (!ready) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
