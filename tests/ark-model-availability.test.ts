import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("ARK model availability", () => {
  it("can call chat completions with configured ARK_MODEL", async () => {
    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_MODEL;

    expect(apiKey, "ARK_API_KEY 未配置").toBeTruthy();
    expect(model, "ARK_MODEL 未配置").toBeTruthy();

    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "-H",
        "Content-Type: application/json",
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-d",
        JSON.stringify({
          model,
          messages: [{ role: "user", content: "请只回答ok" }],
          max_tokens: 16,
          temperature: 0,
        }),
      ],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );

    const data = JSON.parse(stdout) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      error?: {
        code?: string;
        message?: string;
      };
    };

    expect(data.error, JSON.stringify(data)).toBeUndefined();
    expect(data.choices?.[0]?.message?.content?.toLowerCase()).toContain("ok");
  }, 30000);
});
