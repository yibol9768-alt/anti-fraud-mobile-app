import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useAuthStore } from "@/lib/auth-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingStep {
  icon: Parameters<typeof IconSymbol>[0]["name"];
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  tip: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: "hand.raised.fill",
    iconBg: "#FFF3E0",
    iconColor: "#F57C00",
    title: "先暂停，再核验",
    body: "遇到可疑电话、短信或图片，第一步永远是先停下来。不要转账、不要点链接、不要共享屏幕，先把情况告诉我。",
    tip: "只要你说「先暂停」，我就会帮你分析。",
  },
  {
    icon: "waveform.path.ecg",
    iconBg: "#E3F2FD",
    iconColor: "#1565C0",
    title: "电话核验：说一句就够",
    body: "接到可疑来电？不用挂断，先把对方说的话转述给我，或者直接录一段。我会帮你判断是不是诈骗话术。",
    tip: "点「电话主动防御」→ 说一句或录音 → 我来判断。",
  },
  {
    icon: "paperplane.fill",
    iconBg: "#E8F5E9",
    iconColor: "#2E7D32",
    title: "短信核验：粘贴就行",
    body: "收到可疑短信或聊天消息？把内容复制粘贴给我，我会检查链接、验证码请求和时限施压等风险信号。",
    tip: "点「短信主动防御」→ 粘贴内容 → 我来分析。",
  },
  {
    icon: "photo.on.rectangle",
    iconBg: "#F3E5F5",
    iconColor: "#6A1B9A",
    title: "截图核验：拍一张发给我",
    body: "看到可疑的付款页、聊天页或身份通知？截图发给我，我会用多模态分析帮你识别风险。",
    tip: "点「截图主动防御」→ 选图 → 我来识别。",
  },
  {
    icon: "bubble.left.and.bubble.right.fill",
    iconBg: "#E0F7FA",
    iconColor: "#00695C",
    title: "随时找我聊",
    body: "不确定某件事是不是诈骗？直接在「智能助手」页面跟我说，我会给你专业建议，还可以语音对话。",
    tip: "点底部「助手」标签 → 随时开始对话。",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useAuthStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const progress = useSharedValue(0);

  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      progress.value = withTiming(index, { duration: 300 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [progress],
  );

  const handleNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) {
      goTo(currentIndex + 1);
    } else {
      void completeOnboarding().then(() => {
        router.replace("/(tabs)");
      });
    }
  }, [currentIndex, goTo, completeOnboarding, router]);

  const handleSkip = useCallback(() => {
    void completeOnboarding().then(() => {
      router.replace("/(tabs)");
    });
  }, [completeOnboarding, router]);

  const step = STEPS[currentIndex];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={handleSkip} style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={styles.skipText}>跳过</Text>
        </Pressable>
      </View>

      {/* Step dots */}
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <DotIndicator key={i} index={i} progress={progress} total={STEPS.length} />
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: step.iconBg }]}>
          <IconSymbol name={step.icon} size={52} color={step.iconColor} />
        </View>

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        <View style={[styles.tipBox, { backgroundColor: "#F0F7FF" }]}>
          <IconSymbol name="lightbulb.fill" size={16} color="#2F80ED" />
          <Text style={styles.tipText}>{step.tip}</Text>
        </View>
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        {currentIndex > 0 ? (
          <Pressable
            onPress={() => goTo(currentIndex - 1)}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="chevron.left.forwardslash.chevron.right" size={20} color="#5F7592" />
            <Text style={styles.backText}>上一步</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.nextBtn,
            {
              backgroundColor: "#2F80ED",
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Text style={styles.nextText}>
            {currentIndex === STEPS.length - 1 ? "开始使用" : "下一步"}
          </Text>
          <IconSymbol name="chevron.right" size={18} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

function DotIndicator({
  index,
  progress,
  total,
}: {
  index: number;
  progress: SharedValue<number>;
  total: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const isActive = Math.round(progress.value) === index;
    const width = interpolate(
      progress.value,
      [index - 1, index, index + 1],
      [8, 24, 8],
      Extrapolation.CLAMP,
    );
    return {
      width,
      backgroundColor: isActive ? "#2F80ED" : "#C8D9EC",
    };
  });

  return <Animated.View style={[styles.dot, animStyle]} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F7FAFC",
    paddingHorizontal: 28,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { fontSize: 15, color: "#9BB0C7", fontWeight: "500" },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    alignItems: "center",
    gap: 20,
    paddingTop: 16,
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#16324F",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: "#5F7592",
    lineHeight: 26,
    textAlign: "center",
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: "#2F80ED",
    fontWeight: "600",
    lineHeight: 22,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flex: 1,
  },
  backText: { fontSize: 15, color: "#5F7592", fontWeight: "500" },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 20,
    flex: 2,
    justifyContent: "center",
  },
  nextText: { fontSize: 17, fontWeight: "700", color: "#ffffff" },
});
