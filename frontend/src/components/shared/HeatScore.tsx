import { Flame } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  score: number;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
}

interface HeatConfig {
  bar: string;
  dot: string;
  text: string;
  label: string;
}

function getHeatConfig(score: number): HeatConfig {
  if (score >= 70) return { bar: 'bg-red-500',    dot: 'bg-red-400',    text: 'text-red-400',    label: 'Hot' };
  if (score >= 40) return { bar: 'bg-orange-500', dot: 'bg-orange-400', text: 'text-orange-400', label: 'Warm' };
  if (score >= 20) return { bar: 'bg-yellow-500', dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Cool' };
  return            { bar: 'bg-zinc-600',  dot: 'bg-zinc-500',  text: 'text-zinc-500',  label: 'Cold' };
}

export function HeatScore({ score, showLabel = true, compact = false, className }: Props) {
  const pct = Math.min(100, Math.max(0, score));
  const config = getHeatConfig(pct);

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
        <span className={cn('text-sm font-semibold font-data', config.text)}>{score}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[48px]">
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {score >= 70 && <Flame className="w-3 h-3 text-red-400" />}
          <span className={cn('text-xs font-semibold font-data', config.text)}>{score}</span>
        </div>
      )}
    </div>
  );
}
