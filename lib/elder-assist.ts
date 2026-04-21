import { FRAUD_TYPE_LABELS, RISK_LEVEL_LABELS, type FraudType, type InputMode, type RiskLevel } from "@/shared/anti-fraud";

export type DefenseScene = "phone" | "sms" | "screenshot";

export interface ShareSummaryInput {
  generatedAt: string;
  score: number;
  riskLevel?: RiskLevel;
  fraudType?: FraudType;
  headline: string;
  explanation: string;
  suggestions: string[];
  reasons: string[];
}

export interface BlacklistHit {
  category: "keyword" | "link" | "phone";
  value: string;
  reason: string;
}

const BLACKLIST_KEYWORDS: Array<{ keyword: string; reason: string }> = [
  { keyword: "验证码", reason: "诈骗场景常通过验证码接管账户或完成支付验证。" },
  { keyword: "安全账户", reason: "要求转入所谓安全账户，属于高危转账诱导话术。" },
  { keyword: "共享屏幕", reason: "诱导共享屏幕会暴露短信、验证码和支付页面。" },
  { keyword: "屏幕共享", reason: "诱导共享屏幕会暴露短信、验证码和支付页面。" },
  { keyword: "下载会议软件", reason: "以协助退款、认证或调查为由要求装软件，常见于远程控制诈骗。" },
  { keyword: "远程控制", reason: "要求开启远程控制通常意味着对方准备接管设备或支付流程。" },
  { keyword: "刷流水", reason: "以刷流水、验证资金、测试账户为由转账，通常是诈骗步骤。" },
  { keyword: "转账", reason: "在身份尚未核实前要求转账，应视为高危信号。" },
  { keyword: "退款", reason: "退款、退费、会员关闭等场景常被用于诱导共享屏幕或转账。" },
  { keyword: "公检法", reason: "冒充公检法施压配合调查，是常见身份冒充套路。" },
];

export function getSceneByMode(mode: InputMode): DefenseScene {
  if (mode === "audio") {
    return "phone";
  }
  if (mode === "image") {
    return "screenshot";
  }
  return "sms";
}

export function inferImageMeta(uri: string, mimeType?: string | null) {
  const lower = uri.toLowerCase();
  if (mimeType) {
    const normalizedMimeType = mimeType.toLowerCase();
    const extension = normalizedMimeType.includes("png")
      ? "png"
      : normalizedMimeType.includes("webp")
        ? "webp"
        : normalizedMimeType.includes("heic")
          ? "heic"
          : normalizedMimeType.includes("heif")
            ? "heif"
            : "jpg";
    return { mimeType: normalizedMimeType, fileExtension: extension };
  }

  if (lower.endsWith(".png")) {
    return { mimeType: "image/png", fileExtension: "png" };
  }
  if (lower.endsWith(".webp")) {
    return { mimeType: "image/webp", fileExtension: "webp" };
  }
  if (lower.endsWith(".heic")) {
    return { mimeType: "image/heic", fileExtension: "heic" };
  }
  if (lower.endsWith(".heif")) {
    return { mimeType: "image/heif", fileExtension: "heif" };
  }
  return { mimeType: "image/jpeg", fileExtension: "jpg" };
}

export function inferAudioMeta(uri: string, platform: "ios" | "android" | "web") {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) {
    return { mimeType: "audio/m4a", fileExtension: "m4a" };
  }
  if (lower.endsWith(".mp3")) {
    return { mimeType: "audio/mpeg", fileExtension: "mp3" };
  }
  if (lower.endsWith(".wav")) {
    return { mimeType: "audio/wav", fileExtension: "wav" };
  }
  if (lower.endsWith(".ogg")) {
    return { mimeType: "audio/ogg", fileExtension: "ogg" };
  }

  return platform === "ios"
    ? { mimeType: "audio/m4a", fileExtension: "m4a" }
    : { mimeType: "audio/webm", fileExtension: "webm" };
}

export function buildGuardianReminder() {
  return encodeURIComponent(
    "我正在用 A30 核验一条可疑电话、短信或截图。如果我提到转账、验证码、共享屏幕、下载软件或安全账户，请先提醒我立刻暂停操作。",
  );
}

export function buildFamilyReminder(summary: string) {
  return encodeURIComponent(
    `我刚用 A30 做了反诈核验，系统提醒：${summary}。如果我提到转账、验证码、共享屏幕、下载会议软件或安全账户，请先提醒我暂停操作。`,
  );
}

export function buildShareSummaryText(input: ShareSummaryInput) {
  const level = input.riskLevel ? RISK_LEVEL_LABELS[input.riskLevel] : "待检测";
  const fraudType = input.fraudType ? FRAUD_TYPE_LABELS[input.fraudType] : "待识别";
  const suggestions = input.suggestions.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const reasons = input.reasons.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return [
    "A30 多模态反诈智能助手风险摘要",
    `生成时间：${input.generatedAt}`,
    `综合安全评分：${input.score}`,
    `本次识别：${level} / ${fraudType}`,
    `结论摘要：${input.headline}`,
    `判断说明：${input.explanation}`,
    "建议暂停或拉黑的原因：",
    reasons,
    "建议立刻执行的动作：",
    suggestions,
  ].join("\n\n");
}

export function extractBlacklistHits(content: string) {
  const normalized = content.replace(/\s+/g, " ");
  const hits: BlacklistHit[] = [];

  for (const item of BLACKLIST_KEYWORDS) {
    if (normalized.includes(item.keyword)) {
      hits.push({
        category: "keyword",
        value: item.keyword,
        reason: item.reason,
      });
    }
  }

  const links = normalized.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const link of links.slice(0, 2)) {
    hits.push({
      category: "link",
      value: link,
      reason: "文本中出现了外链，诈骗消息常通过伪装网页或下载地址引导下一步操作。",
    });
  }

  const phones = normalized.match(/(?:\+?86[- ]?)?(?:1[3-9]\d{9}|95\d{3,6}|400[- ]?\d{3}[- ]?\d{4})/g) ?? [];
  for (const phone of phones.slice(0, 2)) {
    hits.push({
      category: "phone",
      value: phone,
      reason: "识别到可回拨或可核验号码，建议不要直接回拨文本中的号码，而应通过官方渠道核验。",
    });
  }

  return Array.from(new Map(hits.map((item) => [`${item.category}:${item.value}`, item])).values()).slice(0, 6);
}

export function buildBlockRecordText(summary: string, hits: BlacklistHit[], suggestions: string[]) {
  const lines = [
    "A30 主动防御处置记录",
    `风险摘要：${summary}`,
    "建议立即暂停以下行为：回复消息、继续通话、转账汇款、提供验证码、共享屏幕、下载陌生软件。",
  ];

  if (hits.length) {
    lines.push("命中的黑名单线索：");
    lines.push(...hits.map((item, index) => `${index + 1}. [${item.category}] ${item.value} - ${item.reason}`));
  }

  if (suggestions.length) {
    lines.push("建议动作：");
    lines.push(...suggestions.map((item, index) => `${index + 1}. ${item}`));
  }

  return lines.join("\n\n");
}
