import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

import { ScreenContainer } from "@/components/screen-container";
import { PauseBanner } from "@/components/pause-banner";
import { VoiceChatModal } from "@/components/voice-chat-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useChat, type ChatMessage } from "@/lib/chat-store";
import { useAntiFraud } from "@/lib/anti-fraud-store";
import { clientChatSend } from "@/lib/client-chat";

/* ------------------------------------------------------------------ */
/*  Avatar component with animated states                             */
/* ------------------------------------------------------------------ */

type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "alert";

function AssistantAvatar({ state, size = 48 }: { state: AvatarState; size?: number }) {
  const colors = useColors();
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (state === "thinking") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600 }),
          withTiming(0.95, { duration: 600 }),
        ),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(0.2, { duration: 800 }),
        ),
        -1,
        true,
      );
    } else if (state === "alert") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 300 }),
          withTiming(0.92, { duration: 300 }),
        ),
        -1,
        true,
      );
      glowOpacity.value = withTiming(0.8, { duration: 200 });
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [state, pulseScale, glowOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const bgColor = state === "alert" ? colors.error : colors.primary;

  return (
    <View style={[styles.avatarContainer, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.avatarGlow,
          glowStyle,
          {
            width: size + 8,
            height: size + 8,
            borderRadius: (size + 8) / 2,
            backgroundColor: bgColor,
          },
        ]}
      />
      <Animated.View
        style={[
          animatedStyle,
          styles.avatarInner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
          },
        ]}
      >
        <IconSymbol
          name="shield.lefthalf.fill"
          size={size * 0.5}
          color="#ffffff"
        />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Message bubble                                                    */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  onQuickQuestion,
}: {
  message: ChatMessage;
  onQuickQuestion?: (q: string) => void;
}) {
  const colors = useColors();
  const isUser = message.role === "user";
  const isHighRisk = message.isHighRisk;

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      {!isUser && (
        <AssistantAvatar state={isHighRisk ? "alert" : "idle"} size={32} />
      )}
      <View style={styles.bubbleColumn}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: colors.primary }]
              : [
                  styles.bubbleAssistant,
                  {
                    backgroundColor: isHighRisk ? `${colors.error}18` : colors.surface,
                    borderColor: isHighRisk ? colors.error : colors.border,
                    borderWidth: isHighRisk ? 1.5 : 0.5,
                  },
                ],
          ]}
        >
          {isHighRisk && !isUser && (
            <View style={styles.riskBadge}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color={colors.error} />
              <Text style={[styles.riskBadgeText, { color: colors.error }]}>高风险警告</Text>
            </View>
          )}
          <Text
            style={[
              styles.bubbleText,
              { color: isUser ? "#ffffff" : colors.foreground },
            ]}
          >
            {message.content}
          </Text>
        </View>

        {/* Quick questions */}
        {!isUser && message.quickQuestions && message.quickQuestions.length > 0 && (
          <View style={styles.quickQuestionsContainer}>
            {message.quickQuestions.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.quickQuestionChip, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                onPress={() => onQuickQuestion?.(q)}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickQuestionText, { color: colors.primary }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/*  Typing indicator                                                  */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      style={[styles.bubbleRow, styles.bubbleRowAssistant]}
    >
      <AssistantAvatar state="thinking" size={32} />
      <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5 }]}>
        <View style={styles.typingDots}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.typingText, { color: colors.muted }]}>正在思考...</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/*  Welcome view                                                      */
/* ------------------------------------------------------------------ */

function WelcomeView({ onStart }: { onStart: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.welcomeContainer}>
      <AssistantAvatar state="idle" size={72} />
      <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>明鉴</Text>
      <Text style={[styles.welcomeSubtitle, { color: colors.muted }]}>
        遇到可疑电话、短信或网络信息？{"\n"}随时告诉我，帮你分析风险
      </Text>
      <View style={styles.welcomeFeatures}>
        {[
          { icon: "shield.lefthalf.fill" as const, text: "实时风险分析" },
          { icon: "brain.head.profile" as const, text: "智能追问厘清" },
          { icon: "checkmark.shield.fill" as const, text: "处置建议" },
        ].map((feature, i) => (
          <View key={i} style={[styles.featureItem, { backgroundColor: colors.surface }]}>
            <IconSymbol name={feature.icon} size={20} color={colors.primary} />
            <Text style={[styles.featureText, { color: colors.foreground }]}>{feature.text}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.startButton, { backgroundColor: colors.primary }]}
        onPress={onStart}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>开始对话</Text>
        <IconSymbol name="paperplane.fill" size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main chat screen                                                  */
/* ------------------------------------------------------------------ */

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    activeConversation,
    activeConversationId,
    createConversation,
    addMessage,
    setActiveConversationId,
  } = useChat();
  const { memory } = useAntiFraud();

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Inline Ark chat (no server). Keep shape compatible with old mutateAsync usage.
  const chatSend = {
    mutateAsync: clientChatSend,
  };

  const messages = activeConversation?.messages ?? [];

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleStart = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = (text ?? inputText).trim();
      if (!messageText || isLoading) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        const conv = createConversation();
        conversationId = conv.id;
      }

      setInputText("");
      setIsLoading(true);

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageText,
        timestamp: new Date().toISOString(),
      };
      addMessage(conversationId, userMessage);

      try {
        const result = await chatSend.mutateAsync({
          message: messageText,
          history: messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: m.timestamp,
          })),
          longTerm: memory.longTerm,
          riskContext: activeConversation?.riskContext,
        });

        const assistantMessage: ChatMessage = {
          id: result.id,
          role: "assistant",
          content: result.content,
          timestamp: result.timestamp,
          isHighRisk: result.isHighRisk,
          quickQuestions: result.quickQuestions,
          provider: result.provider,
        };
        addMessage(conversationId, assistantMessage);
      } catch (error) {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "抱歉，我暂时无法回复。请检查网络连接后重试，或拨打 96110 获取帮助。",
          timestamp: new Date().toISOString(),
        };
        addMessage(conversationId, errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [inputText, isLoading, activeConversationId, createConversation, addMessage, chatSend, messages, activeConversation],
  );

  const handleQuickQuestion = useCallback(
    (question: string) => {
      handleSend(question);
    },
    [handleSend],
  );

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, [setActiveConversationId]);

  // Show welcome view if no active conversation
  if (!activeConversationId) {
    return (
      <ScreenContainer>
        <PauseBanner variant="chat" />
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>智能助手</Text>
        </View>
        <WelcomeView onStart={handleStart} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <PauseBanner variant="chat" />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>智能助手</Text>
        <TouchableOpacity
          onPress={handleNewConversation}
          style={[styles.newChatButton, { backgroundColor: colors.surface }]}
          activeOpacity={0.7}
        >
          <IconSymbol name="paperplane.fill" size={16} color={colors.primary} />
          <Text style={[styles.newChatText, { color: colors.primary }]}>新对话</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onQuickQuestion={handleQuickQuestion}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <AssistantAvatar state="idle" size={48} />
              <Text style={[styles.emptyChatText, { color: colors.muted }]}>
                你好！有什么可以帮你的？
              </Text>
            </View>
          }
          ListFooterComponent={isLoading ? <TypingIndicator /> : null}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        />

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Voice button */}
            <TouchableOpacity
              onPress={() => setVoiceModalVisible(true)}
              style={[styles.voiceButton, { backgroundColor: colors.background }]}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20 }}>🎤</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.textInput, { color: colors.foreground }]}
              placeholder="描述可疑情况，或点麦克语音对话..."
              placeholderTextColor={colors.muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={!inputText.trim() || isLoading}
              style={[
                styles.sendButton,
                {
                  backgroundColor: inputText.trim() && !isLoading ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <IconSymbol name="paperplane.fill" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Realtime Voice Chat Modal */}
        <VoiceChatModal
          visible={voiceModalVisible}
          onClose={() => setVoiceModalVisible(false)}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  newChatText: {
    fontSize: 13,
    fontWeight: "600",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bubbleRow: {
    marginVertical: 4,
  },
  bubbleRowUser: {
    alignItems: "flex-end",
  },
  bubbleRowAssistant: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bubbleColumn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    flexShrink: 1,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  quickQuestionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  quickQuestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickQuestionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typingText: {
    fontSize: 13,
  },
  inputBar: {
    borderTopWidth: 0.5,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 100,
    paddingVertical: 6,
  },
  voiceButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  welcomeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: "800",
    marginTop: 8,
  },
  welcomeSubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  welcomeFeatures: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  featureItem: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  featureText: {
    fontSize: 12,
    fontWeight: "600",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 16,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyChatText: {
    fontSize: 15,
  },
  avatarContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlow: {
    position: "absolute",
  },
  avatarInner: {
    alignItems: "center",
    justifyContent: "center",
  },
});
