import { describe, expect, it } from "vitest";

import {
  analyzeFraudLocally,
  buildSafetyReport,
  createInitialMemorySnapshot,
  mergeMemoryAfterAnalysis,
} from "@/lib/anti-fraud-engine";

describe("anti fraud engine", () => {
  it("识别投资理财诈骗并返回高风险结果", () => {
    const memory = createInitialMemorySnapshot();

    const result = analyzeFraudLocally({
      inputMode: "text",
      text: "老师说今晚有内幕消息，保证稳赚不赔，让我先转 5000 到投资平台账户。",
      shortTerm: memory.shortTerm,
      longTerm: memory.longTerm,
    });

    expect(result.fraudType).toBe("investment_scam");
    expect(result.riskLevel).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.knowledgeHits.length).toBeGreaterThan(0);
    expect(result.suggestions.join(" ")).toContain("转账");
  });

  it("在分析后追加短期记忆并沉淀长期风险标签", () => {
    const memory = createInitialMemorySnapshot();

    const result = analyzeFraudLocally({
      inputMode: "audio",
      text: "",
      transcript: "客服说我误开了会员，需要共享屏幕并下载软件才能退款。",
      shortTerm: memory.shortTerm,
      longTerm: memory.longTerm,
    });

    const nextMemory = mergeMemoryAfterAnalysis(
      memory,
      {
        inputMode: "audio",
        text: "",
        transcript: "客服说我误开了会员，需要共享屏幕并下载软件才能退款。",
        shortTerm: memory.shortTerm,
        longTerm: memory.longTerm,
      },
      result,
    );

    expect(nextMemory.shortTerm.length).toBeGreaterThan(memory.shortTerm.length);
    expect(nextMemory.longTerm.riskTags).toContain("shopping_refund");
    expect(nextMemory.recentEvents[0].fraudType).toBe("shopping_refund");
  });

  it("能够基于最新事件生成安全监测报告", () => {
    const memory = createInitialMemorySnapshot();
    const result = analyzeFraudLocally({
      inputMode: "image",
      text: "对方自称公安，说我的账户涉嫌洗钱，要把余额转入安全账户核验。",
      shortTerm: memory.shortTerm,
      longTerm: memory.longTerm,
    });
    const nextMemory = mergeMemoryAfterAnalysis(
      memory,
      {
        inputMode: "image",
        text: "对方自称公安，说我的账户涉嫌洗钱，要把余额转入安全账户核验。",
        shortTerm: memory.shortTerm,
        longTerm: memory.longTerm,
      },
      result,
    );

    const report = buildSafetyReport(nextMemory, result);

    expect(report.score).toBeGreaterThan(0);
    expect(report.trend.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.watchlist.length).toBeGreaterThan(0);
  });
});
