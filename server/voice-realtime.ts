/**
 * Volcengine Doubao S2S (Speech-to-Speech) Realtime Voice Proxy
 *
 * The client connects to our server via WebSocket, and we proxy the connection
 * to the Volcengine Doubao realtime voice API. This avoids exposing API credentials
 * to the client and allows server-side session management.
 *
 * Protocol: Binary WebSocket frames following the Volcengine S2S spec.
 * Upstream: wss://openspeech.bytedance.com/api/v3/realtime/dialogue
 */

import { type Server as HttpServer } from "http";
import { createRequire } from "module";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

// Use createRequire to load ws as CJS in ESM context
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wsModule = _require("ws");
const WsServer: new (opts: object) => {
  on(event: "connection", cb: (ws: WsSocket) => void): void;
} = wsModule.Server;

// Optional HTTPS proxy agent — used when VOLC_UPSTREAM_PROXY is set
// (e.g. http://127.0.0.1:7890 for Clash/Mihomo), so Node tunnels the
// Volcengine wss:// connection through the user's proxy instead of going
// through the system fake-ip and dying at TLS handshake.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const HttpsProxyAgentCtor: new (url: string) => object = _require(
  "https-proxy-agent",
).HttpsProxyAgent;

interface WsSocket {
  binaryType: string;
  readyState: number;
  OPEN: number;
  send(data: Buffer | string): void;
  close(code?: number, reason?: string): void;
  on(event: "open", cb: () => void): void;
  on(event: "message", cb: (data: Buffer) => void): void;
  on(event: "close", cb: (code: number, reason: Buffer) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

const WsClient: new (url: string, opts?: object) => WsSocket = wsModule;
const WS_OPEN = 1; // ws.OPEN constant

// Volcengine S2S endpoint
const VOLC_S2S_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";

// Event IDs (client → server)
const EVENT_START_CONNECTION = 1;
const EVENT_FINISH_CONNECTION = 2;
const EVENT_START_SESSION = 100;
const EVENT_FINISH_SESSION = 102;
const EVENT_TASK_REQUEST = 200;
const EVENT_END_ASR = 400;

// Message type flags
const MSG_TYPE_FULL_CLIENT = 0b0001;
const MSG_TYPE_AUDIO_ONLY = 0b0010;

// Serialization: JSON = 1
const SERIALIZE_JSON = 0x01;

function buildFrameHeader(
  msgType: number,
  msgFlags: number,
  serialize: number,
  compress: number,
): Buffer {
  const header = Buffer.alloc(4);
  header[0] = (0x01 << 4) | 0x01;
  header[1] = (msgType << 4) | msgFlags;
  header[2] = (serialize << 4) | compress;
  header[3] = 0x00;
  return header;
}

function buildClientEventFrame(eventId: number, payload: object, sessionId?: string): Buffer {
  const header = buildFrameHeader(MSG_TYPE_FULL_CLIENT, 0b0100, SERIALIZE_JSON, 0x00);
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeUInt32BE(eventId, 0);
  const payloadBuf = Buffer.from(JSON.stringify(payload), "utf-8");
  const payloadSizeBuf = Buffer.alloc(4);
  payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0);

  if (sessionId) {
    const sessionIdBuf = Buffer.from(sessionId, "utf-8");
    const sessionIdSizeBuf = Buffer.alloc(4);
    sessionIdSizeBuf.writeUInt32BE(sessionIdBuf.length, 0);
    return Buffer.concat([header, eventBuf, sessionIdSizeBuf, sessionIdBuf, payloadSizeBuf, payloadBuf]);
  }
  return Buffer.concat([header, eventBuf, payloadSizeBuf, payloadBuf]);
}

function buildAudioFrame(audioData: Buffer, sessionId: string, sequence: number): Buffer {
  const header = buildFrameHeader(MSG_TYPE_AUDIO_ONLY, 0b0101, 0x00, 0x00);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(sequence, 0);
  const eventBuf = Buffer.alloc(4);
  eventBuf.writeUInt32BE(EVENT_TASK_REQUEST, 0);
  const sessionIdBuf = Buffer.from(sessionId, "utf-8");
  const sessionIdSizeBuf = Buffer.alloc(4);
  sessionIdSizeBuf.writeUInt32BE(sessionIdBuf.length, 0);
  const payloadSizeBuf = Buffer.alloc(4);
  payloadSizeBuf.writeUInt32BE(audioData.length, 0);
  return Buffer.concat([header, seqBuf, eventBuf, sessionIdSizeBuf, sessionIdBuf, payloadSizeBuf, audioData]);
}

export function registerVoiceRealtimeProxy(httpServer: HttpServer): void {
  const wss = new WsServer({ server: httpServer, path: "/api/voice/realtime" });

  wss.on("connection", (clientWs: WsSocket) => {
    console.log("[voice-realtime] client connected");

    if (!ENV.volcSpeechAppId || !ENV.volcSpeechAccessKey) {
      const msg = "语音服务未配置(缺少 VOLC_SPEECH_APP_ID / VOLC_SPEECH_ACCESS_KEY)";
      console.warn(`[voice-realtime] ${msg}`);
      try {
        clientWs.send(JSON.stringify({ type: "error", error: msg }));
      } catch {
        // ignore send failure
      }
      clientWs.close(1011, "voice service not configured");
      return;
    }

    let upstreamWs: WsSocket | null = null;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let sessionStarted = false;
    let audioSeq = 3;
    const pendingAudio: Buffer[] = [];

    const connectUpstream = () => {
      const upstreamProxy = process.env.VOLC_UPSTREAM_PROXY;
      const wsOpts: Record<string, unknown> = {
        headers: {
          Authorization: `Bearer; ${ENV.volcSpeechAccessKey}`,
          "X-Api-App-ID": ENV.volcSpeechAppId,
          "X-Api-Access-Key": ENV.volcSpeechAccessKey,
          "X-Api-Resource-Id": "volc.speech.dialog",
          "X-Api-App-Key": "PlgvMymc7f3tQnJ6",
          "X-Api-Connect-Id": randomUUID(),
        },
      };
      if (upstreamProxy) {
        wsOpts.agent = new HttpsProxyAgentCtor(upstreamProxy);
        console.log("[voice-realtime] using upstream proxy:", upstreamProxy);
      } else {
        console.log("[voice-realtime] no upstream proxy configured");
      }
      upstreamWs = new WsClient(VOLC_S2S_URL, wsOpts);
      upstreamWs.binaryType = "nodebuffer";

      upstreamWs.on("open", () => {
        console.log("[voice-realtime] upstream connected");
        const eventBuf = Buffer.alloc(4);
        eventBuf.writeUInt32BE(EVENT_START_CONNECTION, 0);
        const payloadBuf = Buffer.from("{}", "utf-8");
        const payloadSizeBuf = Buffer.alloc(4);
        payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0);
        const header = buildFrameHeader(MSG_TYPE_FULL_CLIENT, 0b0100, SERIALIZE_JSON, 0x00);
        const startConnFrame = Buffer.concat([header, eventBuf, payloadSizeBuf, payloadBuf]);
        upstreamWs!.send(startConnFrame);
      });

      upstreamWs.on("message", (data: Buffer) => {
        if (clientWs.readyState === WS_OPEN) {
          clientWs.send(data);
        }
      });

      upstreamWs.on("close", (code: number, reason: Buffer) => {
        console.log(`[voice-realtime] upstream closed: ${code} ${reason.toString()}`);
        if (clientWs.readyState === WS_OPEN) {
          clientWs.close(1000, "upstream closed");
        }
      });

      upstreamWs.on("error", (err: Error) => {
        console.error("[voice-realtime] upstream error:", err.message);
        if (clientWs.readyState === WS_OPEN) {
          clientWs.close(1011, "upstream error");
        }
      });
    };

    connectUpstream();

    clientWs.on("message", (data: Buffer) => {
      // Try to parse as JSON control message first
      let parsed: { type?: string } | null = null;
      try {
        const str = data.toString("utf-8");
        parsed = JSON.parse(str) as { type?: string };
      } catch {
        parsed = null;
      }

      if (parsed && parsed.type) {
        if (!upstreamWs || upstreamWs.readyState !== WS_OPEN) return;

        if (parsed.type === "start_session") {
          const sessionPayload = {
            dialog: {
              bot_name: "小安",
              system_role:
                "你是一位专业的反诈骗智能助手，名叫小安。你的职责是帮助用户识别和防范各类诈骗行为，包括电话诈骗、短信诈骗、网络诈骗等。当用户描述可疑情况时，你要冷静分析，给出专业建议，帮助用户保护自己和家人的财产安全。说话要简洁、清晰、亲切，像一个贴心的防诈顾问。",
              speaking_style: "说话简洁有力，语气关切，遇到高风险情况要明确提醒用户立刻停止操作。",
              model: "2.2.0.0",
              input_mod: "audio",
              strict_audit: false,
            },
            asr: { extra: { end_smooth_window_ms: 1200, enable_asr_twopass: true } },
            tts: { audio_config: { speech_rate: 5, loudness_rate: 0 } },
          };
          const startSessionFrame = buildClientEventFrame(EVENT_START_SESSION, sessionPayload, sessionId);
          upstreamWs.send(startSessionFrame);
          sessionStarted = true;
          for (const audioChunk of pendingAudio) {
            upstreamWs.send(buildAudioFrame(audioChunk, sessionId, audioSeq++));
          }
          pendingAudio.length = 0;
        } else if (parsed.type === "end_session") {
          upstreamWs.send(buildClientEventFrame(EVENT_FINISH_SESSION, {}, sessionId));
          sessionStarted = false;
        } else if (parsed.type === "end_asr") {
          upstreamWs.send(buildClientEventFrame(EVENT_END_ASR, {}, sessionId));
        }
      } else {
        // Raw audio PCM
        if (!upstreamWs || upstreamWs.readyState !== WS_OPEN) {
          pendingAudio.push(data);
          return;
        }
        if (sessionStarted) {
          upstreamWs.send(buildAudioFrame(data, sessionId, audioSeq++));
        } else {
          pendingAudio.push(data);
        }
      }
    });

    clientWs.on("close", () => {
      console.log("[voice-realtime] client disconnected");
      if (upstreamWs && upstreamWs.readyState === WS_OPEN) {
        if (sessionStarted) {
          upstreamWs.send(buildClientEventFrame(EVENT_FINISH_SESSION, {}, sessionId));
        }
        const eventBuf = Buffer.alloc(4);
        eventBuf.writeUInt32BE(EVENT_FINISH_CONNECTION, 0);
        const payloadBuf = Buffer.from("{}", "utf-8");
        const payloadSizeBuf = Buffer.alloc(4);
        payloadSizeBuf.writeUInt32BE(payloadBuf.length, 0);
        const header = buildFrameHeader(MSG_TYPE_FULL_CLIENT, 0b0100, SERIALIZE_JSON, 0x00);
        const finishFrame = Buffer.concat([header, eventBuf, payloadSizeBuf, payloadBuf]);
        upstreamWs.send(finishFrame);
        upstreamWs.close();
      }
    });

    clientWs.on("error", (err: Error) => {
      console.error("[voice-realtime] client error:", err.message);
    });
  });

  console.log("[voice-realtime] WebSocket proxy registered at /api/voice/realtime");
}
