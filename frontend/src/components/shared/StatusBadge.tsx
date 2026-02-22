import { cn } from '../../lib/utils';
import type { LeadStatus } from '../../types';
import { STATUS_LABELS } from '../../types';

interface Props {
  status: LeadStatus;
  className?: string;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<LeadStatus, { dot: string; badge: string }> = {
  new:           { dot: 'bg-zinc-400',    badge: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700' },
  contacted:     { dot: 'bg-blue-400',    badge: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/25' },
  qualified:     { dot: 'bg-violet-400',  badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/25' },
  proposal_sent: { dot: 'bg-amber-400',   badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25' },
  booked:        { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25' },
  lost:          { dot: 'bg-red-400',     badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/25' },
  closed_won:    { dot: 'bg-emerald-300', badge: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' },
};

export function StatusBadge({ status, className, size = 'md' }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1',
        config.badge,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
