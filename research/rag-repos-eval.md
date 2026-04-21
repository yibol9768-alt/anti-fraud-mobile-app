# 成熟开源 RAG 仓库候选评估

## 当前候选

| 候选仓库 | 仓库地址 | 当前观察到的关键能力 | 对本项目的初步判断 |
| --- | --- | --- | --- |
| RAGFlow | https://github.com/infiniflow/ragflow | 强调 production-ready AI systems、自带 streamlined RAG workflow、可配置 LLM 与 embedding models、多路召回与重排序、提供 API 集成能力 | 很适合作为“替换当前模拟 RAG 返回”的参考实现，尤其适合知识库检索、召回、重排序、API 接入这一层 |
| Haystack | https://github.com/deepset-ai/haystack | 强调 production-ready LLM applications、模块化 pipeline、显式控制 retrieval/routing/memory/generation、支持 scalable RAG、multimodal、semantic search，并可通过 Hayhooks 暴露 REST API 或 MCP server | 很适合作为“服务端可替换 RAG 编排层”的工程参考，尤其利于我们把记忆、检索、路由、生成拆成可替换组件 |

## 当前阶段结论

从“替换当前随意拼接的模拟返回”这个目标看，**RAGFlow 更像开箱即用的成熟 RAG 产品方案**，适合参考其“知识库检索 + 多路召回 + 重排序 + API 接入”的整体模式；**Haystack 更像成熟的工程框架方案**，适合参考其“检索、记忆、路由、生成显式解耦”的实现思路。

对于当前 A30 反诈移动应用，更合理的方向是：**服务端实现上借鉴 Haystack 的可组合管线思想，检索链路能力目标对齐 RAGFlow 这类成熟 RAG 产品的召回与重排序结构**。这样后续再接 Dify 自部署时，也更容易把服务端适配层替换为真实工作流调用，而不用回退到简单关键词搜索。

## 下一步

下一步继续查看更贴近“可落地代码结构”的候选仓库或示例仓库，优先检查：

1. 是否存在适合直接映射到当前服务端的 RAG 示例应用；
2. 是否支持 REST API / MCP 暴露；
3. 是否清楚区分检索、重排序、记忆、生成；
4. 是否便于未来替换为 Dify 自部署工作流。

## 补充候选：Haystack RAG App

| 候选仓库 | 仓库地址 | 当前观察到的关键能力 | 对本项目的初步判断 |
| --- | --- | --- | --- |
| haystack-rag-app | https://github.com/deepset-ai/haystack-rag-app | 提供一个完整的 RAG backend plus UI 示例；后端基于 FastAPI + Haystack 2；暴露 `POST /api/search`、`GET /api/files`、`POST /api/files`、`GET /api/health`；包含可运行的检索生成应用结构与 Docker Compose 部署方式 | 非常适合作为当前项目“服务端可替换 RAG 层”的直接参考，因为它不仅有框架理念，还有清晰的 API 形态、文件入库流程与查询接口设计 |

从当前三个候选的对比看，**RAGFlow** 适合借鉴产品化 RAG 能力目标，**Haystack** 适合借鉴模块化编排思想，**haystack-rag-app** 则最适合作为我们眼下重构服务端适配层的直接工程参考。下一步可优先围绕 haystack-rag-app 的“查询接口 + 文档入库 + 健康检查 + 可替换后端管线”结构，重构当前反诈服务端的本地闭环实现。
