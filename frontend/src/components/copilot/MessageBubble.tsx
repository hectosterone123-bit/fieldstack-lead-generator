import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function MessageBubble({ role, content, timestamp }: Props) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const timeLabel = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className={cn('flex gap-2.5 px-4 py-2 group', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5',
        isUser ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-700 text-zinc-400'
      )}>
        {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
      </div>
      <div className="min-w-0 max-w-[85%]">
        <div className={cn(
          'relative rounded-xl px-3.5 py-2.5 text-sm',
          isUser
            ? 'bg-orange-500/10 text-zinc-200'
            : 'bg-zinc-800/50 text-zinc-300'
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-white/[0.06] prose-code:text-orange-300 prose-strong:text-zinc-100">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
          {/* Copy button for assistant messages */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 opacity-0 group-hover:opacity-100 transition-all"
              title="Copy message"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
        {/* Timestamp */}
        {timeLabel && (
          <p className={cn('text-[10px] text-zinc-600 mt-0.5 px-1', isUser && 'text-right')}>
            {timeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
