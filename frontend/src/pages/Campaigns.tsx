import { useState } from 'react';
import {
  Send, Users, Mail, MessageSquare, Clock, AlertTriangle, CheckCircle,
  SkipForward, Eye, X, Zap, Target, TrendingUp, MailOpen,
  PhoneCall, Play, Gauge, Reply,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useOutreachQueue, useQueueStats, useMarkSent, useDismissQueueItem,
  useSendEmail, useSendSms, useEmailStatus, useSmsStatus,
  useSetEnrollmentAutoSend, useSequences, useEnrollLeads, useFlushOverdue, useMarkReplied,
} from '../hooks/useSequences';
import { fetchLeads, type LeadsFilters } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../lib/toast';
import type { OutreachQueueItem, TemplateChannel } from '../types';

const CHANNEL_ICONS: Record<TemplateChannel, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  call_script: PhoneCall,
  loom_script: Eye,
};

const CHANNEL_COLORS: Record<TemplateChannel, string> = {
  email: 'text-violet-400',
  sms: 'text-emerald-400',
  call_script: 'text-blue-400',
  loom_script: 'text-amber-400',
};

export function Campaigns() {
  const { data: queue, isLoading: queueLoading } = useOutreachQueue();
  const { data: stats } = useQueueStats();
  const { data: sequences } = useSequences();
  const { data: emailStatus } = useEmailStatus();
  const { data: smsStatus } = useSmsStatus();
  const markSent = useMarkSent();
  const markReplied = useMarkReplied();
  const dismiss = useDismissQueueItem();
  const sendEmail = useSendEmail();
  const sendSms = useSendSms();
  const automateRest = useSetEnrollmentAutoSend();
  const enrollLeads = useEnrollLeads();
  const flushOverdue = useFlushOverdue();
  const { toast } = useToast();

  const [previewItem, setPreviewItem] = useState<OutreachQueueItem | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today'>('all');

  const emailConfigured = emailStatus?.configured ?? false;
  const smsConfigured = smsStatus?.configured ?? false;

  const isSending = sendEmail.isPending || sendSms.isPending;

  const handleSend = (item: OutreachQueueItem) => {
    if (item.channel === 'email') sendEmail.mutate(item.enrollment_id);
    else if (item.channel === 'sms') sendSms.mutate(item.enrollment_id);
  };

  const filteredQueue = queue?.filter(item => {
    if (filter === 'overdue') return item.is_overdue;
    if (filter === 'today') return !item.is_overdue;
    return true;
  }) ?? [];

  const overdue = queue?.filter(q => q.is_overdue) ?? [];
  const dueToday = queue?.filter(q => !q.is_overdue) ?? [];

  // Count emails vs SMS in queue
  const emailCount = queue?.filter(q => q.channel === 'email').length ?? 0;
  const smsCount = queue?.filter(q => q.channel === 'sms').length ?? 0;

  // Active sequences
  const activeSequences = sequences?.filter(s => s.is_active) ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-orange-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Campaigns</h1>
        </div>
        <button
          onClick={() => setShowEnrollModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 transition-colors"
        >
          <Users className="w-4 h-4" /> Enroll Leads
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-6 gap-3 px-5 py-4 border-b border-white/[0.04]">
        <StatCard
          label="Overdue"
          value={stats?.overdue ?? 0}
          icon={AlertTriangle}
          color={stats?.overdue ? 'text-red-400' : 'text-zinc-500'}
          bgColor={stats?.overdue ? 'bg-red-500/10' : 'bg-zinc-800'}
        />
        <StatCard
          label="Due Today"
          value={stats?.due_today ?? 0}
          icon={Clock}
          color={stats?.due_today ? 'text-amber-400' : 'text-zinc-500'}
          bgColor={stats?.due_today ? 'bg-amber-500/10' : 'bg-zinc-800'}
        />
        <StatCard
          label="Upcoming"
          value={stats?.upcoming ?? 0}
          icon={TrendingUp}
          color="text-zinc-400"
          bgColor="bg-zinc-800"
        />
        <StatCard
          label="Emails in Queue"
          value={emailCount}
          icon={Mail}
          color="text-violet-400"
          bgColor="bg-violet-500/10"
        />
        <StatCard
          label="SMS in Queue"
          value={smsCount}
          icon={MessageSquare}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Sent Today"
          value={`${stats?.sent_today ?? 0}/${stats?.daily_limit ?? 20}`}
          icon={Gauge}
          color={stats?.sends_remaining === 0 ? 'text-red-400' : 'text-blue-400'}
          bgColor={stats?.sends_remaining === 0 ? 'bg-red-500/10' : 'bg-blue-500/10'}
        />
      </div>

      {/* Active Sequences Summary */}
      {activeSequences.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-3 overflow-x-auto">
          <span className="text-xs text-zinc-500 shrink-0">Active:</span>
          {activeSequences.map(seq => (
            <div key={seq.id} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-1.5 shrink-0">
              <Zap className="w-3 h-3 text-orange-400" />
              <span className="text-xs text-zinc-300 font-medium">{seq.name}</span>
              <span className="text-[10px] text-zinc-500">{seq.active_enrollments ?? 0} enrolled</span>
              {(seq.emails_sent ?? 0) > 0 && (
                <span className="text-[10px] text-zinc-500">
                  {seq.emails_sent} sent
                  {(seq.emails_opened ?? 0) > 0 && (
                    <span className={cn('ml-1', (seq.emails_opened! / seq.emails_sent!) >= 0.3 ? 'text-emerald-400' : '')}>
                      {Math.round((seq.emails_opened! / seq.emails_sent!) * 100)}% opened
                    </span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-5 py-3 border-b border-white/[0.04]">
        {(['all', 'overdue', 'today'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              filter === tab
                ? 'bg-orange-500/10 text-orange-400 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
            )}
          >
            {tab === 'all' ? `All (${queue?.length ?? 0})` : tab === 'overdue' ? `Overdue (${overdue.length})` : `Due Today (${dueToday.length})`}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {/* Flush Overdue — sends all overdue email/SMS now */}
          {overdue.length > 0 && (emailConfigured || smsConfigured) && (
            <button
              onClick={() => flushOverdue.mutate()}
              disabled={flushOverdue.isPending}
              title="Auto-send all overdue email and SMS steps right now"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-500/20"
            >
              <Zap className="w-3 h-3" /> Flush Overdue ({overdue.filter(i =>
                (i.channel === 'email' && emailConfigured && i.lead_email) ||
                (i.channel === 'sms' && smsConfigured && i.lead_phone)
              ).length})
            </button>
          )}

          {/* Send All button */}
          {filteredQueue.length > 0 && emailConfigured && (
            <button
              onClick={() => {
                const sendable = filteredQueue.filter(item =>
                  (item.channel === 'email' && emailConfigured && item.lead_email) ||
                  (item.channel === 'sms' && smsConfigured && item.lead_phone)
                );
                if (sendable.length === 0) return;
                if (!confirm(`Send ${sendable.length} message(s) now?`)) return;
                sendable.forEach(item => handleSend(item));
              }}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" /> Send All ({filteredQueue.filter(item =>
                (item.channel === 'email' && emailConfigured && item.lead_email) ||
                (item.channel === 'sms' && smsConfigured && item.lead_phone)
              ).length})
            </button>
          )}
        </div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto">
        {queueLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">Loading queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Send className="w-10 h-10 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-400 mb-1">
              {queue?.length === 0 ? 'No outreach pending' : 'No items match this filter'}
            </p>
            <p className="text-xs text-zinc-600">
              {queue?.length === 0
                ? 'Enroll leads into a sequence to start your outreach campaign.'
                : 'Try a different filter to see pending items.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {filteredQueue.map(item => (
              <QueueRow
                key={item.enrollment_id}
                item={item}
                onPreview={setPreviewItem}
                onMarkSent={() => markSent.mutate(item.enrollment_id)}
                onMarkReplied={() => markReplied.mutate(item.enrollment_id)}
                onSkip={() => dismiss.mutate(item.enrollment_id)}
                onSend={handleSend}
                onAutomate={() => automateRest.mutate(item.enrollment_id)}
                emailConfigured={emailConfigured}
                smsConfigured={smsConfigured}
                sending={isSending}
                automating={automateRest.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onMarkSent={() => { markSent.mutate(previewItem.enrollment_id); setPreviewItem(null); }}
          onSend={() => { handleSend(previewItem); setPreviewItem(null); }}
          emailConfigured={emailConfigured}
          smsConfigured={smsConfigured}
          sending={isSending}
        />
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <EnrollModal
          sequences={activeSequences}
          onClose={() => setShowEnrollModal(false)}
          onEnroll={(leadIds, sequenceId) => {
            enrollLeads.mutate({ lead_ids: leadIds, sequence_id: sequenceId }, {
              onSuccess: (data) => {
                setShowEnrollModal(false);
                toast(`Enrolled ${data.enrolled} lead(s), ${data.skipped} skipped`);
              },
              onError: (err) => toast(err.message, 'error'),
            });
          }}
          enrolling={enrollLeads.isPending}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bgColor }: {
  label: string; value: number | string; icon: React.ElementType; color: string; bgColor: string;
}) {
  return (
    <div className={cn('rounded-xl px-4 py-3 border border-white/[0.04]', bgColor)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-3.5 h-3.5', color)} />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn('text-xl font-semibold font-data', color)}>{value}</p>
    </div>
  );
}

function canSendItem(item: OutreachQueueItem, emailConfigured: boolean, smsConfigured: boolean): boolean {
  if (item.channel === 'email') return emailConfigured && !!item.lead_email && !item.email_invalid;
  if (item.channel === 'sms') return smsConfigured && !!item.lead_phone;
  return false;
}

function QueueRow({ item, onPreview, onMarkSent, onMarkReplied, onSkip, onSend, onAutomate, emailConfigured, smsConfigured, sending, automating }: {
  item: OutreachQueueItem;
  onPreview: (item: OutreachQueueItem) => void;
  onMarkSent: () => void;
  onMarkReplied: () => void;
  onSkip: () => void;
  onSend: (item: OutreachQueueItem) => void;
  onAutomate: () => void;
  emailConfigured: boolean;
  smsConfigured: boolean;
  sending: boolean;
  automating: boolean;
}) {
  const ChannelIcon = CHANNEL_ICONS[item.channel];
  const channelColor = CHANNEL_COLORS[item.channel];
  const canSend = canSendItem(item, emailConfigured, smsConfigured);

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3 transition-colors',
      item.is_overdue ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]' : 'hover:bg-white/[0.02]',
    )}>
      <div className={cn(
        'w-0.5 self-stretch rounded-full flex-shrink-0',
        item.is_overdue ? 'bg-red-500' : 'bg-amber-500',
      )} />

      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-zinc-800', channelColor)}>
        <ChannelIcon className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-200 font-medium truncate">{item.business_name}</span>
          {item.is_overdue && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              Overdue
            </span>
          )}
          {item.email_opened_at && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
              <MailOpen className="w-2.5 h-2.5" /> Opened
            </span>
          )}
          {item.has_replied && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
              <Reply className="w-2.5 h-2.5" /> Replied
            </span>
          )}
          {item.email_invalid && item.channel === 'email' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Bounced</span>
          )}
          {!item.lead_email && !item.email_invalid && item.channel === 'email' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">No email</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
          <span>Step {item.current_step}/{item.total_steps}</span>
          <span>·</span>
          <span>{item.step_label}</span>
          <span>·</span>
          <span>{item.sequence_name}</span>
          {item.lead_email && item.channel === 'email' && (
            <>
              <span>·</span>
              <span className="text-violet-400/60">{item.lead_email}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onPreview(item)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
        >
          <Eye className="w-3 h-3" /> Preview
        </button>
        {canSend && (
          <button
            onClick={() => onSend(item)}
            disabled={sending}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Send className="w-3 h-3" /> Send
          </button>
        )}
        <button
          onClick={onMarkSent}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
        >
          <CheckCircle className="w-3 h-3" /> Sent
        </button>
        <button
          onClick={onMarkReplied}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-medium rounded-lg transition-colors border border-emerald-500/20"
        >
          <Reply className="w-3 h-3" /> Replied
        </button>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium rounded-lg transition-colors"
        >
          <SkipForward className="w-3 h-3" />
        </button>
        <button
          onClick={onAutomate}
          disabled={automating}
          title="Auto-send all remaining steps on schedule"
          className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-medium rounded-lg transition-colors border border-amber-500/20 disabled:opacity-40"
        >
          <Zap className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function PreviewModal({ item, onClose, onMarkSent, onSend, emailConfigured, smsConfigured, sending }: {
  item: OutreachQueueItem;
  onClose: () => void;
  onMarkSent: () => void;
  onSend: () => void;
  emailConfigured: boolean;
  smsConfigured: boolean;
  sending: boolean;
}) {
  const canSend = canSendItem(item, emailConfigured, smsConfigured);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{item.template_name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {item.business_name} — Step {item.current_step}/{item.total_steps}
              {item.channel === 'email' && item.lead_email && (
                <span className="ml-2 text-violet-400">{item.lead_email}</span>
              )}
              {item.channel === 'sms' && item.lead_phone && (
                <span className="ml-2 text-emerald-400">{item.lead_phone}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {item.rendered_subject && (
            <div>
              <label className="text-overline text-zinc-500 mb-1 block">Subject</label>
              <p className="text-sm text-zinc-200 bg-zinc-800 rounded-lg px-3 py-2">{item.rendered_subject}</p>
            </div>
          )}
          <div>
            <label className="text-overline text-zinc-500 mb-1 block">Body</label>
            <pre className="text-sm text-zinc-300 bg-zinc-800 rounded-lg px-3 py-2 whitespace-pre-wrap font-sans leading-relaxed">
              {item.rendered_body}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            Close
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                (item.rendered_subject ? `Subject: ${item.rendered_subject}\n\n` : '') + item.rendered_body
              );
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Copy
          </button>
          {canSend && (
            <button
              onClick={onSend}
              disabled={sending}
              className="px-4 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> {item.channel === 'sms' ? 'Send SMS' : 'Send Email'}
            </button>
          )}
          <button
            onClick={onMarkSent}
            className="px-4 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Mark Sent
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrollModal({ sequences, onClose, onEnroll, enrolling }: {
  sequences: { id: number; name: string; steps: any[]; active_enrollments?: number }[];
  onClose: () => void;
  onEnroll: (leadIds: number[], sequenceId: number) => void;
  enrolling: boolean;
}) {
  const [selectedSequence, setSelectedSequence] = useState<number | null>(
    sequences.find(s => s.name.includes('Cold Outreach'))?.id ?? sequences[0]?.id ?? null
  );
  const [statusFilter, setStatusFilter] = useState('new');
  const [serviceFilter, setServiceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);

  const filters: LeadsFilters = { status: statusFilter || undefined, service_type: serviceFilter || undefined, limit: 500 };
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', 'enroll', filters],
    queryFn: () => fetchLeads(filters),
  });

  const leads = leadsData?.leads ?? [];
  const filteredLeads = cityFilter
    ? leads.filter(l => l.city?.toLowerCase().includes(cityFilter.toLowerCase()))
    : leads;

  const allSelected = filteredLeads.length > 0 && filteredLeads.every(l => selectedLeadIds.includes(l.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Enroll Leads into Sequence</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Select leads and a sequence to start outreach</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Sequence picker */}
          <div>
            <label className="text-overline text-zinc-500 mb-2 block">Sequence</label>
            <div className="grid grid-cols-2 gap-2">
              {sequences.map(seq => (
                <button
                  key={seq.id}
                  onClick={() => setSelectedSequence(seq.id)}
                  className={cn(
                    'text-left px-3 py-2 rounded-lg border transition-colors',
                    selectedSequence === seq.id
                      ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                      : 'border-white/[0.04] bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
                  )}
                >
                  <p className="text-sm font-medium">{seq.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {seq.steps.length} steps · {seq.active_enrollments ?? 0} active
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div>
              <label className="text-overline text-zinc-500 mb-1 block">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 [color-scheme:dark]"
              >
                <option value="">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
              </select>
            </div>
            <div>
              <label className="text-overline text-zinc-500 mb-1 block">Service</label>
              <select
                value={serviceFilter}
                onChange={e => setServiceFilter(e.target.value)}
                className="bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 [color-scheme:dark]"
              >
                <option value="">All</option>
                <option value="hvac">HVAC</option>
                <option value="roofing">Roofing</option>
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="landscaping">Landscaping</option>
                <option value="pest_control">Pest Control</option>
              </select>
            </div>
            <div>
              <label className="text-overline text-zinc-500 mb-1 block">City</label>
              <input
                type="text"
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                placeholder="Filter by city..."
                className="bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Lead list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-overline text-zinc-500">
                Leads ({filteredLeads.length})
                {selectedLeadIds.length > 0 && (
                  <span className="text-orange-400 ml-2">{selectedLeadIds.length} selected</span>
                )}
              </label>
              <button
                onClick={() => {
                  if (allSelected) {
                    setSelectedLeadIds([]);
                  } else {
                    setSelectedLeadIds(filteredLeads.map(l => l.id));
                  }
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="border border-white/[0.04] rounded-lg max-h-52 overflow-y-auto divide-y divide-white/[0.03]">
              {isLoading ? (
                <div className="py-8 text-center text-zinc-500 text-sm">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-sm">No leads match filters</div>
              ) : (
                filteredLeads.map(lead => (
                  <label
                    key={lead.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors',
                      selectedLeadIds.includes(lead.id) && 'bg-orange-500/[0.04]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => {
                        setSelectedLeadIds(prev =>
                          prev.includes(lead.id)
                            ? prev.filter(id => id !== lead.id)
                            : [...prev, lead.id]
                        );
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-orange-500 [color-scheme:dark]"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-300 truncate block">{lead.business_name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {lead.city}, {lead.state}
                        {lead.email && <span className="ml-2 text-violet-400/60">{lead.email}</span>}
                        {!lead.email && <span className="ml-2 text-zinc-600">no email</span>}
                      </span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.04]">
          <p className="text-xs text-zinc-500">
            {selectedLeadIds.length} lead(s) will be enrolled
            {selectedSequence && sequences.find(s => s.id === selectedSequence) && (
              <span> into <span className="text-zinc-300">{sequences.find(s => s.id === selectedSequence)!.name}</span></span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!selectedSequence || selectedLeadIds.length === 0) return;
                onEnroll(selectedLeadIds, selectedSequence);
              }}
              disabled={!selectedSequence || selectedLeadIds.length === 0 || enrolling}
              className="px-4 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {enrolling ? 'Enrolling...' : `Enroll ${selectedLeadIds.length} Lead(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
