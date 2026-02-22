import { useState, useRef, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onCancel: () => void;
  streaming: boolean;
}

export function ChatInput({ onSend, onCancel, streaming }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  return (
    <div className="px-3 pb-3 pt-2">
      <div className="flex items-end gap-2 bg-zinc-800/60 border border-white/[0.06] rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-orange-500/40 focus-within:border-orange-500/30 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your leads..."
          rows={1}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none max-h-[120px]"
        />
        {streaming ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-7 h-7 rounded-lg bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center text-red-400 transition-colors"
          >
            <Square className="w-3 h-3 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="shrink-0 w-7 h-7 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 flex items-center justify-center text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
