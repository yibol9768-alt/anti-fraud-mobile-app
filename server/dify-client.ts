/**
 * Dify 自部署接入客户端
 *
 * 当前为占位实现。当用户提供 DIFY_API_BASE_URL 和 DIFY_API_KEY 后，
 * 可替换为真实的 Dify API 调用。
 *
 * 详见 docs/dify-integration-guide.md
 */

import { ENV } from "./_core/env";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface DifyChatRequest {
  query: string;
  conversationId?: string;
  user: string;
  inputs?: Record<string, string>;
}

export interface DifyChatResponse {
  answer: string;
  conversationId: string;
  messageId: string;
  metadata?: {
    retrieverResources?: Array<{
      datasetName: string;
      documentName: string;
      segmentContent: string;
      score: number;
    }>;
  };
}

export interface DifyCompletionRequest {
  inputs: Record<string, string>;
  user: string;
}

export interface DifyCompletionResponse {
  answer: string;
  messageId: string;
  metadata?: {
    retrieverResources?: Array<{
      datasetName: string;
      documentName: string;
      segmentContent: string;
      score: number;
    }>;
  };
}

/* ------------------------------------------------------------------ */
/*  Availability check                                                */
/* ------------------------------------------------------------------ */

/**
 * 检查 Dify 是否已配置且可用
 */
export function isDifyAvailable(): boolean {
  return Boolean(ENV.difyApiBaseUrl && ENV.difyApiKey);
}

/* ------------------------------------------------------------------ */
/*  API calls                                                         */
/* ------------------------------------------------------------------ */

const getDifyHeaders = () => ({
  Authorization: `Bearer ${ENV.difyApiKey}`,
  "Content-Type": "application/json",
});

/**
 * 调用 Dify 对话接口
 *
 * 用于聊天助手的多轮对话场景。
 * Dify 会自动维护会话上下文，通过 conversationId 关联。
 */
export async function sendDifyChat(params: DifyChatRequest): Promise<DifyChatResponse> {
  if (!isDifyAvailable()) {
    throw new Error("Dify is not configured. Set DIFY_API_BASE_URL and DIFY_API_KEY.");
  }

  const response = await fetch(`${ENV.difyApiBaseUrl}/chat-messages`, {
    method: "POST",
    headers: getDifyHeaders(),
    body: JSON.stringify({
      query: params.query,
      conversation_id: params.conversationId ?? "",
      user: params.user,
      inputs: params.inputs ?? {},
      response_mode: "blocking",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Dify chat API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    answer: data.answer ?? "",
    conversationId: data.conversation_id ?? "",
    messageId: data.message_id ?? "",
    metadata: data.metadata,
  };
}

/**
 * 调用 Dify 文本生成接口
 *
 * 用于单轮分析场景，如风险分析报告生成。
 */
export async function sendDifyCompletion(params: DifyCompletionRequest): Promise<DifyCompletionResponse> {
  if (!isDifyAvailable()) {
    throw new Error("Dify is not configured. Set DIFY_API_BASE_URL and DIFY_API_KEY.");
  }

  const response = await fetch(`${ENV.difyApiBaseUrl}/completion-messages`, {
    method: "POST",
    headers: getDifyHeaders(),
    body: JSON.stringify({
      inputs: params.inputs,
      user: params.user,
      response_mode: "blocking",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Dify completion API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    answer: data.answer ?? "",
    messageId: data.message_id ?? "",
    metadata: data.metadata,
  };
}
