import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/services/api";
import { useAuth } from "./AuthContext";

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  isRead: boolean;
  createdAt: string;
  timestamp?: string;
}

export interface Chat {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant1Name: string;
  participant2Name: string;
  lastMessage?: string;
  lastMessageAt?: string;
  bookingId?: string;
  service?: string;
  createdAt: string;
}

interface ChatContextType {
  chats: Chat[];
  messages: Record<string, Message[]>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  sendMessage: (chatId: string, senderId: string, senderName: string, text: string) => Promise<void>;
  getOrCreateChat: (user1Id: string, user1Name: string, user2Id: string, user2Name: string, bookingId?: string, service?: string) => Promise<Chat>;
  markAsRead: (chatId: string, userId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  getMyChats: (userId: string) => Chat[];
  loadChats: () => Promise<void>;
  loadingChats: boolean;
  loadingMessages: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgTimeRef = useRef<Record<string, string>>({});
  const chatsLoadedRef = useRef(false);

  const loadChats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.getChats();
      setChats(res.chats as Chat[]);
    } catch {} finally {
      if (!chatsLoadedRef.current) {
        chatsLoadedRef.current = true;
        setLoadingChats(false);
      }
    }
  }, [user]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!user) {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      chatPollRef.current = null;
      msgPollRef.current = null;
      chatsLoadedRef.current = false;
      lastMsgTimeRef.current = {};
      setChats([]);
      setMessages({});
      setActiveChatId(null);
      setLoadingChats(true);
      setLoadingMessages(false);
      return;
    }
    chatPollRef.current = setInterval(loadChats, 45000); // Reduced from 8 seconds to 30 seconds
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [user, loadChats]);

  const loadMessages = useCallback(async (chatId: string, showLoading = false) => {
    if (showLoading) setLoadingMessages(true);
    try {
      // Load recent messages only (last 50) for better performance
      const res = await api.getMessages(chatId, undefined, 50);
      const msgs = res.messages as Message[];
      setMessages((prev) => ({ ...prev, [chatId]: msgs }));
      if (msgs.length > 0) {
        lastMsgTimeRef.current[chatId] = msgs[msgs.length - 1].createdAt;
      }
    } catch {} finally {
      if (showLoading) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      msgPollRef.current = null;
      return;
    }
    const hasExisting = !!(messages[activeChatId]);
    loadMessages(activeChatId, !hasExisting);
    msgPollRef.current = setInterval(() => loadMessages(activeChatId), 15000); // Reduced from 3 seconds to 10 seconds
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [activeChatId, loadMessages]);

  const getOrCreateChat = useCallback(
    async (
      user1Id: string, user1Name: string,
      user2Id: string, user2Name: string,
      bookingId?: string, service?: string
    ): Promise<Chat> => {
      if (!user) throw new Error("Not logged in");
      const res = await api.getOrCreateChat({
        otherUserId: user2Id,
        otherUserName: user2Name,
        myName: user1Name,
        bookingId,
        service,
      });
      const chat = res.chat as Chat;
      setChats((prev) => {
        const exists = prev.find((c) => c.id === chat.id);
        return exists ? prev.map((c) => c.id === chat.id ? chat : c) : [...prev, chat];
      });
      await loadMessages(chat.id);
      setActiveChatId(chat.id);
      return chat;
    },
    [user, loadMessages]
  );

  const sendMessage = useCallback(
    async (chatId: string, _senderId: string, senderName: string, text: string) => {
      const res = await api.sendMessage(chatId, text, senderName);
      const msg = res.message as Message;
      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));
      setChats((prev) =>
        prev.map((c) => c.id === chatId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c)
      );
    },
    []
  );

  const markAsRead = useCallback(async (chatId: string, _userId: string) => {
    try {
      await api.markChatRead(chatId);
    } catch {}
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      console.log(`ChatContext: Attempting to delete chat ${chatId}`);
      const result = await api.deleteChat(chatId);
      console.log(`ChatContext: Delete API response:`, result);

      // Immediately remove from local state
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setMessages((prev) => {
        const newMessages = { ...prev };
        delete newMessages[chatId];
        return newMessages;
      });
      // Clear active chat if it was the deleted one
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }

      console.log(`ChatContext: Chat ${chatId} deleted successfully`);
    } catch (error) {
      console.error(`ChatContext: Failed to delete chat ${chatId}:`, error);
      throw error; // Re-throw to let the UI handle the error
    }
  }, [activeChatId]);

  const getMyChats = useCallback(
    (userId: string) => {
      return chats.filter(
        (c) => c.participant1Id === userId || c.participant2Id === userId
      );
    },
    [chats]
  );

  return (
    <ChatContext.Provider
      value={{
        chats,
        messages,
        activeChatId,
        setActiveChatId,
        sendMessage,
        getOrCreateChat,
        markAsRead,
        deleteChat,
        getMyChats,
        loadChats,
        loadingChats,
        loadingMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

