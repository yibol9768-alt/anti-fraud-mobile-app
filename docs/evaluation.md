# A30 54-case 多模态反诈评测

主文件见 `a30-project-plan.tex` §8。本页补全原始评测数据、如何跑 runner 重现结果、以及 modality/fraudType 级的混淆矩阵原始数值。

## 数据集

- 总量 **54 case**(25 black + 29 white,约 1:1)
- 模态拆分

| modality | total | black | white | P | R | F1 |
|---|---|---|---|---|---|---|
| text | 30 | 15 | 15 | 100% | 100% | **100%** |
| image | 12 | 6 | 6 | 100% | 66.67% | 80% |
| audio | 12 | 6 | 6 | 85.71% | 100% | 92.31% |
| **overall** | **54** | **27** | **27** | **96.15%** | **92.59%** | **94.34%** |

- 来源:公开诉讼文书 + 国家反诈中心公开披露 + 媒体曝光案例;各省反诈办公开的短信样本;自行搜集的正规短信/官方客服音频作为白样本。
- 黑样本 fraud_type 分布:phishing 4 / investment_scam 4 / impersonation 7 / shopping_refund 5 / loan_scam 3 / romance_scam 2 / complex 2
- 原始 JSON: `../../eval/results/functional.94_34.json`、`latency.final.json`、`stress.final.json`

## 3 张关键图

- 评测集构成 — [`figures/testset-composition.png`](./figures/testset-composition.png)
- P/R/F1 分模态对比 — [`figures/test-results.png`](./figures/test-results.png)
- 时延与稳定性 — [`figures/latency-results.png`](./figures/latency-results.png) / [`figures/stability-results.png`](./figures/stability-results.png)

## 重现步骤

1. 确保 bun server + DashScope/Ark 配置就绪(见 [`deployment.md`](./deployment.md))。
2. 从 zip 解压评测数据集到 `mobol_app/eval/dataset/`(dataset 不入库,只在 `build/benchmark.dataset.json` 作为输入)。
3. 在仓库根目录跑:
   ```bash
   # 功能评测
   cd ../eval && node src/runFunctional.mjs
   # 分模态限制
   MODALITY_FILTER=text node src/runFunctional.mjs
   # 时延
   node src/runLatency.mjs
   # 压测(1/5/10 并发 × 180 秒)
   node src/runStress.mjs
   ```
4. 结果落在 `eval/results/*.json` + `.csv`。再跑 `a30-anti/docs/figures/scripts/make_charts.py` 重绘柱状图。

## 已知的剩余错误

- **2 张图片 FN**:`black-17` / `black-18` 为"微信支付百万保障"/"支付宝电信诈骗保障"类合规页截图,Doubao vision 判读为官方页面,dataset 标注为 black 疑似依赖截图以外的上下文。下一轮需要与标注方确认口径。
- **1 条音频 FP**:`white-27` 自称"中国联通服务质量监督员"但拒绝给工号,LLM 自己也说"身份存疑",属于灰度样本。

## 消融实验

| 配置 | 文本子集 F1 |
|---|---|
| 仅本地规则(overlay off) | 66.67%(R 100%,P 50%) |
| overlay 直接覆写(max off) | 54.55%(R 37.5%,P 100%) |
| deviceId 共享(memory 污染) | 50%(全被判 high) |
| **当前线上配置** | **100%** |

结论:overlay 合并策略 + deviceId 隔离 > SAFE\_HINTS 扩充 > 规则条目扩展。
