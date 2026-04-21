import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
function generateId() {
  return "chat-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

const CHAT_STORAGE_KEY = "a30-chat-history-v1";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  isHighRisk?: boolean;
  quickQuestions?: string[];
  provider?: string;
}

export interface ChatConversation {
  id: string;
  createdAt: string;
  title: string;
  messages: ChatMessage[];
  riskContext?: string;
}

interface ChatContextValue {
  ready: boolean;
  conversations: ChatConversation[];
  activeConversation: ChatConversation | null;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  createConversation: (title?: string, riskContext?: string) => ChatConversation;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  clearConversation: (conversationId: string) => void;
  clearAll: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Hydrate from storage
  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as ChatConversation[];
          setConversations(parsed);
        }
      } catch (error) {
        console.warn("hydrate chat state failed", error);
      } finally {
        if (mounted) setReady(true);
      }
    }
    hydrate();
    return () => { mounted = false; };
  }, []);

  // Persist on change
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)).catch((error) => {
      console.warn("persist chat state failed", error);
    });
  }, [conversations, ready]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((c) => c.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  const createConversation = useCallback((title?: string, riskContext?: string) => {
    const id = generateId();
    const conversation: ChatConversation = {
      id,
      createdAt: new Date().toISOString(),
      title: title ?? "新对话",
      messages: [],
      riskContext,
    };
    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(id);
    return conversation;
  }, []);

  const addMessage = useCallback((conversationId: string, message: ChatMessage) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c;
        const updated = { ...c, messages: [...c.messages, message] };
        // Update title from first user message
        if (message.role === "user" && c.messages.filter((m) => m.role === "user").length === 0) {
          updated.title = message.content.slice(0, 20) + (message.content.length > 20 ? "..." : "");
        }
        return updated;
      }),
    );
  }, []);

  const clearConversation = useCallback((conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
    }
  }, [activeConversationId]);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveConversationId(null);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      ready,
      conversations,
      activeConversation,
      activeConversationId,
      setActiveConversationId,
      createConversation,
      addMessage,
      clearConversation,
      clearAll,
    }),
    [ready, conversations, activeConversation, activeConversationId, createConversation, addMessage, clearConversation, clearAll],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
