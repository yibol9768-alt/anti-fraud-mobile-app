import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";

import { ScreenContainer } from "@/components/screen-container";
import { PauseBanner } from "@/components/pause-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { FRAUD_TYPE_LABELS, INPUT_MODE_LABELS, RISK_LEVEL_LABELS, type InputMode } from "@/shared/anti-fraud";

const ACTIVE_DEFENSE_SCENES: Array<{
  key: "phone" | "sms" | "screenshot";
  title: string;
  subtitle: string;
  mode: InputMode;
  icon: Parameters<typeof IconSymbol>[0]["name"];
  helper: string;
}> = [
  {
    key: "phone",
    title: "电话主动防御",
    subtitle: "接到可疑来电？先别挂断，把对方说的话转述给我，或直接录一段。",
    mode: "audio",
    icon: "waveform.path.ecg",
    helper: "先暂停，再说一句。",
  },
  {
    key: "sms",
    title: "短信主动防御",
    subtitle: "收到可疑短信或聊天？把内容复制给我看看，我帮你判断。",
    mode: "text",
    icon: "paperplane.fill",
    helper: "先别点链接，再说一句。",
  },
  {
    key: "screenshot",
    title: "截图主动防御",
    subtitle: "看到可疑页面？截一张图发给我，我用多模态分析帮你识别。",
    mode: "image",
    icon: "photo.on.rectangle",
    helper: "先暂停，再说一句。",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { memory, latestAnalysis, latestReport, setInputMode, updateDraft } = useAntiFraud();

  const overview = useMemo(() => {
    const highRiskCount = memory.recentEvents.filter((item) => item.riskLevel === "high").length;
    const latest = latestAnalysis ?? memory.recentEvents[0];

    return {
      headline:
        highRiskCount > 0
          ? `近期发现 ${highRiskCount} 次高风险线索，遇到转账、验证码或共享屏幕要求，先暂停再告诉我。`
          : "目前没有新的高风险告警，有任何可疑情况随时告诉我，我帮你判断。",
      score: latest?.score ?? latestReport.score,
      fraudType: latest ? FRAUD_TYPE_LABELS[latest.fraudType] : "待检测",
      riskLevel: latest ? RISK_LEVEL_LABELS[latest.riskLevel] : "低风险",
    };
  }, [latestAnalysis, latestReport.score, memory.recentEvents]);

  const latestEvent = memory.recentEvents[0] ?? null;

  const startDefense = (mode: InputMode) => {
    setInputMode(mode);
    updateDraft({
      text: "",
      transcript: "",
      imageUri: undefined,
      audioUri: undefined,
    });
    router.push("./detect");
  };

  const openSystemUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("open system url failed", error);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#F7FAFC]">
      <PauseBanner variant="default" />
      <ScrollView className="px-5 pt-4" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View className="gap-4">
          <View className="gap-2">
            <Text className="text-sm font-medium text-muted">明鉴 · 主动反诈助手</Text>
            <Text className="text-[26px] font-bold leading-[34px] text-foreground">电话、短信、截图——三个主动防御入口</Text>
            <Text className="text-sm leading-6 text-muted">
              遇到可疑情况，先暂停。选一个入口，把情况告诉我，我帮你判断。
            </Text>
          </View>

          <View className="rounded-[28px] border border-[#D8E8FF] bg-[#EAF4FF] p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-2">
                <View className="self-start rounded-full bg-white/80 px-3 py-1">
                  <Text className="text-xs font-semibold text-primary">今日主动防御总览</Text>
                </View>
                <Text className="text-[22px] font-bold leading-8 text-[#16324F]">{overview.headline}</Text>
                <Text className="text-sm leading-5 text-[#5F7592]">
                  最新状态：{overview.riskLevel} · {overview.fraudType} · 风险分 {overview.score}
                </Text>
              </View>
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
                <IconSymbol name="shield.lefthalf.fill" size={24} color="#2F80ED" />
              </View>
            </View>

            <View className="mt-4 flex-row gap-2">
              <View className="flex-1 rounded-[18px] bg-white px-3 py-3">
                <Text className="text-xs font-medium text-[#6C819C]">综合风险分</Text>
                <Text className="mt-1.5 text-[24px] font-bold leading-7 text-[#16324F]">{overview.score}</Text>
              </View>
              <View className="flex-1 rounded-[18px] bg-white px-3 py-3">
                <Text className="text-xs font-medium text-[#6C819C]">历史事件</Text>
                <Text className="mt-1.5 text-[24px] font-bold leading-7 text-[#16324F]">{memory.recentEvents.length}</Text>
              </View>
              <View className="flex-1 rounded-[18px] bg-white px-3 py-3">
                <Text className="text-xs font-medium text-[#6C819C]">风险标签</Text>
                <Text className="mt-1.5 text-[24px] font-bold leading-7 text-[#16324F]">{memory.longTerm.riskTags.length}</Text>
              </View>
            </View>

            <View className="mt-3 gap-3">
              <Pressable
                onPress={() => startDefense("audio")}
                style={({ pressed }) => [
                  {
                    borderRadius: 18,
                    backgroundColor: "#2F80ED",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text className="text-center text-sm font-semibold text-white">进入主动防御检测</Text>
              </Pressable>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => {
                    void openSystemUrl("tel:96110");
                  }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "white",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text className="text-center text-sm font-semibold text-[#16324F]">拨打 96110</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const body = encodeURIComponent("我正在核验一条可疑电话/短信/截图，如果我提到转账、验证码、共享屏幕或下载软件，请先提醒我暂停操作。");
                    void openSystemUrl(`sms:?body=${body}`);
                  }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "white",
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Text className="text-center text-sm font-semibold text-[#16324F]">发送提醒短信</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">三类主动防御入口</Text>
              <Text className="text-xs text-muted">单手操作优先</Text>
            </View>
            <View className="mt-4 gap-3">
              {ACTIVE_DEFENSE_SCENES.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => startDefense(item.mode)}
                  style={({ pressed }) => [
                    {
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: "#DCE6F2",
                      padding: 16,
                      backgroundColor: pressed ? "#F4F8FC" : "#FFFFFF",
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <View className="flex-row items-center gap-4">
                    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F7FF]">
                      <IconSymbol name={item.icon} size={22} color="#2F80ED" />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-base font-semibold text-foreground">{item.title}</Text>
                      <Text className="text-sm leading-5 text-muted">{item.subtitle}</Text>
                      <Text className="text-xs leading-5 text-primary">{item.helper}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={20} color="#9BB0C7" />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">先停下来的三个信号</Text>
              <Text className="text-xs text-muted">出现任一项都先核验</Text>
            </View>
            <View className="mt-4 gap-3">
              {[
                "对方要求马上转账、提现、刷流水或把钱转入安全账户。",
                "对方要求提供验证码、共享屏幕、下载会议软件或远程协助工具。",
                "对方利用公检法、客服退款、征信异常、快递异常等身份制造时间压力。",
              ].map((item) => (
                <View key={item} className="flex-row gap-3 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <View className="mt-1 h-6 w-6 items-center justify-center rounded-full bg-[#EEF5FF]">
                    <IconSymbol name="checkmark.shield.fill" size={14} color="#2F80ED" />
                  </View>
                  <Text className="flex-1 text-sm leading-6 text-muted">{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">最近事件</Text>
              <Pressable onPress={() => router.push("./memory")} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}> 
                <Text className="text-xs font-medium text-primary">进入记忆中心</Text>
              </Pressable>
            </View>
            {latestEvent ? (
              <View className="mt-4 rounded-[20px] bg-[#F8FBFE] px-4 py-4">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="flex-1 text-sm font-semibold text-foreground">{latestEvent.title}</Text>
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: latestEvent.riskLevel === "high" ? "#FFE8E8" : latestEvent.riskLevel === "medium" ? "#FFF4DD" : "#E8FFF1" }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: latestEvent.riskLevel === "high" ? "#FF5A5F" : latestEvent.riskLevel === "medium" ? "#C28600" : "#1F9B52" }}
                    >
                      {RISK_LEVEL_LABELS[latestEvent.riskLevel]}
                    </Text>
                  </View>
                </View>
                <Text className="mt-2 text-sm leading-6 text-muted">{latestEvent.summary}</Text>
                <Text className="mt-2 text-xs text-[#7B8CA5]">
                  {INPUT_MODE_LABELS[latestEvent.sourceMode]} · {FRAUD_TYPE_LABELS[latestEvent.fraudType]} · 风险分 {latestEvent.score}
                </Text>
                <Pressable onPress={() => router.push("./report")} style={({ pressed }) => [{ marginTop: 14, opacity: pressed ? 0.68 : 1 }]}> 
                  <Text className="text-sm font-semibold text-primary">查看完整监测报告</Text>
                </Pressable>
              </View>
            ) : (
              <View className="mt-4 rounded-[20px] bg-[#F8FBFE] px-4 py-5">
                <Text className="text-sm font-semibold text-foreground">还没有新的检测记录</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">
                  先从电话主动防御或短信主动防御开始，系统会在完成第一次核验后生成历史事件并进入长期记忆。
                </Text>
              </View>
            )}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">当前能力状态</Text>
              <Text className="text-xs text-muted">主动防御版</Text>
            </View>
            <View className="mt-4 gap-3">
              {[
                {
                  title: "Doubao 主分析模型",
                  desc: "用于生成诈骗研判、解释说明与下一步防御建议。",
                  icon: "shield.lefthalf.fill" as const,
                },
                {
                  title: "多模态 Embedding 检索",
                  desc: "用于文本与截图线索的语义召回，辅助证据和案例匹配。",
                  icon: "brain.head.profile" as const,
                },
                {
                  title: "电话短信截图主动防御入口",
                  desc: "用于把高频风险场景前置到检测前，帮助用户先阻断再分析。",
                  icon: "waveform.path.ecg" as const,
                },
              ].map((item) => (
                <View key={item.title} className="flex-row items-center gap-3 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF5FF]">
                    <IconSymbol name={item.icon} size={18} color="#2F80ED" />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="text-sm font-semibold text-foreground">{item.title}</Text>
                    <Text className="text-sm leading-5 text-muted">{item.desc}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-[#1F9B52]">运行中</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
