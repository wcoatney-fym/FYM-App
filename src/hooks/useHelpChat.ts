/**
 * useHelpChat — Chat state management hook for Help Chatbot Widget
 *
 * Manages message history, sessionStorage persistence, keyword matching,
 * special commands, and escalation flow. No external API calls.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { findBestMatch, getCategories, getEntriesByCategory, CATEGORY_LABELS } from '@/lib/help-matcher';
import { HELP_ENTRIES } from '@/data/help-knowledge-base';
import type { HelpEntry } from '@/data/help-knowledge-base';

const STORAGE_KEY = 'fym_help_chat';
const MAX_MESSAGES = 100;

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: number;
  links?: { label: string; href: string }[];
  quickReplies?: { label: string; value: string }[];
}

const GREETING_MESSAGE: ChatMessage = {
  id: 'greeting',
  role: 'bot',
  text: "Hey! I'm the FYM Help Bot. Ask me anything about carriers, contracting, or the app — or type \"help\" for topics I can cover.",
  timestamp: Date.now(),
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 11);
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [GREETING_MESSAGE];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return parsed.length > 0 ? parsed : [GREETING_MESSAGE];
  } catch {
    return [GREETING_MESSAGE];
  }
}

function saveMessages(messages: ChatMessage[]): void {
  try {
    // FIFO: keep only the last MAX_MESSAGES
    const trimmed = messages.length > MAX_MESSAGES
      ? messages.slice(messages.length - MAX_MESSAGES)
      : messages;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // sessionStorage full or unavailable — silently fail
  }
}

/** Build the topics list response for the "help" command */
function buildTopicsList(): string {
  const categories = getCategories(HELP_ENTRIES);
  const lines: string[] = ["Here's what I can help with:\n"];

  for (const cat of categories) {
    const label = CATEGORY_LABELS[cat];
    const entries = getEntriesByCategory(HELP_ENTRIES, cat);
    lines.push(`${label}`);
    for (const entry of entries) {
      lines.push(`  • ${entry.question}`);
    }
    lines.push('');
  }

  lines.push('Just ask your question naturally — I\'ll find the best match.');
  return lines.join('\n');
}

export interface UseHelpChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  handleQuickReply: (value: string) => void;
  clearChat: () => void;
  /** The last user question that triggered an escalation prompt (null if none pending) */
  pendingEscalation: string | null;
}

export function useHelpChat(): UseHelpChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [pendingEscalation, setPendingEscalation] = useState<string | null>(null);
  const lastUserQuestion = useRef<string | null>(null);

  // Sync to sessionStorage whenever messages change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  const addBotMessage = useCallback((
    text: string,
    options?: {
      links?: HelpEntry['links'];
      quickReplies?: ChatMessage['quickReplies'];
    }
  ) => {
    const msg: ChatMessage = {
      id: generateId(),
      role: 'bot',
      text,
      timestamp: Date.now(),
      links: options?.links,
      quickReplies: options?.quickReplies,
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    lastUserQuestion.current = trimmed;

    // Check for special commands
    const lower = trimmed.toLowerCase();

    if (lower === 'help' || lower === 'topics') {
      setTimeout(() => {
        addBotMessage(buildTopicsList());
      }, 300);
      return;
    }

    if (lower === 'clear') {
      setTimeout(() => {
        setMessages([GREETING_MESSAGE]);
        setPendingEscalation(null);
      }, 200);
      return;
    }

    // Run keyword matching
    const match = findBestMatch(trimmed, HELP_ENTRIES);

    setTimeout(() => {
      if (match) {
        addBotMessage(match.entry.answer, {
          links: match.entry.links,
        });
      } else {
        // No match — offer escalation
        setPendingEscalation(trimmed);
        addBotMessage(
          "I'm not sure about that one. Want me to flag this for the team?",
          {
            quickReplies: [
              { label: '✅ Yes, flag it', value: 'escalate_yes' },
              { label: '❌ No thanks', value: 'escalate_no' },
            ],
          }
        );
      }
    }, 300 + Math.random() * 200); // Slight delay for natural feel
  }, [addBotMessage]);

  const handleQuickReply = useCallback((value: string) => {
    if (value === 'escalate_yes') {
      // The actual DB insert happens in the widget component (needs supabase client)
      // This hook just manages the state transition
      addBotMessage("Got it — flagged for the team. They'll follow up.");
      setPendingEscalation(null);
    } else if (value === 'escalate_no') {
      addBotMessage("No problem. Try rephrasing, or type \"help\" to see what I can help with.");
      setPendingEscalation(null);
    }
  }, [addBotMessage]);

  const clearChat = useCallback(() => {
    setMessages([GREETING_MESSAGE]);
    setPendingEscalation(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return {
    messages,
    sendMessage,
    handleQuickReply,
    clearChat,
    pendingEscalation,
  };
}
