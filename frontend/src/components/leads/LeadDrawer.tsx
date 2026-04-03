import { useState, useMemo } from 'react';
import {
  X, Phone, Globe, MapPin, ExternalLink, MessageSquare, PhoneCall,
  Star, Loader2, Search, Mail, Users, Wrench, Code,
  RefreshCw, AlertCircle, Calendar, Tag, Plus,
  FileText, Thermometer, Download, Sparkles, Send, Video, Clock, Timer, CalendarClock, Reply, Bot,
  MailOpen, MousePointerClick, MailX, ShieldAlert,
} from 'lucide-react';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { EnrollmentPanel } from '../sequences/EnrollmentPanel';
import type { Lead, LeadStatus, EnrichmentData, ActivityType } from '../../types';
import { STATUS_LABELS, PREDEFINED_TAGS, TAG_COLORS, TAG_COLOR_DEFAULT } from '../../types';
import { StatusBadge } from '../shared/StatusBadge';
import { HeatScore } from '../shared/HeatScore';
import { formatCurrency, formatRelativeTime, cn } from '../../lib/utils';
import { useLead, usePatchStatus, usePatchHeatScore, useLogActivity, useUpdateLead, useEnrichLead, useTestSubmitLead, useTestRespondLead, useScheduledEmails, useCancelScheduledEmail, useFindLeadEmail } from '../../hooks/useLeads';
import { useToast } from '../../lib/toast';

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'];

const STATUS_BTN: Record<LeadStatus, string> = {
  new:           'bg-zinc-800 text-zinc-400 border-white/[0.04] hover:border-white/[0.08]',
  contacted:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  qualified:     'bg-violet-500/10 text-violet-400 border-violet-500/20',
  proposal_sent: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  booked:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  lost:          'bg-red-500/10 text-red-400 border-red-500/20',
  closed_won:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};

const STATUS_BTN_INACTIVE = 'bg-zinc-800/50 border-white/[0.04] text-zinc-500 hover:border-white/[0.08] hover:text-zinc-400';

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  status_change: RefreshCw,
  note: FileText,
  call_attempt: Phone,
  email_sent: Mail,
  email_opened: MailOpen,
  email_clicked: MousePointerClick,
  email_bounced: MailX,
  email_complained: ShieldAlert,
  email_replied: Reply,
  sms_sent: MessageSquare,
  heat_update: Thermometer,
  import: Download,
  enrichment: Sparkles,
};

const ACTIVITY_COLORS: Record<string, string> = {
  status_change: 'text-blue-400',
  note: 'text-zinc-400',
  call_attempt: 'text-green-400',
  email_sent: 'text-violet-400',
  email_opened: 'text-violet-400',
  email_clicked: 'text-violet-500',
  email_bounced: 'text-red-400',
  email_complained: 'text-red-500',
  email_replied: 'text-emerald-400',
  sms_sent: 'text-emerald-400',
  heat_update: 'text-orange-400',
  import: 'text-zinc-400',
  enrichment: 'text-amber-400',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface Props {
  leadId: number | null;
  onClose: () => void;
}

export function LeadDrawer({ leadId, onClose }: Props) {
  const { data, isLoading } = useLead(leadId);
  const patchStatus = usePatchStatus();
  const patchHeatScore = usePatchHeatScore();
  const logActivity = useLogActivity();
  const updateLead = useUpdateLead();
  const enrichLead = useEnrichLead();
  const testSubmit = useTestSubmitLead();
  const testRespond = useTestRespondLead();
  const { data: scheduledEmails } = useScheduledEmails(leadId);
  const cancelScheduled = useCancelScheduledEmail();
  const findEmail = useFindLeadEmail();
  const { toast } = useToast();

  const [noteText, setNoteText] = useState('');
  const [editValue, setEditValue] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const lead = data as (Lead & { activities: any[] }) | undefined;

  const enrichment = useMemo<EnrichmentData | null>(() => {
    if (!lead?.enrichment_data) return null;
    try { return JSON.parse(lead.enrichment_data); } catch { return null; }
  }, [lead?.enrichment_data]);

  if (leadId === null) return null;

  const FOLLOWUP_DAYS: Record<string, number> = {
    new: 1, contacted: 3, qualified: 2, proposal_sent: 5, booked: 1,
  };

  function handleStatusChange(status: string) {
    if (!lead) return;
    patchStatus.mutate({ id: lead.id, status }, {
      onSuccess: () => {
        const days = FOLLOWUP_DAYS[status];
        toast(days ? `Status updated · Follow-up in ${days}d` : 'Status updated');
      },
      onError: () => toast('Failed to update status', 'error'),
    });
  }

  function handleHeatScore() {
    if (!lead || editValue === null) return;
    patchHeatScore.mutate({ id: lead.id, heat_score: editValue }, {
      onSuccess: () => toast('Heat score updated'),
      onError: () => toast('Failed to update heat score', 'error'),
    });
    setEditValue(null);
  }

  function handleNote() {
    if (!lead || !noteText.trim()) return;
    logActivity.mutate({ leadId: lead.id, data: { type: 'note', title: 'Note added', description: noteText.trim() } }, {
      onSuccess: () => toast('Note added'),
      onError: () => toast('Failed to add note', 'error'),
    });
    setNoteText('');
  }

  function handleLogCall() {
    if (!lead) return;
    logActivity.mutate({ leadId: lead.id, data: { type: 'call_attempt', title: 'Call logged', description: '' } }, {
      onSuccess: () => toast('Call logged'),
      onError: () => toast('Failed to log call', 'error'),
    });
  }

  function handleSaveNotes() {
    if (!lead) return;
    updateLead.mutate({ id: lead.id, data: { notes: editNotes } }, {
      onSuccess: () => toast('Notes saved'),
      onError: () => toast('Failed to save notes', 'error'),
    });
    setEditingNotes(false);
  }

  function handleEnrich() {
    if (!lead) return;
    enrichLead.mutate(lead.id, {
      onSuccess: () => toast('Website enriched'),
      onError: () => toast('Enrichment failed', 'error'),
    });
  }

  function parseTags(tags: string | null): string[] {
    if (!tags) return [];
    try { return JSON.parse(tags); } catch { return []; }
  }

  function addTag(tag: string) {
    if (!lead) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    const current = parseTags(lead.tags);
    if (current.includes(trimmed)) return;
    updateLead.mutate({ id: lead.id, data: { tags: JSON.stringify([...current, trimmed]) } });
  }

  function removeTag(tag: string) {
    if (!lead) return;
    const current = parseTags(lead.tags);
    updateLead.mutate({ id: lead.id, data: { tags: JSON.stringify(current.filter(t => t !== tag)) } });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-zinc-900 border-l border-white/[0.06] z-50 flex flex-col overflow-hidden shadow-[-24px_0_80px_-20px_rgba(0,0,0,0.6)]">

        {/* Header */}
        <div className="flex items-start gap-4 px-5 py-5 border-b border-white/[0.04] flex-shrink-0">
          {lead ? (
            <>
              {/* Business avatar */}
              <div className="w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br from-zinc-700 to-zinc-800 border border-white/[0.08] flex items-center justify-center text-white font-bold text-base select-none">
                {getInitials(lead.business_name)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white leading-tight truncate">
                  {lead.business_name}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusBadge status={lead.status as LeadStatus} />
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-500 capitalize">{lead.service_type}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-600">{lead.contact_count} contact{lead.contact_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex-shrink-0 hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-white/[0.04] border-b border-white/[0.04] bg-zinc-950/40">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-4 py-3 flex flex-col items-center gap-2">
                  <div className="h-4 w-12 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2.5 w-16 bg-zinc-800/60 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 space-y-3 border-b border-white/[0.04]">
              <div className="h-2.5 w-16 bg-zinc-800/60 rounded animate-pulse" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-zinc-800 animate-pulse" />
                  <div className="h-3.5 flex-1 bg-zinc-800/60 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="h-2.5 w-24 bg-zinc-800/60 rounded animate-pulse" />
              <div className="grid grid-cols-2 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 bg-zinc-800/40 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        ) : lead ? (
          <>
            {/* Quick stats strip */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.04] border-b border-white/[0.04] bg-zinc-950/40 flex-shrink-0">
              <div className="px-4 py-3 text-center">
                <HeatScore score={lead.heat_score} compact className="justify-center" />
                <p className="text-overline text-zinc-600 mt-1">Heat Score</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-sm font-semibold text-zinc-300 font-data">
                  {lead.estimated_value ? formatCurrency(lead.estimated_value) : '—'}
                </p>
                <p className="text-overline text-zinc-600 mt-1">Est. Value</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs font-medium text-zinc-400 font-data">
                  {formatRelativeTime(lead.created_at)}
                </p>
                <p className="text-overline text-zinc-600 mt-1">Added</p>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">

              {/* Contact info */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <p className="text-overline text-zinc-600 mb-3">Contact</p>
                <div className="space-y-2">
                  {lead.phone && (
                    <ContactRow
                      icon={Phone}
                      label={lead.phone}
                      href={`tel:${lead.phone}`}
                    />
                  )}
                  {lead.email && (
                    <ContactRow
                      icon={Mail}
                      label={lead.email}
                      href={`mailto:${lead.email}`}
                    />
                  )}
                  {lead.website && (
                    <button
                      onClick={async () => {
                        try {
                          const r = await findEmail.mutateAsync(lead.id);
                          if (r.emails.length > 0) toast(`Found ${r.emails.length} email(s)${r.saved ? ` — saved ${r.saved}` : ''}`);
                          else toast('No emails found on website', 'error');
                        } catch (e: any) { toast(e.message || 'Failed', 'error'); }
                      }}
                      disabled={findEmail.isPending}
                      className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-orange-400 transition-colors disabled:opacity-40 py-0.5"
                    >
                      {findEmail.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      {findEmail.isPending ? 'Searching...' : 'Find Email'}
                    </button>
                  )}
                  {lead.website && (
                    <ContactRow
                      icon={Globe}
                      label={lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      href={lead.website}
                      external
                    />
                  )}
                  {(lead.city || lead.address) && (
                    <ContactRow
                      icon={MapPin}
                      label={[lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(', ')].filter(Boolean).join(' — ')}
                    />
                  )}
                  {lead.google_maps_url && (
                    <a
                      href={lead.google_maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-10 transition-colors"
                    >
                      View on Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {(!lead.phone || !lead.email) && (
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.business_name} ${lead.city ?? ''} ${lead.state ?? ''} phone`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-10 mt-1 transition-colors"
                    >
                      <Search className="w-3 h-3" /> Search on Google
                    </a>
                  )}
                </div>
              </div>

              {/* Rating strip */}
              {lead.rating != null && (
                <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                    <span className="text-sm font-semibold text-zinc-300">{lead.rating.toFixed(1)}</span>
                    <span className="text-xs text-zinc-600">rating</span>
                  </div>
                  {lead.review_count != null && (
                    <span className="text-xs text-zinc-600">{lead.review_count} reviews</span>
                  )}
                </div>
              )}

              {/* Status update */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <p className="text-overline text-zinc-600 mb-3">Pipeline Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_ORDER.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border text-xs font-medium transition-colors',
                        lead.status === s ? STATUS_BTN[s] : STATUS_BTN_INACTIVE,
                      )}
                    >
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        lead.status === s ? 'opacity-100' : 'opacity-40',
                        s === 'new' ? 'bg-zinc-400' :
                        s === 'contacted' ? 'bg-blue-400' :
                        s === 'qualified' ? 'bg-violet-400' :
                        s === 'proposal_sent' ? 'bg-amber-400' :
                        s === 'booked' ? 'bg-emerald-400' :
                        s === 'lost' ? 'bg-red-400' : 'bg-emerald-300',
                      )} />
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact Intel */}
              <div className="px-5 py-4 border-b border-white/[0.04] space-y-3">
                <p className="text-overline text-zinc-600">Contact Intel</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-600 block mb-1">Owner Name</label>
                    <input
                      type="text"
                      defaultValue={(lead as any).owner_name || ''}
                      onBlur={e => { if (e.target.value !== ((lead as any).owner_name || '')) updateLead.mutate({ id: lead.id, data: { owner_name: e.target.value || null } as any }); }}
                      placeholder="e.g. John"
                      className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-600 block mb-1">Direct / Mobile</label>
                    <input
                      type="tel"
                      defaultValue={(lead as any).direct_phone || ''}
                      onBlur={e => { if (e.target.value !== ((lead as any).direct_phone || '')) updateLead.mutate({ id: lead.id, data: { direct_phone: e.target.value || null } as any }); }}
                      placeholder="Owner's direct line"
                      className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark]"
                    />
                  </div>
                </div>
                {(lead as any).gatekeeper_count > 0 && (
                  <p className="text-[10px] text-violet-400">Gatekeeper hit {(lead as any).gatekeeper_count}× — fill in owner name to get personalized scripts</p>
                )}
              </div>

              {/* Outreach Tracking */}
              <div className="px-5 py-4 border-b border-white/[0.04] space-y-3">
                <p className="text-overline text-zinc-600">Outreach Tracking</p>
                <div>
                  <label className="text-[10px] text-zinc-600 block mb-1">Loom Link</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                      <input
                        type="url"
                        defaultValue={lead.loom_url || ''}
                        onBlur={e => { if (e.target.value !== (lead.loom_url || '')) updateLead.mutate({ id: lead.id, data: { loom_url: e.target.value || null } as any }); }}
                        placeholder="https://loom.com/share/..."
                        className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark] transition-colors"
                      />
                    </div>
                    {lead.loom_url && (
                      <a href={lead.loom_url} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/[0.06] rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-600 block mb-1">Ghost Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    <input
                      type="text"
                      defaultValue={lead.ghost_time || ''}
                      onBlur={e => { if (e.target.value !== (lead.ghost_time || '')) updateLead.mutate({ id: lead.id, data: { ghost_time: e.target.value || null } as any }); }}
                      placeholder="e.g. 47 min, 3h, never replied..."
                      className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Response Test Tracker */}
              {(() => {
                const submittedAt = lead.test_submitted_at ? new Date(lead.test_submitted_at) : null;
                const respondedAt = lead.test_responded_at ? new Date(lead.test_responded_at) : null;
                const elapsedMins = submittedAt
                  ? Math.floor(((respondedAt ?? new Date()).getTime() - submittedAt.getTime()) / 60000)
                  : null;
                const fmt = (m: number) => {
                  if (m < 60) return `${m}m`;
                  const h = Math.floor(m / 60), rm = m % 60;
                  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
                  const d = Math.floor(h / 24), rh = h % 24;
                  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
                };
                const responseLabel = elapsedMins !== null ? fmt(elapsedMins) : null;
                const isWaiting = !!submittedAt && !respondedAt;
                const isLongWait = isWaiting && elapsedMins !== null && elapsedMins > 240;
                return (
                  <div className="px-5 py-4 border-b border-white/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-zinc-500" />
                        <p className="text-overline text-zinc-600">Response Test</p>
                      </div>
                      {!submittedAt && (
                        <button
                          onClick={() => testSubmit.mutate(lead.id)}
                          disabled={testSubmit.isPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                        >
                          Mark Test Sent
                        </button>
                      )}
                      {isWaiting && (
                        <button
                          onClick={() => testRespond.mutate(lead.id)}
                          disabled={testRespond.isPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          They Responded
                        </button>
                      )}
                    </div>
                    {!submittedAt && (
                      <p className="text-xs text-zinc-600">No test submitted yet.</p>
                    )}
                    {isWaiting && (
                      <p className={cn('text-sm font-data font-medium', isLongWait ? 'text-red-400' : 'text-amber-400')}>
                        ⏱ {responseLabel} — still waiting
                      </p>
                    )}
                    {respondedAt && (
                      <p className="text-sm font-data font-medium text-emerald-400">
                        ✓ Responded in {responseLabel}
                      </p>
                    )}
                    {submittedAt && (
                      <button
                        onClick={() => updateLead.mutate({ id: lead.id, data: { test_submitted_at: null, test_responded_at: null } as any })}
                        className="mt-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Deal Tracking */}
              {(['proposal_sent', 'booked', 'lost', 'closed_won'] as LeadStatus[]).includes(lead.status) && (
                <div className="px-5 py-4 border-b border-white/[0.04] space-y-3">
                  <p className="text-overline text-zinc-600 mb-3">Deal Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-600 block mb-1">Proposal Amount</label>
                      <input
                        type="number" min="0" step="100"
                        value={lead.proposal_amount ?? ''}
                        onChange={e => updateLead.mutate({ id: lead.id, data: { proposal_amount: e.target.value ? parseFloat(e.target.value) : null } as any })}
                        placeholder="$0"
                        className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark] font-data"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-600 block mb-1">Proposal Date</label>
                      <input
                        type="date"
                        value={lead.proposal_date || ''}
                        onChange={e => updateLead.mutate({ id: lead.id, data: { proposal_date: e.target.value || null } as any })}
                        className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-600 block mb-1">Close Date</label>
                      <input
                        type="date"
                        value={lead.close_date || ''}
                        onChange={e => updateLead.mutate({ id: lead.id, data: { close_date: e.target.value || null } as any })}
                        className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark]"
                      />
                    </div>
                    {lead.status === 'closed_won' && (
                      <div>
                        <label className="text-[10px] text-zinc-600 block mb-1">Won Amount</label>
                        <input
                          type="number" min="0" step="100"
                          value={lead.won_amount ?? ''}
                          onChange={e => updateLead.mutate({ id: lead.id, data: { won_amount: e.target.value ? parseFloat(e.target.value) : null } as any })}
                          placeholder="$0"
                          className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 [color-scheme:dark] font-data"
                        />
                      </div>
                    )}
                    {lead.status === 'lost' && (
                      <div className="col-span-2">
                        <label className="text-[10px] text-zinc-600 block mb-1">Lost Reason</label>
                        <input
                          type="text"
                          value={lead.lost_reason || ''}
                          onChange={e => updateLead.mutate({ id: lead.id, data: { lost_reason: e.target.value || null } as any })}
                          placeholder="Why was this deal lost?"
                          className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500/40 [color-scheme:dark]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Heat score + follow-up */}
              <div className="px-5 py-4 border-b border-white/[0.04] space-y-4">
                {/* Heat score */}
                <div>
                  <p className="text-overline text-zinc-600 mb-3">Heat Score</p>
                  <div className="flex items-center gap-3">
                    <HeatScore score={lead.heat_score} className="flex-1" />
                    <input
                      type="number" min="0" max="100"
                      value={editValue ?? lead.heat_score}
                      onChange={e => setEditValue(parseInt(e.target.value) || 0)}
                      className="w-16 bg-zinc-800/60 border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-zinc-300 text-center focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 font-data"
                    />
                    <button
                      onClick={handleHeatScore}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg border border-white/[0.06] transition-colors"
                    >
                      Set
                    </button>
                  </div>
                </div>

                {/* Scheduled Follow-up */}
                {scheduledEmails && scheduledEmails.length > 0 && (
                  <div>
                    <p className="text-overline text-zinc-600 mb-3">Scheduled Follow-up</p>
                    {scheduledEmails.map(s => {
                      const daysUntil = Math.ceil((new Date(s.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-3 bg-zinc-800/50 rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CalendarClock className="w-4 h-4 text-violet-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-zinc-300 truncate">{s.template_name}</p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Sends in {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => cancelScheduled.mutate({ leadId: lead.id, schedId: s.id })}
                            className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Follow-up date */}
                <div>
                  <p className="text-overline text-zinc-600 mb-3">Follow-up Date</p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                      <input
                        type="date"
                        value={lead.next_followup_at ? lead.next_followup_at.slice(0, 10) : ''}
                        onChange={e => updateLead.mutate({ id: lead.id, data: { next_followup_at: e.target.value || null } })}
                        className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 [color-scheme:dark] transition-colors"
                      />
                    </div>
                    {lead.next_followup_at && (
                      <button
                        onClick={() => updateLead.mutate({ id: lead.id, data: { next_followup_at: null } })}
                        className="px-2.5 py-2 text-zinc-500 hover:text-zinc-300 text-xs rounded-lg bg-zinc-800/60 border border-white/[0.06] transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {lead.next_followup_at && (() => {
                    const diff = Math.floor((new Date(lead.next_followup_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (diff < 0) return <p className="text-xs text-red-400 mt-1.5">Overdue by {Math.abs(diff)} day{Math.abs(diff) === 1 ? '' : 's'}</p>;
                    if (diff === 0) return <p className="text-xs text-amber-400 mt-1.5">Due today</p>;
                    return <p className="text-xs text-zinc-500 mt-1.5">Follow up in {diff} day{diff === 1 ? '' : 's'}</p>;
                  })()}
                </div>
              </div>

              {/* Tags */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <div className="flex items-center gap-1.5 mb-3">
                  <Tag className="w-3 h-3 text-zinc-600" />
                  <p className="text-overline text-zinc-600">Tags</p>
                </div>

                {parseTags(lead.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {parseTags(lead.tags).map(tag => (
                      <span key={tag} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', TAG_COLORS[tag] || TAG_COLOR_DEFAULT)}>
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:opacity-70 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {PREDEFINED_TAGS.filter(t => !parseTags(lead.tags).includes(t)).map(tag => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" /> {tag}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { addTag(customTag); setCustomTag(''); } }}
                    placeholder="Custom tag..."
                    className="flex-1 bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
                  />
                  <button
                    onClick={() => { addTag(customTag); setCustomTag(''); }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/[0.06] text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Sequences */}
              <EnrollmentPanel leadId={lead.id} />

              {/* Website Intel */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-overline text-zinc-600">Website Intel</p>
                  {enrichment && !enrichment.error && (
                    <button
                      onClick={handleEnrich}
                      disabled={enrichLead.isPending}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <RefreshCw className={cn('w-3 h-3', enrichLead.isPending && 'animate-spin')} /> Re-enrich
                    </button>
                  )}
                </div>

                {enrichLead.isPending ? (
                  <div className="flex items-center gap-2 py-3 text-zinc-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Scraping website...
                  </div>
                ) : enrichment ? (
                  enrichment.error ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4" /> {enrichment.error}
                      </div>
                      <button onClick={handleEnrich} className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors">
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enrichment.emails.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-overline text-zinc-600 mb-1.5">
                            <Mail className="w-3 h-3" /> Emails Found
                          </div>
                          <div className="space-y-1">
                            {enrichment.emails.map(email => (
                              <div key={email} className="flex items-center justify-between gap-2">
                                <a href={`mailto:${email}`} className="text-sm text-blue-400 hover:text-blue-300 truncate transition-colors">
                                  {email}
                                </a>
                                {lead.email === email
                                  ? <span className="text-[10px] text-emerald-500 shrink-0">Active</span>
                                  : <button onClick={() => updateLead.mutate({ id: lead.id, data: { email } })} className="text-[10px] font-medium text-zinc-500 hover:text-orange-400 transition-colors shrink-0">Use</button>
                                }
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {enrichment.team_names.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-overline text-zinc-600 mb-1.5">
                            <Users className="w-3 h-3" /> Team / Contacts
                          </div>
                          <div className="space-y-0.5">
                            {enrichment.team_names.map(name => (
                              <div key={name} className="text-sm text-zinc-300">{name}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {enrichment.services.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-overline text-zinc-600 mb-1.5">
                            <Wrench className="w-3 h-3" /> Services
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {enrichment.services.map(service => (
                              <span key={service} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded-md font-medium border border-white/[0.04]">
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {enrichment.tech_stack && (
                        <div>
                          <div className="flex items-center gap-1.5 text-overline text-zinc-600 mb-1.5">
                            <Code className="w-3 h-3" /> Tech Stack
                          </div>
                          <span className={cn(
                            'inline-block px-2 py-0.5 text-xs rounded-md font-medium',
                            enrichment.tech_stack === 'Custom / Unknown'
                              ? 'bg-zinc-800 text-zinc-400 border border-white/[0.04]'
                              : 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20',
                          )}>
                            {enrichment.tech_stack}
                          </span>
                        </div>
                      )}

                      {enrichment.emails.length === 0 && enrichment.team_names.length === 0 && enrichment.services.length === 0 && (
                        <div className="text-sm text-zinc-500 italic">No contact data found on website</div>
                      )}

                      <div className="text-xs text-zinc-600 pt-1 border-t border-white/[0.04]">
                        Scraped {formatRelativeTime(enrichment.scraped_at)}
                      </div>
                    </div>
                  )
                ) : (
                  <button
                    onClick={handleEnrich}
                    disabled={!lead.website || enrichLead.isPending}
                    className="flex items-center gap-2 w-full py-2.5 px-4 bg-zinc-800/60 hover:bg-zinc-700/60 border border-white/[0.06] hover:border-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    {lead.website ? 'Enrich from Website' : 'No website to enrich'}
                  </button>
                )}
              </div>

              {/* Notes */}
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-overline text-zinc-600">Notes</p>
                  {!editingNotes && lead.notes && (
                    <button
                      onClick={() => { setEditNotes(lead.notes || ''); setEditingNotes(true); }}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      rows={3}
                      className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 resize-none transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveNotes}
                        className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNotes(false)}
                        className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {lead.notes && (
                      <p className="text-sm text-zinc-400 leading-relaxed mb-3">{lead.notes}</p>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleNote()}
                        placeholder="Add a note..."
                        className="flex-1 bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
                      />
                      <button
                        onClick={handleNote}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/[0.06] text-zinc-300 rounded-lg transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Activity timeline */}
              {lead.activities && lead.activities.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-overline text-zinc-600 mb-3">Activity Log</p>
                  <div className="relative">
                    <div className="absolute left-[15px] top-4 bottom-0 w-px bg-gradient-to-b from-zinc-700 via-zinc-800 to-transparent" />
                    <div className="space-y-4">
                      {lead.activities.map((a: any) => {
                        const AIcon = ACTIVITY_ICONS[a.type as ActivityType] ?? RefreshCw;
                        const iconColor = ACTIVITY_COLORS[a.type as ActivityType] ?? 'text-zinc-400';
                        return (
                          <div key={a.id} className="relative flex gap-3">
                            <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-white/[0.06] flex items-center justify-center">
                              <AIcon className={cn('w-3.5 h-3.5', iconColor)} />
                            </div>
                            <div className="flex-1 min-w-0 pt-1">
                              <div className="text-sm text-zinc-300 leading-snug">{a.title}</div>
                              {a.description && (
                                <div className="text-xs text-zinc-500 mt-0.5">{a.description}</div>
                              )}
                              <div className="text-[10px] text-zinc-600 mt-1 font-data">{formatRelativeTime(a.created_at)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Templates modal */}
            {showTemplates && lead && (
              <TemplatePreviewModal lead={lead} onClose={() => setShowTemplates(false)} />
            )}

            {/* Sticky footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.04] bg-zinc-950/60 backdrop-blur-sm flex-shrink-0">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors shadow-[0_0_16px_-4px_rgba(249,115,22,0.5)]"
              >
                <Send className="w-4 h-4" />
                Outreach
              </button>
              <button
                onClick={handleLogCall}
                className="px-3 py-2.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] transition-colors flex items-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
              </button>
              {lead.phone && (
                <a
                  href={`/caller?lead=${lead.id}`}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-2"
                  title="Start AI Call"
                >
                  <Bot className="w-4 h-4" />
                </a>
              )}
              {lead.website && (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] transition-colors flex items-center gap-2"
                >
                  <Globe className="w-4 h-4" />
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] transition-colors flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

// ContactRow helper
function ContactRow({
  icon: Icon, label, href, external,
}: {
  icon: React.ElementType;
  label: string;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <div className="flex items-center gap-3 group">
      <div className="w-7 h-7 rounded-md bg-zinc-800 border border-white/[0.04] flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
      </div>
      {href ? (
        <span className="text-sm text-zinc-400 group-hover:text-orange-400 transition-colors truncate flex items-center gap-1">
          {label}
          {external && <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
        </span>
      ) : (
        <span className="text-sm text-zinc-400 truncate">{label}</span>
      )}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {inner}
      </a>
    );
  }

  return inner;
}
