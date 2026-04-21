/**
 * VoiceChatModal — Realtime Voice Conversation Modal
 *
 * Provides a bottom-sheet style modal for end-to-end voice conversation.
 * Shows animated waveform during listening, transcript history, and state feedback.
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { useVoiceChat, type VoiceChatState } from "@/lib/use-voice-chat";

interface VoiceChatModalProps {
  visible: boolean;
  onClose: () => void;
}

const STATE_LABELS: Record<VoiceChatState, string> = {
  idle: "点击「开始对话」连接语音助手",
  connecting: "正在连接语音服务...",
  ready: "长按麦克风说话",
  listening: "正在聆听...",
  processing: "正在理解你说的话...",
  speaking: "助手正在回复...",
  error: "连接出现问题，请重试",
};

const STATE_COLORS: Record<VoiceChatState, string> = {
  idle: "#687076",
  connecting: "#F59E0B",
  ready: "#22C55E",
  listening: "#2F80ED",
  processing: "#8B5CF6",
  speaking: "#F59E0B",
  error: "#EF4444",
};

function WaveformBars({ isActive, color }: { isActive: boolean; color: string }) {
  const bars = useRef<Animated.Value[]>(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (!isActive) {
      bars.forEach((bar) => {
        Animated.timing(bar, { toValue: 0.3, duration: 200, useNativeDriver: true }).start();
      });
      return;
    }

    const animations = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + i * 60,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.2 + Math.random() * 0.4,
            duration: 200 + i * 40,
            useNativeDriver: true,
          }),
        ])
      )
    );

    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [isActive, bars]);

  return (
    <View style={styles.waveformContainer}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveformBar,
            { backgroundColor: color, transform: [{ scaleY: bar }] },
          ]}
        />
      ))}
    </View>
  );
}

export function VoiceChatModal({ visible, onClose }: VoiceChatModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const {
    state,
    transcripts,
    errorMessage,
    startSession,
    stopSession,
    startListening,
    stopListening,
  } = useVoiceChat();

  const isListening = state === "listening";
  const isConnected = state === "ready" || state === "listening" || state === "processing" || state === "speaking";
  const stateColor = STATE_COLORS[state];

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    if (transcripts.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [transcripts]);

  const handleClose = () => {
    stopSession();
    onClose();
  };

  const handleMicPress = async () => {
    if (state === "ready") {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await startListening();
    }
  };

  const handleMicRelease = async () => {
    if (state === "listening") {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await stopListening();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>实时语音对话</Text>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.closeBtnText, { color: colors.muted }]}>关闭</Text>
            </Pressable>
          </View>

          {/* State indicator */}
          <View style={styles.stateRow}>
            <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.stateLabel, { color: stateColor }]}>
              {STATE_LABELS[state]}
            </Text>
          </View>

          {/* Error message */}
          {errorMessage && (
            <View style={[styles.errorBox, { backgroundColor: "#FEF2F2" }]}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Transcript area */}
          <ScrollView
            ref={scrollRef}
            style={styles.transcriptArea}
            contentContainerStyle={styles.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            {transcripts.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.muted }]}>
                {isConnected
                  ? "长按下方麦克风按钮说话，松开后助手会回复你。"
                  : "连接后可以直接和助手说话，描述你遇到的可疑情况。"}
              </Text>
            ) : (
              transcripts.map((t, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    t.role === "user" ? styles.userBubble : styles.assistantBubble,
                    {
                      backgroundColor:
                        t.role === "user" ? "#2F80ED" : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      { color: t.role === "user" ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {t.text}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          {/* Waveform */}
          <View style={styles.waveformRow}>
            <WaveformBars isActive={isListening} color={stateColor} />
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            {!isConnected ? (
              <Pressable
                onPress={() => void startSession()}
                style={({ pressed }) => [
                  styles.startBtn,
                  { backgroundColor: "#2F80ED", opacity: pressed ? 0.85 : 1 },
                  state === "connecting" && { opacity: 0.6 },
                ]}
                disabled={state === "connecting"}
              >
                <Text style={styles.startBtnText}>
                  {state === "connecting" ? "连接中..." : "开始对话"}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.micRow}>
                <Pressable
                  onPressIn={() => void handleMicPress()}
                  onPressOut={() => void handleMicRelease()}
                  style={({ pressed }) => [
                    styles.micBtn,
                    {
                      backgroundColor: isListening ? "#2F80ED" : colors.surface,
                      borderColor: isListening ? "#2F80ED" : colors.border,
                      transform: [{ scale: pressed || isListening ? 1.05 : 1 }],
                    },
                  ]}
                  disabled={state === "processing" || state === "speaking"}
                >
                  <Text style={styles.micIcon}>{isListening ? "🎙️" : "🎤"}</Text>
                  <Text
                    style={[
                      styles.micLabel,
                      { color: isListening ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {isListening ? "松开结束" : "长按说话"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={stopSession}
                  style={({ pressed }) => [
                    styles.endBtn,
                    { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.endBtnText, { color: colors.muted }]}>结束</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Hint */}
          <Text style={[styles.hint, { color: colors.muted }]}>
            语音内容仅用于本次反诈核验，不会被存储或分享
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    minHeight: 480,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeBtnText: {
    fontSize: 15,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  errorBox: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
  },
  transcriptArea: {
    flex: 1,
    marginVertical: 8,
  },
  transcriptContent: {
    gap: 8,
    paddingVertical: 4,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 16,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  waveformRow: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    marginVertical: 4,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 40,
  },
  waveformBar: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  controls: {
    marginTop: 8,
  },
  startBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  micBtn: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 16,
    alignItems: "center",
    gap: 4,
  },
  micIcon: {
    fontSize: 24,
  },
  micLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  endBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  endBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
  },
});
