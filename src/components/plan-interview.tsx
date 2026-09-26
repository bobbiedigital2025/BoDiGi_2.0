'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, ArrowRight } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content: "I'm the Plan Agent. Before the build team touches anything, I want to understand what you're really making — the apps turn out dramatically better. So: what's the idea, and who's it for?",
};

/**
 * PlanInterview — Plan Mode chat. The Plan Agent interviews the founder
 * (problem, audience, features, integrations, monetization), then
 * synthesizes the conversation into a structured build brief that feeds
 * the normal generate pipeline.
 */
export function PlanInterview({ onBuild, onClose }: {
  onBuild: (brief: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);

    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || data.error || 'Something went wrong — try again.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection hiccup — send that again?' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const buildFromInterview = async () => {
    if (building || messages.length < 3) return;
    setBuilding(true);
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, phase: 'synthesize' }),
      });
      const data = await res.json();
      if (data.brief) {
        onBuild(data.brief);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.error || 'Could not build the brief — answer one or two more questions and try again.' }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection hiccup — hit Build again.' }]);
    } finally {
      setBuilding(false);
    }
  };

  const enoughForBrief = messages.filter((m) => m.role === 'user').length >= 2;

  return (
    <div className="rounded-2xl border border-fuchsia-500/30 bg-slate-950/95 shadow-2xl shadow-fuchsia-500/10 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/60">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fuchsia-400" /> Plan Mode
          </div>
          <div className="text-[11px] text-white/40">A short interview, then the AI team builds the right thing</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={buildFromInterview}
            disabled={!enoughForBrief || building || busy}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition"
            title={enoughForBrief ? 'Turn this interview into a build plan' : 'Answer a couple of questions first'}
          >
            {building ? 'Planning…' : 'Build my app'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} aria-label="Close plan mode" className="p-1.5 rounded-lg hover:bg-white/10 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto px-5 py-4 space-y-3">
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
          placeholder="Answer the question…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500/50"
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
