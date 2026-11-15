<!-- repository-brand:start -->
<p align="center"><img src=".github/assets/repository-cover.jpg" alt="Anti-Fraud Assistant" width="100%"></p>
<p align="center"><strong>Multimodal fraud-risk awareness for different users.</strong></p>
<p align="center"><a href="https://github.com/yibol9768-alt/anti-fraud-mobile-app">Code</a> · <a href="https://github.com/yibol9768-alt/anti-fraud-mobile-app/issues">Issues</a></p>
<!-- repository-brand:end -->

# A30 多模态反诈智能助手 · 文档索引

本目录是 A30 项目(仓库 `a30-anti`)的完整文档体系入口。

## 核心产物

| 文档 | 形式 | 覆盖范围 |
|---|---|---|
| [`a30-project-plan.tex`](./a30-project-plan.tex) + [`a30-project-plan.pdf`](./a30-project-plan.pdf) | LaTeX + PDF(45 页) | **主项目计划书** — 问题场景 / 用户需求 / 产品方案 / ToB 商业计划 / 系统架构 / 技术路线 / 知识底座 / 测试验证 / 项目管理 |
| [`evaluation.md`](./evaluation.md) | Markdown | 54-case 多模态评测集说明 + eval runner 使用指南 + 复现步骤 |
| [`deployment.md`](./deployment.md) | Markdown | 本地开发 + 服务端部署 + env 变量 + macOS Sequoia 已知问题(tsx/esbuild 被 App Management 静默 kill → bun) |
| [`rag-scheme.md`](./rag-scheme.md) | Markdown | 本地 haystack-style RAG 设计说明(先前版本保留) |
| [`dify-integration-guide.md`](./dify-integration-guide.md) | Markdown | 可选 Dify workflow 集成路径(先前版本保留) |

## 图与插图资产

- [`figures/`](./figures/) 共 40+ PNG
  - 11 张真机 Expo Web 截图(home/detect ×3 / chat / report / memory / profile / guardian / login / onboarding)
  - 24 张 mermaid 架构/流程/业务图(可在 [`figures/mermaid-src/`](./figures/mermaid-src/) 看到源 `.mmd` 并通过 [`figures/scripts/render_mermaid.sh`](./figures/scripts/render_mermaid.sh) 重新生成)
  - 4 张 matplotlib 评测数据图(`testset-composition` / `test-results` / `latency-results` / `stability-results`),源脚本 [`figures/scripts/make_charts.py`](./figures/scripts/make_charts.py)
- 截图脚手架 [`figures/scripts/capture_screens.py`](./figures/scripts/capture_screens.py)(playwright headless,在 Expo Web 端注入 AsyncStorage 身份后批量抓取)

## 快速复现

```bash
# 1. 重新编译 PDF
cd a30-anti/docs && xelatex -interaction=nonstopmode a30-project-plan.tex   # 跑两次

# 2. 刷新评测数据图(需要 matplotlib)
python3 figures/scripts/make_charts.py

# 3. 刷新 mermaid 图(需网络,走 mermaid.ink)
bash figures/scripts/render_mermaid.sh

# 4. 重新截屏(需 Expo web + playwright + server up)
python3 figures/scripts/capture_screens.py
```

## 历史归档

- [`archive/docs-v1.zip`](./archive/docs-v1.zip) — 2026-04-17 的 docs 体系备份(25 份 Markdown + 4 份中文名旧 md + `A30.docx`)。这些文档里的目录指针(`anti-fraud-mobile-app/`)和叙事口径已经由 `a30-project-plan.tex` v2 + `evaluation.md` + `deployment.md` 取代。保留归档是为了追溯写作过程。

## 维护准则

- **事实一致性**:所有 "拟" "预期" "建议后续" 等 hedge 词汇只能出现在真正未落地的规划段落。当前代码已实现的能力必须用实际函数/文件/评测数字表述。
- **路径准确性**:所有代码路径以仓库根目录 `a30-anti/` 为基准。移动端主 App 不再是 `anti-fraud-mobile-app/`。
- **图一定要是真图**:任何 `\placeholderbox` 都应替换为 `figures/` 下的实际 PNG,或删除对应 `\begin{figure}` 块。
- **评测数字同步**:`a30-project-plan.tex` 与 `evaluation.md` 中的 P/R/F1/latency/stress 数字均应与 [`../../../eval/results/`](../../eval/results/) 的 JSON 快照对齐,任一侧更新后另一侧同步修订。
