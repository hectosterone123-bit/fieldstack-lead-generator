import { useNavigate } from 'react-router-dom';
import { PhoneOutgoing, Clock, Check, Moon, AlertTriangle, PhoneIncoming } from 'lucide-react';
import { useFollowups, useSnoozeLead, usePatchStatus } from '../hooks/useLeads';
import { StatusBadge } from '../components/shared/StatusBadge';
import { formatRelativeTime, cn } from '../lib/utils';
import { useToast } from '../lib/toast';
import type { Lead } from '../types';

export function Callbacks() {
  const navigate = useNavigate();
  const { data: followups, isLoading } = useFollowups();
  const snoozeLead = useSnoozeLead();
  const patchStatus = usePatchStatus();
  const { toast } = useToast();

  const overdue = [...(followups?.overdue || [])].sort((a: Lead, b: Lead) => b.heat_score - a.heat_score);
  const dueToday = [...(followups?.due_today || [])].sort((a: Lead, b: Lead) => b.heat_score - a.heat_score);
  const total = overdue.length + dueToday.length;

  function handleCallNow(lead: Lead) {
    navigate(`/caller?lead_id=${lead.id}`);
  }

  function handleSnooze(lead: Lead) {
    snoozeLead.mutate(
      { id: lead.id, days: 1 },
      { onSuccess: () => toast(`Snoozed ${lead.business_name} for 1 day`) }
    );
  }

  function handleMarkContacted(lead: Lead) {
    patchStatus.mutate(
      { id: lead.id, status: 'contacted' },
      { onSuccess: () => toast(`Marked ${lead.business_name} as contacted`) }
    );
  }

  function getOverdueText(dateStr: string | null) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return 'Due today';
    return `${diff}d overdue`;
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="h-8 w-40 bg-zinc-900 rounded animate-pulse mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-zinc-900 rounded-xl border border-white/[0.06] animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Callbacks</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {total === 0 ? 'No callbacks due' : `${total} lead${total !== 1 ? 's' : ''} scheduled for follow-up`}
          </p>
        </div>
        {overdue.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdue.length} overdue
          </div>
        )}
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/[0.06] flex items-center justify-center mb-4">
            <PhoneIncoming className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-zinc-400 font-medium">No callbacks due</p>
          <p className="text-sm text-zinc-600 mt-1">You're all caught up — check back after your next call block.</p>
        </div>
      )}

      {/* Overdue section */}
      {overdue.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400 uppercase tracking-wide">Overdue</span>
            <span className="text-xs text-zinc-600">({overdue.length})</span>
          </div>
          <div className="space-y-2">
            {overdue.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                overdueText={getOverdueText(lead.next_followup_at)}
                variant="overdue"
                onCall={handleCallNow}
                onSnooze={handleSnooze}
                onMarkContacted={handleMarkContacted}
              />
            ))}
          </div>
        </div>
      )}

      {/* Due today section */}
      {dueToday.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">Due Today</span>
            <span className="text-xs text-zinc-600">({dueToday.length})</span>
          </div>
          <div className="space-y-2">
            {dueToday.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                overdueText="Due today"
                variant="today"
                onCall={handleCallNow}
                onSnooze={handleSnooze}
                onMarkContacted={handleMarkContacted}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LeadRowProps {
  lead: Lead;
  overdueText: string;
  variant: 'overdue' | 'today';
  onCall: (lead: Lead) => void;
  onSnooze: (lead: Lead) => void;
  onMarkContacted: (lead: Lead) => void;
}

function LeadRow({ lead, overdueText, variant, onCall, onSnooze, onMarkContacted }: LeadRowProps) {
  const accentColor = variant === 'overdue' ? 'border-l-red-500/40' : 'border-l-amber-500/30';

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-900 border border-white/[0.06] border-l-2',
      accentColor
    )}>
      {/* Heat score */}
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
        lead.heat_score >= 70 ? 'bg-orange-500/15 text-orange-400' :
        lead.heat_score >= 40 ? 'bg-amber-500/15 text-amber-400' :
        'bg-zinc-800 text-zinc-500'
      )}>
        {lead.heat_score}
      </div>

      {/* Lead info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-200 truncate">{lead.business_name}</span>
          <StatusBadge status={lead.status} />
          {lead.service_type && (
            <span className="text-xs text-zinc-600">{lead.service_type}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {lead.phone && (
            <span className="text-xs text-zinc-500">{lead.phone}</span>
          )}
          {lead.city && (
            <span className="text-xs text-zinc-600">{lead.city}</span>
          )}
          <span className={cn(
            'text-xs font-medium',
            variant === 'overdue' ? 'text-red-400' : 'text-amber-400'
          )}>
            {overdueText}
          </span>
          {lead.next_followup_at && (
            <span className="text-xs text-zinc-700">
              {formatRelativeTime(lead.next_followup_at)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onCall(lead)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors"
        >
          <PhoneOutgoing className="w-3.5 h-3.5" />
          Call Now
        </button>
        <button
          onClick={() => onSnooze(lead)}
          title="Snooze 1 day"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <Moon className="w-3.5 h-3.5" />
          1d
        </button>
        <button
          onClick={() => onMarkContacted(lead)}
          title="Mark as contacted"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
