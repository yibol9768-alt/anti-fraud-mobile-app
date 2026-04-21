import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";

import { publicProcedure, router } from "./_core/trpc";
import { hasArkRuntimeConfig, runArkChat, type ArkChatMessage } from "./ark-client";
import { invokeLLM } from "./_core/llm";
import type { ShortMemoryEntry, LongMemoryProfile } from "../shared/anti-fraud";

/* ------------------------------------------------------------------ */
/*  Schemas                                                           */
/* ------------------------------------------------------------------ */

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
});

const longMemoryProfileSchema = z.object({
  nickname: z.string(),
  roleLabel: z.string(),
  ageGroup: z.string(),
  occupation: z.string(),
  sensitivity: z.number(),
  notes: z.array(z.string()),
  riskTags: z.array(z.string()),
  preferredGuardians: z.array(z.object({
    id: z.string(),
    name: z.string(),
    relation: z.string(),
    phone: z.string(),
    enabled: z.boolean(),
  })),
});

const chatSendSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(chatMessageSchema).default([]),
  longTerm: longMemoryProfileSchema.optional(),
  /** Optional: attach a risk context from a recent detection */
  riskContext: z.string().optional(),
});

const chatStartSchema = z.object({
  conversationId: z.string().optional(),
  longTerm: longMemoryProfileSchema.optional(),
});

/* ------------------------------------------------------------------ */
/*  In-memory conversation store (per conversation)                   */
/* ------------------------------------------------------------------ */

interface ConversationState {
  id: string;
  createdAt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  riskContext?: string;
}

const conversationStore = new Map<string, ConversationState>();

const MAX_HISTORY_TURNS = 12;

/* ------------------------------------------------------------------ */
/*  System prompt                                                     */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(longTerm?: z.infer<typeof longMemoryProfileSchema>, riskContext?: string) {
  const parts = [
    "你是 A30 反诈智能助手，一个专注于帮助用户识别和防范电信网络诈骗的 AI 伙伴。",
    "你的核心职责：",
    "1. 耐心倾听用户描述的可疑情况，通过追问厘清关键细节（对方身份、要求、涉及金额、时间线）",
    "2. 基于反诈知识判断风险等级，给出明确的风险评估和处置建议",
    "3. 在高风险场景中优先提醒用户暂停一切资金操作，并建议联系家人或拨打 96110",
    "4. 用简洁、温和、易懂的中文回复，适合老年用户理解",
    "5. 每次回复控制在 3-5 句话，避免信息过载",
    "",
    "关键原则：",
    "- 涉及转账、验证码、共享屏幕、安全账户时，必须立即发出高风险警告",
    "- 不要替用户做决定，但要给出清晰的行动建议",
    "- 如果用户情绪激动，先安抚再分析",
    "- 每轮回复末尾可以提出一个追问，帮助进一步了解情况",
  ];

  if (longTerm) {
    const profile = [
      longTerm.nickname ? `昵称：${longTerm.nickname}` : null,
      longTerm.ageGroup ? `年龄段：${longTerm.ageGroup}` : null,
      longTerm.occupation ? `职业：${longTerm.occupation}` : null,
      longTerm.riskTags.length > 0 ? `历史风险标签：${longTerm.riskTags.join("、")}` : null,
      longTerm.notes.length > 0 ? `备注：${longTerm.notes.join("；")}` : null,
    ].filter((v): v is string => v !== null);

    if (profile.length > 0) {
      parts.push("", "当前用户画像：", ...profile);
    }
  }

  if (riskContext) {
    parts.push("", "最近一次风险检测上下文：", riskContext);
    parts.push("请结合这个上下文继续与用户对话，帮助用户理解风险并采取行动。");
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Text cleanup helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Detects and collapses pathological per-character newlines.
 * e.g. "你\n好\n！\n我\n是" -> "你好！我是"
 * Only triggers when most lines are 1-2 chars (clearly broken formatting).
 */
function cleanPerCharNewlines(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const shortLineCount = lines.filter((l) => l.trim().length <= 2).length;
  if (shortLineCount / lines.length > 0.7) {
    return lines.map((l) => l.trim()).join("");
  }
  return text;
}

/* ------------------------------------------------------------------ */
/*  LLM call abstraction (Ark first, fallback to built-in)            */
/* ------------------------------------------------------------------ */

async function callLLM(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  // Try Ark first
  if (hasArkRuntimeConfig()) {
    try {
      const arkMessages: ArkChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await runArkChat(arkMessages, {
        temperature: 0.4,
        maxTokens: 600,
      });

      return {
        content: cleanPerCharNewlines(result.content),
        provider: "ark" as const,
      };
    } catch (error) {
      console.warn("Ark chat failed, falling back to built-in LLM", error);
    }
  }

  // Fallback to built-in LLM
  try {
    const result = await invokeLLM({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      maxTokens: 600,
    });

    const firstChoice = result.choices?.[0];
    const rawContent = firstChoice?.message?.content;
    let content = typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        // Filter to only text-type parts (exclude thinking/reasoning blocks)
        // and join without separators to get a clean response string
        ? rawContent
            .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof (p as { text?: unknown }).text === "string")
            .map((p) => p.text)
            .join("")
            .trim()
        : "";

    // Defensive: collapse pathological per-character newlines
    content = cleanPerCharNewlines(content);

    if (!content.trim()) {
      throw new Error("Built-in LLM returned empty content");
    }

    return {
      content: content.trim(),
      provider: "built-in" as const,
    };
  } catch (error) {
    console.warn("Built-in LLM also failed", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "智能助手暂时无法响应，请稍后再试。",
      cause: error,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

export const chatRouter = router({
  /** Start or resume a conversation */
  start: publicProcedure.input(chatStartSchema).mutation(({ input }) => {
    const conversationId = input.conversationId || randomUUID();

    if (!conversationStore.has(conversationId)) {
      const systemPrompt = buildSystemPrompt(input.longTerm);
      conversationStore.set(conversationId, {
        id: conversationId,
        createdAt: new Date().toISOString(),
        messages: [{ role: "system", content: systemPrompt }],
      });
    }

    return {
      conversationId,
      greeting: "你好！我是 A30 反诈助手。如果你遇到了可疑的电话、短信或网络信息，可以随时告诉我，我会帮你分析风险并给出建议。请问有什么我可以帮你的？",
    };
  }),

  /** Send a message and get a response */
  send: publicProcedure.input(chatSendSchema).mutation(async ({ input }) => {
    const { conversationId, message, history, longTerm, riskContext } = input;

    // Get or create conversation state
    let conversation = conversationStore.get(conversationId);
    if (!conversation) {
      const systemPrompt = buildSystemPrompt(longTerm, riskContext);
      conversation = {
        id: conversationId,
        createdAt: new Date().toISOString(),
        messages: [{ role: "system", content: systemPrompt }],
        riskContext,
      };
      conversationStore.set(conversationId, conversation);
    }

    // If risk context is newly provided, update system prompt
    if (riskContext && riskContext !== conversation.riskContext) {
      conversation.riskContext = riskContext;
      const updatedSystemPrompt = buildSystemPrompt(longTerm, riskContext);
      conversation.messages[0] = { role: "system", content: updatedSystemPrompt };
    }

    // Build message list for LLM
    const systemMessage = conversation.messages[0];
    const recentHistory = history.slice(-MAX_HISTORY_TURNS).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const llmMessages = [
      systemMessage,
      ...recentHistory,
      { role: "user" as const, content: message },
    ];

    // Call LLM
    const response = await callLLM(llmMessages);

    // Store in conversation
    conversation.messages.push(
      { role: "user", content: message },
      { role: "assistant", content: response.content },
    );

    // Trim conversation history if too long
    if (conversation.messages.length > MAX_HISTORY_TURNS * 2 + 1) {
      const system = conversation.messages[0];
      conversation.messages = [
        system,
        ...conversation.messages.slice(-(MAX_HISTORY_TURNS * 2)),
      ];
    }

    // Detect risk level from response
    const riskIndicators = ["高风险", "立即停止", "暂停操作", "不要转账", "不要提供验证码", "96110"];
    const isHighRisk = riskIndicators.some((indicator) => response.content.includes(indicator));

    // Generate quick follow-up questions
    const quickQuestions = generateQuickQuestions(message, response.content, isHighRisk);

    return {
      id: randomUUID(),
      conversationId,
      content: response.content,
      provider: response.provider,
      isHighRisk,
      quickQuestions,
      timestamp: new Date().toISOString(),
    };
  }),

  /** Get conversation status */
  status: publicProcedure.query(() => {
    return {
      activeConversations: conversationStore.size,
      arkReady: hasArkRuntimeConfig(),
    };
  }),

  /** Clear a conversation */
  clear: publicProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .mutation(({ input }) => {
      conversationStore.delete(input.conversationId);
      return { success: true };
    }),
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function generateQuickQuestions(userMessage: string, assistantResponse: string, isHighRisk: boolean): string[] {
  const questions: string[] = [];

  if (isHighRisk) {
    questions.push("我应该怎么保留证据？");
    questions.push("需要报警吗？");
    questions.push("如何联系银行冻结账户？");
  } else {
    if (userMessage.includes("电话") || userMessage.includes("来电")) {
      questions.push("对方还说了什么？");
      questions.push("来电号码是多少？");
    }
    if (userMessage.includes("短信") || userMessage.includes("消息")) {
      questions.push("短信里有链接吗？");
      questions.push("发送方号码是什么？");
    }
    if (userMessage.includes("转账") || userMessage.includes("汇款")) {
      questions.push("转了多少钱？");
      questions.push("转到了哪个账户？");
    }
    if (questions.length === 0) {
      questions.push("还有其他可疑的细节吗？");
      questions.push("这种情况持续多久了？");
    }
  }

  return questions.slice(0, 3);
}
