import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Loader2, Zap, Sparkles } from 'lucide-react';
import { useChatStore } from '@/stores/cc-stores';
import { generateClawdBotResponse } from '@/lib/command-center/clawdbot-ai';
import type { ChatMessage } from '@/lib/command-center/types';
import { format } from 'date-fns';

export function CcChatTab() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const response = generateClawdBotResponse(userMsg.content);
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      addMessage(assistantMsg);
      setTyping(false);
    }, 1200 + Math.random() * 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const quickPrompts = [
    "What should I prioritize today?",
    "Show me pipeline health",
    "Who has bandwidth for new tasks?",
    "Revenue forecast update",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
          <Bot className="w-5 h-5 text-background" />
        </div>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            ClawdBot
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">ONLINE</span>
          </h1>
          <p className="text-xs text-muted-foreground">Direct. Profit-focused. No excuses.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-background" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Ready to work.</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              I analyze your pipelines, team workload, and performance metrics to give you actionable insights. Ask me anything.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickPrompts.map((prompt) => (
                <button key={prompt} onClick={() => setInput(prompt)} className="px-3 py-1.5 rounded-lg text-xs bg-secondary/50 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                  <Sparkles className="w-3 h-3 inline mr-1.5" />{prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[70%]">
                <div className="flex items-end gap-2">
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-background" />
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'glass rounded-bl-md'}`}>
                    <div className="whitespace-pre-wrap">{msg.content.split('**').map((part, i) =>
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                    )}</div>
                  </div>
                </div>
                <p className={`text-[10px] text-muted-foreground mt-1 ${msg.role === 'user' ? 'text-right' : 'ml-9'}`}>
                  {format(new Date(msg.timestamp), 'h:mm a')}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-background" />
            </div>
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Analyzing...</span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/50 pt-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 glass rounded-xl p-1">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask ClawdBot anything..." rows={1} className="w-full bg-transparent px-3 py-2.5 text-sm resize-none outline-none placeholder:text-muted-foreground/50" style={{ minHeight: '40px', maxHeight: '120px' }} />
          </div>
          <button onClick={handleSend} disabled={!input.trim() || isTyping} className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
            <Send className="w-4 h-4 text-background" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3" /><span>ClawdBot has access to all pipeline data and team metrics</span>
        </div>
      </div>
    </div>
  );
}
