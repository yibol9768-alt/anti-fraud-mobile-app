import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("@/server/ark-client", () => ({
  hasArkRuntimeConfig: () => false,
  hasArkEmbeddingRuntimeConfig: () => false,
  hasTextEmbeddingRuntimeConfig: () => false,
  runArkChat: vi.fn(),
  runArkMultimodalEmbedding: vi.fn().mockRejectedValue(new Error("embedding disabled in router tests")),
  runArkEmbeddings: vi.fn().mockRejectedValue(new Error("embedding disabled in router tests")),
}));

import { appRouter } from "@/server/routers";
import type { TrpcContext } from "@/server/_core/context";

function createCaller() {
  const ctx = {
    req: {} as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
    user: null,
  } satisfies TrpcContext;

  return appRouter.createCaller(ctx);
}

describe("antiFraud router", () => {
  it("返回与当前运行时配置一致的状态", async () => {
    const caller = createCaller();

    const status = await caller.antiFraud.status();

    expect(status.sessionCount).toBeGreaterThanOrEqual(0);

    if (status.difyReady) {
      expect(status.mode).toBe("dify-ready");
      expect(status.ragProvider).toBe("dify");
      return;
    }

    if (status.arkReady) {
      expect(status.mode).toBe("ark-ready");
      expect(status.ragProvider).toBe("ark+haystack-style-local");
      return;
    }

    expect(status.mode).toBe("local-fallback");
    expect(status.ragProvider).toBe("haystack-style-local");
  });

  it("能够完成一次本地分析并返回更新后的记忆与报告", async () => {
    const caller = createCaller();

    const result = await caller.antiFraud.analyze({
      deviceId: "device-a",
      inputMode: "text",
      text: "老师说今晚有内幕投资消息，先转 5000 到平台账户，明天保证能提现。",
    });

    expect(result.usedDify).toBe(false);
    expect(result.usedRag).toBe(true);
    expect(result.analysis.fraudType).toBe("investment_scam");
    expect(result.analysis.riskLevel).toBe("high");
    expect(result.analysis.knowledgeHits[0]?.source).toContain("haystack-style-local");
    expect(result.analysis.explanation.length).toBeGreaterThan(0);
    expect(result.analysis.suggestions.length).toBeGreaterThan(0);
    expect(result.memory.shortTerm.length).toBeGreaterThan(1);
    expect(result.report.recommendations.length).toBeGreaterThan(0);
  });

  it("能够同步记忆并据此生成报告", async () => {
    const caller = createCaller();

    const analyzed = await caller.antiFraud.analyze({
      deviceId: "device-b",
      inputMode: "audio",
      transcript: "客服说我误开了会员，要共享屏幕才能退款。",
    });

    const syncResult = await caller.antiFraud.syncMemory({
      deviceId: "device-b",
      memory: analyzed.memory,
    });

    const reportResult = await caller.antiFraud.buildReport({
      memory: syncResult.memory,
      latestAnalysis: analyzed.analysis,
    });

    expect(syncResult.success).toBe(true);
    expect(reportResult.report.score).toBeGreaterThan(0);
    expect(reportResult.report.trend.length).toBeGreaterThan(0);
    expect(reportResult.memory.recentEvents[0].fraudType).toBe("shopping_refund");
  });
});
