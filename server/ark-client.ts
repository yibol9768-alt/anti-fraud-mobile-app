import { ENV } from "./_core/env";

export type ArkRole = "system" | "user" | "assistant";

export interface ArkTextContentPart {
  type: "text";
  text: string;
}

export interface ArkImageContentPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high" | "auto";
    image_pixel_limit?: {
      max_pixels?: number;
      min_pixels?: number;
    };
  };
}

export type ArkChatContentPart = ArkTextContentPart | ArkImageContentPart;

export interface ArkChatMessage {
  role: ArkRole;
  content: string | ArkChatContentPart[];
}

export interface ArkChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ArkEmbeddingOptions {
  model?: string;
}

export type ArkMultimodalEmbeddingPart = ArkTextContentPart | ArkImageContentPart;

interface ArkChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: ArkRole;
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string;
  }>;
}

interface ArkEmbeddingResponse {
  model?: string;
  data?: Array<{
    index?: number;
    embedding?: number[];
  }>;
}

interface ArkMultimodalEmbeddingResponse {
  model?: string;
  data?: Array<{
    index?: number;
    embedding?: number[];
  }>;
  embedding?: number[];
}

function normalizeBaseUrl() {
  return ENV.arkApiBaseUrl.replace(/\/$/, "");
}

function buildHeaders() {
  if (!ENV.arkApiKey) {
    throw new Error("ARK_API_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${ENV.arkApiKey}`,
    "Content-Type": "application/json",
  };
}

type ArkMessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | undefined;

function extractTextContent(content: ArkMessageContent) {
  if (typeof content === "string") {
    // Defensive: if the string has pathological per-character newlines
    // (e.g. "你\n好\n！"), collapse them into a clean string.
    return cleanPerCharNewlines(content.trim());
  }

  if (Array.isArray(content)) {
    // Filter to only text-type parts (exclude thinking/reasoning blocks)
    // and join WITHOUT separators to avoid one-character-per-line output.
    return content
      .filter((item) => {
        // Keep items without type (plain text parts) or with type === "text"
        return !item.type || item.type === "text";
      })
      .map((item) => item?.text?.trim() ?? "")
      .filter(Boolean)
      .join("")
      .trim();
  }

  return "";
}

/**
 * Detects and collapses pathological per-character newlines.
 * e.g. "你\n好\n！\n我\n是" -> "你好！我是"
 * Only triggers when most lines are 1-2 chars (clearly broken formatting).
 */
function cleanPerCharNewlines(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const shortLineCount = lines.filter((l) => l.trim().length <= 2).length;
  // If more than 70% of lines are very short, it's pathological
  if (shortLineCount / lines.length > 0.7) {
    return lines.map((l) => l.trim()).join("");
  }
  return text;
}

async function requestArk<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl()}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ark request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

function findNumericVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => typeof item === "number")) {
      return value as number[];
    }

    for (const item of value) {
      const nested = findNumericVector(item);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const vector = findNumericVector(nested);
      if (vector) {
        return vector;
      }
    }
  }

  return null;
}

export function hasArkRuntimeConfig() {
  return Boolean(ENV.arkApiKey && ENV.arkModel);
}

export function hasArkEmbeddingRuntimeConfig() {
  return Boolean(ENV.arkApiKey && ENV.arkEmbeddingModel);
}

export async function runArkChat(messages: ArkChatMessage[], options: ArkChatOptions = {}) {
  const model = options.model ?? ENV.arkModel;

  if (!model) {
    throw new Error("ARK_MODEL is not configured");
  }

  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 700,
  };

  const data = await requestArk<ArkChatResponse>("/chat/completions", payload);
  const firstChoice = data.choices?.[0];
  const content = extractTextContent(firstChoice?.message?.content);

  if (!content) {
    throw new Error("Ark chat returned empty content");
  }

  return {
    content,
    model: data.model ?? payload.model,
    finishReason: firstChoice?.finish_reason ?? "unknown",
    raw: data,
  };
}

export function hasTextEmbeddingRuntimeConfig() {
  return Boolean(ENV.embeddingApiKey && ENV.embeddingModel && ENV.embeddingApiBaseUrl);
}

export async function runArkEmbeddings(input: string | string[], options: ArkEmbeddingOptions = {}) {
  const inputs = Array.isArray(input) ? input : [input];
  const apiKey = ENV.embeddingApiKey;
  const baseUrl = (ENV.embeddingApiBaseUrl || ENV.arkApiBaseUrl).replace(/\/$/, "");
  const model = options.model ?? ENV.embeddingModel;

  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY (or ARK_API_KEY) is not configured");
  }
  if (!model) {
    throw new Error("EMBEDDING_MODEL (or ARK_EMBEDDING_MODEL) is not configured");
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: inputs }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embeddings request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ArkEmbeddingResponse;
  const vectors = (data.data ?? [])
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding ?? []);

  if (vectors.length !== inputs.length || vectors.some((item) => item.length === 0)) {
    throw new Error("Embeddings returned invalid vectors");
  }

  return {
    vectors,
    model: data.model ?? model,
    raw: data,
  };
}

export async function runArkMultimodalEmbedding(parts: ArkMultimodalEmbeddingPart[], options: ArkEmbeddingOptions = {}) {
  const normalizedParts = parts.filter((item) => {
    if (item.type === "text") {
      return item.text.trim().length > 0;
    }

    return item.image_url.url.trim().length > 0;
  });

  const model = options.model ?? ENV.arkEmbeddingModel;

  if (!model) {
    throw new Error("ARK_EMBEDDING_MODEL is not configured");
  }

  if (normalizedParts.length === 0) {
    throw new Error("Ark multimodal embedding input is empty");
  }

  const payload = {
    model,
    input: normalizedParts,
  };

  const data = await requestArk<ArkMultimodalEmbeddingResponse>("/embeddings/multimodal", payload);
  const vector = findNumericVector(data);

  if (!vector || vector.length === 0) {
    throw new Error("Ark multimodal embedding returned invalid vectors");
  }

  return {
    vector,
    model: data.model ?? payload.model,
    raw: data,
  };
}
