import React, { useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PageId } from '../types/studio';
import { djEngine } from '../audio/djEngine';

interface AssistantDrawerProps {
  open: boolean;
  currentPage: PageId;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onSuggestMusicPrompt: (prompt: string) => void;
}

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  confirmationPrompt?: string | null;
}

const QUICK_COMMANDS = [
  'Open DJ Studio',
  'Create an Afrobeat beat',
  'Add echo',
  'Reduce the bass',
  'Make the music slower',
  'Explain how to mix two songs',
];

export const AssistantDrawer: React.FC<AssistantDrawerProps> = ({
  open,
  currentPage,
  onClose,
  onNavigate,
  onSuggestMusicPrompt,
}) => {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: 'assistant',
      text: 'Welcome to MUNIX DJ ASSISTANT. Ask me to open any studio, adjust Deck A/B bass/echo/tempo, draft an Afrobeat prompt, or explain mixing techniques.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  if (!open) return null;

  const executeDeckCommand = (deck: 'A' | 'B' | 'MASTER' | null, command: string | null) => {
    if (!command) return;
    const targets: Array<'A' | 'B'> = deck === 'B' ? ['B'] : deck === 'A' ? ['A'] : ['A', 'B'];
    const states = djEngine.getStates();

    for (const d of targets) {
      const st = states[d];
      if (command === 'play') djEngine.play(d);
      if (command === 'pause') djEngine.pause(d);
      if (command === 'add_echo') djEngine.setDeckParam(d, 'echoMix', Math.min(0.85, st.echoMix + 0.4));
      if (command === 'reduce_bass') djEngine.setDeckParam(d, 'bassDb', Math.max(-12, st.bassDb - 6));
      if (command === 'slower') djEngine.setDeckParam(d, 'pitchRate', Math.max(0.65, Number((st.pitchRate - 0.08).toFixed(2))));
      if (command === 'faster') djEngine.setDeckParam(d, 'pitchRate', Math.min(1.4, Number((st.pitchRate + 0.08).toFixed(2))));
      if (command === 'reset_eq') {
        djEngine.setDeckParam(d, 'bassDb', 0);
        djEngine.setDeckParam(d, 'midDb', 0);
        djEngine.setDeckParam(d, 'trebleDb', 0);
      }
    }
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const nextHistory = [...messages, { role: 'user' as const, text: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch<{
        reply: string;
        navigationTarget: PageId | null;
        deckAction: { deck: 'A' | 'B' | 'MASTER' | null; command: string | null } | null;
        requiresConfirmation: boolean;
        confirmationPrompt: string | null;
        suggestedMusicPrompt: string | null;
      }>('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          currentPage,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      if (res.navigationTarget) {
        onNavigate(res.navigationTarget);
      }
      if (res.suggestedMusicPrompt) {
        onSuggestMusicPrompt(res.suggestedMusicPrompt);
      }
      if (res.deckAction?.command && !res.requiresConfirmation) {
        executeDeckCommand(res.deckAction.deck, res.deckAction.command);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.reply,
          confirmationPrompt: res.requiresConfirmation ? res.confirmationPrompt : null,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach MUNIX DJ ASSISTANT.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVoiceCommand = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Voice recognition is not supported in this browser. Type your command below.',
        },
      ]);
      return;
    }

    const rec = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        sendMessage(transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/10 bg-[#0b100e] shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">MUNIX DJ ASSISTANT</h3>
            <p className="text-xs text-neutral-400">Text & Voice Studio Copilot</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 cursor-pointer"
          aria-label="Close assistant"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap gap-1.5 bg-black/25">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => sendMessage(cmd)}
            className="px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-emerald-500/15 hover:border-emerald-500/40 text-xs text-neutral-200 transition-colors cursor-pointer"
          >
            {cmd}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`rounded-xl p-3.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'ml-8 bg-emerald-600/20 border border-emerald-500/30 text-emerald-50'
                : 'mr-6 bg-[#131a17] border border-white/10 text-neutral-200'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.confirmationPrompt && (
              <div className="mt-3 pt-2.5 border-t border-amber-500/30 text-xs text-amber-200">
                Confirmation required: {m.confirmationPrompt}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-8 rounded-xl bg-[#131a17] border border-white/10 p-3.5 text-xs text-neutral-400">
            Processing studio request...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-4 border-t border-white/10 bg-black/40 flex items-center gap-2 pb-safe"
      >
        <button
          type="button"
          onClick={toggleVoiceCommand}
          className={`min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
            listening
              ? 'border-red-500 bg-red-500/20 text-red-300'
              : 'border-white/10 bg-white/5 text-neutral-300 hover:text-white'
          }`}
          title="Voice command"
          aria-label="Voice command"
        >
          {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask MUNIX Assistant..."
          className="flex-1 min-h-[44px] rounded-lg border border-white/10 bg-[#0d1210] px-3 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="min-w-[44px] min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer"
          aria-label="Send command"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
