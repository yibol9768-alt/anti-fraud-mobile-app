# 豆包 Ark 模型接入选择记录

基于当前账号下实际可访问的 Ark 模型列表，项目已经确认可以直接调用**文本生成模型**与**文本向量模型**。这意味着当前版本不必继续停留在纯本地分析阶段，可以将服务端主分析链路切换到真实模型调用，同时为后续的 Embedding RAG 保留同一平台下的替换路径。

| 能力类型 | 当前可见候选模型 | 推荐优先级 | 选择理由 |
| --- | --- | --- | --- |
| 文本分析主模型 | `doubao-seed-2-0-lite-260215`、`doubao-seed-2-0-pro-260215`、`qwen3-32b-20250429`、`qwen2-5-72b-20240919`、`deepseek-v3-250324`、`deepseek-v3-2-251201` | 第一优先：`doubao-seed-2-0-lite-260215`；第二优先：`doubao-seed-2-0-pro-260215` | 同属 Ark 生态，后续运维和鉴权最简单；`lite` 适合当前交互延迟要求，`pro` 适合作为高质量升级选项。 |
| 文本 Embedding | `doubao-embedding-text-240715`、`doubao-embedding-large-text-240915`、`doubao-embedding-large-text-250515` | 第一优先：`doubao-embedding-large-text-250515`；回退：`doubao-embedding-text-240715` | `large` 更适合作为后续反诈知识库的语义召回底座；保留旧版本作为兼容回退路径。 |
| 多模态视觉补充 | `doubao-vision-pro-32k-241028`、`doubao-1-5-vision-pro-32k-250115`、`doubao-seed-1-6-vision-250815` | 暂不作为本阶段主链路 | 当前核心目标仍是文本、记忆和报告闭环，视觉模型可在截图识别阶段单独接入。 |

当前建议的接入策略是：**服务端风险分析默认使用 `doubao-seed-2-0-lite-260215`，并在配置层保留可切换到 `doubao-seed-2-0-pro-260215` 的能力；后续知识检索向量化默认使用 `doubao-embedding-large-text-250515`。** 这样既满足当前可运行交付，也与用户后续要求的 Embedding RAG 路线保持一致。

从工程角度看，服务端应尽量把模型名做成集中配置，而不是散落在业务逻辑中。这样后续无论切到 Dify 工作流，还是继续沿用 Ark 原生调用，移动端都不需要感知模型层差异。与此同时，当前本地受 haystack-rag-app 启发的检索管线可以继续保留，但生成阶段应尽快切换为 Ark 真正输出，以提升反诈判断、证据摘要和建议文本的可信度。

下一步实现建议是先完成三件事：其一，在服务端新增 Ark 客户端封装，并暴露统一的 `analyzeRisk` 调用；其二，将当前反诈路由中的本地生成逻辑替换为 Ark 文本生成；其三，为后续 Embedding RAG 预留 `embedDocuments` 与 `embedQuery` 接口，使知识库检索可以逐步从启发式相似匹配过渡到真实向量检索。
