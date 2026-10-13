'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Send, ExternalLink, X, Lock } from 'lucide-react';

interface Message {
  role: 'agent' | 'user';
  content: string;
  timestamp: Date;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

interface SetupAgentProps {
  isOpen: boolean;
  onClose: () => void;
  buildFailed?: boolean;
  projectId?: string;
}

export function SetupAgent({ isOpen, onClose, buildFailed = false, projectId }: SetupAgentProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with a welcome message
  useEffect(() => {
    if (!isOpen || messages.length !== 0) return;
    const initialContent = buildFailed
      ? `Hey! I can see your build hit an error — frustrating, but usually fixable. The most common wins:\n\n• Simplify or rephrase your idea slightly and rebuild\n• Ask me what the error in your pipeline log means\n\nI can also help with API keys, deploying, and domains. What would you like to do?`
      : `Hey! I'm your Setup Agent. I can help you:\n\n• Configure API keys for your app\n• Understand what each key does\n• Learn how to keep your keys safe\n• Troubleshoot deployment issues\n\nWhat do you need help with?`;
    // Deferred a tick: synchronous setState inside an effect triggers
    // cascading renders (react-hooks flags it as an error).
    const t = setTimeout(() => {
      setMessages([{ role: 'agent', content: initialContent, timestamp: new Date() }]);
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, buildFailed, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Send to AI backend
      const res = await fetch('/api/setup-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          messages: newMessages.map(m => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: 'agent',
          content: data.message,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'agent',
          content: data.message,
          timestamp: new Date(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'agent',
        content: 'I lost connection for a second. Try sending that again?',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ESC closes the panel — standard dialog behavior.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    // Height is viewport-aware (100dvh - margins) so the header — and its
    // close button — can never slide above the top of the screen, and z-[60]
    // keeps the panel above the sticky z-50 dashboard header.
    <div className="fixed bottom-4 left-4 z-[60] w-96 max-w-[92vw] max-h-[min(600px,calc(100dvh-2rem))] flex flex-col">
      <Card className="flex flex-col h-full shadow-2xl border-violet-500/30">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm">Setup Agent</CardTitle>
              <p className="text-xs text-white/40">
                AI-powered setup assistant
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-violet-500/20 text-white'
                  : 'bg-white/5 text-white/80'
              }`}>
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                {msg.action && (
                  <div className="mt-2">
                    {msg.action.href ? (
                      <a href={msg.action.href} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="text-xs">
                          {msg.action.label} <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </a>
                    ) : msg.action.onClick ? (
                      <Button variant="gradient" size="sm" className="text-xs" onClick={msg.action.onClick}>
                        {msg.action.label}
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 rounded-lg p-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="border-t border-white/10 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question or paste a key..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50"
              disabled={loading}
            />
            <Button variant="gradient" size="sm" onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-white/30 mt-2 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Keys are encrypted and never shared
          </p>
        </div>
      </Card>
    </div>
  );
}
