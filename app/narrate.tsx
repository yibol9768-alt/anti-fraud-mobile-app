/**
 * 讲述问题界面
 * 检测分析完成后，引导用户用自然语言补充描述当前遇到的情况，
 * 补充内容会附加到聊天助手的上下文中，帮助 AI 更准确地理解风险。
 */
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { useChat } from "@/lib/chat-store";

const PROMPT_SUGGESTIONS = [
  "对方说自己是公安局的，让我配合调查",
  "收到一条退款短信，里面有个链接",
  "有人说我中奖了，要我先交保证金",
  "对方说我的银行卡有异常，让我转账到安全账户",
  "有人加我微信说可以帮我投资赚钱",
  "收到一条说我违规的短信，要求我点链接处理",
];

export default function NarrateScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { latestAnalysis, memory } = useAntiFraud();
  const { createConversation, addMessage, setActiveConversationId } = useChat();

  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const riskLabel = latestAnalysis
    ? latestAnalysis.riskLevel === "high"
      ? "高风险"
      : latestAnalysis.riskLevel === "medium"
        ? "中风险"
        : "低风险"
    : null;

  const riskColor = latestAnalysis
    ? latestAnalysis.riskLevel === "high"
      ? "#EF4444"
      : latestAnalysis.riskLevel === "medium"
        ? "#F59E0B"
        : "#22C55E"
    : "#2F80ED";

  const handleSuggestionPress = useCallback((suggestion: string) => {
    setDescription((prev) => {
      if (prev.trim()) {
        return prev.trim() + "\n" + suggestion;
      }
      return suggestion;
    });
  }, []);

  const handleSkip = useCallback(() => {
    router.replace("/(tabs)/report");
  }, [router]);

  const handleSubmit = useCallback(async () => {
    const text = description.trim();
    if (!text) {
      router.replace("/(tabs)/report");
      return;
    }

    setIsSubmitting(true);
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Build risk context from latest analysis
      const riskContext = latestAnalysis
        ? `风险等级：${riskLabel}，诈骗类型：${latestAnalysis.fraudType}，风险分：${latestAnalysis.score}。用户补充描述：${text}`
        : `用户描述：${text}`;

      // Create a new chat conversation with the narration as context
      const conv = createConversation(riskContext);
      setActiveConversationId(conv.id);

      // Add user's narration as the first message
      addMessage(conv.id, {
        id: `narrate-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      });

      // Navigate to chat with the context
      router.replace("/(tabs)/chat");
    } catch (error) {
      console.warn("narrate submit failed", error);
      Alert.alert("提交失败", "请稍后重试。", [{ text: "知道了" }]);
    } finally {
      setIsSubmitting(false);
    }
  }, [description, latestAnalysis, riskLabel, createConversation, addMessage, setActiveConversationId, router]);

  return (
    <View style={[styles.root, { backgroundColor: "#F7FAFC" }]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="chevron.left" size={22} color="#16324F" />
            </Pressable>
            <Text style={styles.headerTitle}>讲述问题</Text>
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.skipText}>跳过</Text>
            </Pressable>
          </View>

          {/* Risk result summary */}
          {latestAnalysis && (
            <View style={[styles.resultCard, { borderColor: `${riskColor}30`, backgroundColor: `${riskColor}08` }]}>
              <View style={styles.resultRow}>
                <View style={[styles.riskBadge, { backgroundColor: `${riskColor}18` }]}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={14} color={riskColor} />
                  <Text style={[styles.riskBadgeText, { color: riskColor }]}>{riskLabel}</Text>
                </View>
                <Text style={styles.resultScore}>风险分 {latestAnalysis.score}</Text>
              </View>
              <Text style={styles.resultConclusion} numberOfLines={3}>
                {latestAnalysis.summary}
              </Text>
            </View>
          )}

          {/* Prompt */}
          <View style={styles.promptSection}>
            <View style={styles.promptIcon}>
              <IconSymbol name="text.bubble.fill" size={28} color="#2F80ED" />
            </View>
            <Text style={styles.promptTitle}>用自己的话说说情况</Text>
            <Text style={styles.promptDesc}>
              把你遇到的事情详细描述一下，越具体越好。{"\n"}
              比如：对方是谁、说了什么、让你做什么。
            </Text>
          </View>

          {/* Suggestion chips */}
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsLabel}>常见情况（点击快速填入）</Text>
            <View style={styles.suggestionsGrid}>
              {PROMPT_SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => handleSuggestionPress(s)}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Text input */}
          <View style={styles.inputSection}>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: "#ffffff",
                  borderColor: description.trim() ? "#2F80ED" : "#DCE6F2",
                  color: colors.foreground,
                },
              ]}
              placeholder={`例如：\n刚才接到一个电话，对方说是公安局的，说我的银行卡涉及洗钱案，让我把钱转到一个"安全账户"配合调查，还说不能告诉家人...`}
              placeholderTextColor="#9BB0C7"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              returnKeyType="default"
              maxLength={500}
            />
            <Text style={styles.charCount}>{description.length}/500</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: isSubmitting ? "#A0BFE0" : "#2F80ED",
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <IconSymbol name="bubble.left.and.bubble.right.fill" size={18} color="#ffffff" />
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "正在跳转..." : description.trim() ? "发给助手分析" : "直接查看报告"}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [
                styles.skipActionButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.skipActionText}>先看检测报告</Text>
            </Pressable>
          </View>

          {/* Privacy note */}
          <View style={styles.privacyRow}>
            <IconSymbol name="lock.fill" size={12} color="#9BB0C7" />
            <Text style={styles.privacyText}>描述内容仅用于本次分析，不会上传或存储</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#16324F" },
  skipButton: { padding: 8, marginRight: -8 },
  skipText: { fontSize: 15, color: "#9BB0C7" },
  // Risk result card
  resultCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    gap: 10,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  riskBadgeText: { fontSize: 13, fontWeight: "700" },
  resultScore: { fontSize: 13, color: "#5F7592" },
  resultConclusion: { fontSize: 13, lineHeight: 20, color: "#16324F" },
  // Prompt section
  promptSection: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  promptIcon: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#EAF4FF",
  },
  promptTitle: { fontSize: 22, fontWeight: "800", color: "#16324F", textAlign: "center" },
  promptDesc: { fontSize: 14, lineHeight: 22, color: "#5F7592", textAlign: "center" },
  // Suggestions
  suggestionsSection: { gap: 10 },
  suggestionsLabel: { fontSize: 13, fontWeight: "600", color: "#5F7592" },
  suggestionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8E8FF",
    backgroundColor: "#EAF4FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: { fontSize: 12, color: "#2F80ED", fontWeight: "500" },
  // Text input
  inputSection: { gap: 6 },
  textArea: {
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 140,
  },
  charCount: { fontSize: 12, color: "#9BB0C7", textAlign: "right" },
  // Actions
  actions: { gap: 12 },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 18,
    paddingVertical: 16,
  },
  submitButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  skipActionButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipActionText: { fontSize: 14, color: "#9BB0C7" },
  // Privacy
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  privacyText: { fontSize: 11, color: "#9BB0C7" },
});
