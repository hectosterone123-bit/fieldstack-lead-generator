import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Flame, DollarSign, TrendingUp, Search, Phone,
  Clock, CheckCircle, RefreshCw, FileText, Mail, MailOpen, MessageSquare as MessageSquareIcon, Thermometer,
  Download, Sparkles, ChevronRight, Database, Send, Zap, UserX, Reply, BarChart3, Eye, MessageCircle, Repeat,
  ChevronDown,
} from 'lucide-react';
import { fetchStats } from '../lib/api';
import { StatusBadge } from '../components/shared/StatusBadge';
import { formatCurrency, formatRelativeTime, cn } from '../lib/utils';
import type { Lead, LeadStatus, ActivityType } from '../types';
import { Link } from 'react-router-dom';
import { useFollowups, useSnoozeLead, useLogActivity, usePatchStatus } from '../hooks/useLeads';
import { useToast } from '../lib/toast';
import { OutreachQueue } from '../components/sequences/OutreachQueue';

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
  email_opened: MailOpen,
  sms_sent: MessageSquareIcon,
  heat_update: Thermometer,
  import: Download,
  enrichment: Sparkles,
  email_replied: Reply,
};

const ACTIVITY_ICON_COLORS: Record<ActivityType, string> = {
  status_change: 'text-blue-400',
  note: 'text-zinc-400',
  call_attempt: 'text-green-400',
  email_sent: 'text-violet-400',
  email_opened: 'text-emerald-400',
  sms_sent: 'text-emerald-400',
  heat_update: 'text-orange-400',
  import: 'text-zinc-400',
  enrichment: 'text-amber-400',
  email_replied: 'text-emerald-400',
};

interface OutreachSummary {
  total_emails_sent: number;
  total_opens: number;
  total_replies: number;
  open_rate: number;
  reply_rate: number;
  active_enrollments: number;
  completed_enrollments: number;
}

interface StepPerf {
  step: number;
  label: string;
  channel: string;
  sent: number;
  opened: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

interface SeqPerf {
  sequence_id: number;
  sequence_name: string;
  steps: StepPerf[];
}

function OutreachPerformance({ summary, stepPerformance, requeueEligible }: {
  summary: OutreachSummary;
  stepPerformance: SeqPerf[];
  requeueEligible: number;
}) {
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  const pills = [
    { label: 'Emails Sent', value: summary.total_emails_sent, icon: Mail, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Open Rate', value: `${summary.open_rate}%`, icon: Eye, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Reply Rate', value: `${summary.reply_rate}%`, icon: MessageCircle, color: summary.reply_rate >= 20 ? 'text-emerald-400' : summary.reply_rate >= 10 ? 'text-amber-400' : 'text-red-400', bg: summary.reply_rate >= 20 ? 'bg-emerald-500/10' : summary.reply_rate >= 10 ? 'bg-amber-500/10' : 'bg-red-500/10' },
    { label: 'Active Sequences', value: summary.active_enrollments, icon: Repeat, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  ];

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
        <BarChart3 className="w-4 h-4 text-orange-400" />
        <h2 className="text-zinc-300 font-medium text-sm">Outreach Performance</h2>
        {requeueEligible > 0 && (
          <span className="ml-auto text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {requeueEligible} eligible for re-queue
          </span>
        )}
      </div>

      {/* Mini KPI pills */}
      <div className="grid grid-cols-4 gap-3 px-5 py-4">
        {pills.map(p => (
          <div key={p.label} className="flex items-center gap-2.5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', p.bg)}>
              <p.icon className={cn('w-3.5 h-3.5', p.color)} />
            </div>
            <div>
              <p className="text-lg font-bold font-data text-white leading-none">{p.value}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{p.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-sequence step breakdown */}
      {stepPerformance.length > 0 && (
        <div className="border-t border-white/[0.04]">
          {stepPerformance.map(seq => {
            const isExpanded = expandedSeq === seq.sequence_id;
            const totalSent = seq.steps.reduce((s, st) => s + st.sent, 0);
            if (totalSent === 0) return null;
            return (
              <div key={seq.sequence_id}>
                <button
                  onClick={() => setExpandedSeq(isExpanded ? null : seq.sequence_id)}
                  className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <ChevronDown className={cn('w-3 h-3 text-zinc-500 transition-transform', isExpanded && 'rotate-180')} />
                  <span className="text-xs font-medium text-zinc-300">{seq.sequence_name}</span>
                  <span className="text-[10px] text-zinc-600 ml-auto">{totalSent} sent</span>
                </button>
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-2">
                    {seq.steps.filter(s => s.sent > 0).map(step => (
                      <div key={step.step} className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-500 w-24 truncate flex-shrink-0">{step.label}</span>
                        <div className="flex-1 flex items-center gap-2">
                          {/* Open rate bar */}
                          <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden" title={`${step.open_rate}% open rate`}>
                            <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${step.open_rate}%` }} />
                          </div>
                          {/* Reply rate bar */}
                          <div className="flex-1 h-1.5 bg-zinc-800/60 rounded-full overflow-hidden" title={`${step.reply_rate}% reply rate`}>
                            <div className={cn(
                              'h-full rounded-full',
                              step.reply_rate >= 20 ? 'bg-emerald-500' : step.reply_rate >= 10 ? 'bg-amber-500' : 'bg-red-500/60',
                            )} style={{ width: `${Math.min(step.reply_rate, 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-data w-16 text-right">{step.sent} sent</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-4 pt-1">
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500/60" /> Open rate
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> Reply rate
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
      <div className="p-6 max-w-6xl">
        <div className="h-10 w-48 bg-zinc-900 rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-900 rounded-xl border border-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-zinc-900 rounded-xl border border-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-zinc-900 rounded-xl border border-white/[0.06] animate-pulse" />
          <div className="h-64 bg-zinc-900 rounded-xl border border-white/[0.06] animate-pulse" />
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
    <div className="p-6 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          to="/finder"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm rounded-lg transition-colors glow-orange"
        >
          <Search className="w-4 h-4" /> Find Leads
        </Link>
      </div>

      {/* KPI Cards — Row 1: Lead Gen Health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-3">
        {/* Leads Found This Week — hero card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-orange-500/10 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/15 text-orange-400">
              <Search className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-gradient-orange">
            {stats?.leads_found_this_week ?? 0}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Leads Found This Week</p>
        </div>

        {/* Enrichment Rate */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.enrichment_rate ?? 0}%
          </p>
          <p className="text-overline text-zinc-500 mt-1">Enrichment Rate</p>
          <p className="text-[10px] text-zinc-600 mt-1.5">phone or email on file</p>
        </div>

        {/* Outreach Coverage */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.outreach_coverage ?? 0}%
          </p>
          <p className="text-overline text-zinc-500 mt-1">Outreach Coverage</p>
          <p className="text-[10px] text-zinc-600 mt-1.5">leads past 'new' status</p>
        </div>

        {/* Speed to Lead */}
        <div className={cn(
          'bg-zinc-900 border rounded-xl p-5 shadow-surface',
          stats?.avg_speed_to_lead_minutes != null && stats.avg_speed_to_lead_minutes <= 5
            ? 'border-emerald-500/20'
            : stats?.avg_speed_to_lead_minutes != null && stats.avg_speed_to_lead_minutes > 60
              ? 'border-red-500/20'
              : 'border-white/[0.06]',
        )}>
          <div className="flex items-start justify-between mb-4">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              stats?.avg_speed_to_lead_minutes != null && stats.avg_speed_to_lead_minutes <= 5
                ? 'bg-emerald-500/10 text-emerald-400'
                : stats?.avg_speed_to_lead_minutes != null && stats.avg_speed_to_lead_minutes > 60
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-orange-500/10 text-orange-400',
            )}>
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.avg_speed_to_lead_minutes != null
              ? stats.avg_speed_to_lead_minutes < 1
                ? `${Math.round(stats.avg_speed_to_lead_minutes * 60)}s`
                : stats.avg_speed_to_lead_minutes < 60
                  ? `${Math.round(stats.avg_speed_to_lead_minutes)}m`
                  : `${Math.round(stats.avg_speed_to_lead_minutes / 60)}h ${Math.round(stats.avg_speed_to_lead_minutes % 60)}m`
              : '--'}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Speed to Lead</p>
          <p className="text-[10px] text-zinc-600 mt-1.5">
            {stats?.speed_to_lead_sample
              ? `avg response time (${stats.speed_to_lead_sample} leads)`
              : 'avg time to first contact'}
          </p>
        </div>
      </div>

      {/* KPI Cards — Row 2: Pipeline */}
      <p className="text-overline text-zinc-500 mt-2 mb-3">Pipeline</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {/* Pipeline Value */}
        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
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

      {/* KPI Cards — Row 3: Revenue */}
      <p className="text-overline text-zinc-500 mt-2 mb-3">Revenue</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/15 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-gradient-orange">
            {formatCurrency(stats?.revenue_this_month ?? 0)}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Revenue This Month</p>
        </div>

        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-zinc-800 text-zinc-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {stats?.deals_closed_this_month ?? 0}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Deals Closed This Month</p>
        </div>

        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {formatCurrency(stats?.avg_deal_size ?? 0)}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Avg Deal Size</p>
        </div>

        <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-5 shadow-surface">
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight font-data text-white">
            {formatCurrency(stats?.proposals_open_value ?? 0)}
          </p>
          <p className="text-overline text-zinc-500 mt-1">Open Proposals</p>
          <p className="text-[10px] text-zinc-600 mt-1.5">{stats?.proposals_open_count ?? 0} proposals pending</p>
        </div>
      </div>

      {/* Outreach Performance */}
      {stats?.outreach_summary && stats.outreach_summary.total_emails_sent > 0 && (
        <OutreachPerformance
          summary={stats.outreach_summary}
          stepPerformance={stats.step_performance || []}
          requeueEligible={stats.requeue_eligible || 0}
        />
      )}

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

      {/* Outreach Queue */}
      <OutreachQueue />

      {/* Ghost Detection — leads that went silent after contact */}
      {stats && stats.ghost_count > 0 && (
        <div className="bg-zinc-900 border border-amber-500/[0.12] rounded-xl shadow-surface mb-6 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
            <UserX className="w-4 h-4 text-amber-400" />
            <h2 className="text-zinc-300 font-medium text-sm">Went Silent</h2>
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
              {stats.ghost_count}
            </span>
            <span className="text-xs text-zinc-600 ml-auto">contacted 7+ days ago, no reply</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {(stats.ghost_leads || []).map(ghost => {
              const daysSince = Math.floor(
                (Date.now() - new Date(ghost.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <div key={ghost.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="w-0.5 self-stretch rounded-full flex-shrink-0 bg-amber-500/40" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-200 font-medium truncate block">{ghost.business_name}</span>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                      {ghost.phone && <span>{ghost.phone}</span>}
                      <span>· {ghost.service_type}</span>
                      <span>· silent {daysSince}d</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => logActivity.mutate(
                        { leadId: ghost.id, data: { type: 'call_attempt', title: 'Call logged' } },
                        { onSuccess: () => toast('Call logged') },
                      )}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Phone className="w-3 h-3" /> Log Call
                    </button>
                    <button
                      onClick={() => snoozeLead.mutate(
                        { id: ghost.id, days: 3 },
                        { onSuccess: () => toast('Snoozed 3 days') },
                      )}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      Snooze 3d
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {stats.ghost_count > 5 && (
            <div className="px-5 py-3 border-t border-white/[0.04]">
              <Link to="/leads" className="text-xs text-zinc-500 hover:text-orange-400 transition-colors">
                +{stats.ghost_count - 5} more → view in Leads
              </Link>
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
                  {(stats.recent_activities || []).slice(0, 8).map(a => {
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
        <div className="mt-6 bg-orange-950/30 border border-orange-800/40 rounded-xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
            <Flame className="w-7 h-7 text-orange-400" />
          </div>
          <h3 className="text-zinc-100 font-semibold text-base mb-1">Ready to find leads?</h3>
          <p className="text-zinc-500 text-sm mb-5 max-w-xs mx-auto">
            Search for HVAC, plumbing, and home service businesses in your target area.
          </p>
          <Link
            to="/finder"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm rounded-lg transition-colors glow-orange"
          >
            <Search className="w-4 h-4" /> Start Finding Leads
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
