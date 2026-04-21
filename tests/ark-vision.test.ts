import { describe, expect, it } from "vitest";

import "../scripts/load-env.js";

const SAMPLE_IMAGE_URL = "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png";

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

describe("Ark vision capability", () => {
  it(
    "verifies whether the configured Doubao model accepts image input",
    async () => {
      const apiKey = process.env.ARK_API_KEY;
      const model = process.env.ARK_MODEL;
      const baseUrl = (process.env.ARK_API_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");

      expect(apiKey).toBeTruthy();
      expect(model).toBeTruthy();

      const attempts = [
        {
          name: "responses_api",
          url: `${baseUrl}/responses`,
          payload: {
            model,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_image",
                    image_url: SAMPLE_IMAGE_URL,
                    detail: "high",
                  },
                  {
                    type: "input_text",
                    text: "请用一句中文简述这张图里有什么。",
                  },
                ],
              },
            ],
            max_output_tokens: 80,
          },
        },
        {
          name: "chat_completions",
          url: `${baseUrl}/chat/completions`,
          payload: {
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: SAMPLE_IMAGE_URL,
                      detail: "high",
                    },
                  },
                  {
                    type: "text",
                    text: "请用一句中文简述这张图里有什么。",
                  },
                ],
              },
            ],
            temperature: 0,
            max_tokens: 80,
          },
        },
      ];

      const results: string[] = [];

      for (const attempt of attempts) {
        const result = await postJson(attempt.url, apiKey as string, attempt.payload);
        results.push(`${attempt.name}:${result.status}:${result.text.slice(0, 220)}`);
        if (result.ok && /图|图片|表格|模型|支持|输入|看到|显示|内容/.test(result.text)) {
          expect(result.ok).toBe(true);
          return;
        }
      }

      throw new Error(`Configured model did not confirm vision support -> ${results.join(" | ")}`);
    },
    25000,
  );
});
