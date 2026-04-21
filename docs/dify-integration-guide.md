# Dify 自部署接入指南

本文档说明如何将 A30 反诈智能助手的部分编排与检索流程替换为 Dify 自部署实例。

## 一、当前架构

```
移动端 → 本项目服务端（tRPC） → 豆包 Ark API（主分析模型 + Embedding）
                                ↘ 本地回退引擎（离线兜底）
```

## 二、目标架构（接入 Dify 后）

```
移动端 → 本项目服务端（tRPC） → Dify API（RAG 编排 + 工作流）
                                ↘ 豆包 Ark API（作为 Dify 后端模型）
                                ↘ 本地回退引擎（离线兜底）
```

## 三、环境变量配置

在项目的 Secrets 管理面板中配置以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DIFY_API_BASE_URL` | Dify 实例的 API 地址 | `https://your-dify.example.com/v1` |
| `DIFY_API_KEY` | Dify 应用的 API Key | `app-xxxxxxxxxxxxxxxx` |

这两个变量已在 `server/_core/env.ts` 中预留：

```typescript
difyApiBaseUrl: process.env.DIFY_API_BASE_URL ?? "",
difyApiKey: process.env.DIFY_API_KEY ?? "",
```

## 四、服务端替换步骤

### 4.1 创建 Dify 客户端

在 `server/dify-client.ts` 中实现 Dify API 调用：

```typescript
import { ENV } from "./_core/env";

const DIFY_HEADERS = {
  "Authorization": `Bearer ${ENV.difyApiKey}`,
  "Content-Type": "application/json",
};

export async function sendDifyChat(params: {
  query: string;
  conversationId?: string;
  user: string;
  inputs?: Record<string, string>;
}) {
  const response = await fetch(`${ENV.difyApiBaseUrl}/chat-messages`, {
    method: "POST",
    headers: DIFY_HEADERS,
    body: JSON.stringify({
      query: params.query,
      conversation_id: params.conversationId ?? "",
      user: params.user,
      inputs: params.inputs ?? {},
      response_mode: "blocking",
    }),
  });

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`);
  }

  return response.json();
}

export async function sendDifyCompletion(params: {
  inputs: Record<string, string>;
  user: string;
}) {
  const response = await fetch(`${ENV.difyApiBaseUrl}/completion-messages`, {
    method: "POST",
    headers: DIFY_HEADERS,
    body: JSON.stringify({
      inputs: params.inputs,
      user: params.user,
      response_mode: "blocking",
    }),
  });

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.status}`);
  }

  return response.json();
}
```

### 4.2 在 chat-router 中替换调用

在 `server/chat-router.ts` 的 `send` mutation 中，当 Dify 可用时优先使用 Dify：

```typescript
// 在 chat-router.ts 中添加判断逻辑
const useDify = ENV.difyApiBaseUrl && ENV.difyApiKey;

if (useDify) {
  // 使用 Dify 对话接口
  const difyResult = await sendDifyChat({
    query: input.message,
    conversationId: difyConversationMapping[input.conversationId],
    user: "a30-user",
    inputs: {
      risk_context: systemPrompt,
      user_profile: profileSummary,
    },
  });
  // 解析 difyResult.answer 作为回复
} else {
  // 使用当前的 Ark 直连方式（已实现）
}
```

### 4.3 在 anti-fraud-router 中替换 RAG 检索

在 `server/anti-fraud-router.ts` 的分析流程中，当 Dify 可用时使用 Dify 的 RAG Pipeline：

```typescript
if (useDify) {
  // 使用 Dify completion 接口进行风险分析
  const difyResult = await sendDifyCompletion({
    inputs: {
      content: analysisInput,
      mode: inputMode,
      history: recentEventsJson,
    },
    user: "a30-user",
  });
  // 解析 difyResult.answer 中的 JSON 结构
} else {
  // 使用当前的 Ark + 本地 Embedding 方式（已实现）
}
```

## 五、Dify 工作流配置建议

### 5.1 反诈分析工作流

在 Dify 中创建一个 Completion 类型应用，配置以下知识库：

1. **反诈案例库** - 收录常见诈骗类型、话术模板和判定标准
2. **法规政策库** - 收录反诈相关法律法规和处置指引
3. **诈骗话术库** - 收录高频诈骗话术关键词和模式

工作流输入变量：
- `content`：用户提交的文本/转录内容
- `mode`：输入模式（text/audio/image）
- `history`：近期事件 JSON

### 5.2 聊天助手工作流

在 Dify 中创建一个 Chat 类型应用，配置：

- 系统提示词：使用本项目 `chat-router.ts` 中的 `buildSystemPrompt` 生成的内容
- 知识库：同上
- 会话变量：用户画像、风险标签、敏感度等

## 六、会话映射

Dify 使用 `conversation_id` 维护会话状态。本项目需要维护一个映射表：

```
本项目 conversationId ↔ Dify conversation_id
```

建议在服务端内存或数据库中维护此映射，确保同一对话始终路由到同一 Dify 会话。

## 七、回退策略

当 Dify 不可用时（网络故障、配置未完成等），系统自动回退到当前的 Ark 直连方式。回退判断逻辑：

1. 环境变量未配置 → 直接使用 Ark
2. Dify API 调用失败 → 捕获异常后回退到 Ark
3. Dify 返回格式异常 → 使用本地回退引擎

## 八、测试验证

接入 Dify 后，可通过以下方式验证：

1. 在 Secrets 面板配置 `DIFY_API_BASE_URL` 和 `DIFY_API_KEY`
2. 重启服务端
3. 在聊天助手中发送测试消息，观察回复是否来自 Dify
4. 在检测页面提交测试内容，观察分析结果是否包含 RAG 检索信息
5. 断开 Dify 连接，验证回退到 Ark 直连是否正常
