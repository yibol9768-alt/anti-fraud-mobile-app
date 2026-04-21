import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { readFile, stat, mkdir } from "node:fs/promises";
import { extname, resolve, basename } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const TRPC_URL = `${API_BASE_URL}/api/trpc`;

export const trpc = createTRPCClient({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      transformer: superjson,
    }),
  ],
});

export function nowMs() {
  return performance.now();
}

export async function healthCheck() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body?.ok);
  } catch {
    return false;
  }
}

const IMG_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const AUDIO_MIME = {
  ".m4a": "audio/m4a",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
};

function guessMime(path, table, fallback) {
  const ext = extname(path).toLowerCase();
  return { mime: table[ext] ?? fallback, ext: ext.replace(/^\./, "") };
}

export async function uploadImage(datasetRoot, relativePath) {
  const abs = resolve(datasetRoot, relativePath);
  const buf = await readFile(abs);
  const { mime, ext } = guessMime(relativePath, IMG_MIME, "image/jpeg");
  const start = nowMs();
  const res = await trpc.antiFraud.uploadImage.mutate({
    imageBase64: buf.toString("base64"),
    mimeType: mime,
    fileExtension: ext || undefined,
    source: "detect",
  });
  return { url: res.url, key: res.key, durationMs: nowMs() - start };
}

// Fallback path when forge storage proxy is unavailable: embed the image
// as an inline data: URL. Doubao Ark chat completion accepts these.
export async function imageAsDataUrl(datasetRoot, relativePath) {
  const abs = resolve(datasetRoot, relativePath);
  const buf = await readFile(abs);
  const { mime } = guessMime(relativePath, IMG_MIME, "image/jpeg");
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function transcribeAudio(datasetRoot, relativePath) {
  const abs = resolve(datasetRoot, relativePath);
  const buf = await readFile(abs);
  const { mime, ext } = guessMime(relativePath, AUDIO_MIME, "audio/m4a");
  const start = nowMs();
  const res = await trpc.voice.transcribe.mutate({
    audioBase64: buf.toString("base64"),
    mimeType: mime,
    fileExtension: ext || undefined,
    language: "zh",
    source: "detect",
  });
  return { text: res.text, audioUrl: res.audioUrl, durationMs: nowMs() - start };
}

const DASHSCOPE_ASR_URL =
  process.env.DASHSCOPE_ASR_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DASHSCOPE_ASR_KEY = process.env.DASHSCOPE_API_KEY;
if (!DASHSCOPE_ASR_KEY) {
  throw new Error("DASHSCOPE_API_KEY is required for eval ASR. Set it in .env.");
}
const DASHSCOPE_ASR_MODEL = process.env.DASHSCOPE_ASR_MODEL ?? "qwen3-asr-flash";

const ASR_MAX_SECONDS = Number(process.env.ASR_MAX_SECONDS ?? 150);
const ASR_SIZE_THRESHOLD = Number(process.env.ASR_SIZE_THRESHOLD ?? 2.4 * 1024 * 1024); // ~150s @ 128kbps

async function trimAudioIfLong(abs, ext) {
  const info = await stat(abs);
  if (info.size <= ASR_SIZE_THRESHOLD) return { path: abs, trimmed: false };
  const workDir = resolve(tmpdir(), "eval-asr");
  await mkdir(workDir, { recursive: true });
  const out = resolve(workDir, `${basename(abs, `.${ext}`)}.trim.${ext}`);
  await new Promise((ok, rej) => {
    const ff = spawn("ffmpeg", ["-y", "-i", abs, "-t", String(ASR_MAX_SECONDS), "-acodec", "copy", out], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    ff.stderr.on("data", (c) => { err += c.toString(); });
    ff.on("exit", (code) => (code === 0 ? ok() : rej(new Error(`ffmpeg exit ${code}: ${err.slice(-200)}`))));
    ff.on("error", rej);
  });
  return { path: out, trimmed: true };
}

// Client-side transcription via DashScope Qwen3-ASR Flash. Avoids the server
// voice.transcribe path (which requires Volc speech keys + forge storage).
export async function transcribeAudioDashScope(datasetRoot, relativePath) {
  const absOrig = resolve(datasetRoot, relativePath);
  const ext = (extname(relativePath).toLowerCase().replace(/^\./, "") || "mp3");
  const { path: abs } = await trimAudioIfLong(absOrig, ext);
  const buf = await readFile(abs);
  const { mime } = guessMime(relativePath, AUDIO_MIME, "audio/mpeg");
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  const start = nowMs();
  const body = JSON.stringify({
    model: DASHSCOPE_ASR_MODEL,
    messages: [{ role: "user", content: [{ type: "audio", audio: dataUrl }] }],
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(DASHSCOPE_ASR_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${DASHSCOPE_ASR_KEY}`, "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`DashScope ASR failed (${res.status}): ${t.slice(0, 240)}`);
      }
      const payload = await res.json();
      const text = payload?.choices?.[0]?.message?.content ?? "";
      return { text, audioUrl: "", durationMs: nowMs() - start, ext };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("DashScope ASR failed after retries");
}

export async function analyzeCase(args) {
  const start = nowMs();
  const res = await trpc.antiFraud.analyze.mutate({
    inputMode: args.inputMode,
    text: args.text ?? "",
    transcript: args.transcript ?? "",
    imageUri: args.imageUri,
    audioUri: args.audioUri,
    conversationId: args.conversationId,
    deviceId: args.deviceId ?? args.conversationId ?? "eval-runner",
  });
  return { response: res, durationMs: nowMs() - start };
}

export async function statusProbe() {
  return trpc.antiFraud.status.query();
}
