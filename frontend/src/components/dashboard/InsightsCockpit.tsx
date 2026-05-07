import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, AlertTriangle, Lightbulb, TrendingUp, Info,
  ChevronDown, ChevronUp, Loader2, Sparkles, ArrowRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useInsights, useAiInsightSummary } from '../../hooks/useInsights';
import type { Insight } from '../../lib/api';

const TYPE_CONFIG = {
  warning: {
    icon: AlertTriangle,
    label: 'Issue',
    border: 'border-l-red-500',
    bg: 'hover:bg-red-500/[0.03]',
    iconColor: 'text-red-400',
    labelColor: 'bg-red-500/15 text-red-400',
  },
  tip: {
    icon: Lightbulb,
    label: 'Tip',
    border: 'border-l-amber-500',
    bg: 'hover:bg-amber-500/[0.03]',
    iconColor: 'text-amber-400',
    labelColor: 'bg-amber-500/15 text-amber-400',
  },
  good: {
    icon: TrendingUp,
    label: 'Win',
    border: 'border-l-emerald-500',
    bg: 'hover:bg-emerald-500/[0.03]',
    iconColor: 'text-emerald-400',
    labelColor: 'bg-emerald-500/15 text-emerald-400',
  },
  info: {
    icon: Info,
    label: 'Info',
    border: 'border-l-zinc-500',
    bg: 'hover:bg-white/[0.02]',
    iconColor: 'text-zinc-400',
    labelColor: 'bg-zinc-700 text-zinc-400',
  },
};

function InsightRow({ insight }: { insight: Insight }) {
  const cfg = TYPE_CONFIG[insight.type];
  const Icon = cfg.icon;
  return (
    <div className={cn('flex items-start gap-3 px-5 py-3 border-l-2 transition-colors', cfg.border, cfg.bg)}>
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', cfg.iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide', cfg.labelColor)}>
            {cfg.label}
          </span>
          <span className="text-sm font-medium text-zinc-200">{insight.title}</span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed mb-1.5">{insight.description}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] bg-zinc-800 border border-white/[0.06] rounded px-2 py-0.5 text-zinc-400 font-data">
            {insight.metric.label}: <span className="text-zinc-200">{insight.metric.value}</span>
            <span className="text-zinc-600"> · target {insight.metric.benchmark}</span>
          </span>
          <Link
            to={insight.action_href}
            className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors font-medium"
          >
            {insight.action} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function InsightsCockpit() {
  const { data, isLoading, isError } = useInsights();
  const aiSummary = useAiInsightSummary();
  const [showAll, setShowAll] = useState(false);
  const [aiText, setAiText] = useState('');

  const insights = data?.insights || [];
  const warnings = insights.filter(i => i.type === 'warning').length;
  const wins = insights.filter(i => i.type === 'good').length;
  const visible = showAll ? insights : insights.slice(0, 5);

  if (isLoading) {
    return (
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 overflow-hidden animate-pulse h-32" />
    );
  }

  if (isError) {
    return (
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 p-5">
        <p className="text-sm text-zinc-500">Could not load insights — backend may be unavailable.</p>
      </div>
    );
  }

  if (!insights.length) {
    return (
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-emerald-400" />
          <p className="text-sm font-medium text-zinc-200">Pipeline looks healthy</p>
        </div>
        <p className="text-xs text-zinc-500">No issues or recommendations right now. Keep adding leads and running outreach — insights will appear as patterns emerge.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.04]">
        <Zap className="w-4 h-4 text-orange-400" />
        <h2 className="text-zinc-300 font-medium text-sm">Strategy Cockpit</h2>
        <div className="flex items-center gap-1.5 ml-1">
          {warnings > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
              {warnings} {warnings === 1 ? 'issue' : 'issues'}
            </span>
          )}
          {wins > 0 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
              {wins} {wins === 1 ? 'win' : 'wins'}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              if (aiText) { setAiText(''); return; }
              aiSummary.mutateAsync().then(d => setAiText(d.summary)).catch(() => {});
            }}
            disabled={aiSummary.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/[0.06] rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            {aiSummary.isPending
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
              : <><Sparkles className="w-3 h-3 text-violet-400" /> {aiText ? 'Hide AI' : 'AI Analysis'}</>
            }
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {aiText && (
        <div className="px-5 py-3.5 border-b border-white/[0.04] bg-violet-500/[0.04]">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-300 leading-relaxed">{aiText}</p>
          </div>
        </div>
      )}

      {/* Insight rows */}
      <div className="divide-y divide-white/[0.03]">
        {visible.map(insight => (
          <InsightRow key={insight.id} insight={insight} />
        ))}
      </div>

      {/* Show more / less */}
      {insights.length > 5 && (
        <div className="px-5 py-2.5 border-t border-white/[0.04]">
          <button
            onClick={() => setShowAll(s => !s)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors"
          >
            {showAll
              ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
              : <><ChevronDown className="w-3.5 h-3.5" /> {insights.length - 5} more insights</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
