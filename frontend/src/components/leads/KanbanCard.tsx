import { MapPin } from 'lucide-react';
import type { Lead, ServiceType } from '../../types';
import { SERVICE_LABELS, SERVICE_COLORS, TAG_COLORS, TAG_COLOR_DEFAULT } from '../../types';
import { HeatScore } from '../shared/HeatScore';
import { formatCurrency, cn } from '../../lib/utils';

interface Props {
  lead: Lead;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try { return JSON.parse(tags); } catch { return []; }
}

export function KanbanCard({ lead, isDragging, onClick, onDragStart, onDragEnd }: Props) {
  const tags = parseTags(lead.tags);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'bg-zinc-800/60 border border-white/[0.06] rounded-lg p-3 cursor-grab active:cursor-grabbing',
        'hover:border-white/[0.12] hover:bg-zinc-800 transition-colors',
        isDragging && 'opacity-40 scale-[0.98]',
      )}
    >
      <p className="text-sm font-medium text-zinc-200 truncate mb-2">{lead.business_name}</p>

      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', SERVICE_COLORS[lead.service_type as ServiceType])}>
          {SERVICE_LABELS[lead.service_type as ServiceType]}
        </span>
        <HeatScore score={lead.heat_score} compact />
      </div>

      {(lead.city || lead.state) && (
        <div className="flex items-center gap-1 text-xs text-zinc-600 mb-1.5">
          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{[lead.city, lead.state].filter(Boolean).join(', ')}</span>
        </div>
      )}

      <div className="text-xs font-data font-semibold text-zinc-400 tabular-nums">
        {formatCurrency(lead.estimated_value)}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map(tag => (
            <span key={tag} className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', TAG_COLORS[tag] || TAG_COLOR_DEFAULT)}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
