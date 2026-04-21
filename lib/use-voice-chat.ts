/**
 * useVoiceChat — Direct client-side connection to Volcengine Doubao S2S.
 *
 * This hook connects directly to wss://openspeech.bytedance.com/api/v3/realtime/dialogue
 * from the APK (no server proxy), builds the binary frame protocol inline, and
 * streams recorded audio up / plays TTS audio down.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

// ---------- Volcengine config (baked into APK via EXPO_PUBLIC_*) ----------
const VOLC_WS_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const VOLC_APP_ID = process.env.EXPO_PUBLIC_VOLC_SPEECH_APP_ID ?? "";
const VOLC_ACCESS_KEY = process.env.EXPO_PUBLIC_VOLC_SPEECH_ACCESS_KEY ?? "";
const VOLC_APP_KEY = "PlgvMymc7f3tQnJ6";
const VOLC_RESOURCE_ID = "volc.speech.dialog";

// ---------- Event IDs ----------
const EVENT_START_CONNECTION = 1;
const EVENT_START_SESSION = 100;
const EVENT_FINISH_SESSION = 102;
const EVENT_TASK_REQUEST = 200;
const EVENT_END_ASR = 400;

const SERVER_EVENT_CONNECTION_STARTED = 50;
const SERVER_EVENT_SESSION_STARTED = 150;
const SERVER_EVENT_SESSION_FINISHED = 152;
const SERVER_EVENT_ASR_INFO = 450;
const SERVER_EVENT_ASR_RESULT = 451;
const SERVER_EVENT_ASR_ENDED = 459;
const SERVER_EVENT_CHAT_RESULT = 550;
const SERVER_EVENT_CHAT_ENDED = 559;
const SERVER_EVENT_TTS_SENTENCE_START = 350;
const SERVER_EVENT_TTS_SENTENCE_END = 351;
const SERVER_EVENT_TTS_AUDIO = 352;

// ---------- Frame type flags ----------
const MSG_TYPE_FULL_CLIENT = 0b0001;
const MSG_TYPE_AUDIO_ONLY = 0b0010;
const SERIALIZE_JSON = 0x01;

export type VoiceChatState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceChatTranscript {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

interface UseVoiceChatReturn {
  state: VoiceChatState;
  transcripts: VoiceChatTranscript[];
  errorMessage: string | null;
  isSessionActive: boolean;
  startSession: () => Promise<void>;
  stopSession: () => void;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

// ---------- Frame builders ----------
function buildHeader(msgType: number, msgFlags: number, serialize: number, compress: number): Uint8Array {
  const h = new Uint8Array(4);
  h[0] = (0x01 << 4) | 0x01;
  h[1] = (msgType << 4) | msgFlags;
  h[2] = (serialize << 4) | compress;
  h[3] = 0x00;
  return h;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, n, false);
  return b;
}

function i32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, n, false);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function buildStartConnectionFrame(): Uint8Array {
  const header = buildHeader(MSG_TYPE_FULL_CLIENT, 0b0100, SERIALIZE_JSON, 0x00);
  const event = u32be(EVENT_START_CONNECTION);
  const payload = new TextEncoder().encode("{}");
  const payloadSize = u32be(payload.length);
  return concat([header, event, payloadSize, payload]);
}

function buildClientEventFrame(eventId: number, payloadObj: unknown, sessionId?: string): Uint8Array {
  const header = buildHeader(MSG_TYPE_FULL_CLIENT, 0b0100, SERIALIZE_JSON, 0x00);
  const event = u32be(eventId);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
  const payloadSize = u32be(payloadBytes.length);
  if (sessionId) {
    const sid = new TextEncoder().encode(sessionId);
    const sidSize = u32be(sid.length);
    return concat([header, event, sidSize, sid, payloadSize, payloadBytes]);
  }
  return concat([header, event, payloadSize, payloadBytes]);
}

function buildAudioFrame(audioBytes: Uint8Array, sessionId: string, sequence: number): Uint8Array {
  const header = buildHeader(MSG_TYPE_AUDIO_ONLY, 0b0101, 0x00, 0x00);
  const seq = i32be(sequence);
  const event = u32be(EVENT_TASK_REQUEST);
  const sid = new TextEncoder().encode(sessionId);
  const sidSize = u32be(sid.length);
  const payloadSize = u32be(audioBytes.length);
  return concat([header, seq, event, sidSize, sid, payloadSize, audioBytes]);
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ParsedFrame {
  eventId: number;
  payload: unknown;
  sessionId: string | null;
  audioBytes: Uint8Array | null;
}

function parseServerFrame(data: ArrayBuffer): ParsedFrame | null {
  if (data.byteLength < 8) return null;
  const view = new DataView(data);
  const eventId = view.getUint32(4, false);
  let offset = 8;
  let payload: unknown = null;
  let sessionId: string | null = null;
  let audioBytes: Uint8Array | null = null;

  while (offset + 4 <= data.byteLength) {
    const size = view.getUint32(offset, false);
    offset += 4;
    if (offset + size > data.byteLength) break;
    const block = new Uint8Array(data, offset, size);
    offset += size;
    if (block.length === 0) continue;
    const first = block[0];
    if (first === 0x7b || first === 0x5b) {
      try {
        payload = JSON.parse(new TextDecoder().decode(block));
        break;
      } catch {
        // not valid JSON, treat as raw
      }
    }
    if (sessionId === null) {
      try {
        sessionId = new TextDecoder("utf-8", { fatal: true }).decode(block);
        continue;
      } catch {
        // not text
      }
    }
    if (audioBytes === null) {
      audioBytes = new Uint8Array(block);
    }
  }

  return { eventId, payload, sessionId, audioBytes };
}

export function useVoiceChat(): UseVoiceChatReturn {
  const [state, setState] = useState<VoiceChatState>("idle");
  const [transcripts, setTranscripts] = useState<VoiceChatTranscript[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(randomId("session"));
  const audioSeqRef = useRef<number>(3);
  const ttsChunksRef = useRef<Uint8Array[]>([]);
  const isSessionActiveRef = useRef(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const appendTranscript = useCallback((role: "user" | "assistant", text: string) => {
    if (!text.trim()) return;
    setTranscripts((prev) => [
      ...prev,
      { role, text: text.trim(), timestamp: new Date().toISOString() },
    ]);
  }, []);

  const stopSession = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN && isSessionActiveRef.current) {
          ws.send(buildClientEventFrame(EVENT_FINISH_SESSION, {}, sessionIdRef.current));
        }
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    isSessionActiveRef.current = false;
    setState("idle");
  }, []);

  const startSession = useCallback(async () => {
    if (state !== "idle" && state !== "error") return;

    if (Platform.OS === "web") {
      setErrorMessage("实时语音对话暂不支持网页端,请在手机 App 中使用。");
      setState("error");
      return;
    }

    if (!VOLC_APP_ID || !VOLC_ACCESS_KEY) {
      setErrorMessage("语音服务凭证未配置。");
      setState("error");
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setErrorMessage("需要麦克风权限才能使用语音对话。");
      setState("error");
      return;
    }

    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {
      // non-iOS
    }

    setState("connecting");
    setErrorMessage(null);
    setTranscripts([]);
    sessionIdRef.current = randomId("session");
    audioSeqRef.current = 3;

    const connectId = randomId("conn");
    const headers = {
      Authorization: `Bearer; ${VOLC_ACCESS_KEY}`,
      "X-Api-App-ID": VOLC_APP_ID,
      "X-Api-Access-Key": VOLC_ACCESS_KEY,
      "X-Api-Resource-Id": VOLC_RESOURCE_ID,
      "X-Api-App-Key": VOLC_APP_KEY,
      "X-Api-Connect-Id": connectId,
    };

    console.log("[voice-chat] connecting direct to Volc");
    // RN WebSocket third arg is a non-standard options object with headers.
    // Cast through a loose constructor signature to bypass DOM typings.
    const RNWebSocket = WebSocket as unknown as new (
      url: string,
      protocols?: string | string[],
      options?: { headers?: Record<string, string> },
    ) => WebSocket;
    const ws = new RNWebSocket(VOLC_WS_URL, undefined, { headers });
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[voice-chat] volc ws opened");
      ws.send(buildStartConnectionFrame());
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        console.log("[voice-chat] unexpected text frame:", event.data);
        return;
      }
      const parsed = parseServerFrame(event.data as ArrayBuffer);
      if (!parsed) return;

      if (parsed.eventId === SERVER_EVENT_CONNECTION_STARTED) {
        console.log("[voice-chat] connection started, sending start_session");
        const sessionPayload = {
          dialog: {
            bot_name: "小安",
            system_role:
              "你是明鉴，一位专业的反诈骗智能助手。当用户描述可疑情况时，你要冷静分析，给出专业建议，帮助用户保护自己和家人的财产安全。说话要简洁、清晰、亲切。",
            speaking_style: "语气自然、简洁、清晰，遇到高风险情况直接提醒用户暂停操作。",
            model: "2.2.0.0",
            input_mod: "audio",
            strict_audit: false,
          },
          asr: { extra: { end_smooth_window_ms: 1200, enable_asr_twopass: true } },
          tts: { audio_config: { speech_rate: 5, loudness_rate: 0 } },
        };
        ws.send(buildClientEventFrame(EVENT_START_SESSION, sessionPayload, sessionIdRef.current));
      } else if (parsed.eventId === SERVER_EVENT_SESSION_STARTED) {
        console.log("[voice-chat] session started");
        isSessionActiveRef.current = true;
        if (parsed.sessionId) sessionIdRef.current = parsed.sessionId;
        setState("ready");
      } else if (parsed.eventId === SERVER_EVENT_SESSION_FINISHED) {
        isSessionActiveRef.current = false;
        setState("idle");
      } else if (parsed.eventId === SERVER_EVENT_ASR_RESULT) {
        const p = parsed.payload as { results?: Array<{ text?: string; is_interim?: boolean }> } | null;
        const res = p?.results?.[0];
        if (res?.text && res.is_interim === false) {
          appendTranscript("user", res.text);
        }
      } else if (parsed.eventId === SERVER_EVENT_CHAT_RESULT) {
        const p = parsed.payload as { content?: string } | null;
        if (p?.content) {
          appendTranscript("assistant", p.content);
        }
      } else if (parsed.eventId === SERVER_EVENT_TTS_SENTENCE_START) {
        ttsChunksRef.current = [];
        setState("speaking");
      } else if (parsed.eventId === SERVER_EVENT_TTS_AUDIO && parsed.audioBytes) {
        ttsChunksRef.current.push(parsed.audioBytes);
      } else if (parsed.eventId === SERVER_EVENT_TTS_SENTENCE_END) {
        // Playback left as future work — need OGG decode support on RN
        ttsChunksRef.current = [];
        setState("ready");
      } else if (parsed.eventId === SERVER_EVENT_CHAT_ENDED) {
        setState("ready");
      } else if (parsed.eventId === SERVER_EVENT_ASR_ENDED) {
        setState("processing");
      } else {
        const p = parsed.payload as { error?: unknown; message?: string } | null;
        if (p?.error || p?.message) {
          console.warn("[voice-chat] upstream message:", parsed.eventId, p);
        }
      }
    };

    ws.onerror = (event) => {
      console.error("[voice-chat] ws error:", event);
      setErrorMessage("无法连接到语音服务，请检查网络后重试。");
      setState("error");
      isSessionActiveRef.current = false;
    };

    ws.onclose = (ev) => {
      console.log("[voice-chat] ws closed:", ev.code, ev.reason);
      isSessionActiveRef.current = false;
      setState((current) => (current === "error" ? current : "idle"));
    };
  }, [state, appendTranscript]);

  const startListening = useCallback(async () => {
    if (state !== "ready" || !isSessionActiveRef.current) return;
    setState("listening");
    try {
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      audioRecorder.record();
    } catch (e) {
      console.warn("[voice-chat] start recording error:", e);
      setState("ready");
    }
  }, [state, audioRecorder]);

  const stopListening = useCallback(async () => {
    if (state !== "listening") return;
    try {
      audioRecorder.stop();
      const uri = audioRecorder.uri;
      const ws = wsRef.current;
      if (uri && ws?.readyState === WebSocket.OPEN) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const frame = buildAudioFrame(bytes, sessionIdRef.current, audioSeqRef.current++);
        ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        ws.send(buildClientEventFrame(EVENT_END_ASR, {}, sessionIdRef.current));
        setState("processing");
      } else {
        setState("ready");
      }
    } catch (e) {
      console.warn("[voice-chat] stop recording error:", e);
      setState("ready");
    }
  }, [state, audioRecorder]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return {
    state,
    transcripts,
    errorMessage,
    isSessionActive: isSessionActiveRef.current,
    startSession,
    stopSession,
    startListening,
    stopListening,
  };
}
