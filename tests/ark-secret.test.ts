import { describe, expect, it } from "vitest";

import "../scripts/load-env.js";

async function tryArkEndpoint(
  url: string,
  payload: Record<string, unknown>,
  apiKey: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

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

describe("Ark runtime secrets", () => {
  it(
    "can reach a lightweight Ark model endpoint with the configured secret",
    async () => {
      const apiKey = process.env.ARK_API_KEY;
      const model = process.env.ARK_MODEL;
      const baseUrl = (process.env.ARK_API_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");

      expect(apiKey).toBeTruthy();
      expect(model).toBeTruthy();

      const attempts = [
        {
          name: "responses",
          url: `${baseUrl}/responses`,
          payload: {
            model,
            input: "请只回复ok",
            max_output_tokens: 16,
          },
        },
        {
          name: "chat_completions",
          url: `${baseUrl}/chat/completions`,
          payload: {
            model,
            messages: [{ role: "user", content: "请只回复ok" }],
            temperature: 0,
            max_tokens: 16,
          },
        },
      ];

      const failures: string[] = [];

      for (const attempt of attempts) {
        const result = await tryArkEndpoint(attempt.url, attempt.payload, apiKey as string);
        if (result.ok && result.text.trim().length > 0) {
          expect(result.ok).toBe(true);
          return;
        }
        failures.push(`${attempt.name}:${result.status}:${result.text.slice(0, 200)}`);
      }

      throw new Error(`Ark secret validation failed -> ${failures.join(" | ")}`);
    },
    20000,
  );
});
