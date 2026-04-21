import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  analyzeFraudLocally,
  buildSafetyReport,
  createInitialMemorySnapshot,
  mergeMemoryAfterAnalysis,
} from "@/lib/anti-fraud-engine";
import type {
  AnalysisResult,
  InputMode,
  LongMemoryProfile,
  MemorySnapshot,
  ReportResponse,
  SafetyReport,
} from "@/shared/anti-fraud";

const STORAGE_KEY = "anti-fraud-memory-v1";

interface AnalyzeDraft {
  inputMode: InputMode;
  text: string;
  transcript: string;
  imageUri?: string;
  audioUri?: string;
}

interface AntiFraudContextValue {
  ready: boolean;
  memory: MemorySnapshot;
  latestAnalysis: AnalysisResult | null;
  latestReport: SafetyReport;
  draft: AnalyzeDraft;
  setInputMode: (mode: InputMode) => void;
  updateDraft: (patch: Partial<AnalyzeDraft>) => void;
  runAnalysis: () => Promise<AnalysisResult>;
  generateReport: () => ReportResponse;
  clearShortTermMemory: () => void;
  updateLongTermProfile: (patch: Partial<LongMemoryProfile>) => void;
  seedDemoScenario: (preset: "investment" | "refund" | "impersonation") => void;
}

const defaultMemory = createInitialMemorySnapshot();
const defaultReport = buildSafetyReport(defaultMemory);

const AntiFraudContext = createContext<AntiFraudContextValue | null>(null);

function createDefaultDraft(): AnalyzeDraft {
  return {
    inputMode: "text",
    text: "",
    transcript: "",
    imageUri: undefined,
    audioUri: undefined,
  };
}

export function AntiFraudProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [memory, setMemory] = useState<MemorySnapshot>(defaultMemory);
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null);
  const [latestReport, setLatestReport] = useState<SafetyReport>(defaultReport);
  const [draft, setDraft] = useState<AnalyzeDraft>(createDefaultDraft);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          if (mounted) {
            setReady(true);
          }
          return;
        }

        const parsed = JSON.parse(raw) as {
          memory?: MemorySnapshot;
          latestAnalysis?: AnalysisResult | null;
          latestReport?: SafetyReport | null;
          draft?: AnalyzeDraft;
        };

        if (!mounted) return;

        if (parsed.memory) {
          setMemory(parsed.memory);
        }
        if (parsed.latestAnalysis) {
          setLatestAnalysis(parsed.latestAnalysis);
        }
        if (parsed.latestReport) {
          setLatestReport(parsed.latestReport);
        }
        if (parsed.draft) {
          setDraft(parsed.draft);
        }
      } catch (error) {
        console.warn("hydrate anti fraud state failed", error);
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload = JSON.stringify({ memory, latestAnalysis, latestReport, draft });
    AsyncStorage.setItem(STORAGE_KEY, payload).catch((error) => {
      console.warn("persist anti fraud state failed", error);
    });
  }, [draft, latestAnalysis, latestReport, memory, ready]);

  const setInputMode = useCallback((mode: InputMode) => {
    setDraft((current) => ({ ...current, inputMode: mode }));
  }, []);

  const updateDraft = useCallback((patch: Partial<AnalyzeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const runAnalysis = useCallback(async () => {
    const localAnalysis = analyzeFraudLocally({
      inputMode: draft.inputMode,
      text: draft.text,
      transcript: draft.transcript,
      imageUri: draft.imageUri,
      audioUri: draft.audioUri,
      shortTerm: memory.shortTerm,
      longTerm: memory.longTerm,
    });

    const nextMemory = mergeMemoryAfterAnalysis(
      memory,
      {
        inputMode: draft.inputMode,
        text: draft.text,
        transcript: draft.transcript,
        imageUri: draft.imageUri,
        audioUri: draft.audioUri,
        shortTerm: memory.shortTerm,
        longTerm: memory.longTerm,
      },
      localAnalysis,
    );

    const report = buildSafetyReport(nextMemory, localAnalysis);

    setMemory(nextMemory);
    setLatestAnalysis(localAnalysis);
    setLatestReport(report);

    return localAnalysis;
  }, [draft, memory]);

  const generateReport = useCallback(() => {
    const report = buildSafetyReport(memory, latestAnalysis ?? undefined);
    setLatestReport(report);
    return {
      report,
      memory,
    };
  }, [latestAnalysis, memory]);

  const clearShortTermMemory = useCallback(() => {
    setMemory((current) => ({
      ...current,
      shortTerm: current.shortTerm.slice(0, 1),
    }));
  }, []);

  const updateLongTermProfile = useCallback((patch: Partial<LongMemoryProfile>) => {
    setMemory((current) => ({
      ...current,
      longTerm: {
        ...current.longTerm,
        ...patch,
      },
    }));
  }, []);

  const seedDemoScenario = useCallback((preset: "investment" | "refund" | "impersonation") => {
    if (preset === "investment") {
      setDraft({
        inputMode: "text",
        text: "老师说这是内部投资群，今晚跟单稳赚，先转 5000 到平台账户，明天就能提现。",
        transcript: "",
        imageUri: "fraud://investment-screenshot",
        audioUri: undefined,
      });
      return;
    }

    if (preset === "refund") {
      setDraft({
        inputMode: "audio",
        text: "",
        transcript: "客服说我误开了会员，需要下载会议软件共享屏幕才能退款。",
        imageUri: undefined,
        audioUri: "fraud://refund-call",
      });
      return;
    }

    setDraft({
      inputMode: "image",
      text: "对方自称公安，说我的账户涉嫌洗钱，要我把余额转到安全账户核验。",
      transcript: "",
      imageUri: "fraud://impersonation-shot",
      audioUri: undefined,
    });
  }, []);

  const value = useMemo<AntiFraudContextValue>(
    () => ({
      ready,
      memory,
      latestAnalysis,
      latestReport,
      draft,
      setInputMode,
      updateDraft,
      runAnalysis,
      generateReport,
      clearShortTermMemory,
      updateLongTermProfile,
      seedDemoScenario,
    }),
    [
      clearShortTermMemory,
      draft,
      generateReport,
      latestAnalysis,
      latestReport,
      memory,
      ready,
      runAnalysis,
      seedDemoScenario,
      setInputMode,
      updateDraft,
      updateLongTermProfile,
    ],
  );

  return <AntiFraudContext.Provider value={value}>{children}</AntiFraudContext.Provider>;
}

export function useAntiFraud() {
  const context = useContext(AntiFraudContext);
  if (!context) {
    throw new Error("useAntiFraud must be used within AntiFraudProvider");
  }
  return context;
}
