'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth-context';
import { X, Send, RotateCcw } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY = 'bodigi-support-chat';

const GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hi! I'm the BoDiGi support agent. Ask me anything about your apps — building, docs, deploying, API keys, billing. If I can't fix something, I'll hand it to the human team.",
};

/**
 * SupportChat — AI support panel on all logged-in pages.
 * Opened from the nav's Support button (custom event 'bodigi:open-support').
 * Conversation persists in localStorage across closes and page reloads;
 * the reset icon starts a fresh conversation.
 * Escalates to a human ticket when stuck.
 */
export function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Open when the nav button fires the event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('bodigi:open-support', handler);
    return () => window.removeEventListener('bodigi:open-support', handler);
  }, []);

  // Restore conversation on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* fresh start */ }
  }, []);

  // Persist conversation
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch { /* storage full/blocked — non-fatal */ }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  if (!user) return null;

  const startNewChat = () => {
    setMessages([GREETING]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m, i) => !(i === 0 && m.role === 'assistant')) }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || data.error || 'Something went wrong — try again.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection hiccup — try sending that again.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[120] w-[92vw] max-w-sm h-[70vh] max-h-[560px] rounded-2xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/70 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/60">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Support
          </div>
          <div className="text-[11px] text-white/40">AI first — humans when needed</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startNewChat}
            aria-label="Start new chat"
            title="New chat"
            className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/60 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close support chat"
            title="Close (conversation is saved)"
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white rounded-br-sm'
                  : 'bg-white/5 border border-white/10 text-white/85 rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Describe your issue…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center disabled:opacity-40 transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
