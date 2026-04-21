import { describe, expect, it } from "vitest";

import {
  buildBlockRecordText,
  buildFamilyReminder,
  buildGuardianReminder,
  buildShareSummaryText,
  extractBlacklistHits,
  getSceneByMode,
  inferAudioMeta,
  inferImageMeta,
} from "./elder-assist";

describe("elder assist helpers", () => {
  it("maps input modes to the expected defense scenes", () => {
    expect(getSceneByMode("audio")).toBe("phone");
    expect(getSceneByMode("image")).toBe("screenshot");
    expect(getSceneByMode("text")).toBe("sms");
  });

  it("infers image metadata from mime type and file extension", () => {
    expect(inferImageMeta("file:///tmp/demo.png")).toEqual({
      mimeType: "image/png",
      fileExtension: "png",
    });

    expect(inferImageMeta("content://photo/123", "image/heic")).toEqual({
      mimeType: "image/heic",
      fileExtension: "heic",
    });

    expect(inferImageMeta("file:///tmp/unknown.bin")).toEqual({
      mimeType: "image/jpeg",
      fileExtension: "jpg",
    });
  });

  it("infers audio metadata from uri and platform fallback", () => {
    expect(inferAudioMeta("file:///tmp/voice.m4a", "android")).toEqual({
      mimeType: "audio/m4a",
      fileExtension: "m4a",
    });

    expect(inferAudioMeta("file:///tmp/voice.wav", "ios")).toEqual({
      mimeType: "audio/wav",
      fileExtension: "wav",
    });

    expect(inferAudioMeta("file:///tmp/voice.unknown", "ios")).toEqual({
      mimeType: "audio/m4a",
      fileExtension: "m4a",
    });

    expect(inferAudioMeta("file:///tmp/voice.unknown", "android")).toEqual({
      mimeType: "audio/webm",
      fileExtension: "webm",
    });
  });

  it("builds encoded reminders for guardians and family", () => {
    const guardian = decodeURIComponent(buildGuardianReminder());
    const family = decodeURIComponent(buildFamilyReminder("疑似冒充客服并催促转账"));

    expect(guardian).toContain("可疑电话");
    expect(guardian).toContain("验证码");
    expect(family).toContain("疑似冒充客服并催促转账");
    expect(family).toContain("下载会议软件");
  });

  it("builds a readable risk summary for sharing", () => {
    const summary = buildShareSummaryText({
      generatedAt: "今天 08:30",
      score: 88,
      riskLevel: "high",
      fraudType: "impersonation",
      headline: "近期发现 1 次高风险线索",
      explanation: "对方要求共享屏幕并转入安全账户，属于高危话术。",
      reasons: ["对方持续催促转账", "要求提供验证码"],
      suggestions: ["立即挂断电话", "联系家人核验"],
    });

    expect(summary).toContain("A30 多模态反诈智能助手风险摘要");
    expect(summary).toContain("高风险");
    expect(summary).toContain("本次识别：");
    expect(summary).toContain("1. 对方持续催促转账");
    expect(summary).toContain("2. 联系家人核验");
  });

  it("extracts blacklist hits from suspicious text content", () => {
    const hits = extractBlacklistHits(
      "对方让我把验证码发过去，还说要转到安全账户，点开 https://fake.example 下载会议软件，并回拨 13800138000。",
    );

    expect(hits.some((item) => item.value === "验证码")).toBe(true);
    expect(hits.some((item) => item.value === "安全账户")).toBe(true);
    expect(hits.some((item) => item.category === "link")).toBe(true);
    expect(hits.some((item) => item.category === "phone")).toBe(true);
  });

  it("builds a block record text with hits and suggested actions", () => {
    const record = buildBlockRecordText(
      "疑似冒充客服并要求共享屏幕",
      [
        { category: "keyword", value: "共享屏幕", reason: "可能暴露验证码和支付页面。" },
        { category: "phone", value: "13800138000", reason: "不要直接回拨文本中的号码。" },
      ],
      ["立即挂断电话", "联系家人核验"],
    );

    expect(record).toContain("A30 主动防御处置记录");
    expect(record).toContain("风险摘要：疑似冒充客服并要求共享屏幕");
    expect(record).toContain("[keyword] 共享屏幕");
    expect(record).toContain("[phone] 13800138000");
    expect(record).toContain("2. 联系家人核验");
  });
});
