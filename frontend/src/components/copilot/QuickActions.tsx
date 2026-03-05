import { useCopilotContext } from '../../lib/copilotContext';

interface Props {
  onSelect: (text: string) => void;
}

const SUGGESTIONS: Record<string, string[]> = {
  '/': [
    'What should I focus on today?',
    'Show me pipeline health',
    'Which leads need follow-up?',
  ],
  '/leads': [
    'Find my hottest leads',
    'Show overdue follow-ups',
    'Pipeline summary',
  ],
  '/finder': [
    'How many leads have I imported?',
    'Which areas have the most leads?',
  ],
  '/templates': [
    'Which templates work best for new leads?',
    'Help me write a custom email',
  ],
};

export function QuickActions({ onSelect }: Props) {
  const { context } = useCopilotContext();

  const leadSuggestions = context.lead_id && context.lead_name
    ? [
        `Summarize ${context.lead_name}`,
        `Draft a follow-up email for ${context.lead_name}`,
        `What's the best next step for ${context.lead_name}?`,
      ]
    : null;

  const items = leadSuggestions || SUGGESTIONS[context.page] || SUGGESTIONS['/'];

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {items.map(text => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          className="px-2.5 py-1.5 text-xs text-zinc-400 bg-zinc-800/60 hover:bg-zinc-700/60 border border-white/[0.06] hover:border-white/[0.10] rounded-lg transition-colors truncate max-w-[200px]"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
