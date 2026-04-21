# A30 本地开发与部署

## 运行时依赖

- Node 20+(服务端 tRPC 客户端 + runner 脚本)
- **Bun 1.3+**(服务端入口 `server/_core/index.ts`;macOS Sequoia 下 tsx/esbuild 的 helper 进程会被 App Management 静默 kill,因此本地开发不再使用 `pnpm dev:server`)
- pnpm(前端 Metro + Expo)
- ffmpeg(evaluation runner 里做音频预截断,避免 DashScope ASR 180 秒硬限制)
- Chromium via Playwright(可选,用于截图脚手架)

## env 变量一览(`.env` 不入库)

| 变量 | 必填 | 用途 |
|---|---|---|
| `ARK_API_KEY` | ✓ | 火山方舟 API key,驱动 Doubao chat + vision overlay |
| `ARK_API_BASE_URL` | 默认 `https://ark.cn-beijing.volces.com/api/v3` | |
| `ARK_MODEL` | ✓ | 建议 `doubao-seed-2-0-lite-260215`(兼具 chat + vision) |
| `ARK_EMBEDDING_MODEL` | 可选 | 若账号开通了火山方舟 embedding,填对应接入点 id。**当前演示账号下文本 embedding 预设推理接入点未开通**,因此 `EMBEDDING_*` 覆写到 DashScope |
| `EMBEDDING_API_KEY` | 可选(默认 fallback 回 `ARK_API_KEY`) | 多 provider 支持,例如 DashScope |
| `EMBEDDING_API_BASE_URL` | 可选 | 例如 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `EMBEDDING_MODEL` | 可选 | 例如 `text-embedding-v4`(阿里云百炼 OpenAI 兼容) |
| `VOLC_SPEECH_APP_ID` / `VOLC_SPEECH_ACCESS_KEY` | 可选 | 启用服务器内置 `voice.transcribe`;不配则 eval runner 走客户端 DashScope qwen3-asr-flash |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | 可选 | forge 对象存储代理;不配则图片走 `data:image/*;base64` URL 内联 |
| `DASHSCOPE_API_KEY` | 可选(runner 侧) | eval runner 做音频 ASR 时单独读;默认会落到 env 里的同名键 |
| `OAUTH_SERVER_URL` / `VITE_APP_ID` / `VITE_OAUTH_PORTAL_URL` | 可选 | Manus 登录闭环,开发环境可以留空 |

## 启动本地服务

```bash
# 服务端(端口 3000)
cd a30-anti
bun server/_core/index.ts

# 前端 metro web(端口 8081)
EXPO_PORT=8081 pnpm dev:metro
# 或直接:
npx expo start --web --port 8081

# Android native(需要真机 + adb):
pnpm android
```

## 已知问题

1. **tsx/esbuild 被 macOS App Management 静默 kill**:在 macOS Sequoia 上使用 `pnpm dev:server`(走 tsx)时 helper binary 会被系统策略拒绝加载,日志里看到 `library load disallowed by system policy`。解决方案是改用 Bun 直接执行 `server/_core/index.ts`,Bun 自带 TypeScript 支持且无 helper 进程。Linux/CI 环境不受影响。
2. **lightningcss native binding 被隔离**:`lightningcss.darwin-arm64.node` 上会挂 `com.apple.quarantine` xattr 导致 Metro 启动失败,解决办法是 `xattr -d com.apple.quarantine <path>`。`a30-anti/docs/figures/scripts/render_mermaid.sh` 的调用上下文下未触发,因为这类 native binding 只在 Metro 端发生。
3. **DashScope qwen3-asr-flash 音频长度限制**:约 180 秒上限。`eval/src/client.mjs` 里内置了 ffmpeg 自动截断至 150 秒,超过阈值自动做一次 `ffmpeg -t 150 -acodec copy`,配合 3 次指数退避重试。
4. **Doubao overlay JSON 偶发截断**:在 `runArkOverlay` 里 `maxTokens` 设为 1800 后不再常见;若仍遇到,可在 `server/anti-fraud-router.ts` 里把 `coerceFraudType` 的 fallback 放更宽松。
5. **MCP chrome-in-chrome 扩展与 Playwright headless 的关系**:两者完全独立,截图脚手架 `capture_screens.py` 使用 Playwright 内置的 Chromium,不依赖用户侧 Chrome 的 MCP 会话。

## 生成评测/文档资产

```bash
cd a30-anti/docs
# 图表
python3 figures/scripts/make_charts.py
# mermaid
bash figures/scripts/render_mermaid.sh
# app 截图(需服务端 + Metro 双起)
python3 figures/scripts/capture_screens.py
# 主项目计划书 PDF
xelatex -interaction=nonstopmode a30-project-plan.tex && xelatex -interaction=nonstopmode a30-project-plan.tex
```
