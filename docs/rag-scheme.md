# RAG 方案实现说明

本文档说明 A30 反诈智能助手的 RAG（检索增强生成）方案设计与实现状态。

## 一、方案概述

A30 采用 **Embedding 向量检索** 路线实现 RAG，而非简单关键词搜索。当前实现分为两层：

| 层级 | 实现方式 | 状态 |
|------|---------|------|
| **主链路** | 豆包 Ark Embedding API + 服务端向量相似度计算 | 已实现 |
| **扩展链路** | Dify RAG Pipeline（自部署知识库检索） | 已预留接口 |
| **回退链路** | 本地关键词匹配 + 规则引擎 | 已实现 |

## 二、主链路实现

### 2.1 Embedding 生成

使用豆包 Ark 的 Embedding 模型将用户输入和知识库内容转换为向量：

```typescript
// server/ark-client.ts
export async function createEmbedding(text: string): Promise<number[]> {
  const response = await arkClient.embeddings.create({
    model: ENV.arkEmbeddingModel,
    input: text,
  });
  return response.data[0].embedding;
}
```

### 2.2 向量检索流程

```
用户输入 → Embedding 生成 → 与知识库向量计算余弦相似度 → 取 Top-K 结果 → 注入 LLM Prompt
```

### 2.3 知识库构成

当前知识库以服务端内存中的结构化数据为基础：

1. **诈骗类型知识** - 定义在 `shared/anti-fraud.ts` 的 `FRAUD_TYPE_LABELS` 中
2. **风险等级标准** - 定义在 `shared/anti-fraud.ts` 的 `RISK_LEVEL_LABELS` 中
3. **用户历史事件** - 存储在客户端 `anti-fraud-store` 的 `recentEvents` 中
4. **长期记忆画像** - 存储在客户端 `anti-fraud-store` 的 `longTerm` 中

### 2.4 分析流程中的 RAG 应用

在 `server/anti-fraud-router.ts` 的 `analyze` mutation 中：

1. 将用户输入（文本/转录/图片描述）生成 Embedding
2. 与历史事件的 Embedding 计算相似度
3. 将最相关的历史事件作为上下文注入分析 Prompt
4. LLM 基于增强后的上下文生成风险分析结果

## 三、聊天助手中的 RAG

在 `server/chat-router.ts` 的 `send` mutation 中：

1. 将用户消息生成 Embedding
2. 检索相关的历史对话和风险事件
3. 将检索结果注入系统提示词
4. LLM 基于增强上下文生成回复和追问

## 四、本地回退引擎

当远程 API 不可用时，`lib/anti-fraud-engine.ts` 提供本地回退：

1. **关键词匹配** - 基于预定义的诈骗关键词列表进行匹配
2. **规则评分** - 基于匹配到的关键词类别和数量计算风险分
3. **模板生成** - 基于规则评分结果生成结构化分析报告

## 五、Dify RAG 扩展

当接入 Dify 后，RAG 流程将升级为：

```
用户输入 → 本项目服务端 → Dify RAG Pipeline → 知识库检索 → LLM 生成 → 返回结果
```

Dify 的 RAG Pipeline 优势：
- 支持文档级别的知识库管理（PDF、Word、网页等）
- 内置文档分块、Embedding 生成和向量存储
- 支持混合检索（向量 + 关键词）
- 可视化配置检索参数（Top-K、相似度阈值等）

详见 [Dify 接入指南](./dify-integration-guide.md)。

## 六、测试方案

### 6.1 Embedding 质量测试

验证 Embedding 模型能正确区分不同类型的诈骗内容：

```
输入 A: "你好，我是公安局的，你的银行卡涉嫌洗钱"
输入 B: "你好，你的快递到了，请签收"
输入 C: "你好，我是检察院的，你涉嫌一起案件"

期望：A 和 C 的相似度 > A 和 B 的相似度
```

### 6.2 端到端分析测试

验证 RAG 增强后的分析质量：

1. 先提交一条高风险内容建立历史记录
2. 再提交一条相似的内容
3. 验证第二次分析是否引用了第一次的历史事件
4. 验证风险评分是否因历史关联而提升

### 6.3 回退测试

1. 断开网络或清除 API Key
2. 提交分析请求
3. 验证本地回退引擎是否正常工作
4. 验证回退结果的格式是否与主链路一致

### 6.4 聊天 RAG 测试

1. 在聊天助手中描述一个诈骗场景
2. 验证助手是否能基于知识库给出准确的风险判断
3. 验证追问是否能引导用户提供更多关键信息
4. 验证处置建议是否具体可操作

## 七、性能指标

| 指标 | 目标值 | 当前状态 |
|------|--------|---------|
| Embedding 生成延迟 | < 500ms | 依赖 Ark API 响应 |
| 向量检索延迟（Top-5） | < 100ms | 内存计算，已达标 |
| 端到端分析延迟 | < 5s | 依赖 LLM 响应 |
| 聊天回复延迟 | < 3s | 依赖 LLM 响应 |
| 回退引擎延迟 | < 50ms | 纯本地计算，已达标 |
