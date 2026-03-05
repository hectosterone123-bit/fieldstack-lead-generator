import { useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { Lead, LeadStatus } from '../../types';
import { STATUS_LABELS, SERVICE_LABELS, PREDEFINED_TAGS, TAG_COLORS, TAG_COLOR_DEFAULT } from '../../types';
import { useLeads, usePatchStatus } from '../../hooks/useLeads';
import { formatCurrency, cn } from '../../lib/utils';
import { useToast } from '../../lib/toast';
import { KanbanCard } from './KanbanCard';

const COLUMN_ORDER: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won',
];

const COLUMN_DOT: Record<LeadStatus, string> = {
  new: 'bg-zinc-400',
  contacted: 'bg-blue-400',
  qualified: 'bg-violet-400',
  proposal_sent: 'bg-amber-400',
  booked: 'bg-emerald-400',
  lost: 'bg-red-400',
  closed_won: 'bg-emerald-300',
};

interface Props {
  onLeadClick: (lead: Lead) => void;
}

export function KanbanBoard({ onLeadClick }: Props) {
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);

  const { data, isLoading } = useLeads({
    search: search || undefined,
    service_type: serviceFilter !== 'all' ? serviceFilter : undefined,
    tag: tagFilter || undefined,
    limit: 500,
  });

  const patchStatus = usePatchStatus();
  const { toast } = useToast();

  const allLeads = data?.leads ?? [];

  const columns = COLUMN_ORDER.map(status => ({
    status,
    leads: allLeads.filter(l => l.status === status),
  }));

  function handleDragStart(e: React.DragEvent, leadId: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(leadId));
    setDraggingId(leadId);
  }

  function handleDragOver(e: React.DragEvent, status: LeadStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatus !== status) setDragOverStatus(status);
  }

  function handleDragLeave(e: React.DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverStatus(null);
    }
  }

  function handleDrop(e: React.DragEvent, status: LeadStatus) {
    e.preventDefault();
    const leadId = Number(e.dataTransfer.getData('text/plain'));
    setDragOverStatus(null);
    setDraggingId(null);
    if (!leadId || isNaN(leadId)) return;
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead || lead.status === status) return;
    patchStatus.mutate(
      { id: leadId, status },
      { onSuccess: () => toast(`Moved to ${STATUS_LABELS[status]}`) },
    );
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverStatus(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-white/[0.04] space-y-2.5 flex-shrink-0">
        <div className="flex gap-2.5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 cursor-pointer transition-colors"
            >
              <option value="all">All Services</option>
              {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {PREDEFINED_TAGS.map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(prev => prev === t ? '' : t)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                tagFilter === t
                  ? TAG_COLORS[t] || TAG_COLOR_DEFAULT
                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban columns */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto px-5 py-4 flex-1">
          {COLUMN_ORDER.map(status => (
            <div key={status} className="w-64 flex-shrink-0 rounded-xl bg-zinc-900/60 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto px-5 py-4 flex-1 min-h-0">
          {columns.map(col => {
            const colValue = col.leads.reduce((sum, l) => sum + (l.estimated_value || 0), 0);
            const isDragOver = dragOverStatus === col.status;

            return (
              <div
                key={col.status}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.status)}
                className={cn(
                  'flex flex-col w-64 flex-shrink-0 rounded-xl bg-zinc-900 border transition-all',
                  isDragOver
                    ? 'border-orange-500/40 ring-1 ring-orange-500/20 bg-orange-500/[0.02]'
                    : 'border-white/[0.04]',
                )}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.04] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', COLUMN_DOT[col.status])} />
                    <span className="text-xs font-semibold text-zinc-300">{STATUS_LABELS[col.status]}</span>
                  </div>
                  <span className="text-xs text-zinc-600 font-data tabular-nums">{col.leads.length}</span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                  {col.leads.length === 0 ? (
                    <div className="text-center py-8 text-zinc-700 text-xs">No leads</div>
                  ) : (
                    col.leads.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        isDragging={draggingId === lead.id}
                        onClick={() => onLeadClick(lead)}
                        onDragStart={e => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>

                {/* Column footer — pipeline value */}
                <div className="px-3 py-2 border-t border-white/[0.04] flex-shrink-0">
                  <span className="text-xs text-zinc-600 font-data tabular-nums">
                    {formatCurrency(colValue)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
