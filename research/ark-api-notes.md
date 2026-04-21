# 豆包 Ark API 接入笔记

本阶段已从火山方舟官方文档确认，当前项目可以按 **OpenAI 兼容风格** 接入豆包 Ark 服务端能力。对于文本生成主链路，核心接口为：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`。[1]

当前已明确的关键接入点如下。

| 项目 | 结论 |
| --- | --- |
| 对话接口 | `POST /api/v3/chat/completions` |
| 鉴权方式 | `Authorization: Bearer <ARK_API_KEY>` |
| 请求体核心字段 | `model`、`messages` |
| 集成风格 | 官方提供 OpenAI SDK 兼容说明，意味着现有服务端可按兼容模式封装统一客户端 |
| 当前用途 | 用于替换反诈路由中本地生成说明文本的部分，使风险解释、建议与报告摘要来自真实模型 |

结合当前系统结构，下一步服务端实现应优先做三件事：第一，新增 Ark 客户端封装，统一处理 base URL、API Key、model 与错误回退；第二，在 `anti-fraud-router` 中保留现有受 Haystack 启发的本地检索与重排序，但把最终说明文本、建议补充与报告摘要交给 Ark 生成；第三，为后续 Embedding 接口预留同一封装层，以便将知识检索从当前本地向量近似方案切换到真实的豆包 Embedding。

## 当前已确认的文档事实

1. 官方对话接口文档显示，聊天生成接口为 `POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`，请求体至少包含 `model` 与 `messages`。[1]
2. 官方另有“兼容 OpenAI SDK”说明页面，表明 Ark 支持低改动兼容式接入，适合当前项目在服务端快速落地统一模型客户端。[2]

## 对当前项目的工程含义

| 模块 | 当前做法 | 接下来改造方向 |
| --- | --- | --- |
| 本地检索 | 继续保留，负责反诈案例召回与证据上下文拼装 | 保留作为 RAG 检索层 |
| 生成解释 | 当前仍主要依赖本地拼接 | 切换为 Ark Chat 生成 |
| 报告摘要 | 当前主要由本地规则生成 | 改为本地结构化数据 + Ark 文本润色 |
| Dify 替换 | 暂未可用 | 仍保留为未来编排入口 |
| Embedding | 当前为本地近似方案 | 后续切换为豆包文本向量模型 |

## 参考资料

[1]: https://www.volcengine.com/docs/82379/1494384 "对话(Chat) API--火山方舟"
[2]: https://www.volcengine.com/docs/82379/1330626 "兼容 OpenAI SDK--火山方舟"
