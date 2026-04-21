import { describe, expect, it } from "vitest";

import "../scripts/load-env.js";

async function postJson(url: string, apiKey: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function findEmbeddingVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => typeof item === "number")) {
      return value as number[];
    }

    for (const item of value) {
      const nested = findEmbeddingVector(item);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const vector = findEmbeddingVector(nested);
      if (vector) {
        return vector;
      }
    }
  }

  return null;
}

describe("text embedding runtime secrets", () => {
  it(
    "can reach the configured text embedding endpoint (OpenAI-compat /embeddings)",
    async () => {
      const apiKey = process.env.EMBEDDING_API_KEY ?? process.env.ARK_API_KEY;
      const model = process.env.EMBEDDING_MODEL ?? process.env.ARK_EMBEDDING_MODEL;
      const baseUrl = (
        process.env.EMBEDDING_API_BASE_URL ??
        process.env.ARK_API_BASE_URL ??
        "https://ark.cn-beijing.volces.com/api/v3"
      ).replace(/\/$/, "");

      expect(apiKey).toBeTruthy();
      expect(model).toBeTruthy();

      const result = await postJson(`${baseUrl}/embeddings`, apiKey as string, {
        model,
        input: "天很蓝，海很深",
      });

      if (!result.ok) {
        throw new Error(`Text embedding validation failed (${result.status}): ${result.text.slice(0, 300)}`);
      }

      const payload = JSON.parse(result.text) as Record<string, unknown>;
      const embedding = findEmbeddingVector(payload);

      expect(embedding).not.toBeNull();
      expect((embedding?.length ?? 0)).toBeGreaterThan(0);
    },
    25000,
  );
});
