import { useQuery } from '@tanstack/react-query';
import {
  Users, Flame, DollarSign, TrendingUp, Search, Phone,
  Clock, CheckCircle, RefreshCw, FileText, Mail, Thermometer,
  Download, Sparkles, ChevronRight,
} from 'lucide-react';
import { fetchStats } from '../lib/api';
import { StatusBadge } from '../components/shared/StatusBadge';
import { formatCurrency, formatRelativeTime, cn } from '../lib/utils';
import type { Lead, LeadStatus, ActivityType } from '../types';
import { Link } from 'react-router-dom';
import { useFollowups, useSnoozeLead, useLogActivity, usePatchStatus } from '../hooks/useLeads';
import { useToast } from '../lib/toast';

// Per-status bar colors for the distribution chart
const STATUS_BAR_COLORS: Record<LeadStatus, string> = {
  new: 'bg-zinc-500',
  contacted: 'bg-blue-500',
  qualified: 'bg-violet-500',
  proposal_sent: 'bg-amber-500',
  booked: 'bg-emerald-500',
  lost: 'bg-red-500',
  closed_won: 'bg-emerald-400',
};

// Activity type → Lucide icon
const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  status_change: RefreshCw,
  note: FileText,
  call_attempt: Phone,
  email_sent: Mail,
  heat_update: Thermometer,
  import: Download,
  enrichment: Sparkles,
};

const ACTIVITY_ICON_COLORS: Record<ActivityType, string> = {
  status_change: 'text-blue-400',
  note: 'text-zinc-400',
  call_attempt: 'text-green-400',
  email_sent: 'text-violet-400',
  heat_update: 'text-orange-400',
  import: 'text-zinc-400',
  enrichment: 'text-amber-400',
};

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });
  const { data: followups } = useFollowups();
  const snoozeLead = useSnoozeLead();
  const logActivity = useLogActivity();
  const patchStatus = usePatchStatus();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-900 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-zinc-900 rounded-xl animate-pulse" />
          <div className="h-64 bg-zinc-900 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const byStatus = stats?.by_status || [];
  const maxCount = Math.max(...byStatus.map(s => s.count), 1);

  const allFollowups = [...(followups?.overdue || []), ...(followups?.due_today || [])];
  const overdueIds = new Set((followups?.overdue || []).map((l: Lead) => l.id));

  function getOverdueText(dateStr: string | null) {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return 'Due today';
    return `${diff} day${diff === 1 ? '' : 's'} overdue`;
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-zinc-100 font-semibold text-lg tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Overview of your lead pipeline</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Pipeline Value — highlight card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-orange-500/10 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/15 text-orange-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-gradient-orange">
            {formatCurrency(stats?.pipeline_value ?? 0)}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Pipeline Value</p>
        </div>

        {/* Total Leads */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-zinc-800 text-zinc-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.total_leads ?? 0}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Total Leads</p>
        </div>

        {/* Hot Leads */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-500/10 text-red-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.hot_leads_count ?? 0}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Hot Leads (70+)</p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.conversion_rate ?? 0}%
          </p>
          <p className="text-overline text-zinc-500 mt-1">Conversion Rate</p>
        </div>
      </div>

      {/* Today's Follow-ups */}
      {followups && (
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
            <Clock className="w-4 h-4 text-orange-400" />
            <h2 className="text-zinc-300 font-medium text-sm">Today's Follow-ups</h2>
            {allFollowups.length > 0 && (
              <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
                {allFollowups.length}
              </span>
            )}
          </div>

          {allFollowups.length === 0 ? (
            <div className="flex items-center justify-center gap-2.5 py-5 px-5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-medium">All caught up! No follow-ups due.</span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {allFollowups.map((lead: Lead) => {
                const isOverdue = overdueIds.has(lead.id);
                return (
                  <div
                    key={lead.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3 transition-colors',
                      isOverdue
                        ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]'
                        : 'bg-amber-500/[0.03] hover:bg-amber-500/[0.06]',
                    )}
                  >
                    {/* Urgency bar */}
                    <div className={cn(
                      'w-0.5 self-stretch rounded-full flex-shrink-0',
                      isOverdue ? 'bg-red-500' : 'bg-amber-500',
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-200 font-medium truncate">{lead.business_name}</span>
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                          isOverdue
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400',
                        )}>
                          {isOverdue ? 'Overdue' : 'Due Today'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                        {lead.phone && <span>{lead.phone}</span>}
                        {lead.service_type && <span>· {lead.service_type}</span>}
                        <span>· {getOverdueText(lead.next_followup_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => logActivity.mutate(
                          { leadId: lead.id, data: { type: 'call_attempt', title: 'Call logged' } },
                          { onSuccess: () => toast('Call logged') },
                        )}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        <Phone className="w-3 h-3" /> Log Call
                      </button>
                      <button
                        onClick={() => snoozeLead.mutate(
                          { id: lead.id, days: 1 },
                          { onSuccess: () => toast('Snoozed 1 day') },
                        )}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        Snooze 1d
                      </button>
                      <button
                        onClick={() => patchStatus.mutate(
                          { id: lead.id, status: 'contacted' },
                          { onSuccess: () => toast('Marked as contacted') },
                        )}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" /> Contacted
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Status */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Leads by Status</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Current pipeline distribution</p>
          </div>
          <div className="p-5">
            {byStatus.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-zinc-600 text-sm">No leads yet.</p>
                <Link to="/finder" className="inline-flex items-center gap-1 mt-2 text-orange-400 text-sm hover:text-orange-300 transition-colors">
                  <Search className="w-3.5 h-3.5" /> Find your first leads
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {byStatus.map(s => (
                  <div key={s.status} className="flex items-center gap-3">
                    <StatusBadge status={s.status as LeadStatus} className="w-32 justify-center flex-shrink-0" />
                    <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', STATUS_BAR_COLORS[s.status as LeadStatus])}
                        style={{ width: `${(s.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-zinc-400 text-xs tabular-nums w-5 text-right font-data">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity — timeline */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Recent Activity</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Latest actions across all leads</p>
          </div>
          <div className="p-5">
            {!stats?.recent_activities?.length ? (
              <p className="text-zinc-600 text-sm text-center py-8">No recent activity</p>
            ) : (
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[15px] top-4 bottom-0 w-px bg-gradient-to-b from-zinc-700 via-zinc-800 to-transparent" />
                <div className="space-y-4">
                  {stats.recent_activities.slice(0, 8).map(a => {
                    const ActivityIcon = ACTIVITY_ICONS[a.type as ActivityType] ?? RefreshCw;
                    const iconColor = ACTIVITY_ICON_COLORS[a.type as ActivityType] ?? 'text-zinc-400';
                    return (
                      <div key={a.id} className="relative flex gap-3">
                        {/* Icon bubble */}
                        <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-white/[0.06] flex items-center justify-center">
                          <ActivityIcon className={cn('w-3.5 h-3.5', iconColor)} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 bg-zinc-800/40 rounded-lg px-3 py-2 border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                          <div className="text-xs text-zinc-300 leading-snug">
                            <span className="text-zinc-500">{a.business_name} · </span>
                            {a.title}
                          </div>
                          <div className="text-[10px] text-zinc-600 mt-1 font-data">{formatRelativeTime(a.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick action CTA when no leads */}
      {(stats?.total_leads ?? 0) === 0 && (
        <div className="mt-6 bg-orange-950/30 border border-orange-800/40 rounded-xl p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
            <Flame className="w-7 h-7 text-orange-400" />
          </div>
          <h3 className="text-zinc-100 font-semibold text-base mb-1">Ready to find leads?</h3>
          <p className="text-zinc-500 text-sm mb-5 max-w-xs mx-auto">
            Search for HVAC, plumbing, and home service businesses in your target area.
          </p>
          <Link
            to="/finder"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm rounded-lg transition-all shadow-[0_0_20px_-6px_rgba(249,115,22,0.6)] hover:shadow-[0_0_24px_-4px_rgba(249,115,22,0.8)]"
          >
            <Search className="w-4 h-4" /> Start Finding Leads
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
