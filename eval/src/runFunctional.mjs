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
import { loadDataset, truthPositive, normalizeAssetPath } from "./loadDataset.mjs";
import { computeMetrics, groupBy } from "./metrics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, "..", "results");

function predictedPositive(level) {
  return level === "medium" || level === "high";
}

async function runCase(root, c) {
  const truth = truthPositive(c);
  const startAll = nowMs();
  let uploadMs = 0;
  let transcribeMs = 0;
  let analyzeMs = 0;
  let status = "ok";
  let errorMessage = "";
  let predictedLevel = "unknown";
  let predictedFraudType = "unknown";
  let summary = "";
  let usedDify = false;
  let usedRag = false;

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
    const { response } = await analyzeCase({
      inputMode: c.modality,
      text: c.raw_text,
      transcript,
      imageUri,
      audioUri,
      conversationId: `eval-${c.case_id}`,
    });
    analyzeMs = nowMs() - analyzeStart;
    predictedLevel = response.analysis.riskLevel;
    predictedFraudType = response.analysis.fraudType;
    summary = response.analysis.summary;
    usedDify = Boolean(response.usedDify);
    usedRag = Boolean(response.usedRag);
  } catch (err) {
    status = "error";
    errorMessage = String(err?.message ?? err);
  }

  const durationMs = nowMs() - startAll;
  const predicted = status === "ok" ? predictedPositive(predictedLevel) : false;

  return {
    case_id: c.case_id,
    label: c.label,
    modality: c.modality,
    fraud_type: c.fraud_type,
    title: c.title,
    truth_positive: truth,
    predicted_positive: predicted,
    predicted_risk_level: predictedLevel,
    predicted_fraud_type: predictedFraudType,
    status,
    error_message: errorMessage,
    duration_ms: Number(durationMs.toFixed(2)),
    upload_ms: Number(uploadMs.toFixed(2)),
    transcribe_ms: Number(transcribeMs.toFixed(2)),
    analyze_ms: Number(analyzeMs.toFixed(2)),
    used_dify: usedDify,
    used_rag: usedRag,
    summary,
    source_url: c.source_url,
  };
}

function toCsv(rows) {
  const header = [
    "case_id",
    "label",
    "modality",
    "fraud_type",
    "truth_positive",
    "predicted_positive",
    "predicted_risk_level",
    "predicted_fraud_type",
    "status",
    "duration_ms",
    "upload_ms",
    "transcribe_ms",
    "analyze_ms",
    "used_dify",
    "used_rag",
  ];
  const body = rows.map((r) =>
    header.map((h) => String(r[h] ?? "").replace(/[\r\n,]+/g, " ")).join(","),
  );
  return [header.join(","), ...body].join("\n");
}

export async function runFunctional() {
  await mkdir(RESULTS_DIR, { recursive: true });
  const { root, dataset } = await loadDataset();
  const modalityFilter = (process.env.MODALITY_FILTER ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const cases = modalityFilter.length
    ? dataset.cases.filter((c) => modalityFilter.includes(c.modality))
    : dataset.cases;
  console.log(
    `running functional eval on ${cases.length} cases${modalityFilter.length ? ` (filter=${modalityFilter.join(",")})` : ""}…`,
  );

  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    process.stdout.write(`  [${i + 1}/${cases.length}] ${c.case_id} (${c.modality})… `);
    const r = await runCase(root, c);
    const tag = r.status === "ok" ? r.predicted_risk_level : `error:${r.error_message.slice(0, 40)}`;
    console.log(`${tag} (${(r.duration_ms / 1000).toFixed(1)}s)`);
    results.push(r);
  }

  const overall = computeMetrics(results);
  const byModality = Object.fromEntries(
    Object.entries(groupBy(results, (r) => r.modality)).map(([k, v]) => [k, computeMetrics(v)]),
  );
  const byFraudType = Object.fromEntries(
    Object.entries(groupBy(results, (r) => r.fraud_type)).map(([k, v]) => [k, computeMetrics(v)]),
  );

  const payload = {
    generated_at: new Date().toISOString(),
    metrics: overall,
    by_modality: byModality,
    by_fraud_type: byFraudType,
    results,
  };
  const jsonPath = resolve(RESULTS_DIR, "functional.json");
  const csvPath = resolve(RESULTS_DIR, "functional.csv");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(csvPath, toCsv(results), "utf8");

  console.log(
    `functional: accuracy=${(overall.accuracy * 100).toFixed(2)}% precision=${(
      overall.precision * 100
    ).toFixed(2)}% recall=${(overall.recall * 100).toFixed(2)}% f1=${(overall.f1 * 100).toFixed(
      2,
    )}% (wrote ${jsonPath})`,
  );
  return results;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("runFunctional.mjs");
if (invokedDirectly) {
  runFunctional().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
