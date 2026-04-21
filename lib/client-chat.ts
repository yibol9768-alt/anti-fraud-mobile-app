import type { LongMemoryProfile } from "@/shared/anti-fraud";

const ARK_API_KEY = process.env.EXPO_PUBLIC_ARK_API_KEY ?? "";
const ARK_BASE_URL = (process.env.EXPO_PUBLIC_ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
const ARK_MODEL = process.env.EXPO_PUBLIC_ARK_MODEL ?? "doubao-seed-2-0-lite-260215";

export interface ClientChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface ClientChatRequest {
  message: string;
  history: ClientChatMessage[];
  longTerm?: LongMemoryProfile;
  riskContext?: string;
}

export interface ClientChatResponse {
  id: string;
  content: string;
  provider: "ark" | "fallback";
  isHighRisk: boolean;
  quickQuestions: string[];
  timestamp: string;
}

const MAX_HISTORY_TURNS = 12;

function buildSystemPrompt(longTerm?: LongMemoryProfile, riskContext?: string): string {
  const parts = [
    "你是明鉴，一个专注于帮助用户识别和防范电信网络诈骗的 AI 伙伴。",
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

function cleanPerCharNewlines(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  const shortLineCount = lines.filter((l) => l.trim().length <= 2).length;
  if (shortLineCount / lines.length > 0.7) {
    return lines.map((l) => l.trim()).join("");
  }
  return text;
}

function generateQuickQuestions(userMessage: string, isHighRisk: boolean): string[] {
  const questions: string[] = [];
  if (isHighRisk) {
    questions.push("我应该怎么保留证据？", "需要报警吗？", "如何联系银行冻结账户？");
  } else {
    if (userMessage.includes("电话") || userMessage.includes("来电")) {
      questions.push("对方还说了什么？", "来电号码是多少？");
    }
    if (userMessage.includes("短信") || userMessage.includes("消息")) {
      questions.push("短信里有链接吗？", "发送方号码是什么？");
    }
    if (userMessage.includes("转账") || userMessage.includes("汇款")) {
      questions.push("转了多少钱？", "转到了哪个账户？");
    }
    if (questions.length === 0) {
      questions.push("还有其他可疑的细节吗？", "这种情况持续多久了？");
    }
  }
  return questions.slice(0, 3);
}

function randomId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function clientChatSend(request: ClientChatRequest): Promise<ClientChatResponse> {
  if (!ARK_API_KEY) {
    throw new Error("Ark API key missing (EXPO_PUBLIC_ARK_API_KEY)");
  }

  const systemPrompt = buildSystemPrompt(request.longTerm, request.riskContext);
  const recentHistory = request.history.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));
  const arkMessages = [
    { role: "system", content: systemPrompt },
    ...recentHistory,
    { role: "user", content: request.message },
  ];

  const response = await fetch(`${ARK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      messages: arkMessages,
      temperature: 0.4,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Ark chat HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
  };
  const firstChoice = data.choices?.[0];
  const raw = firstChoice?.message?.content;
  let content = "";
  if (typeof raw === "string") content = raw;
  else if (Array.isArray(raw)) {
    content = raw.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text!).join("");
  }
  content = cleanPerCharNewlines(content.trim());
  if (!content) {
    throw new Error("Ark returned empty content");
  }

  const riskIndicators = ["高风险", "立即停止", "暂停操作", "不要转账", "不要提供验证码", "96110"];
  const isHighRisk = riskIndicators.some((k) => content.includes(k));
  const quickQuestions = generateQuickQuestions(request.message, isHighRisk);

  return {
    id: randomId(),
    content,
    provider: "ark",
    isHighRisk,
    quickQuestions,
    timestamp: new Date().toISOString(),
  };
}
