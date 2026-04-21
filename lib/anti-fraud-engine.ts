import type {
  AnalysisInput,
  AnalysisResult,
  FraudEvent,
  FraudType,
  KnowledgeHit,
  LongMemoryProfile,
  MemorySnapshot,
  ReportMetricPoint,
  SafetyReport,
  ShortMemoryEntry,
} from "@/shared/anti-fraud";

const KNOWLEDGE_BASE: Array<KnowledgeHit & { fraudType: FraudType; keywords: string[] }> = [
  {
    id: "kb-1",
    title: "虚假投资平台诱导转账",
    source: "反诈案例库",
    snippet: "诈骗方以高收益、内幕消息、导师带单等话术诱导持续转账，并强调保本稳赚。",
    similarity: 0.96,
    tags: ["投资", "转账", "高收益"],
    fraudType: "investment_scam",
    keywords: ["投资", "理财", "稳赚", "内幕", "收益", "导师", "带单", "平台"],
  },
  {
    id: "kb-2",
    title: "冒充客服退款诈骗",
    source: "交易平台安全提示",
    snippet: "常见于‘商品异常’‘误开会员’‘先退款后验证’等场景，诱导共享屏幕或下载远控软件。",
    similarity: 0.92,
    tags: ["退款", "客服", "共享屏幕"],
    fraudType: "shopping_refund",
    keywords: ["退款", "客服", "误开", "会员", "取消", "验证", "远程", "共享屏幕", "快递", "取件码", "驿站", "包裹", "订单异常"],
  },
  {
    id: "kb-3",
    title: "冒充公检法要求安全账户转账",
    source: "公安反诈公开案例",
    snippet: "诈骗方伪装成执法机构，强调案件保密与资金核验，要求转入所谓安全账户。",
    similarity: 0.94,
    tags: ["公检法", "安全账户", "保密"],
    fraudType: "impersonation",
    keywords: ["公安", "法院", "检察院", "安全账户", "保密", "洗钱", "涉案"],
  },
  {
    id: "kb-4",
    title: "贷款征信修复诈骗",
    source: "金融消费者保护资料",
    snippet: "骗子利用‘低息放款’‘先交保证金’‘修复征信’等说法骗取手续费或验证码。",
    similarity: 0.9,
    tags: ["贷款", "征信", "保证金"],
    fraudType: "loan_scam",
    keywords: ["贷款", "征信", "额度", "保证金", "手续费", "放款"],
  },
  {
    id: "kb-5",
    title: "情感关系诱导投资或借款",
    source: "社交平台风险案例",
    snippet: "诈骗方通过建立亲密关系降低戒备，随后引导投资、博彩或借款。",
    similarity: 0.88,
    tags: ["交友", "感情", "借款"],
    fraudType: "romance_scam",
    keywords: ["想你", "未来", "恋爱", "见面", "借钱", "博彩", "一起赚钱"],
  },
  {
    id: "kb-6",
    title: "钓鱼链接与验证码套取",
    source: "运营商反诈提醒",
    snippet: "通过伪装物流、银行、平台通知，引导点击链接或索取验证码完成盗刷。",
    similarity: 0.91,
    tags: ["链接", "验证码", "银行"],
    fraudType: "phishing",
    keywords: ["链接", "验证码", "银行", "解冻", "验证", "短信", "点击", "网址", "登陆", "登录", "激活", "领取", "礼包", "积分", "过期"],
  },
];

const RISK_HINTS: Array<{ pattern: RegExp; label: string; detail: string; weight: number }> = [
  {
    pattern: /(高收益|稳赚|保本|内幕消息|导师带单|内幕投资|保证提现|稳赚不赔)/i,
    label: "收益承诺异常",
    detail: "内容中出现保本、高收益或导师带单等典型投资诈骗承诺。",
    weight: 28,
  },
  {
    pattern: /(验证码|安全账户|保密|涉案|冻结)/i,
    label: "身份威压与账户控制",
    detail: "出现涉案、保密、安全账户或验证码等高危控制信号。",
    weight: 24,
  },
  {
    pattern: /(退款|客服|会员|共享屏幕|远程)/i,
    label: "客服退款诱导",
    detail: "内容中疑似出现冒充客服、共享屏幕或误开会员诱导。",
    weight: 22,
  },
  {
    pattern: /(转账|打款|汇款|先转\s*\d+|转\s*\d+|转到.*账户|平台账户|手续费|保证金)/i,
    label: "资金操作要求",
    detail: "检测到明确的转账、打款或保证金要求。",
    weight: 18,
  },
  {
    pattern: /(贷款|征信|额度|放款)/i,
    label: "贷款征信套路",
    detail: "内容中出现贷款征信相关高风险用语。",
    weight: 20,
  },
  {
    pattern: /(恋爱|见面|未来|借钱|一起赚钱)/i,
    label: "情感关系诱导",
    detail: "疑似通过关系建立降低警惕，再引导借款或投资。",
    weight: 16,
  },
  {
    pattern: /(链接|点击|下载APP|安装|扫码)/i,
    label: "可疑跳转或安装引导",
    detail: "出现链接、下载或扫码引导，可能与钓鱼或远控有关。",
    weight: 14,
  },
  {
    pattern: /\*{3,}|[X]{2,}(网址|链接|官网|域名)/,
    label: "可疑占位 URL",
    detail: "出现 ****** 或 XX网址等模糊占位，疑似钓鱼短信。",
    weight: 26,
  },
  {
    pattern: /(作弊|冒名|盗用).{0,10}(嫌疑|处理|核查|核验|处罚|身份)|涉嫌.{0,6}(违法|犯罪|洗钱|诈骗|走私|偷税|漏税)|违法.{0,6}(嫌疑|犯罪|处罚|处理)|成绩记为?\s?0\s?分|账号.{0,3}(被冻结|异常|存在违规)|涉案.{0,6}(洗钱|违法|资金)|(信息|资料)(完善|核对|核查|验证)/,
    label: "施压式身份/账号核查话术",
    detail: "通过违规嫌疑、账号异常、信息完善等方式制造恐慌，是冒充机构诈骗的高风险信号。",
    weight: 24,
  },
  {
    pattern: /〖[^〖〗]{0,3}X{2,}[^〖〗]*?(局|院|部|行|中心|委|所|队|台|处)[^〖〗]*?〗|【[^【】]{0,3}X{2,}[^【】]*?(局|院|部|行|中心|委|所|队|台|处)[^【】]*?】/,
    label: "发送方标识被占位遮挡",
    detail: "SMS 发送方含 XX+机构关键字等占位形式，非正规发件特征。",
    weight: 20,
  },
  {
    pattern: /(详询|详细|联系|咨询|查询|致电)\s?1[3-9]\d[\d\*X]{4,}|\s1[3-9]\d[\*X]{4,}/i,
    label: "诱导回拨陌生个人手机号",
    detail: "要求用户联系非官方个人手机号，常见于仿冒物流、退款诈骗。",
    weight: 20,
  },
  {
    pattern: /(宝贝|老婆|老公|亲爱的|亲).{0,40}(垫|借|打给|先给|先.{0,2}转).{0,10}(\d{3,}|一万|两万|三万|五万|十万|几万|万|块)|(保证金|工资|押金|定金).{0,10}(垫|借|先给|先.{0,2}转)/,
    label: "亲密称呼+代垫/借款请求",
    detail: "以亲密称呼开场并要求垫付或借款，情感诈骗典型话术。",
    weight: 20,
  },
];

// Counter-signals: strong indicators that the conversation/message is a
// legitimate business contact (user-initiated call to a known hotline, an
// official IVR, etc). When matched, we apply a discount so legit audio/SMS
// isn't bumped into medium purely by keyword overlap ("客服", "退款", "立即").
const SAFE_HINTS: Array<{ pattern: RegExp; label: string; discount: number }> = [
  {
    // Widely recognised Chinese customer-service hotlines (3-6 digits).
    pattern: /\b(95\d{3}|955\d{2}|950\d{3,4}|1008611|10086|10000|10010|12315|12333|12345|12381|96110)\b/,
    label: "官方公开客服热线号码",
    discount: 22,
  },
  {
    // Brand + customer service language — user is talking to/about an
    // identifiable platform or carrier.
    pattern: /(京东|淘宝|天猫|拼多多|闲鱼|抖音|美团|携程|支付宝|微信支付|建设银行|工商银行|招商银行|农业银行|邮储银行|中国银行|交通银行|中国联通|中国移动|中国电信|顺丰|圆通|中通|京东物流|长城宽带|联通宽带|电信宽带|移动宽带)[^。\n]{0,32}(客服|官方|热线|旗舰店|公众号|小程序|App|应用|装维|维运|运营商|工号|满意度)/,
    label: "已识别的平台/运营商官方渠道",
    discount: 14,
  },
  {
    // Widely used opening phrases of real customer hotlines.
    pattern: /(欢迎致电|业务受理请按|故障报修请按|投诉及建议请按|工单号|您拨打的是|您即将接入|您的号码为尾号)/,
    label: "正规热线开场/工单/接入词",
    discount: 14,
  },
  {
    // Standalone brand mention (used as extra weak signal when the strict
    // brand+service window in pattern 2 doesn't hit — e.g. "欢迎致电长城宽带"
    // 与后面的 "客服代表" 隔得很远).
    pattern: /(京东|淘宝|天猫|拼多多|闲鱼|抖音|美团|携程|支付宝|微信支付|微信支付百万保障|建设银行|工商银行|招商银行|农业银行|邮储银行|中国银行|交通银行|中国联通|中国移动|中国电信|顺丰速运|圆通速递|中通快递|京东物流|长城宽带|联通宽带|电信宽带|移动宽带|中国邮政)/,
    label: "提及真实平台/运营商/银行名称",
    discount: 8,
  },
  {
    // Telecom / broadband field-service & billing vocabulary that strongly
    // indicates a legitimate tech-support conversation, not a scam.
    pattern: /(装维|装机|重启(光|路由)?|光猫|路由器|拨号|调制解调|宽带续费|套餐升级|MAC\s?地址|端口|带宽|上行|下行|网速|故障申报|报修|维修|过户|携号转网|话费充值|流量包|售后服务|账单查询|实名认证)/,
    label: "通信/宽带售后专业词汇",
    discount: 12,
  },
  {
    // The user is clearly the caller / writer ("I want to ask…",
    // "my broadband…"). Reduces suspicion of an inbound scam.
    pattern: /(我这边是|我是[^。\n]{2,12}的?(用户|客户|会员|老客户)|我想咨询|我要投诉|我想问一下|想问一下|想咨询一下|我的订单|我宽带|我的宽带|我的账单|我的卡号|我想取消|我要取消|我要办理|我要退订|我要换号|正在投诉|持续跟踪解决|提升服务质量)/,
    label: "用户主动咨询/投诉口吻",
    discount: 12,
  },
  {
    // Canonical IVR / queueing wording from real customer-service lines.
    pattern: /(请按[0-9]|按[0-9]键|请稍候|将为您转接|已为您.{0,8}转接|您是本机构.{0,8}的老客户|尊敬的.{0,10}用户|客服工号|工号\s*\d|服务评价|满意请按|是一般、?满意还是不满意|您好.{0,12}请问(有)?什么.{0,4}(可以)?(帮|为).{0,6}您|对我们(的)?(过程|服务)是否满意|是否已解决)/,
    label: "正规客服 IVR/排队/话术",
    discount: 14,
  },
  {
    // Genuine transactional proof points: order ids, masked card tails,
    // real addresses and date-stamped balances. Scam SMS rarely carries
    // these together with no call-to-action.
    pattern: /(订单号[:：]?\s?[A-Z]{1,3}\d{6,}|尾号\s?\d{3,4}|余额[^。\n]{0,12}\d{1,3}(,\d{3})+(\.\d{2})?|[0-9]{4}-[0-9]{2}-[0-9]{2}\s?\d{2}:\d{2})/,
    label: "真实业务凭证(订单号/卡尾号/余额/时间戳)",
    discount: 10,
  },
];

export function matchSafeHints(text: string) {
  const out: Array<{ label: string; discount: number }> = [];
  for (const item of SAFE_HINTS) {
    if (item.pattern.test(text)) out.push({ label: item.label, discount: item.discount });
  }
  return out;
}

export const DEFAULT_LONG_TERM_PROFILE: LongMemoryProfile = {
  nickname: "家人守护对象",
  roleLabel: "普通用户",
  ageGroup: "成年人",
  occupation: "未设置",
  sensitivity: 72,
  notes: ["近期更关注转账风险", "建议遇到高风险内容先暂停操作"],
  riskTags: ["转账敏感", "截图核验"],
  preferredGuardians: [
    {
      id: "guardian-1",
      name: "紧急联系人",
      relation: "家人",
      phone: "138****1024",
      enabled: true,
    },
  ],
};

export const DEFAULT_SHORT_TERM: ShortMemoryEntry[] = [
  {
    id: "stm-1",
    role: "system",
    content: "系统会记住你最近的可疑线索，并在后续检测时连续分析。",
    timestamp: new Date().toISOString(),
  },
];

export const DEFAULT_RECENT_EVENTS: FraudEvent[] = [
  {
    id: "event-seed-1",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    title: "陌生投资群消息",
    summary: "对方承诺高收益并引导下载理财平台。",
    riskLevel: "high",
    fraudType: "investment_scam",
    score: 89,
    sourceMode: "text",
    conversationId: "seed-conv-1",
  },
  {
    id: "event-seed-2",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    title: "退款客服来电",
    summary: "要求共享屏幕并操作网银。",
    riskLevel: "medium",
    fraudType: "shopping_refund",
    score: 68,
    sourceMode: "audio",
    conversationId: "seed-conv-2",
  },
];

export function createInitialMemorySnapshot(): MemorySnapshot {
  return {
    shortTerm: DEFAULT_SHORT_TERM,
    longTerm: DEFAULT_LONG_TERM_PROFILE,
    recentEvents: DEFAULT_RECENT_EVENTS,
  };
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function inferFraudType(text: string): FraudType {
  const scores = new Map<FraudType, number>();
  const compact = text.toLowerCase();

  for (const item of KNOWLEDGE_BASE) {
    const score = item.keywords.reduce((sum, keyword) => sum + (compact.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    scores.set(item.fraudType, (scores.get(item.fraudType) ?? 0) + score);
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] === 0) {
    return "unknown";
  }
  return sorted[0][0];
}

function buildKnowledgeHits(text: string, fraudType: FraudType) {
  const tokens = tokenize(text);
  const uniqueTokens = new Set(tokens);

  return KNOWLEDGE_BASE.filter((item) => item.fraudType === fraudType || item.keywords.some((keyword) => uniqueTokens.has(keyword.toLowerCase())))
    .map((item) => {
      const hitCount = item.keywords.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase())).length;
      const similarity = Math.min(0.99, Number((0.62 + hitCount * 0.09).toFixed(2)));
      return {
        id: item.id,
        title: item.title,
        source: item.source,
        snippet: item.snippet,
        tags: item.tags,
        similarity,
      } satisfies KnowledgeHit;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

function buildSummary(fraudType: FraudType, score: number) {
  if (fraudType === "investment_scam") {
    return score >= 80
      ? "内容高度疑似投资理财诈骗，包含高收益承诺与持续转账诱导。"
      : "内容疑似投资引导，建议暂缓转账并核验平台资质。";
  }
  if (fraudType === "shopping_refund") {
    return "内容疑似冒充客服退款诈骗，重点风险在于共享屏幕和账户操作。";
  }
  if (fraudType === "impersonation") {
    return "内容疑似冒充公检法或权威机构施压，需警惕所谓安全账户与保密要求。";
  }
  if (fraudType === "loan_scam") {
    return "内容疑似贷款征信诈骗，常见于保证金、手续费或验证码套取。";
  }
  if (fraudType === "romance_scam") {
    return "内容疑似情感关系诱导型诈骗，需要警惕借款、投资或博彩话题。";
  }
  if (fraudType === "phishing") {
    return "内容存在钓鱼链接或验证码套取风险，建议勿点击陌生链接。";
  }
  return "当前线索仍需继续补充，建议结合截图、转账信息或语音说明再次识别。";
}

function buildSuggestions(fraudType: FraudType, riskLevel: AnalysisResult["riskLevel"]) {
  const base = ["先暂停转账、下载或验证码操作", "优先通过官方渠道重新核验对方身份"];

  if (fraudType === "investment_scam") {
    base.push("不要继续向陌生平台充值，保留聊天与转账记录");
  }
  if (fraudType === "shopping_refund") {
    base.push("不要开启共享屏幕，也不要安装远程控制软件");
  }
  if (fraudType === "impersonation") {
    base.push("真正执法机构不会要求将资金转入所谓安全账户");
  }
  if (fraudType === "loan_scam") {
    base.push("正规贷款不会在放款前要求先交手续费或保证金");
  }
  if (fraudType === "romance_scam") {
    base.push("不要因为关系建立而降低对借款与投资请求的警惕");
  }
  if (fraudType === "phishing") {
    base.push("陌生链接、验证码和下载请求都应在官方页面中独立核验");
  }
  if (riskLevel === "high") {
    base.push("建议立即联系家人或平台客服复核，必要时拨打 96110 咨询");
  }

  return Array.from(new Set(base)).slice(0, 4);
}

function buildQuickQuestions(fraudType: FraudType) {
  const common = ["对方是否要求你马上操作？", "是否出现私人账户、二维码或陌生链接？"];

  if (fraudType === "investment_scam") {
    return ["对方是否承诺保本高收益？", "你是否已向陌生平台或个人账户转账？", ...common];
  }
  if (fraudType === "shopping_refund") {
    return ["对方是否要求共享屏幕或安装软件？", "是否提到误开会员、退款验证等说法？", ...common];
  }
  if (fraudType === "impersonation") {
    return ["对方是否自称公安、法院或检察机关？", "是否要求保密并转入安全账户？", ...common];
  }
  return common;
}

export function analyzeFraudLocally(input: AnalysisInput): AnalysisResult {
  const mergedText = [input.text, input.transcript, ...input.shortTerm.slice(-3).map((entry) => entry.content)]
    .filter(Boolean)
    .join("\n")
    .trim();

  const evidences = RISK_HINTS.filter((item) => item.pattern.test(mergedText)).map((item, index) => ({
    id: `evidence-${index + 1}`,
    label: item.label,
    detail: item.detail,
    weight: item.weight,
  }));

  const fraudType = inferFraudType(mergedText);
  const knowledgeHits = buildKnowledgeHits(mergedText, fraudType);
  const memoryBoost = Math.min(14, input.longTerm.riskTags.length * 2 + input.shortTerm.length);
  const hitBoost = knowledgeHits.reduce((sum, item) => sum + Math.round(item.similarity * 10), 0);
  const evidenceScore = evidences.reduce((sum, item) => sum + item.weight, 0);
  const fraudTypeBoostMap: Record<FraudType, number> = {
    phishing: 10,
    investment_scam: 28,
    impersonation: 22,
    shopping_refund: 18,
    loan_scam: 18,
    romance_scam: 16,
    unknown: 0,
  };
  const hasUrgentTransferPattern = /(马上|立刻|立即|今晚|现在|先).*(转账|打款|汇款|转\s*\d+|平台账户)|((转账|打款|汇款|转\s*\d+|平台账户).*(马上|立刻|立即|今晚|现在|先))/i.test(mergedText);
  const hasAuthorityThreatPattern = /(公安|法院|检察院|安全账户|涉案|保密)/i.test(mergedText);
  const coordinatedRiskBoost =
    (evidences.length >= 2 ? 8 : 0) +
    (hasUrgentTransferPattern ? 10 : 0) +
    (hasAuthorityThreatPattern ? 10 : 0);
  const safeHints = matchSafeHints(mergedText);
  const safeDiscount = safeHints.reduce((sum, item) => sum + item.discount, 0);
  // Strong-black gate: if any of these "smoking gun" patterns appear we never
  // apply the safe-context cap, since even a legit-looking call can still be
  // instructing the victim to transfer/share-screen.
  const hasStrongBlack =
    /(\*{3,}|安全账户|共享屏幕|保证金|涉案|洗钱|冻结资金|停卡|验证码.*(给|提供|告诉)|按我说的|屏幕共享|不要告诉家人|保密办案|教您操作)/i.test(
      mergedText,
    );
  const rawScore = evidenceScore + memoryBoost + hitBoost + fraudTypeBoostMap[fraudType] + coordinatedRiskBoost - safeDiscount;
  let score = Math.max(12, Math.min(98, rawScore));
  // When the text strongly looks like a legit hotline/IVR/user-initiated
  // conversation and we haven't seen any smoking-gun black pattern, cap the
  // score below the medium threshold so keyword overlap ("客服", "退款", "立即")
  // can't push it into medium on its own.
  // Only cap when the local engine itself saw weak or no black evidence.
  // Multi-signal black content should never be silently downgraded by safe
  // markers that may co-occur coincidentally.
  if (!hasStrongBlack && safeHints.length >= 2 && evidences.length <= 1) {
    score = Math.min(score, 38);
  }
  const riskLevel = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
  const summary = buildSummary(fraudType, score);

  return {
    eventId: `event-${Date.now()}`,
    conversationId: input.conversationId ?? `local-conv-${Date.now()}`,
    fraudType,
    riskLevel,
    score,
    summary,
    explanation:
      knowledgeHits.length > 0
        ? `系统结合当前输入、近期会话线索和长期风险画像，召回了 ${knowledgeHits.length} 条相似案例，因此判定结果具有较高参考价值。`
        : "当前结果主要依据文本线索与记忆上下文得出，建议补充截图或语音说明提升准确度。",
    evidences,
    suggestions: buildSuggestions(fraudType, riskLevel),
    knowledgeHits,
    quickQuestions: buildQuickQuestions(fraudType),
    reportMessage: `本次检测风险分为 ${riskLevel === "high" ? "高" : riskLevel === "medium" ? "中" : "低"}，建议优先完成身份核验并保留证据。`,
  };
}

export function buildFraudEvent(input: AnalysisInput, analysis: AnalysisResult): FraudEvent {
  return {
    id: analysis.eventId,
    createdAt: new Date().toISOString(),
    title:
      input.inputMode === "text"
        ? "文本可疑内容检测"
        : input.inputMode === "audio"
          ? "语音线索检测"
          : "截图与图片检测",
    summary: analysis.summary,
    riskLevel: analysis.riskLevel,
    fraudType: analysis.fraudType,
    score: analysis.score,
    sourceMode: input.inputMode,
    conversationId: analysis.conversationId,
  };
}

export function buildSafetyReport(memory: MemorySnapshot, latest?: AnalysisResult): SafetyReport {
  const recent = latest
    ? [
        {
          id: latest.eventId,
          createdAt: new Date().toISOString(),
          title: "最新检测",
          summary: latest.summary,
          riskLevel: latest.riskLevel,
          fraudType: latest.fraudType,
          score: latest.score,
          sourceMode: "text",
        },
        ...memory.recentEvents,
      ]
    : memory.recentEvents;

  const topEvents = recent.slice(0, 5);
  const trend: ReportMetricPoint[] = topEvents
    .map((item, index) => ({
      label: `第${index + 1}次`,
      value: item.score,
    }))
    .reverse();

  const typeMap = new Map<string, number>();
  recent.forEach((item) => {
    typeMap.set(item.fraudType, (typeMap.get(item.fraudType) ?? 0) + 1);
  });

  const typeDistribution: ReportMetricPoint[] = Array.from(typeMap.entries()).map(([label, value]) => ({
    label,
    value,
  }));

  const avgScore = recent.length > 0 ? Math.round(recent.reduce((sum, item) => sum + item.score, 0) / recent.length) : 42;
  const highRiskCount = recent.filter((item) => item.riskLevel === "high").length;

  return {
    generatedAt: new Date().toISOString(),
    headline: highRiskCount > 0 ? "近期需要重点关注高风险转账与身份冒充场景" : "整体风险可控，建议保持核验习惯",
    overview: `系统已结合 ${memory.shortTerm.length} 条短期记忆与 ${memory.recentEvents.length} 条历史事件生成本次安全监测报告。`,
    score: avgScore,
    trend,
    typeDistribution,
    recommendations: [
      "在任何涉及转账、验证码、共享屏幕的情境下，先暂停操作再核验。",
      "对于重复出现的诈骗脚本，建议在记忆中心中保留风险标签，便于后续提升识别速度。",
      "当结果为高风险时，优先联系家人、平台官方客服或 96110 进一步确认。",
    ],
    watchlist: [
      ...memory.longTerm.riskTags,
      ...(latest ? latest.quickQuestions.slice(0, 2) : []),
    ].slice(0, 5),
  };
}

export function mergeMemoryAfterAnalysis(memory: MemorySnapshot, input: AnalysisInput, analysis: AnalysisResult): MemorySnapshot {
  const now = new Date().toISOString();
  const appendedShortTerm: ShortMemoryEntry[] = [
    ...memory.shortTerm,
    {
      id: `short-user-${Date.now()}`,
      role: "user" as const,
      content: input.text || input.transcript || "已提交多模态线索",
      timestamp: now,
      mode: input.inputMode,
    },
    {
      id: `short-assistant-${Date.now() + 1}`,
      role: "assistant" as const,
      content: analysis.summary,
      timestamp: now,
    },
  ].slice(-8);

  const nextRiskTags = Array.from(new Set([...memory.longTerm.riskTags, analysis.fraudType, analysis.riskLevel === "high" ? "高危预警" : "持续观察"]));
  const nextNotes = Array.from(new Set([...memory.longTerm.notes, analysis.reportMessage])).slice(-5);
  const event = buildFraudEvent(input, analysis);

  return {
    shortTerm: appendedShortTerm,
    longTerm: {
      ...memory.longTerm,
      riskTags: nextRiskTags,
      notes: nextNotes,
    },
    recentEvents: [event, ...memory.recentEvents].slice(0, 8),
  };
}

export function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
