import { z } from "zod";

import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import {
  analyzeFraudLocally,
  matchSafeHints,
  buildSafetyReport,
  createInitialMemorySnapshot,
  mergeMemoryAfterAnalysis,
} from "../lib/anti-fraud-engine";
import type {
  AnalysisInput,
  AnalysisResult,
  AnalyzeResponse,
  FraudType,
  KnowledgeHit,
  MemorySnapshot,
  ReportResponse,
} from "../shared/anti-fraud";
import { publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import {
  hasArkRuntimeConfig,
  hasTextEmbeddingRuntimeConfig,
  runArkChat,
  runArkEmbeddings,
  runArkMultimodalEmbedding,
} from "./ark-client";
import { storagePut } from "./storage";

const inputModeSchema = z.enum(["text", "audio", "image"]);
const riskLevelSchema = z.enum(["low", "medium", "high"]);
const fraudTypeSchema = z.enum([
  "phishing",
  "investment_scam",
  "impersonation",
  "shopping_refund",
  "loan_scam",
  "romance_scam",
  "unknown",
]);

const evidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  weight: z.number(),
});

const knowledgeHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  snippet: z.string(),
  similarity: z.number(),
  tags: z.array(z.string()),
});

const guardianSchema = z.object({
  id: z.string(),
  name: z.string(),
  relation: z.string(),
  phone: z.string(),
  enabled: z.boolean(),
});

const shortMemoryEntrySchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
  mode: inputModeSchema.optional(),
});

const longMemoryProfileSchema = z.object({
  nickname: z.string(),
  roleLabel: z.string(),
  ageGroup: z.string(),
  occupation: z.string(),
  sensitivity: z.number(),
  notes: z.array(z.string()),
  riskTags: z.array(z.string()),
  preferredGuardians: z.array(guardianSchema),
});

const fraudEventSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  title: z.string(),
  summary: z.string(),
  riskLevel: riskLevelSchema,
  fraudType: fraudTypeSchema,
  score: z.number(),
  sourceMode: inputModeSchema,
  conversationId: z.string().optional(),
});

const memorySnapshotSchema = z.object({
  shortTerm: z.array(shortMemoryEntrySchema),
  longTerm: longMemoryProfileSchema,
  recentEvents: z.array(fraudEventSchema),
});

const analysisResultSchema = z.object({
  eventId: z.string(),
  conversationId: z.string(),
  riskLevel: riskLevelSchema,
  fraudType: fraudTypeSchema,
  score: z.number(),
  summary: z.string(),
  explanation: z.string(),
  evidences: z.array(evidenceSchema),
  suggestions: z.array(z.string()),
  knowledgeHits: z.array(knowledgeHitSchema),
  quickQuestions: z.array(z.string()),
  reportMessage: z.string(),
});

const reportMetricPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});

const safetyReportSchema = z.object({
  generatedAt: z.string(),
  headline: z.string(),
  overview: z.string(),
  score: z.number(),
  trend: z.array(reportMetricPointSchema),
  typeDistribution: z.array(reportMetricPointSchema),
  recommendations: z.array(z.string()),
  watchlist: z.array(z.string()),
});

const analyzeInputSchema = z.object({
  deviceId: z.string().min(1).optional(),
  inputMode: inputModeSchema,
  text: z.string().default(""),
  transcript: z.string().optional().default(""),
  imageUri: z.string().optional(),
  audioUri: z.string().optional(),
  conversationId: z.string().optional(),
  memory: memorySnapshotSchema.optional(),
});

const uploadImageInputSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  fileExtension: z.string().optional(),
  source: z.enum(["detect", "conversation", "report"]).default("detect"),
});

const reportInputSchema = z.object({
  memory: memorySnapshotSchema,
  latestAnalysis: analysisResultSchema.optional(),
});

const memoryUpdateSchema = z.object({
  deviceId: z.string().min(1),
  memory: memorySnapshotSchema,
});

const runtimeMemoryStore = new Map<string, MemorySnapshot>();

interface LocalRagDocument {
  id: string;
  title: string;
  source: string;
  fraudType: FraudType;
  tags: string[];
  body: string;
  recommendations: string[];
  priority: number;
}

const LOCAL_RAG_DOCUMENTS: LocalRagDocument[] = [
  {
    id: "case-invest-01",
    title: "高收益投资群与导师带单骗局",
    source: "haystack-style-local/反诈案例库",
    fraudType: "investment_scam",
    tags: ["投资", "高收益", "导师带单", "平台充值"],
    body:
      "诈骗方通常先把用户拉入投资交流群，再以内幕消息、保本高收益、今晚跟单等话术制造紧迫感，最终诱导用户向陌生平台或私人账户持续充值。此类场景常伴随截图伪造、提现受限和继续加仓要求。",
    recommendations: [
      "不要继续向陌生平台或个人账户转账。",
      "保留群聊、转账和开户链接截图，优先核验平台备案信息。",
    ],
    priority: 0.98,
  },
  {
    id: "case-refund-02",
    title: "冒充客服退款并诱导共享屏幕",
    source: "haystack-style-local/平台安全提示",
    fraudType: "shopping_refund",
    tags: ["退款", "客服", "共享屏幕", "远程控制"],
    body:
      "当对方声称商品异常、误开会员、续费扣款或航空退改签时，往往会以退款验证为由要求用户下载会议软件、开启共享屏幕或提供验证码，从而进一步控制网银和支付工具。",
    recommendations: [
      "不要共享屏幕，也不要安装来路不明的远程控制软件。",
      "所有退款都应回到官方订单页或官方客服电话重新确认。",
    ],
    priority: 0.95,
  },
  {
    id: "case-impersonation-03",
    title: "冒充公检法要求转入安全账户",
    source: "haystack-style-local/公安公开案例",
    fraudType: "impersonation",
    tags: ["公安", "法院", "检察院", "安全账户", "保密"],
    body:
      "诈骗分子会以涉案、洗钱、账户冻结、保密办案为由施压，要求用户将资金转入所谓安全账户，或在电话中持续控制用户不与家人沟通。真实执法机构不会通过电话要求转账核验。",
    recommendations: [
      "立即中止通话并通过 110、96110 或机构官方号码回拨核实。",
      "不要因所谓保密要求切断与家人或同事的联系。",
    ],
    priority: 0.97,
  },
  {
    id: "case-loan-04",
    title: "低息贷款与征信修复手续费骗局",
    source: "haystack-style-local/金融消费者保护资料",
    fraudType: "loan_scam",
    tags: ["贷款", "征信", "手续费", "保证金"],
    body:
      "诈骗分子通常以低门槛、快速放款、征信修复为诱饵，要求用户先交保证金、刷流水、支付会员费或验证码。正规金融机构不会在放款前要求私下转账完成所谓资质验证。",
    recommendations: [
      "贷款前若被要求先交费，应立即停止操作。",
      "通过金融机构官方 App 或网点核验，不要相信私人聊天窗口中的放款承诺。",
    ],
    priority: 0.9,
  },
  {
    id: "case-romance-05",
    title: "情感建立后引导借款或博彩投资",
    source: "haystack-style-local/社交反诈案例",
    fraudType: "romance_scam",
    tags: ["恋爱", "交友", "借钱", "博彩", "一起赚钱"],
    body:
      "对方会通过密集陪伴、未来承诺与情绪价值降低防备，随后转向投资、博彩、借款或代收代付请求。这类场景的风险点不在单句关键词，而在关系建立后出现的资金要求。",
    recommendations: [
      "涉及感情关系中的借款和投资请求时，必须引入第三方核验。",
      "不要因对方提供的盈利截图就相信投资真实性。",
    ],
    priority: 0.88,
  },
  {
    id: "case-phishing-06",
    title: "钓鱼链接与验证码套取",
    source: "haystack-style-local/运营商与银行安全提醒",
    fraudType: "phishing",
    tags: ["钓鱼链接", "验证码", "银行", "短信通知"],
    body:
      "攻击者常伪装成物流、银行、支付平台或政务通知，诱导用户点击链接、输入银行卡信息或泄露验证码，随后完成盗刷、登录接管或支付授权。此类风险往往伴随紧急文案与仿冒页面。",
    recommendations: [
      "陌生链接不要直接点开，应改为手动进入官方页面核验。",
      "验证码只能输入在自己主动打开的官方页面，不能口头或截图发送给他人。",
    ],
    priority: 0.93,
  },
  {
    id: "guide-escalation-07",
    title: "高风险场景的通用止损动作",
    source: "haystack-style-local/处置指南",
    fraudType: "unknown",
    tags: ["止损", "核验", "保存证据", "96110"],
    body:
      "当场景同时出现紧迫催促、转账要求、验证码、共享屏幕或权威身份威压时，应立即暂停一切资金与账户操作，并保存聊天记录、来电号码、转账凭证与截图。若已发生转账，应尽快联系银行和反诈专线处理。",
    recommendations: [
      "先暂停，再核验，再保留证据。",
      "必要时联系银行、平台客服与 96110 同步处理。",
    ],
    priority: 0.92,
  },
  {
    id: "guide-guardian-08",
    title: "监护人与家庭协同防护建议",
    source: "haystack-style-local/家庭协同指南",
    fraudType: "unknown",
    tags: ["监护人", "家庭协同", "复核", "高龄用户"],
    body:
      "对于高龄人群、学生和近期频繁遭遇陌生转账请求的用户，应设置一位固定监护联系人参与高风险复核。应用在高危事件中优先提示联系家人或同事，可以显著降低被持续操控的概率。",
    recommendations: [
      "为高风险场景预设监护联系人与复核流程。",
      "当对方要求保密或阻断沟通时，优先联系可信家人确认。",
    ],
    priority: 0.86,
  },
];

const EMBEDDING_DIMENSIONS = 192;

function hasDifyRuntimeConfig() {
  return Boolean(ENV.difyApiBaseUrl && ENV.difyApiKey);
}

function resolveMemoryKey(input: z.infer<typeof analyzeInputSchema> | z.infer<typeof memoryUpdateSchema>) {
  return input.deviceId ?? "anonymous-device";
}

function pickWorkingMemory(input: z.infer<typeof analyzeInputSchema>) {
  if (input.memory) {
    return input.memory;
  }

  const memoryKey = resolveMemoryKey(input);
  return runtimeMemoryStore.get(memoryKey) ?? createInitialMemorySnapshot();
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u3000\n\r\t]+/g, " ")
    .replace(/[，。！？；：、“”‘’（）()【】\[\]{}<>《》,!?;:'"`~@#$%^&*_+=|\\/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSemanticUnits(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [] as string[];
  }

  const baseTokens = normalized.split(" ").filter(Boolean);
  const grams: string[] = [];

  for (const token of baseTokens) {
    const compact = token.replace(/\s+/g, "");
    if (compact.length <= 1) {
      grams.push(compact);
      continue;
    }

    grams.push(compact);
    for (let index = 0; index < compact.length - 1; index += 1) {
      grams.push(compact.slice(index, index + 2));
    }
  }

  return Array.from(new Set([...baseTokens, ...grams]));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function embedText(text: string) {
  const units = extractSemanticUnits(text);
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const unit of units) {
    const hashA = stableHash(unit);
    const hashB = stableHash(`${unit}:${unit.length}`);
    vector[hashA % EMBEDDING_DIMENSIONS] += 1;
    vector[hashB % EMBEDDING_DIMENSIONS] += unit.length > 2 ? 0.6 : 0.3;
  }

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => item / norm);
}

function cosineSimilarity(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return Number(total.toFixed(4));
}

const LOCAL_RAG_INDEX = LOCAL_RAG_DOCUMENTS.map((document) => {
  const searchableText = [document.title, document.body, document.tags.join(" "), document.recommendations.join(" ")].join("\n");
  return {
    document,
    searchableText,
    units: new Set(extractSemanticUnits(searchableText)),
    fallbackEmbedding: embedText(searchableText),
    remoteEmbedding: null as number[] | null,
  };
});

async function getArkReadyDocumentEmbedding(entry: (typeof LOCAL_RAG_INDEX)[number]) {
  if (!hasTextEmbeddingRuntimeConfig()) {
    return {
      vector: entry.fallbackEmbedding,
      provider: "local-hash" as const,
    };
  }

  if (entry.remoteEmbedding) {
    return {
      vector: entry.remoteEmbedding,
      provider: "remote-text" as const,
    };
  }

  try {
    const result = await runArkEmbeddings(entry.searchableText);
    entry.remoteEmbedding = result.vectors[0];

    return {
      vector: entry.remoteEmbedding,
      provider: "remote-text" as const,
    };
  } catch (error) {
    console.warn("document embedding failed, fallback to local hash embedding", error);
    return {
      vector: entry.fallbackEmbedding,
      provider: "local-hash" as const,
    };
  }
}

async function buildQueryEmbedding(input: AnalysisInput, query: string) {
  const rawImageUri = input.imageUri ?? "";
  const multimodalParts: Array<{
    type: "text";
    text: string;
  } | {
    type: "image_url";
    image_url: { url: string };
  }> = [];

  if (query.trim()) {
    multimodalParts.push({
      type: "text",
      text: query,
    });
  }

  if (isRemoteImageUrl(rawImageUri)) {
    multimodalParts.push({
      type: "image_url",
      image_url: {
        url: rawImageUri.trim(),
      },
    });
  }

  const hasImagePart = multimodalParts.some((part) => part.type === "image_url");

  if (hasImagePart && ENV.arkApiKey && ENV.arkEmbeddingModel && multimodalParts.length > 0) {
    try {
      const result = await runArkMultimodalEmbedding(multimodalParts);
      return {
        vector: result.vector,
        provider: "ark-multimodal" as const,
      };
    } catch (error) {
      console.warn("ark multimodal query embedding failed, fallback", error);
    }
  }

  if (!hasImagePart && hasTextEmbeddingRuntimeConfig() && query.trim()) {
    try {
      const result = await runArkEmbeddings(query);
      return {
        vector: result.vectors[0],
        provider: "remote-text" as const,
      };
    } catch (error) {
      console.warn("text query embedding failed, fallback to local hash embedding", error);
    }
  }

  return {
    vector: embedText(query),
    provider: "local-hash" as const,
  };
}

function buildRagQuery(input: AnalysisInput, localAnalysis: AnalysisResult) {
  return [
    input.text,
    input.transcript ?? "",
    ...input.shortTerm.slice(-4).map((item) => item.content),
    input.longTerm.roleLabel,
    input.longTerm.ageGroup,
    input.longTerm.occupation,
    input.longTerm.riskTags.join(" "),
    input.longTerm.notes.join(" "),
    localAnalysis.fraudType,
    ...localAnalysis.evidences.map((item) => `${item.label} ${item.detail}`),
    localAnalysis.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

function mapScoreToSimilarity(score: number) {
  const bounded = Math.max(0.55, Math.min(0.99, score));
  return Number(bounded.toFixed(2));
}

function inferFraudTypeFromHits(baseType: FraudType, hits: Array<{ document: LocalRagDocument }>) {
  if (baseType !== "unknown") {
    return baseType;
  }

  const resolved = hits.find((item) => item.document.fraudType !== "unknown");
  return resolved?.document.fraudType ?? baseType;
}

async function buildRepositoryInspiredLocalRag(input: AnalysisInput, localAnalysis: AnalysisResult) {
  const query = buildRagQuery(input, localAnalysis);
  const queryUnits = new Set(extractSemanticUnits(query));
  const queryEmbeddingResult = await buildQueryEmbedding(input, query);

  const ranked = (await Promise.all(
    LOCAL_RAG_INDEX.map(async (entry) => {
      const overlapCount = Array.from(queryUnits).filter((item) => entry.units.has(item)).length;
      const overlapScore = queryUnits.size > 0 ? overlapCount / queryUnits.size : 0;
      const entryEmbeddingResult = await getArkReadyDocumentEmbedding(entry);
      const semanticScore = cosineSimilarity(queryEmbeddingResult.vector, entryEmbeddingResult.vector);
      const typeBoost =
        localAnalysis.fraudType !== "unknown" && entry.document.fraudType === localAnalysis.fraudType ? 0.08 : 0;
      const memoryBoost = input.longTerm.riskTags.some((tag) => entry.document.tags.some((docTag) => docTag.includes(tag) || tag.includes(docTag)))
        ? 0.04
        : 0;
      const finalScore = semanticScore * 0.64 + overlapScore * 0.2 + entry.document.priority * 0.12 + typeBoost + memoryBoost;

      return {
        ...entry,
        overlapScore,
        semanticScore,
        finalScore,
        embeddingProvider: entryEmbeddingResult.provider,
      };
    }),
  ))
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, 5)
    .sort((left, right) => {
      const rerankLeft = left.finalScore + (left.document.fraudType === localAnalysis.fraudType ? 0.04 : 0) + left.overlapScore * 0.04;
      const rerankRight = right.finalScore + (right.document.fraudType === localAnalysis.fraudType ? 0.04 : 0) + right.overlapScore * 0.04;
      return rerankRight - rerankLeft;
    })
    .slice(0, 3);

  const resolvedFraudType = inferFraudTypeFromHits(localAnalysis.fraudType, ranked);
  const knowledgeHits: KnowledgeHit[] = ranked.map(({ document, finalScore }) => ({
    id: document.id,
    title: document.title,
    source: document.source,
    snippet: document.body,
    similarity: mapScoreToSimilarity(finalScore),
    tags: document.tags,
  }));

  const boostedScore = Math.min(
    98,
    localAnalysis.score + Math.round((ranked[0]?.finalScore ?? 0) * 6) + (resolvedFraudType === localAnalysis.fraudType ? 2 : 0),
  );
  const riskLevel = boostedScore >= 80 ? "high" : boostedScore >= 55 ? "medium" : "low";
  const explanation =
    knowledgeHits.length > 0
      ? `服务端已按 Haystack RAG App 的分层思路执行本地检索管线：先完成${queryEmbeddingResult.provider === "ark-multimodal" ? "多模态 Embedding 语义召回" : "本地语义召回"}，再结合诈骗类型与历史记忆做重排序，最终命中 ${knowledgeHits.length} 条高相关知识片段。最相关的参考来源为“${knowledgeHits[0].title}”，因此当前结论不再依赖单一关键词命中，而是综合相似案例、上下文与处置知识生成。`
      : localAnalysis.explanation;
  const suggestionAdditions = ranked.flatMap((item) => item.document.recommendations);
  const suggestions = Array.from(new Set([...localAnalysis.suggestions, ...suggestionAdditions])).slice(0, 5);
  const reportMessage = knowledgeHits.length > 0
    ? `本次检测已结合 ${knowledgeHits.length} 条检索证据完成解释，当前检索向量来源为${queryEmbeddingResult.provider === "ark-multimodal" ? "多模态 Embedding" : "本地回退向量"}，建议优先按高相关案例中的止损动作处理。`
    : localAnalysis.reportMessage;

  return {
    query,
    analysis: {
      ...localAnalysis,
      fraudType: resolvedFraudType,
      score: boostedScore,
      riskLevel,
      explanation,
      suggestions,
      knowledgeHits,
      reportMessage,
    } satisfies AnalysisResult,
  };
}

const KNOWN_FRAUD_TYPES: FraudType[] = [
  "phishing",
  "investment_scam",
  "impersonation",
  "shopping_refund",
  "loan_scam",
  "romance_scam",
  "unknown",
];

function coerceFraudType(value: unknown): FraudType | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if ((KNOWN_FRAUD_TYPES as string[]).includes(v)) return v as FraudType;
  // LLM sometimes emits descriptive labels. Map common variants back to the enum.
  if (/(face_?time|screen|共享|远控|远程)/.test(v)) return "shopping_refund";
  if (/(scam|fraud|phish|钓鱼|链接|验证码)/.test(v)) return "phishing";
  if (/(invest|理财|投资|带单|高收益)/.test(v)) return "investment_scam";
  if (/(imperson|冒充|公检法|公安|机构|政府)/.test(v)) return "impersonation";
  if (/(refund|退款|客服|取件|快递|会员|物流)/.test(v)) return "shopping_refund";
  if (/(loan|贷款|征信|保证金|额度)/.test(v)) return "loan_scam";
  if (/(romance|情感|婚恋|恋爱|交友|亲密)/.test(v)) return "romance_scam";
  return "unknown";
}

const arkOverlaySchema = z.object({
  summary: z.string().optional(),
  explanation: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  quickQuestions: z.array(z.string()).optional(),
  reportMessage: z.string().optional(),
  riskLevel: riskLevelSchema.optional(),
  // Loose: LLM sometimes invents labels; normalize in code via coerceFraudType.
  fraudType: z.unknown().optional(),
});

type RepositoryInspiredRagResult = Awaited<ReturnType<typeof buildRepositoryInspiredLocalRag>>;

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function isRemoteImageUrl(imageUri?: string) {
  if (typeof imageUri !== "string") return false;
  const v = imageUri.trim();
  return /^https?:\/\//i.test(v) || /^data:image\/[^;]+;base64,/i.test(v);
}

function stripDataUrlPrefix(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "").trim();
}

function resolveImageExtension(mimeType: string, preferred?: string) {
  if (preferred) {
    return preferred.replace(/^\./, "").toLowerCase();
  }

  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  return mimeMap[mimeType] ?? "jpg";
}

async function uploadAnalysisImage(input: z.infer<typeof uploadImageInputSchema>) {
  const cleanedBase64 = stripDataUrlPrefix(input.imageBase64);
  const imageBuffer = Buffer.from(cleanedBase64, "base64");

  if (!imageBuffer.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "图片内容为空，无法继续分析。",
    });
  }

  if (imageBuffer.length > 8 * 1024 * 1024) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "图片过大，请换一张更清晰但体积更小的截图后重试。",
    });
  }

  const extension = resolveImageExtension(input.mimeType, input.fileExtension);
  const datePrefix = new Date().toISOString().slice(0, 10);
  const storageKey = `anti-fraud/${input.source}/${datePrefix}/${randomUUID()}.${extension}`;
  return storagePut(storageKey, imageBuffer, input.mimeType);
}

function buildArkUserContent(input: AnalysisInput, repositoryInspired: RepositoryInspiredRagResult) {
  const contextText = repositoryInspired.analysis.knowledgeHits
    .map((item, index) => `#${index + 1} ${item.title}\n来源：${item.source}\n标签：${item.tags.join("、")}\n内容：${item.snippet}`)
    .join("\n\n");

  const textContent = [
    `输入方式：${input.inputMode}`,
    `用户文本：${input.text || "无"}`,
    `语音转写：${input.transcript || "无"}`,
    `图片线索：${input.imageUri ? (isRemoteImageUrl(input.imageUri) ? input.imageUri : "已收到本地图片引用，当前作为截图线索标记") : "无"}`,
    `长期画像：${JSON.stringify({
      roleLabel: input.longTerm.roleLabel,
      ageGroup: input.longTerm.ageGroup,
      occupation: input.longTerm.occupation,
      riskTags: input.longTerm.riskTags,
      notes: input.longTerm.notes,
    })}`,
    `短期记忆：${input.shortTerm.slice(-4).map((item) => item.content).join(" | ") || "无"}`,
    `本地初判：${JSON.stringify({
      riskLevel: repositoryInspired.analysis.riskLevel,
      fraudType: repositoryInspired.analysis.fraudType,
      score: repositoryInspired.analysis.score,
      summary: repositoryInspired.analysis.summary,
      evidences: repositoryInspired.analysis.evidences,
      suggestions: repositoryInspired.analysis.suggestions,
    })}`,
    `检索上下文：\n${contextText || "无"}`,
    "请独立判断 riskLevel。判定准则：\n1) 出现以下任一信号至少 medium —— 仿冒机构（〖XX局/院〗、含占位符 ****** 的发件或 URL）、紧迫话术（立即、马上、限时、否则）、要求用户点击陌生链接/拨打陌生个人手机号、资料/信息/身份核查/核验、亲密称呼+借款/垫付、非官方渠道的金融或资料操作。\n2) 出现多条信号或涉及『转入安全账户』『共享屏幕』『保证金』『按我说的操作』直接 high。\n3) 以下情形一律 low，即便话术包含『立即/马上/请稍候』等常见服务用语：(a) 发件方/通话方使用完整真实机构全名且仅引用官方通道（官方网站/官方 App/95xxx/10086/10000/950xxx/955xx/1008611 等已公开的客服热线/线下网点）；(b) 用户**主动**拨打企业官方客服（京东/淘宝/电信/联通/移动/银行/宽带运营商等）咨询账单、售后、维权、投诉、速率等问题；(c) 正规客服的 IVR 自动导航、排队提示、业务菜单播报；(d) 来电/短信提供真实业务线索（订单号、卡号尾 4 位、真实地址、真实账号），且没有向用户索要密码、验证码、转账、屏幕共享、输入个人信息的动作。\n4) 不要盲目沿用本地初判，请独立下判断。对于图片线索，若视觉看到的是已知平台（微信/支付宝/银行/京东）提供的合规说明页或官方公告，且页面本身没有引导用户转账/输入敏感信息，也不要认为是诈骗黑样本，但若画面显示的是对话/来电中对方诱导受害者转入安全账户/共享屏幕/输入密码，则仍是高风险诈骗场景。",
  ].join("\n\n");

  const rawImageUri = input.imageUri ?? "";
  const remoteImageUrl = isRemoteImageUrl(rawImageUri) ? rawImageUri.trim() : null;

  if (!remoteImageUrl) {
    return textContent;
  }

  return [
    {
      type: "image_url" as const,
      image_url: {
        url: remoteImageUrl,
        detail: "high" as const,
      },
    },
    {
      type: "text" as const,
      text: textContent,
    },
  ];
}

function buildArkMessages(input: AnalysisInput, repositoryInspired: RepositoryInspiredRagResult) {
  return [
    {
      role: "system" as const,
      content:
        "你是移动端反诈风险研判助手。你需要结合输入线索、历史记忆、检索到的反诈知识以及可能提供的截图或图片线索，对当前事件给出更自然、更可信的中文解释与处置建议。你必须只返回 JSON，对象字段仅限 summary、explanation、suggestions、quickQuestions、reportMessage、riskLevel、fraudType。suggestions 和 quickQuestions 必须是字符串数组。不要输出 Markdown，不要输出代码块。",
    },
    {
      role: "user" as const,
      content: buildArkUserContent(input, repositoryInspired),
    },
  ];
}

async function runArkOverlay(
  input: AnalysisInput,
  repositoryInspired: RepositoryInspiredRagResult,
) {
  if (!hasArkRuntimeConfig()) {
    return {
      usedDify: false,
      analysis: repositoryInspired.analysis,
      ragProvider: "haystack-style-local",
    } as const;
  }

  try {
    const completion = await runArkChat(buildArkMessages(input, repositoryInspired), {
      temperature: 0,
      maxTokens: 1800,
    });

    const jsonText = extractJsonObject(completion.content);
    let parsed: ReturnType<typeof arkOverlaySchema.safeParse> | null = null;
    try {
      parsed = jsonText ? arkOverlaySchema.safeParse(JSON.parse(jsonText)) : null;
    } catch {
      // Malformed JSON (usually truncation). Fall back to repository-inspired.
    }
    const overlay = parsed && parsed.success ? parsed.data : null;

    const explanation = overlay?.explanation?.trim() || completion.content.trim().slice(0, 320) || repositoryInspired.analysis.explanation;
    const suggestions = Array.from(
      new Set([
        ...repositoryInspired.analysis.suggestions,
        ...(overlay?.suggestions ?? []),
      ].map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 5);
    const quickQuestions = Array.from(
      new Set([
        ...(overlay?.quickQuestions ?? []),
        ...repositoryInspired.analysis.quickQuestions,
      ].map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 4);

    const levelRank: Record<"low" | "medium" | "high", number> = { low: 0, medium: 1, high: 2 };
    const localRisk = repositoryInspired.analysis.riskLevel;
    const evidences = repositoryInspired.analysis.evidences ?? [];
    const localHasEvidence = evidences.length > 0;
    // Re-run safe-hint matching on the raw input so we can decide whether to
    // let the overlay downgrade. Local engine's "客服 / 退款" weak evidence
    // shouldn't block a confident LLM "low" when a real hotline / IVR /
    // user-initiated conversation was detected.
    const rawInputText = [input.text, input.transcript]
      .filter(Boolean)
      .join("\n")
      .trim();
    const safeHintsAtRouter = matchSafeHints(rawInputText);
    const weakOnlyBlack = evidences.every((item) =>
      /退款|客服|会员|共享屏幕|远程|链接|点击|下载APP|安装|扫码/.test(item.label + item.detail),
    );
    let mergedRisk: "low" | "medium" | "high" = localRisk;
    const strongBlackPresent =
      /(\*{3,}|安全账户|共享屏幕|保证金|涉案|洗钱|冻结资金|停卡|验证码.*(给|提供|告诉)|按我说的|屏幕共享|不要告诉家人|保密办案|教您操作|转入.*账户)/i.test(
        rawInputText,
      );
    if (overlay?.riskLevel) {
      if (levelRank[overlay.riskLevel] > levelRank[localRisk]) {
        // only upgrade
        mergedRisk = overlay.riskLevel;
      } else if (levelRank[overlay.riskLevel] < levelRank[localRisk]) {
        // Let LLM downgrade when:
        //   (a) local saw zero evidence — the score came purely from bias
        //       terms and LLM's "low" is a better anchor;
        //   (b) local evidence is only weak keywords (客服/退款/链接) AND the
        //       input has at least two safe-context signals;
        //   (c) three or more safe signals matched and no smoking-gun black
        //       pattern — high confidence of legit context.
        const safeEnough = safeHintsAtRouter.length >= 2 && weakOnlyBlack;
        const overwhelmingSafe = safeHintsAtRouter.length >= 3 && !strongBlackPresent;
        if (!localHasEvidence || safeEnough || overwhelmingSafe) {
          mergedRisk = overlay.riskLevel;
        }
      }
    }
    // Even without the overlay, overwhelming safe context should never be
    // left at medium/high on the local side alone.
    if (!strongBlackPresent && safeHintsAtRouter.length >= 3 && mergedRisk !== "low") {
      // Only pull to low if the overlay didn't independently vote higher.
      if (!overlay?.riskLevel || overlay.riskLevel === "low") {
        mergedRisk = "low";
      }
    }
    const overlayFraud = coerceFraudType(overlay?.fraudType);
    return {
      usedDify: false,
      analysis: {
        ...repositoryInspired.analysis,
        summary: overlay?.summary?.trim() || repositoryInspired.analysis.summary,
        explanation,
        suggestions,
        quickQuestions,
        reportMessage: overlay?.reportMessage?.trim() || repositoryInspired.analysis.reportMessage,
        riskLevel: mergedRisk,
        fraudType: overlayFraud ?? repositoryInspired.analysis.fraudType,
      } satisfies AnalysisResult,
      ragProvider: "ark+haystack-style-local",
    } as const;
  } catch (error) {
    console.warn("ark overlay failed, fallback to repository-inspired local rag", error);
    return {
      usedDify: false,
      analysis: repositoryInspired.analysis,
      ragProvider: "haystack-style-local",
    } as const;
  }
}

async function runDifyOverlay(
  input: AnalysisInput,
  repositoryInspired: RepositoryInspiredRagResult,
) {
  if (!hasDifyRuntimeConfig()) {
    return {
      usedDify: false,
      analysis: repositoryInspired.analysis,
      ragProvider: "haystack-style-local",
    } as const;
  }

  const apiBaseUrl = ENV.difyApiBaseUrl.replace(/\/$/, "");
  const apiKey = ENV.difyApiKey;

  try {
    const response = await fetch(`${apiBaseUrl}/v1/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          query: repositoryInspired.query,
          inputMode: input.inputMode,
          text: input.text,
          transcript: input.transcript ?? "",
          retrieved_contexts: repositoryInspired.analysis.knowledgeHits
            .map((item, index) => `#${index + 1} ${item.title}\n来源：${item.source}\n${item.snippet}`)
            .join("\n\n"),
          short_term_memory: input.shortTerm.slice(-4).map((item) => item.content).join("\n"),
          long_term_profile: JSON.stringify({
            roleLabel: input.longTerm.roleLabel,
            ageGroup: input.longTerm.ageGroup,
            occupation: input.longTerm.occupation,
            riskTags: input.longTerm.riskTags,
          }),
        },
        response_mode: "blocking",
        user: input.conversationId ?? "anti-fraud-device",
      }),
    });

    if (!response.ok) {
      throw new Error(`dify request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: {
        outputs?: {
          answer?: string;
          suggestions?: string[] | string;
        };
      };
    };

    const remoteAnswer = payload.data?.outputs?.answer;
    const remoteSuggestions = Array.isArray(payload.data?.outputs?.suggestions)
      ? payload.data?.outputs?.suggestions
      : typeof payload.data?.outputs?.suggestions === "string"
        ? payload.data.outputs.suggestions
            .split(/\n+/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    return {
      usedDify: true,
      ragProvider: "dify",
      analysis: {
        ...repositoryInspired.analysis,
        explanation: remoteAnswer
          ? `${repositoryInspired.analysis.explanation} Dify 工作流补充：${remoteAnswer}`.slice(0, 320)
          : repositoryInspired.analysis.explanation,
        suggestions: Array.from(new Set([...repositoryInspired.analysis.suggestions, ...remoteSuggestions])).slice(0, 5),
      } satisfies AnalysisResult,
    } as const;
  } catch (error) {
    console.warn("dify overlay failed, fallback to repository-inspired local rag", error);
    return {
      usedDify: false,
      analysis: repositoryInspired.analysis,
      ragProvider: "haystack-style-local",
    } as const;
  }
}

async function buildAnalyzeResponse(input: z.infer<typeof analyzeInputSchema>): Promise<AnalyzeResponse> {
  const workingMemory = pickWorkingMemory(input);
  const analysisInput: AnalysisInput = {
    inputMode: input.inputMode,
    text: input.text,
    transcript: input.transcript,
    imageUri: input.imageUri,
    audioUri: input.audioUri,
    conversationId: input.conversationId,
    shortTerm: workingMemory.shortTerm,
    longTerm: workingMemory.longTerm,
  };

  const localAnalysis = analyzeFraudLocally(analysisInput);
  const repositoryInspired = await buildRepositoryInspiredLocalRag(analysisInput, localAnalysis);
  const remoteResult = hasDifyRuntimeConfig()
    ? await runDifyOverlay(analysisInput, repositoryInspired)
    : await runArkOverlay(analysisInput, repositoryInspired);
  const nextMemory = mergeMemoryAfterAnalysis(workingMemory, analysisInput, remoteResult.analysis);
  const report = buildSafetyReport(nextMemory, remoteResult.analysis);

  runtimeMemoryStore.set(resolveMemoryKey(input), nextMemory);

  return {
    analysis: remoteResult.analysis,
    memory: nextMemory,
    report,
    usedDify: remoteResult.usedDify,
    usedRag: remoteResult.analysis.knowledgeHits.length > 0,
  };
}

export const antiFraudRouter = router({
  status: publicProcedure.query(() => {
      return {
        mode: hasDifyRuntimeConfig() ? "dify-ready" : hasArkRuntimeConfig() ? "ark-ready" : "local-fallback",
        difyReady: hasDifyRuntimeConfig(),
        arkReady: hasArkRuntimeConfig(),
        ragProvider: hasDifyRuntimeConfig()
          ? "dify"
          : hasArkRuntimeConfig()
            ? "ark+haystack-style-local"
            : "haystack-style-local",
        sessionCount: runtimeMemoryStore.size,
      } as const;

  }),

  analyze: publicProcedure.input(analyzeInputSchema).mutation(async ({ input }) => {
    return buildAnalyzeResponse(input);
  }),

  uploadImage: publicProcedure.input(uploadImageInputSchema).mutation(async ({ input }) => {
    try {
      return await uploadAnalysisImage(input);
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "截图上传失败，请稍后再试。",
        cause: error,
      });
    }
  }),

  buildReport: publicProcedure.input(reportInputSchema).query(({ input }): ReportResponse => {
    return {
      report: buildSafetyReport(input.memory, input.latestAnalysis),
      memory: input.memory,
    };
  }),

  syncMemory: publicProcedure.input(memoryUpdateSchema).mutation(({ input }) => {
    runtimeMemoryStore.set(resolveMemoryKey(input), input.memory);
    return {
      success: true,
      memory: input.memory,
    } as const;
  }),

  resetMemory: publicProcedure.input(z.object({ deviceId: z.string().min(1) })).mutation(({ input }) => {
    runtimeMemoryStore.delete(input.deviceId);
    return {
      success: true,
    } as const;
  }),

  reportSchema: publicProcedure.query(() => safetyReportSchema.shape),
});
