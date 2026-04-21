import { describe, expect, it } from "vitest";

describe("ARK API secret validation", () => {
  it("can access the Ark models endpoint with the configured API key", async () => {
    const apiKey = process.env.ARK_API_KEY;

    expect(apiKey, "ARK_API_KEY 未配置").toBeTruthy();

    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const bodyText = await response.text();

    expect(response.ok, `Ark 模型列表接口校验失败: ${response.status} ${bodyText}`).toBe(true);

    const data = JSON.parse(bodyText) as { data?: Array<{ id?: string }> };
    expect(Array.isArray(data.data), "Ark 模型列表返回缺少 data 数组").toBe(true);
  }, 20000);
});
