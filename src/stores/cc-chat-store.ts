import { create } from 'zustand';
import { ChatMessage } from '@/lib/command-center/types';
import { mockChatHistory } from '@/lib/command-center/mock-data';

interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  mockDataLoaded: boolean;
  loadMockData: () => void;
  clearMockData: () => void;
  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,
  mockDataLoaded: false,
  loadMockData: () => set({ messages: mockChatHistory, mockDataLoaded: true }),
  clearMockData: () => set({ messages: [], mockDataLoaded: false }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setTyping: (typing) => set({ isTyping: typing }),
}));
