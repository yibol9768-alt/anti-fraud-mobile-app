export type RiskLevel = "low" | "medium" | "high";

export type FraudType =
  | "phishing"
  | "investment_scam"
  | "impersonation"
  | "shopping_refund"
  | "loan_scam"
  | "romance_scam"
  | "unknown";

export type InputMode = "text" | "audio" | "image";

export interface EvidenceItem {
  id: string;
  label: string;
  detail: string;
  weight: number;
}

export interface KnowledgeHit {
  id: string;
  title: string;
  source: string;
  snippet: string;
  similarity: number;
  tags: string[];
}

export interface ShortMemoryEntry {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  mode?: InputMode;
}

export interface FraudEvent {
  id: string;
  createdAt: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  fraudType: FraudType;
  score: number;
  sourceMode: InputMode;
  conversationId?: string;
}

export interface GuardianContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  enabled: boolean;
}

export interface LongMemoryProfile {
  nickname: string;
  roleLabel: string;
  ageGroup: string;
  occupation: string;
  sensitivity: number;
  notes: string[];
  riskTags: string[];
  preferredGuardians: GuardianContact[];
}

export interface MemorySnapshot {
  shortTerm: ShortMemoryEntry[];
  longTerm: LongMemoryProfile;
  recentEvents: FraudEvent[];
}

export interface AnalysisInput {
  inputMode: InputMode;
  text: string;
  imageUri?: string;
  audioUri?: string;
  transcript?: string;
  shortTerm: ShortMemoryEntry[];
  longTerm: LongMemoryProfile;
  conversationId?: string;
}

export interface AnalysisResult {
  eventId: string;
  conversationId: string;
  riskLevel: RiskLevel;
  fraudType: FraudType;
  score: number;
  summary: string;
  explanation: string;
  evidences: EvidenceItem[];
  suggestions: string[];
  knowledgeHits: KnowledgeHit[];
  quickQuestions: string[];
  reportMessage: string;
}

export interface ReportMetricPoint {
  label: string;
  value: number;
}

export interface SafetyReport {
  generatedAt: string;
  headline: string;
  overview: string;
  score: number;
  trend: ReportMetricPoint[];
  typeDistribution: ReportMetricPoint[];
  recommendations: string[];
  watchlist: string[];
}

export interface AnalyzeResponse {
  analysis: AnalysisResult;
  memory: MemorySnapshot;
  report: SafetyReport;
  usedDify: boolean;
  usedRag: boolean;
}

export interface ReportResponse {
  report: SafetyReport;
  memory: MemorySnapshot;
}

export interface MemoryUpdateInput {
  nickname?: string;
  roleLabel?: string;
  ageGroup?: string;
  occupation?: string;
  sensitivity?: number;
  notes?: string[];
  riskTags?: string[];
  preferredGuardians?: GuardianContact[];
}

export const FRAUD_TYPE_LABELS: Record<FraudType, string> = {
  phishing: "钓鱼诈骗",
  investment_scam: "投资理财诈骗",
  impersonation: "冒充身份诈骗",
  shopping_refund: "退款售后诈骗",
  loan_scam: "贷款征信诈骗",
  romance_scam: "情感交友诈骗",
  unknown: "待进一步核实",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

export const INPUT_MODE_LABELS: Record<InputMode, string> = {
  text: "文本检测",
  audio: "语音说明",
  image: "截图识别",
};
