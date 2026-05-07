import { useState, useMemo } from 'react';
import { RadioTower, Send, Loader2, CheckCircle2, AlertCircle, Users, MessageSquare, FileText } from 'lucide-react';
import { useLeads } from '../hooks/useLeads';
import { useTemplates } from '../hooks/useTemplates';
import { useBulkSendSms } from '../hooks/useLeads';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';
import type { Lead } from '../types';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'booked', label: 'Booked' },
  { value: 'lost', label: 'Lost' },
];

const SERVICE_OPTIONS = [
  { value: '', label: 'All services' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'general', label: 'General' },
];

function segmentCount(text: string) {
  if (!text) return { chars: 0, segments: 0 };
  const chars = text.length;
  const segments = Math.ceil(chars / 160) || 1;
  return { chars, segments };
}

export function SmsBlast() {
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [message, setMessage] = useState('');
  const [templateMode, setTemplateMode] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [result, setResult] = useState<{ sent: number; skipped: number; failed: number; total: number } | null>(null);

  const bulkSend = useBulkSendSms();

  // Load leads with filters — paginate large via limit=500 to get a reasonable set
  const { data: leadsData, isLoading: leadsLoading } = useLeads({
    status: filterStatus || undefined,
    service_type: filterService || undefined,
    search: filterCity || undefined,
    limit: 500,
  });

  const { data: smsTemplates } = useTemplates({ channel: 'sms' });

  // Filter to only leads that can receive SMS
  const reachableLeads = useMemo(() => {
    if (!leadsData?.leads) return [];
    return (leadsData.leads as Lead[]).filter(
      l => l.phone && !l.dnc_at && !l.unsubscribed_at
    );
  }, [leadsData]);

  const selectedTemplate = smsTemplates?.find(t => t.id === selectedTemplateId);
  const previewBody = selectedTemplate
    ? selectedTemplate.body
        .replace(/{business_name}/g, 'Example Business')
        .replace(/{city}/g, 'Austin')
        .replace(/{first_name}/g, 'John')
        .replace(/\{[^}]+\}/g, '...')
    : '';

  const activeMessage = templateMode ? previewBody : message;
  const { chars, segments } = segmentCount(activeMessage);

  const leadIds = reachableLeads.map(l => l.id);
  const canSend = leadIds.length > 0 && (templateMode ? !!selectedTemplateId : message.trim().length > 0) && !bulkSend.isPending;

  async function handleSend() {
    if (!canSend) return;
    const label = templateMode ? `${leadIds.length} leads using template` : `${leadIds.length} leads`;
    if (!window.confirm(`Send SMS to ${label}? This cannot be undone.`)) return;
    setResult(null);
    try {
      const data = templateMode
        ? { lead_ids: leadIds, template_id: selectedTemplateId! }
        : { lead_ids: leadIds, body: message.trim() };
      const res = await bulkSend.mutateAsync(data);
      setResult(res);
      toast(`SMS blast complete: ${res.sent} sent`);
    } catch (err: any) {
      toast(err.message || 'Send failed', 'error');
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <RadioTower className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-zinc-100">SMS Blast</h1>
          <p className="text-xs text-zinc-500">Send a one-off SMS to a filtered group of leads</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4 mb-4">
        <p className="text-xs font-medium text-zinc-400 mb-3">Filter leads</p>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 px-2.5 py-2 outline-none"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filterService}
            onChange={e => setFilterService(e.target.value)}
            className="bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 px-2.5 py-2 outline-none"
          >
            {SERVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            placeholder="City search..."
            className="bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 px-2.5 py-2 outline-none placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Audience summary */}
      <div className="flex items-center gap-3 mb-4">
        {leadsLoading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading leads...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Users className="w-3.5 h-3.5" />
              <span><span className="text-zinc-200 font-medium">{leadsData?.pagination?.total ?? 0}</span> match filters</span>
            </div>
            <span className="text-zinc-700">·</span>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <MessageSquare className="w-3.5 h-3.5" />
              <span><span className="font-medium">{reachableLeads.length}</span> reachable</span>
            </div>
            {(leadsData?.pagination?.total ?? 0) - reachableLeads.length > 0 && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-zinc-500">{(leadsData?.pagination?.total ?? 0) - reachableLeads.length} no phone / DNC / opted-out</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Message composer */}
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4 mb-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-3 p-0.5 bg-zinc-800 rounded-lg w-fit">
          <button
            onClick={() => setTemplateMode(false)}
            className={cn('text-xs px-3 py-1.5 rounded-md transition-colors', !templateMode ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300')}
          >
            Custom message
          </button>
          <button
            onClick={() => setTemplateMode(true)}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors', templateMode ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300')}
          >
            <FileText className="w-3 h-3" /> Template
          </button>
        </div>

        {templateMode ? (
          <div className="space-y-2">
            <select
              value={selectedTemplateId ?? ''}
              onChange={e => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 px-2.5 py-2 outline-none"
            >
              <option value="">Pick an SMS template...</option>
              {smsTemplates?.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="px-3 py-2.5 bg-zinc-800 rounded-lg text-xs text-zinc-400 leading-relaxed border border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 mb-1">Preview (with example data)</p>
                {previewBody}
              </div>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 px-3 py-2.5 outline-none resize-none placeholder:text-zinc-600 leading-relaxed"
            />
            <div className="flex justify-end mt-1">
              <span className={cn('text-[10px]', chars > 320 ? 'text-red-400' : chars > 160 ? 'text-amber-400' : 'text-zinc-600')}>
                {chars}/160 · {segments} SMS
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={cn(
          'flex items-center gap-3 rounded-xl px-4 py-3 mb-4 text-sm border',
          result.failed > 0
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        )}>
          {result.failed > 0 ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>
            <span className="font-medium">{result.sent} sent</span>
            {result.skipped > 0 && <span className="text-zinc-400"> · {result.skipped} skipped (DNC / no phone)</span>}
            {result.failed > 0 && <span className="text-red-400"> · {result.failed} failed</span>}
          </span>
        </div>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {bulkSend.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
        ) : (
          <><Send className="w-4 h-4" /> Send to {reachableLeads.length} leads</>
        )}
      </button>
    </div>
  );
}
