import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Speech from "expo-speech";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Contacts from "expo-contacts";
import { Platform } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { PauseBanner } from "@/components/pause-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatTimeLabel } from "@/lib/anti-fraud-engine";
import {
  buildBlockRecordText,
  buildFamilyReminder,
  buildShareSummaryText,
  extractBlacklistHits,
} from "@/lib/elder-assist";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { FRAUD_TYPE_LABELS, RISK_LEVEL_LABELS } from "@/shared/anti-fraud";

const IMMEDIATE_ACTIONS: Array<{
  key: string;
  title: string;
  subtitle: string;
  icon: Parameters<typeof IconSymbol>[0]["name"];
  action: "call" | "sms" | "detect" | "speak" | "share" | "record";
}> = [
  {
    key: "call",
    title: "拨打 96110 反诈专线",
    subtitle: "适用于冒充公检法、客服退款、征信异常、转账施压和下载软件场景。",
    icon: "phone.fill",
    action: "call",
  },
  {
    key: "sms",
    title: "发送提醒短信",
    subtitle: "把当前识别结果同步给家人或可信联系人，避免自己继续被催促做决定。",
    icon: "person.2.fill",
    action: "sms",
  },
  {
    key: "record",
    title: "一键记录并阻断",
    subtitle: "快速生成处置记录，提醒自己暂停通话、停止回复、不要转账并保留证据。",
    icon: "checkmark.shield.fill",
    action: "record",
  },
  {
    key: "speak",
    title: "语音播报本次结论",
    subtitle: "适合老年用户直接听结论；如果手机静音，播报可能没有声音。",
    icon: "speaker.wave.2.fill",
    action: "speak",
  },
  {
    key: "share",
    title: "分享风险摘要",
    subtitle: "生成一份可转发给家人、社区工作者或民警的简明摘要。",
    icon: "doc.text.fill",
    action: "share",
  },
  {
    key: "detect",
    title: "返回继续检测",
    subtitle: "补充更多语音、截图或短信内容，让判断更完整。",
    icon: "photo.on.rectangle",
    action: "detect",
  },
];

function getBlacklistCategoryLabel(category: "keyword" | "link" | "phone") {
  if (category === "keyword") {
    return "高危关键词";
  }
  if (category === "link") {
    return "可疑链接";
  }
  return "可核验号码";
}

export default function ReportScreen() {
  const router = useRouter();
  const { latestAnalysis, latestReport, memory } = useAntiFraud();
  const [isReadingSummary, setIsReadingSummary] = useState(false);
  const [isSharingSummary, setIsSharingSummary] = useState(false);
  const [isPreparingBlockRecord, setIsPreparingBlockRecord] = useState(false);

  const analysis = latestAnalysis;

  const sourceContent = useMemo(() => {
    return [
      analysis?.summary,
      analysis?.explanation,
      ...(analysis?.suggestions ?? []),
      ...(analysis?.evidences ?? []).map((item) => item.detail),
      latestReport.headline,
      latestReport.overview,
      ...latestReport.recommendations,
    ]
      .filter(Boolean)
      .join(" ");
  }, [analysis, latestReport]);

  const blacklistHits = useMemo(() => extractBlacklistHits(sourceContent), [sourceContent]);

  const primarySuggestions = useMemo(() => {
    return analysis?.suggestions.length ? analysis.suggestions : latestReport.recommendations.slice(0, 3);
  }, [analysis?.suggestions, latestReport.recommendations]);

  const riskReasons = useMemo(() => {
    const blacklistReasons = blacklistHits.map((item) => `${getBlacklistCategoryLabel(item.category)}：${item.value}。${item.reason}`);
    const evidenceReasons = (analysis?.evidences ?? []).slice(0, 3).map((item) => item.detail);
    const watchlistReasons = latestReport.watchlist.slice(0, 3).map((item) => `长期观察信号：${item}`);
    const fallback = [
      "只要对方要求立刻转账、提供验证码、共享屏幕或下载远程控制软件，都应视为高危信号。",
      "真实客服、公检法和金融机构不会通过私人聊天窗口要求把钱转到所谓安全账户。",
    ];

    return Array.from(new Set([...blacklistReasons, ...evidenceReasons, ...watchlistReasons, ...fallback])).slice(0, 6);
  }, [analysis?.evidences, blacklistHits, latestReport.watchlist]);

  const summaryForShare = useMemo(() => {
    return buildShareSummaryText({
      generatedAt: formatTimeLabel(latestReport.generatedAt),
      score: latestReport.score,
      riskLevel: analysis?.riskLevel,
      fraudType: analysis?.fraudType,
      headline: analysis?.summary ?? latestReport.headline,
      explanation: analysis?.explanation ?? latestReport.overview,
      suggestions: primarySuggestions,
      reasons: riskReasons,
    });
  }, [analysis, latestReport, primarySuggestions, riskReasons]);

  const blockRecordText = useMemo(() => {
    return buildBlockRecordText(analysis?.summary ?? latestReport.headline, blacklistHits, primarySuggestions);
  }, [analysis?.summary, blacklistHits, latestReport.headline, primarySuggestions]);

  const openSystemUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("open system url failed", error);
      Alert.alert("系统操作暂时不可用", "请稍后再试，或手动完成拨号和短信发送。", [{ text: "知道了" }]);
    }
  };

  const handleShareSummary = async () => {
    if (isSharingSummary) {
      return;
    }

    setIsSharingSummary(true);
    try {
      const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}a30-risk-summary.txt`;
      await FileSystem.writeAsStringAsync(fileUri, summaryForShare, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("当前设备暂不支持系统分享", "你可以先用短信按钮把核心风险结论发送给家人。", [{ text: "知道了" }]);
        return;
      }

      await Sharing.shareAsync(fileUri, {
        dialogTitle: "分享本次反诈风险摘要",
        mimeType: "text/plain",
        UTI: "public.plain-text",
      });
    } catch (error) {
      console.warn("share summary failed", error);
      Alert.alert("分享失败", "请稍后再试。", [{ text: "知道了" }]);
    } finally {
      setIsSharingSummary(false);
    }
  };

  const handleCreateBlockRecord = async () => {
    if (isPreparingBlockRecord) {
      return;
    }

    setIsPreparingBlockRecord(true);
    try {
      const fileUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}a30-block-record.txt`;
      await FileSystem.writeAsStringAsync(fileUri, blockRecordText, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: "保存或转发本次处置记录",
          mimeType: "text/plain",
          UTI: "public.plain-text",
        });
      }

      Alert.alert(
        "处置记录已生成",
        "请先停止通话、停止回复、不要转账，也不要继续提供验证码或共享屏幕。需要时可把这份记录转给家人或社区工作人员。",
        [{ text: "知道了" }],
      );
    } catch (error) {
      console.warn("create block record failed", error);
      Alert.alert("生成处置记录失败", "请稍后再试。", [{ text: "知道了" }]);
    } finally {
      setIsPreparingBlockRecord(false);
    }
  };

  const handleSpeakSummary = async () => {
    try {
      const speaking = await Speech.isSpeakingAsync();
      if (speaking) {
        await Speech.stop();
        setIsReadingSummary(false);
        return;
      }

      Speech.speak(
        analysis
          ? `系统判断当前风险为${RISK_LEVEL_LABELS[analysis.riskLevel]}。诈骗类型偏向${FRAUD_TYPE_LABELS[analysis.fraudType]}。${analysis.summary}。建议先停止转账、不要提供验证码，也不要共享屏幕。`
          : `${latestReport.headline}。建议先回到检测页补充语音、截图或短信内容。`,
        {
          language: "zh-CN",
          rate: 0.92,
          pitch: 1,
          onStart: () => setIsReadingSummary(true),
          onDone: () => setIsReadingSummary(false),
          onStopped: () => setIsReadingSummary(false),
          onError: () => setIsReadingSummary(false),
        },
      );
    } catch (error) {
      console.warn("speak summary failed", error);
      setIsReadingSummary(false);
      Alert.alert("语音播报失败", "请确认设备音量和静音状态后重试。", [{ text: "知道了" }]);
    }
  };

  const handleImmediateAction = async (action: "call" | "sms" | "detect" | "speak" | "share" | "record") => {
    if (action === "call") {
      await openSystemUrl("tel:96110");
      return;
    }

    if (action === "sms") {
      const body = buildFamilyReminder(analysis?.summary ?? latestReport.headline);
      if (Platform.OS === "web") {
        await openSystemUrl(`sms:?body=${body}`);
        return;
      }
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "无法访问通讯录",
            "请允许访问通讯录以快速选择家人，或手动打开短信应用发送。",
            [
              { text: "手动发送", onPress: () => { void openSystemUrl(`sms:?body=${body}`); } },
              { text: "取消", style: "cancel" },
            ],
          );
          return;
        }
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        const withPhone = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
        if (withPhone.length === 0) {
          await openSystemUrl(`sms:?body=${body}`);
          return;
        }
        const options = withPhone.slice(0, 10).map((c) => ({
          text: `${c.name ?? "未知"} (${c.phoneNumbers![0]!.number ?? ""})`,
          onPress: () => {
            const phone = c.phoneNumbers![0]!.number?.replace(/\s|-/g, "") ?? "";
            void openSystemUrl(`sms:${phone}?body=${body}`);
          },
        }));
        options.push({ text: "取消", onPress: () => {} });
        Alert.alert(
          "选择提醒对象",
          "从通讯录中选择一位家人或可信联系人发送提醒短信",
          options,
        );
      } catch (err) {
        console.warn("contacts pick failed in report", err);
        await openSystemUrl(`sms:?body=${body}`);
      }
      return;
    }

    if (action === "detect") {
      router.push("./detect");
      return;
    }

    if (action === "share") {
      await handleShareSummary();
      return;
    }

    if (action === "record") {
      await handleCreateBlockRecord();
      return;
    }

    await handleSpeakSummary();
  };

  return (
    <ScreenContainer containerClassName="bg-[#F7FAFC]">
      <PauseBanner variant="report" />
      <ScrollView className="px-5 pt-4" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-sm font-medium text-muted">安全监测报告</Text>
            <Text className="text-[28px] font-bold leading-[36px] text-foreground">先看结论，再执行阻断动作，再把风险告诉家人</Text>
            <Text className="text-sm leading-6 text-muted">
              报告会结合最近会话、长期风险标签与历史事件，生成便于本人、家人和社区工作人员理解的风险说明与主动防御建议。
            </Text>
          </View>

          <View className="rounded-[28px] bg-[#16324F] p-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1 gap-2">
                <View className="self-start rounded-full bg-white/10 px-3 py-1">
                  <Text className="text-xs font-semibold text-white">综合安全评分</Text>
                </View>
                <Text className="text-[40px] font-bold leading-[46px] text-white">{latestReport.score}</Text>
                <Text className="text-sm leading-6 text-[#D6E4F3]">{latestReport.headline}</Text>
              </View>
              <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white/10">
                <IconSymbol name="chart.bar.fill" size={28} color="#FFFFFF" />
              </View>
            </View>
            <Text className="mt-4 text-xs leading-5 text-[#C8D7E7]">生成时间：{formatTimeLabel(latestReport.generatedAt)}</Text>
          </View>

          {analysis ? (
            <View className="rounded-[24px] border border-border bg-white p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground">本次识别结论</Text>
                <View
                  className="rounded-full px-3 py-1"
                  style={{ backgroundColor: analysis.riskLevel === "high" ? "#FFE8E8" : analysis.riskLevel === "medium" ? "#FFF4DD" : "#E8FFF1" }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: analysis.riskLevel === "high" ? "#FF5A5F" : analysis.riskLevel === "medium" ? "#C28600" : "#1F9B52" }}
                  >
                    {RISK_LEVEL_LABELS[analysis.riskLevel]}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 text-lg font-semibold text-foreground">{FRAUD_TYPE_LABELS[analysis.fraudType]}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{analysis.summary}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{analysis.explanation}</Text>
              <View className="mt-4 flex-row gap-3">
                <View className="flex-1 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <Text className="text-xs font-medium text-[#6C819C]">风险等级</Text>
                  <Text className="mt-2 text-base font-semibold text-foreground">{RISK_LEVEL_LABELS[analysis.riskLevel]}</Text>
                </View>
                <View className="flex-1 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <Text className="text-xs font-medium text-[#6C819C]">风险分</Text>
                  <Text className="mt-2 text-base font-semibold text-foreground">{analysis.score}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className="rounded-[24px] border border-border bg-white p-4">
              <Text className="text-base font-semibold text-foreground">还没有本次识别结果</Text>
              <Text className="mt-3 text-sm leading-6 text-muted">
                先去检测页提交一段语音、短信、聊天内容或截图线索，系统完成分析后会在这里展示诈骗类型、证据召回与阻断建议。
              </Text>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  onPress={() => router.push("./detect")}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "#2F80ED",
                      paddingVertical: 14,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text className="text-center text-sm font-semibold text-white">去做一次检测</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("./memory")}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      borderRadius: 18,
                      backgroundColor: "#F1F7FF",
                      paddingVertical: 14,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text className="text-center text-sm font-semibold text-primary">查看记忆中心</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">立即执行的阻断动作</Text>
              <Text className="text-xs text-muted">先操作再沟通</Text>
            </View>
            <View className="mt-4 gap-3">
              {IMMEDIATE_ACTIONS.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    void handleImmediateAction(item.action);
                  }}
                  style={({ pressed }) => [
                    {
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: "#DCE6F2",
                      backgroundColor: "#F8FBFE",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      opacity: pressed ? 0.86 : 1,
                    },
                  ]}
                >
                  <View className="flex-row items-center gap-4">
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
                      <IconSymbol name={item.icon} size={18} color="#2F80ED" />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold text-foreground">{item.title}</Text>
                      <Text className="text-xs leading-5 text-muted">{item.subtitle}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={18} color="#9BB0C7" />
                  </View>
                </Pressable>
              ))}
            </View>
            {isReadingSummary ? <Text className="mt-3 text-xs leading-5 text-primary">正在播报本次结论，再点一次“语音播报本次结论”可停止。</Text> : null}
            {isSharingSummary ? <Text className="mt-3 text-xs leading-5 text-primary">正在准备可分享的风险摘要文件。</Text> : null}
            {isPreparingBlockRecord ? <Text className="mt-3 text-xs leading-5 text-primary">正在生成处置记录，请稍候。</Text> : null}
          </View>

          <View className="rounded-[24px] border border-[#FFD9D9] bg-[#FFF7F7] p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">建议暂停或拉黑的原因</Text>
              <Text className="text-xs text-[#C96A6A]">用于解释给家人听</Text>
            </View>
            <View className="mt-4 gap-3">
              {riskReasons.map((item) => (
                <View key={item} className="flex-row gap-3 rounded-[18px] bg-white px-4 py-4">
                  <View className="mt-1 h-6 w-6 items-center justify-center rounded-full bg-[#FFEAEA]">
                    <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#FF5A5F" />
                  </View>
                  <Text className="flex-1 text-sm leading-6 text-muted">{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">黑名单线索命中</Text>
              <Text className="text-xs text-muted">关键词 / 链接 / 号码</Text>
            </View>
            {blacklistHits.length ? (
              <View className="mt-4 gap-3">
                {blacklistHits.map((item) => (
                  <View key={`${item.category}-${item.value}`} className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-sm font-semibold text-foreground">{item.value}</Text>
                      <View className="rounded-full bg-[#EEF5FF] px-3 py-1">
                        <Text className="text-xs font-medium text-primary">{getBlacklistCategoryLabel(item.category)}</Text>
                      </View>
                    </View>
                    <Text className="mt-2 text-sm leading-6 text-muted">{item.reason}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className="mt-4 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm leading-6 text-muted">当前未命中预设黑名单关键词、可疑链接或号码模式。建议继续补充完整短信、来电原话或截图细节后再检测。</Text>
              </View>
            )}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">建议先做这几件事</Text>
              <Text className="text-xs text-muted">可立即执行</Text>
            </View>
            <View className="mt-4 gap-3">
              {primarySuggestions.map((item) => (
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
              <Text className="text-base font-semibold text-foreground">风险趋势</Text>
              <Text className="text-xs text-muted">最近 {latestReport.trend.length} 次</Text>
            </View>
            <View className="mt-4 gap-3">
              {latestReport.trend.map((point) => (
                <View key={point.label} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground">{point.label}</Text>
                    <Text className="text-sm text-muted">{point.value}</Text>
                  </View>
                  <View className="h-3 overflow-hidden rounded-full bg-[#EEF3F8]">
                    <View
                      style={{
                        width: `${Math.max(8, Math.min(100, point.value))}%`,
                        backgroundColor: point.value >= 80 ? "#FF5A5F" : point.value >= 55 ? "#FFB020" : "#34C759",
                        height: 12,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">诈骗类型分布</Text>
              <Text className="text-xs text-muted">基于历史事件</Text>
            </View>
            <View className="mt-4 gap-3">
              {latestReport.typeDistribution.map((item) => (
                <View key={item.label} className="flex-row items-center justify-between rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF5FF]">
                      <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#2F80ED" />
                    </View>
                    <Text className="text-sm font-medium text-foreground">{FRAUD_TYPE_LABELS[item.label as keyof typeof FRAUD_TYPE_LABELS] ?? item.label}</Text>
                  </View>
                  <Text className="text-sm font-semibold text-primary">{item.value} 次</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">证据与案例召回</Text>
              <Text className="text-xs text-muted">语义检索结果</Text>
            </View>
            {analysis ? (
              <View className="mt-4 gap-3">
                {analysis.evidences.map((item) => (
                  <View key={item.id} className="rounded-[18px] bg-[#FFF8F8] px-4 py-4">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-foreground">{item.label}</Text>
                      <Text className="text-xs font-medium text-[#D16A6D]">权重 {item.weight}</Text>
                    </View>
                    <Text className="mt-2 text-sm leading-6 text-muted">{item.detail}</Text>
                  </View>
                ))}
                {analysis.knowledgeHits.map((item) => (
                  <View key={item.id} className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-sm font-semibold text-foreground">{item.title}</Text>
                      <Text className="text-xs font-medium text-primary">相似度 {Math.round(item.similarity * 100)}%</Text>
                    </View>
                    <Text className="mt-2 text-sm leading-6 text-muted">{item.snippet}</Text>
                    <Text className="mt-2 text-xs leading-5 text-[#7A8CA4]">来源：{item.source}</Text>
                  </View>
                ))}
                {!analysis.evidences.length && !analysis.knowledgeHits.length ? (
                  <View className="rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                    <Text className="text-sm leading-6 text-muted">本次未召回明显相似案例，建议补充截图细节、转账要求或对方身份信息后再次检测。</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="mt-4 rounded-[18px] bg-[#F8FBFE] px-4 py-4">
                <Text className="text-sm leading-6 text-muted">完成一次检测后，这里会展示触发判断的关键证据、召回案例与相似知识条目。</Text>
              </View>
            )}
          </View>

          <View className="rounded-[24px] border border-border bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">长期观察清单</Text>
              <Text className="text-xs text-muted">画像 + 历史事件</Text>
            </View>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {latestReport.watchlist.map((item) => (
                <View key={item} className="rounded-full bg-[#EEF5FF] px-3 py-2">
                  <Text className="text-xs font-medium text-primary">{item}</Text>
                </View>
              ))}
            </View>
            <Text className="mt-4 text-sm leading-6 text-muted">
              当前累计保留 {memory.recentEvents.length} 条历史事件，系统会在下一次检测时继续参考这些长期信号，并结合新的语音、短信或截图线索做连续判断。
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
