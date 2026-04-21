/**
 * Dify 接入与 RAG 方案测试
 *
 * 验证：
 * 1. Dify 客户端可用性检查
 * 2. Dify 占位接口类型正确性
 * 3. 服务端 env 中 Dify 变量已预留
 * 4. chat-router 中 Dify 回退逻辑
 * 5. RAG 方案文档完整性
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Dify 接入占位配置", () => {
  it("server/dify-client.ts 存在且导出必要函数", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/dify-client.ts"), "utf-8");
    expect(content).toContain("isDifyAvailable");
    expect(content).toContain("sendDifyChat");
    expect(content).toContain("sendDifyCompletion");
    expect(content).toContain("DifyChatRequest");
    expect(content).toContain("DifyChatResponse");
    expect(content).toContain("DifyCompletionRequest");
    expect(content).toContain("DifyCompletionResponse");
  });

  it("server/_core/env.ts 中已预留 Dify 环境变量", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/_core/env.ts"), "utf-8");
    expect(content).toContain("DIFY_API_BASE_URL");
    expect(content).toContain("DIFY_API_KEY");
    expect(content).toContain("difyApiBaseUrl");
    expect(content).toContain("difyApiKey");
  });

  it("Dify 客户端在未配置时返回不可用", async () => {
    // 动态导入以测试运行时行为
    const difyClient = await import("../server/dify-client");
    // 在测试环境中 env vars 未设置，应返回 false
    expect(difyClient.isDifyAvailable()).toBe(false);
  });

  it("Dify 客户端在未配置时调用应抛出错误", async () => {
    const difyClient = await import("../server/dify-client");
    await expect(
      difyClient.sendDifyChat({ query: "test", user: "test" }),
    ).rejects.toThrow("Dify is not configured");
    await expect(
      difyClient.sendDifyCompletion({ inputs: { test: "test" }, user: "test" }),
    ).rejects.toThrow("Dify is not configured");
  });
});

describe("RAG 方案文档", () => {
  it("docs/rag-scheme.md 存在且包含关键章节", () => {
    const content = fs.readFileSync(path.join(ROOT, "docs/rag-scheme.md"), "utf-8");
    expect(content).toContain("方案概述");
    expect(content).toContain("主链路实现");
    expect(content).toContain("Embedding");
    expect(content).toContain("本地回退引擎");
    expect(content).toContain("Dify RAG 扩展");
    expect(content).toContain("测试方案");
    expect(content).toContain("性能指标");
  });

  it("docs/dify-integration-guide.md 存在且包含关键章节", () => {
    const content = fs.readFileSync(path.join(ROOT, "docs/dify-integration-guide.md"), "utf-8");
    expect(content).toContain("环境变量配置");
    expect(content).toContain("DIFY_API_BASE_URL");
    expect(content).toContain("DIFY_API_KEY");
    expect(content).toContain("服务端替换步骤");
    expect(content).toContain("Dify 工作流配置建议");
    expect(content).toContain("回退策略");
    expect(content).toContain("测试验证");
  });
});

describe("Chat Router 集成", () => {
  it("server/chat-router.ts 存在且包含必要的聊天功能", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/chat-router.ts"), "utf-8");
    expect(content).toContain("chatRouter");
    expect(content).toContain("send");
    expect(content).toContain("buildSystemPrompt");
    expect(content).toContain("quickQuestions");
    expect(content).toContain("isHighRisk");
  });

  it("server/routers.ts 中已注册 chat router", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("chatRouter");
    expect(content).toContain("chat: chatRouter");
  });
});

describe("Ark 主链路", () => {
  it("server/ark-client.ts 存在且包含 Embedding 功能", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/ark-client.ts"), "utf-8");
    expect(content).toContain("requestArk");
    expect(content).toContain("embeddings");
  });

  it("server/_core/env.ts 中已配置 Ark 环境变量", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/_core/env.ts"), "utf-8");
    expect(content).toContain("ARK_API_KEY");
    expect(content).toContain("ARK_MODEL");
    expect(content).toContain("ARK_EMBEDDING_MODEL");
    expect(content).toContain("arkApiBaseUrl");
  });
});

describe("本地回退引擎", () => {
  it("lib/anti-fraud-engine.ts 存在且包含回退分析功能", () => {
    const content = fs.readFileSync(path.join(ROOT, "lib/anti-fraud-engine.ts"), "utf-8");
    expect(content).toContain("analyzeFraudLocally");
    expect(content).toContain("score");
    expect(content).toContain("riskLevel");
  });
});

describe("Android 守护模块", () => {
  it("guardian-settings 页面存在且包含权限引导", () => {
    const content = fs.readFileSync(path.join(ROOT, "app/guardian-settings.tsx"), "utf-8");
    expect(content).toContain("PermissionCard");
    expect(content).toContain("toggleMonitoring");
    expect(content).toContain("可见守护模式");
    expect(content).toContain("权限授权引导");
    expect(content).toContain("安全说明");
  });

  it("原生守护模块类型定义完整", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "modules/a30-guardian/src/A30Guardian.types.ts"),
      "utf-8",
    );
    expect(content).toContain("GuardianPermissionState");
    expect(content).toContain("GuardianBootstrapState");
    expect(content).toContain("smsGranted");
    expect(content).toContain("mediaGranted");
    expect(content).toContain("notificationsGranted");
    expect(content).toContain("batteryOptimizationIgnored");
  });
});
