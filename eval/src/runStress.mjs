import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeCase,
  uploadImage,
  imageAsDataUrl,
  transcribeAudio,
  transcribeAudioDashScope,
  nowMs,
} from "./client.mjs";
import { loadDataset, normalizeAssetPath } from "./loadDataset.mjs";
import { latencyStat } from "./metrics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, "..", "results");
const DURATION_SECONDS = Number(process.env.STRESS_DURATION_SECONDS ?? 180);
const LEVELS = (process.env.STRESS_CONCURRENCY ?? "1,5,10")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);

function pickStressCases(cases) {
  const byMod = { text: [], image: [], audio: [] };
  for (const c of cases) {
    const bucket = byMod[c.modality];
    if (bucket && bucket.length < 2) bucket.push(c);
  }
  return [...byMod.text, ...byMod.image, ...byMod.audio];
}

async function runOne(root, c, tag) {
  const startAll = nowMs();
  try {
    let imageUri;
    let audioUri;
    let transcript = c.transcript ?? "";
    if (c.modality === "image" && c.image_path) {
      const normalizedImg = normalizeAssetPath(c.image_path);
      if (process.env.USE_FORGE_STORAGE === "1") {
        const up = await uploadImage(root, normalizedImg);
        imageUri = up.url;
      } else {
        imageUri = await imageAsDataUrl(root, normalizedImg);
      }
    }
    if (c.modality === "audio" && c.audio_path) {
      const normalizedAudio = normalizeAssetPath(c.audio_path);
      if (process.env.USE_SERVER_TRANSCRIBE === "1") {
        const tr = await transcribeAudio(root, normalizedAudio);
        audioUri = tr.audioUrl;
        transcript = tr.text;
      } else {
        const tr = await transcribeAudioDashScope(root, normalizedAudio);
        transcript = tr.text;
      }
    }
    await analyzeCase({
      inputMode: c.modality,
      text: c.raw_text,
      transcript,
      imageUri,
      audioUri,
      conversationId: tag,
    });
    return { durationMs: nowMs() - startAll, ok: true };
  } catch (err) {
    return { durationMs: nowMs() - startAll, ok: false, error: String(err?.message ?? err) };
  }
}

async function worker(root, pool, deadline, latencies, errors, counter, workerId) {
  let i = 0;
  while (nowMs() < deadline) {
    const c = pool[(i + workerId) % pool.length];
    i += 1;
    const tag = `stress-w${workerId}-${i}`;
    const r = await runOne(root, c, tag);
    counter.total += 1;
    if (r.ok) {
      counter.ok += 1;
      latencies.push(r.durationMs);
    } else {
      counter.fail += 1;
      if (r.error && errors.length < 8) errors.push(r.error);
    }
  }
}

async function runProfile(root, pool, concurrency) {
  console.log(`  concurrency=${concurrency} for ${DURATION_SECONDS}s…`);
  const deadline = nowMs() + DURATION_SECONDS * 1000;
  const latencies = [];
  const errors = [];
  const counter = { ok: 0, fail: 0, total: 0 };
  const workers = Array.from({ length: concurrency }, (_, i) =>
    worker(root, pool, deadline, latencies, errors, counter, i + 1),
  );
  await Promise.all(workers);
  const latency = latencyStat(latencies);
  return {
    concurrency,
    duration_seconds: DURATION_SECONDS,
    request_count: counter.total,
    success_count: counter.ok,
    failure_count: counter.fail,
    success_rate: counter.total ? counter.ok / counter.total : 0,
    throughput_rps: counter.ok / DURATION_SECONDS,
    latency,
    errors,
  };
}

function toCsv(profiles) {
  const header = [
    "concurrency",
    "duration_seconds",
    "request_count",
    "success_count",
    "failure_count",
    "success_rate",
    "throughput_rps",
    "lat_mean",
    "lat_p50",
    "lat_p90",
    "lat_p95",
    "lat_max",
  ];
  const rows = profiles.map((p) =>
    [
      p.concurrency,
      p.duration_seconds,
      p.request_count,
      p.success_count,
      p.failure_count,
      p.success_rate.toFixed(4),
      p.throughput_rps.toFixed(4),
      p.latency.mean,
      p.latency.p50,
      p.latency.p90,
      p.latency.p95,
      p.latency.max,
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export async function runStress() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const { root, dataset } = await loadDataset();
  const pool = pickStressCases(dataset.cases);
  console.log(`running stress on ${pool.length} cases, levels=${LEVELS.join(",")}`);

  const profiles = [];
  for (const c of LEVELS) {
    const p = await runProfile(root, pool, c);
    console.log(
      `    ok=${p.success_count}/${p.request_count} rps=${p.throughput_rps.toFixed(
        4,
      )} p95=${p.latency.p95.toFixed(0)}ms`,
    );
    profiles.push(p);
  }

  const payload = {
    generated_at: new Date().toISOString(),
    duration_seconds: DURATION_SECONDS,
    profiles,
  };
  const jsonPath = resolve(RESULTS_DIR, "stress.json");
  const csvPath = resolve(RESULTS_DIR, "stress.csv");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(csvPath, toCsv(profiles), "utf8");
  console.log(`stress: wrote ${jsonPath}`);
  return profiles;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("runStress.mjs");
if (invokedDirectly) {
  runStress().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
