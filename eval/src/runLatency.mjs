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
const REPETITIONS = Number(process.env.LATENCY_REPS ?? 5);
const PER_MODALITY = Number(process.env.LATENCY_CASES_PER_MODALITY ?? 3);

function pickCases(cases) {
  const byMod = { text: [], image: [], audio: [] };
  for (const c of cases) {
    const bucket = byMod[c.modality];
    if (bucket && bucket.length < PER_MODALITY) bucket.push(c);
  }
  return [...byMod.text, ...byMod.image, ...byMod.audio];
}

async function runOnce(root, c, rep) {
  let uploadMs = 0;
  let transcribeMs = 0;
  let analyzeMs = 0;
  let status = "ok";
  const startAll = nowMs();
  try {
    let imageUri;
    let audioUri;
    let transcript = c.transcript ?? "";
    if (c.modality === "image" && c.image_path) {
      const normalizedImg = normalizeAssetPath(c.image_path);
      const uploadStart = nowMs();
      if (process.env.USE_FORGE_STORAGE === "1") {
        const up = await uploadImage(root, normalizedImg);
        imageUri = up.url;
        uploadMs = up.durationMs;
      } else {
        imageUri = await imageAsDataUrl(root, normalizedImg);
        uploadMs = nowMs() - uploadStart;
      }
    }
    if (c.modality === "audio" && c.audio_path) {
      const normalizedAudio = normalizeAssetPath(c.audio_path);
      if (process.env.USE_SERVER_TRANSCRIBE === "1") {
        const tr = await transcribeAudio(root, normalizedAudio);
        audioUri = tr.audioUrl;
        transcript = tr.text;
        transcribeMs = tr.durationMs;
      } else {
        const tr = await transcribeAudioDashScope(root, normalizedAudio);
        transcript = tr.text;
        transcribeMs = tr.durationMs;
      }
    }
    const analyzeStart = nowMs();
    await analyzeCase({
      inputMode: c.modality,
      text: c.raw_text,
      transcript,
      imageUri,
      audioUri,
      conversationId: `eval-latency-${c.case_id}-${rep}`,
    });
    analyzeMs = nowMs() - analyzeStart;
  } catch {
    status = "error";
  }
  const durationMs = nowMs() - startAll;
  return {
    case_id: c.case_id,
    modality: c.modality,
    repetition: rep,
    duration_ms: Number(durationMs.toFixed(2)),
    upload_ms: Number(uploadMs.toFixed(2)),
    transcribe_ms: Number(transcribeMs.toFixed(2)),
    analyze_ms: Number(analyzeMs.toFixed(2)),
    status,
  };
}

function toCsv(rows) {
  const header = [
    "case_id",
    "modality",
    "repetition",
    "duration_ms",
    "upload_ms",
    "transcribe_ms",
    "analyze_ms",
    "status",
  ];
  const body = rows.map((r) => header.map((h) => String(r[h] ?? "")).join(","));
  return [header.join(","), ...body].join("\n");
}

export async function runLatency() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const { root, dataset } = await loadDataset();
  const pool = pickCases(dataset.cases);
  console.log(`running latency on ${pool.length} cases × ${REPETITIONS} reps…`);

  const rows = [];
  for (let rep = 1; rep <= REPETITIONS; rep++) {
    for (const c of pool) {
      process.stdout.write(`  rep ${rep} ${c.case_id}… `);
      const row = await runOnce(root, c, rep);
      console.log(
        `${(row.duration_ms / 1000).toFixed(1)}s${row.status === "ok" ? "" : " [ERROR]"}`,
      );
      rows.push(row);
    }
  }

  const overall = latencyStat(rows.filter((r) => r.status === "ok").map((r) => r.duration_ms));
  const byMod = Object.fromEntries(
    ["text", "image", "audio"].map((m) => [
      m,
      latencyStat(
        rows.filter((r) => r.modality === m && r.status === "ok").map((r) => r.duration_ms),
      ),
    ]),
  );

  const payload = {
    generated_at: new Date().toISOString(),
    repetitions: REPETITIONS,
    case_pool_size: pool.length,
    overall,
    by_modality: byMod,
    rows,
  };
  const jsonPath = resolve(RESULTS_DIR, "latency.json");
  const csvPath = resolve(RESULTS_DIR, "latency.csv");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(csvPath, toCsv(rows), "utf8");
  console.log(
    `latency: mean=${overall.mean.toFixed(0)}ms p50=${overall.p50.toFixed(
      0,
    )}ms p95=${overall.p95.toFixed(0)}ms (wrote ${jsonPath})`,
  );
  return rows;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("runLatency.mjs");
if (invokedDirectly) {
  runLatency().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
