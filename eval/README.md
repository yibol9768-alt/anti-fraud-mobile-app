# eval runner

Stand-alone evaluation harness for the `antiFraud.analyze` tRPC path. Kept
outside the mobile-app source tree; intentionally not bundled by Metro.

## Layout

```
eval/
├── src/                 # runner entry points (ESM, plain node)
│   ├── client.mjs       # tRPC v11 client + data-URL image + DashScope ASR
│   ├── loadDataset.mjs  # benchmark.dataset.json loader + asset-path fix
│   ├── metrics.mjs      # percentile / confusion matrix / group-by helpers
│   ├── runReadiness.mjs # env + status probe
│   ├── runFunctional.mjs# full 54-case eval, per-modality + per-fraud-type
│   ├── runLatency.mjs   # 9 cases × 5 reps, overall/p50/p90/p95
│   ├── runStress.mjs    # concurrency 1/5/10 × 180s
│   └── runAll.mjs       # orchestrator (ONLY=functional,latency,stress)
└── package.json         # @trpc/client + superjson (no tsx / esbuild needed)
```

`dataset/` and `results/` are gitignored. Extract
`evaluation-dataset*.zip` into `eval/dataset/` before running so the layout
matches `dataset/build/benchmark.dataset.json` and
`dataset/assets/_sources/*`.

## Prerequisites

- Node 20+ (the dev Mac uses the system `/usr/local/bin/node`).
- Bun 1.3+ to actually serve the server (`brew install bun` — the upstream
  `tsx` harness is killed silently by macOS Sequoia's App Management layer
  for unsigned helper binaries). You can fall back to `tsx` on Linux/older
  macOS where this isn't an issue.
- `ffmpeg` for audio trimming (`brew install ffmpeg`) — Qwen3 ASR Flash has
  a ~180s input limit, so the runner auto-trims anything > 2.4 MB to 150s.

## Server env (write to `a30-anti/.env`, already gitignored)

```
ARK_API_KEY=...
ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-lite-260215

# Embedding can live on a different provider (火山 Ark embedding endpoints
# require opening a per-model inference access point; DashScope's
# OpenAI-compatible layer ships text-embedding-v4 out of the box).
EMBEDDING_API_KEY=sk-...
EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4
```

Optional: `VOLC_SPEECH_APP_ID` / `VOLC_SPEECH_ACCESS_KEY` /
`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` to enable the server's
own `voice.transcribe` + `antiFraud.uploadImage` paths. Without them the
runner talks to DashScope ASR directly and inlines images as `data:` URLs.

## Commands

```
cd a30-anti && PORT=3000 bun server/_core/index.ts  # or pnpm dev:server on linux

cd a30-anti/eval
node src/runReadiness.mjs          # environment + status probe
node src/runFunctional.mjs         # 54-case accuracy/P/R/F1 breakdown
MODALITY_FILTER=text node src/runFunctional.mjs  # text-only subset
node src/runLatency.mjs            # 9 × 5 latency matrix
node src/runStress.mjs             # 1/5/10 concurrency × 180s
ONLY=functional,latency node src/runAll.mjs
```

Key env knobs:

- `MODALITY_FILTER=text,image,audio` — narrow functional eval to modality
- `USE_FORGE_STORAGE=1` — route image uploads via server `antiFraud.uploadImage`
- `USE_SERVER_TRANSCRIBE=1` — route audio via server `voice.transcribe` (needs VOLC keys)
- `DASHSCOPE_ASR_MODEL=qwen3-asr-flash` — override the ASR model
- `ASR_MAX_SECONDS=150` — trim long audio before ASR
- `STRESS_DURATION_SECONDS=180` / `STRESS_CONCURRENCY=1,5,10`
- `LATENCY_REPS=5` / `LATENCY_CASES_PER_MODALITY=3`

## Known gotcha

The runner passes a unique `deviceId` per case. The server's
`runtimeMemoryStore` is keyed on `deviceId`, and sharing it across cases
leaks each case's `recentEvents` + `riskTags` into the next one, which is
enough on its own to turn white samples into medium/high across the whole
run. If you roll your own harness and see an anomalous drop in precision
around the middle of the batch, this is almost certainly why.
