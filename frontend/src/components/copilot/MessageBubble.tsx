import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  role: 'user' | 'assistant';
  content: string;
}

export function MessageBubble({ role, content }: Props) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-2.5 px-4 py-2', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5',
        isUser ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-700 text-zinc-400'
      )}>
        {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
      </div>
      <div className={cn(
        'min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
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
      </div>
    </div>
  );
}
