import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { transcribeAudio } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";

const transcribeInputSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  fileExtension: z.string().optional(),
  language: z.string().optional(),
  prompt: z.string().optional(),
  source: z.enum(["conversation", "detect", "note"]).default("conversation"),
});

function stripDataUrlPrefix(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "").trim();
}

function resolveExtension(mimeType: string, preferred?: string) {
  if (preferred) {
    return preferred.replace(/^\./, "").toLowerCase();
  }

  const mimeMap: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
  };

  return mimeMap[mimeType] ?? "webm";
}

function buildDefaultPrompt(language?: string) {
  if (language?.startsWith("zh")) {
    return "请将用户的语音求助准确转写为简体中文文本，并尽量保留诈骗话术、金额、网址、验证码、转账要求和可疑身份信息。";
  }

  return "Transcribe the user's anti-fraud help request faithfully and preserve scam scripts, money amounts, links, verification codes, transfer instructions, and suspicious identities.";
}

export const voiceRouter = router({
  transcribe: publicProcedure.input(transcribeInputSchema).mutation(async ({ input }) => {
    try {
      const cleanedBase64 = stripDataUrlPrefix(input.audioBase64);
      const audioBuffer = Buffer.from(cleanedBase64, "base64");

      if (!audioBuffer.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "语音内容为空，无法完成转写。",
        });
      }

      if (audioBuffer.length > 12 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "录音过长，请控制在较短语音片段内后重试。",
        });
      }

      const extension = resolveExtension(input.mimeType, input.fileExtension);
      const datePrefix = new Date().toISOString().slice(0, 10);
      const storageKey = `voice/${input.source}/${datePrefix}/${randomUUID()}.${extension}`;
      const uploaded = await storagePut(storageKey, audioBuffer, input.mimeType);

      const transcription = await transcribeAudio({
        audioUrl: uploaded.url,
        language: input.language,
        prompt: input.prompt ?? buildDefaultPrompt(input.language),
      });

      if ("error" in transcription) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transcription.error,
          cause: transcription,
        });
      }

      return {
        audioUrl: uploaded.url,
        audioKey: uploaded.key,
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
        segments: transcription.segments,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "语音转写失败，请稍后再试。",
        cause: error,
      });
    }
  }),
});
