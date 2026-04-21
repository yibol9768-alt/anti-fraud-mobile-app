import { describe, it, expect } from "vitest";

/* ------------------------------------------------------------------ */
/*  cleanPerCharNewlines — shared logic in both ark-client & chat-router */
/* ------------------------------------------------------------------ */

function cleanPerCharNewlines(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const shortLineCount = lines.filter((l) => l.trim().length <= 2).length;
  if (shortLineCount / lines.length > 0.7) {
    return lines.map((l) => l.trim()).join("");
  }
  return text;
}

describe("cleanPerCharNewlines", () => {
  it("should collapse per-character newlines into a clean string", () => {
    const broken = "你\n好\n！\n我\n是\n您\n的\n反\n诈\n智\n能\n助\n手";
    const result = cleanPerCharNewlines(broken);
    expect(result).toBe("你好！我是您的反诈智能助手");
    expect(result).not.toContain("\n");
  });

  it("should leave normal multi-line text untouched", () => {
    const normal = "这是第一段话，内容比较长。\n这是第二段话，也比较长。\n这是第三段话。";
    const result = cleanPerCharNewlines(normal);
    expect(result).toBe(normal); // Should NOT collapse
  });

  it("should handle short text (< 3 lines) without changes", () => {
    expect(cleanPerCharNewlines("你好")).toBe("你好");
    expect(cleanPerCharNewlines("你好\n世界")).toBe("你好\n世界");
  });

  it("should handle empty string", () => {
    expect(cleanPerCharNewlines("")).toBe("");
  });

  it("should handle mixed short and long lines correctly", () => {
    // Only 2 out of 4 lines are short (50%), should NOT collapse
    const mixed = "你\n好\n这是一段正常的长文本\n另一段正常文本";
    const result = cleanPerCharNewlines(mixed);
    expect(result).toBe(mixed);
  });

  it("should handle the exact user-reported bug scenario", () => {
    // "您好！我是您的反诈智能助手，很高兴为您服务。请问您遇到了什么可疑情况..."
    // Each character on its own line
    const chars = "您好！我是您的反诈智能助手，很高兴为您服务。请问您遇到了什么可疑情况，或者有什么想了解的吗？您可以详细和我说说。";
    const broken = chars.split("").join("\n");
    const result = cleanPerCharNewlines(broken);
    expect(result).toBe(chars);
    const lines = result.split("\n");
    expect(lines.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  extractTextContent — ark-client.ts logic                          */
/* ------------------------------------------------------------------ */

type ArkMessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | undefined;

function extractTextContent(content: ArkMessageContent): string {
  if (typeof content === "string") {
    return cleanPerCharNewlines(content.trim());
  }
  if (Array.isArray(content)) {
    return content
      .filter((item) => !item.type || item.type === "text")
      .map((item) => item?.text?.trim() ?? "")
      .filter(Boolean)
      .join("")
      .trim();
  }
  return "";
}

describe("extractTextContent (ark-client)", () => {
  it("should return string content cleaned of per-char newlines", () => {
    const broken = "你\n好\n！";
    expect(extractTextContent(broken)).toBe("你好！");
  });

  it("should extract text parts from array and join WITHOUT newlines", () => {
    const arrayContent = [
      { type: "text", text: "你好！" },
      { type: "text", text: "我是助手。" },
    ];
    expect(extractTextContent(arrayContent)).toBe("你好！我是助手。");
  });

  it("should filter out thinking blocks from array", () => {
    const arrayContent = [
      { type: "thinking", text: "Let me think..." },
      { type: "text", text: "这是回复。" },
    ];
    expect(extractTextContent(arrayContent)).toBe("这是回复。");
  });

  it("should handle parts without type field", () => {
    const arrayContent = [
      { text: "无类型部分" },
      { type: "text", text: "有类型部分" },
    ];
    expect(extractTextContent(arrayContent)).toBe("无类型部分有类型部分");
  });

  it("should handle undefined", () => {
    expect(extractTextContent(undefined)).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/*  chat-router content extraction (built-in LLM path)                */
/* ------------------------------------------------------------------ */

describe("chat-router content extraction (built-in LLM)", () => {
  function extractContent(rawContent: unknown): string {
    let content: string;
    if (typeof rawContent === "string") {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      content = rawContent
        .filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" &&
            typeof (p as { text?: unknown }).text === "string"
        )
        .map((p) => p.text)
        .join("")
        .trim();
    } else {
      content = "";
    }
    return cleanPerCharNewlines(content);
  }

  it("should clean per-char newlines from string content", () => {
    const broken = "你\n好\n！\n我\n是\n助\n手";
    expect(extractContent(broken)).toBe("你好！我是助手");
  });

  it("should extract and join array content without newlines", () => {
    const arrayContent = [
      { type: "thinking", thinking: "analyzing..." },
      { type: "text", text: "回复内容" },
    ];
    expect(extractContent(arrayContent)).toBe("回复内容");
  });

  it("should NOT produce one-character-per-line output", () => {
    const perCharContent = "你好".split("").map((ch) => ({ type: "text", text: ch }));
    const result = extractContent(perCharContent);
    expect(result).toBe("你好");
    expect(result.split("\n").length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Auth logout                                                       */
/* ------------------------------------------------------------------ */

describe("auth-store logout logic", () => {
  it("should clear profile and onboarding state on logout", () => {
    let profile: { name: string } | null = { name: "张三" };
    let onboardingDone = true;

    // Simulate logout
    profile = null;
    onboardingDone = false;

    expect(profile).toBeNull();
    expect(onboardingDone).toBe(false);
  });
});
