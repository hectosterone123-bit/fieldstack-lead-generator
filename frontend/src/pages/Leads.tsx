import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Upload, List, Columns3, Repeat, X, Sparkles, ShieldCheck, MessageSquare, Mail } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Lead } from '../types';
import { LeadsTable } from '../components/leads/LeadsTable';
import { KanbanBoard } from '../components/leads/KanbanBoard';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { importCsv, batchFindPhones, batchValidatePhones, blastSmsByFilter, bulkSendEmail } from '../lib/api';
import { useTemplates } from '../hooks/useTemplates';
import { useCopilotContext } from '../lib/copilotContext';
import { useSequences, useEnrollLeads } from '../hooks/useSequences';
import { useLead } from '../hooks/useLeads';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

export function Leads() {
  const location = useLocation();
  const navState = location.state as { preset?: { status?: string; sort?: string; order?: 'asc' | 'desc' }; openLeadId?: number } | null;

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [phoneLookupRunning, setPhoneLookupRunning] = useState(false);
  const [phoneValidating, setPhoneValidating] = useState(false);
  const [enrollAfterImport, setEnrollAfterImport] = useState<{ leadIds: number[]; count: number } | null>(null);
  const [smsBlastOpen, setSmsBlastOpen] = useState(false);
  const [coldEmailOpen, setColdEmailOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { setLeadContext } = useCopilotContext();

  // Auto-open a specific lead drawer when navigated here with openLeadId
  const { data: presetLead } = useLead(navState?.openLeadId ?? null);
  useEffect(() => {
    if (presetLead && !selectedLead) setSelectedLead(presetLead);
  }, [presetLead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedLead) {
      setLeadContext(selectedLead.id, selectedLead.business_name);
    } else {
      setLeadContext(null);
    }
  }, [selectedLead, setLeadContext]);

  function handleExport() {
    window.open('/api/leads/export', '_blank');
  }

  async function handleBatchFindPhones() {
    setPhoneLookupRunning(true);
    setImportStatus('Finding direct phones...');
    try {
      const result = await batchFindPhones(undefined, 20);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setImportStatus(`Found ${result.found} of ${result.checked} checked`);
      setTimeout(() => setImportStatus(null), 6000);
    } catch (e: unknown) {
      setImportStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setPhoneLookupRunning(false);
    }
  }

  async function handleBatchValidate() {
    setPhoneValidating(true);
    setImportStatus('Validating phones (~$0.005/number)...');
    try {
      const result = await batchValidatePhones(undefined, undefined, 200);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setImportStatus(`${result.valid} valid, ${result.invalid} invalid of ${result.checked} checked`);
      setTimeout(() => setImportStatus(null), 8000);
    } catch (e: unknown) {
      setImportStatus(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setPhoneValidating(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    setImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const result = await importCsv(text);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (result.imported > 0) {
        setEnrollAfterImport({ leadIds: result.lead_ids, count: result.imported });
        if (result.skipped > 0) {
          setImportStatus(`${result.skipped} skipped (duplicates)`);
          setTimeout(() => setImportStatus(null), 5000);
        }
      } else {
        setImportStatus(`No leads imported${result.skipped ? `, ${result.skipped} skipped (duplicates)` : ''}`);
        setTimeout(() => setImportStatus(null), 5000);
      }
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`);
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setImporting(false);
    }
  }

  return (
    // h-[calc(100vh-3.5rem)] accounts for the 3.5rem (h-14) AppLayout top header
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Page header */}
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
        <h1 className="text-zinc-100 font-semibold text-base tracking-tight">Lead Pipeline</h1>
        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="flex items-center bg-zinc-800/60 border border-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => setView('table')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                view === 'table'
                  ? 'bg-zinc-700 text-zinc-200 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <List className="w-3.5 h-3.5" /> Table
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                view === 'kanban'
                  ? 'bg-zinc-700 text-zinc-200 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Columns3 className="w-3.5 h-3.5" /> Board
            </button>
          </div>
          {importStatus && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              importStatus.startsWith('Error')
                ? 'text-red-400 bg-red-500/10 ring-1 ring-red-500/20'
                : 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20'
            }`}>
              {importStatus}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="w-px h-6 bg-white/[0.06]" />

          {/* Data enrichment */}
          <button
            onClick={handleBatchFindPhones}
            disabled={phoneLookupRunning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" /> {phoneLookupRunning ? 'Finding...' : 'Find Phones'}
          </button>
          <button
            onClick={handleBatchValidate}
            disabled={phoneValidating}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> {phoneValidating ? 'Validating...' : 'Validate Phones'}
          </button>

          <div className="w-px h-6 bg-white/[0.06]" />

          {/* Import / Export */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>

          <div className="w-px h-6 bg-white/[0.06]" />

          {/* Outreach */}
          <button
            onClick={() => setSmsBlastOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" /> SMS Blast
          </button>
          <button
            onClick={() => setColdEmailOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 bg-zinc-800/60 border border-white/[0.06] rounded-lg hover:border-white/[0.10] hover:text-zinc-200 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" /> Cold Email
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'table' ? (
          <LeadsTable onRowClick={setSelectedLead} preset={navState?.preset} />
        ) : (
          <KanbanBoard onLeadClick={setSelectedLead} />
        )}
      </div>

      <LeadDrawer
        leadId={selectedLead?.id ?? null}
        onClose={() => setSelectedLead(null)}
      />

      {enrollAfterImport && (
        <EnrollAfterImportModal
          count={enrollAfterImport.count}
          leadIds={enrollAfterImport.leadIds}
          onClose={() => setEnrollAfterImport(null)}
        />
      )}
      {smsBlastOpen && <SmsBlastModal onClose={() => setSmsBlastOpen(false)} />}
      {coldEmailOpen && <ColdEmailModal onClose={() => setColdEmailOpen(false)} />}
    </div>
  );
}

function EnrollAfterImportModal({ count, leadIds, onClose }: {
  count: number;
  leadIds: number[];
  onClose: () => void;
}) {
  const [seqId, setSeqId] = useState<number | ''>('');
  const { data: sequences } = useSequences();
  const enrollLeads = useEnrollLeads();
  const { toast } = useToast();
  const activeSequences = (sequences || []).filter(s => s.is_active);

  async function handleEnroll() {
    if (!seqId) return;
    const result = await enrollLeads.mutateAsync({ lead_ids: leadIds, sequence_id: seqId as number });
    toast(`Imported ${count} leads — enrolled ${result.enrolled}${result.skipped ? `, ${result.skipped} already active` : ''}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Imported {count} lead{count !== 1 ? 's' : ''}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Enroll them in a sequence now?</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <select
          value={seqId}
          onChange={e => setSeqId(e.target.value ? Number(e.target.value) : '')}
          className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 mb-4"
        >
          <option value="">Select a sequence…</option>
          {activeSequences.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            Skip
          </button>
          <button
            onClick={handleEnroll}
            disabled={!seqId || enrollLeads.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40 transition-colors"
          >
            <Repeat className="w-3.5 h-3.5" />
            {enrollLeads.isPending ? 'Enrolling…' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTER_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
];
const FILTER_SERVICES = [
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'general', label: 'General' },
];
const FILTER_DAYS = [
  { value: 0, label: 'Any time' },
  { value: 1, label: '1+ days' },
  { value: 3, label: '3+ days' },
  { value: 7, label: '7+ days' },
  { value: 14, label: '14+ days' },
  { value: 30, label: '30+ days' },
];

const SELECT_CLS = 'w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40';
const LABEL_CLS = 'text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1 block';

function SmsBlastModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [notContactedDays, setNotContactedDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number; total: number } | null>(null);
  const { toast } = useToast();

  async function handleSend() {
    if (!message.trim()) return;
    if (!confirm('Send this SMS to all matching leads? This will bill Twilio credits.')) return;
    setLoading(true);
    try {
      const res = await blastSmsByFilter({
        message,
        status: status || undefined,
        service_type: serviceType || undefined,
        not_contacted_days: notContactedDays > 0 ? notContactedDays : undefined,
      });
      setResult(res);
      toast(`Sent ${res.sent} SMS messages`);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Blast failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-zinc-100">SMS Blast</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-1">
              <p className="text-sm font-medium text-emerald-400">{result.sent} messages sent</p>
              {result.failed > 0 && <p className="text-xs text-red-400">{result.failed} failed</p>}
              {result.skipped > 0 && <p className="text-xs text-zinc-500">{result.skipped} skipped (opted out / no phone)</p>}
              <p className="text-xs text-zinc-500">{result.total} leads matched filter</p>
            </div>
            <button onClick={onClose} className="w-full px-3 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={SELECT_CLS}>
                  <option value="">All statuses</option>
                  {FILTER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Service</label>
                <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={SELECT_CLS}>
                  <option value="">All services</option>
                  {FILTER_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Not contacted in</label>
              <select value={notContactedDays} onChange={e => setNotContactedDays(Number(e.target.value))} className={SELECT_CLS}>
                {FILTER_DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Message ({message.length}/160)</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={320}
                rows={4}
                placeholder="Hi {business_name}, this is Hector with FieldStack..."
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 resize-none"
              />
            </div>
            <p className="text-[10px] text-zinc-600">Leads on DNC / opt-out list are automatically skipped.</p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Cancel</button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || loading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {loading ? 'Sending…' : 'Blast SMS'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ColdEmailModal({ onClose }: { onClose: () => void }) {
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [status, setStatus] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [notContactedDays, setNotContactedDays] = useState(0);
  const [aiPersonalize, setAiPersonalize] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; ai_personalized: number; total: number } | null>(null);
  const { toast } = useToast();
  const { data: templates } = useTemplates({ channel: 'email' });

  async function handleSend() {
    if (!templateId) return;
    if (!confirm('Send cold email to all matching leads with emails? This will bill Resend credits.')) return;
    setLoading(true);
    try {
      const res = await bulkSendEmail({
        template_id: templateId as number,
        status: status || undefined,
        service_type: serviceType || undefined,
        not_contacted_days: notContactedDays > 0 ? notContactedDays : undefined,
        ai_personalize: aiPersonalize,
      });
      setResult(res);
      toast(`Sent ${res.sent} emails${res.ai_personalized ? ` (${res.ai_personalized} AI-personalized)` : ''}`);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Email blast failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Cold Email Blast</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-1">
              <p className="text-sm font-medium text-emerald-400">{result.sent} emails sent</p>
              {result.ai_personalized > 0 && <p className="text-xs text-orange-400">{result.ai_personalized} AI-personalized</p>}
              {result.failed > 0 && <p className="text-xs text-red-400">{result.failed} failed</p>}
              <p className="text-xs text-zinc-500">{result.total} leads matched filter</p>
            </div>
            <button onClick={onClose} className="w-full px-3 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS}>Email template</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value ? Number(e.target.value) : '')} className={SELECT_CLS}>
                <option value="">Select a template…</option>
                {(templates || []).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={SELECT_CLS}>
                  <option value="">All statuses</option>
                  {FILTER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Service</label>
                <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={SELECT_CLS}>
                  <option value="">All services</option>
                  {FILTER_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Not contacted in</label>
              <select value={notContactedDays} onChange={e => setNotContactedDays(Number(e.target.value))} className={SELECT_CLS}>
                {FILTER_DAYS.filter(d => d.value !== 1).map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer" onClick={() => setAiPersonalize(!aiPersonalize)}>
              <div className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${aiPersonalize ? 'bg-orange-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${aiPersonalize ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-zinc-300 font-medium">AI personalization <span className="text-zinc-500 font-normal">(Gemini rewrites each email)</span></span>
            </label>
            <p className="text-[10px] text-zinc-600">Only leads with valid emails that haven't unsubscribed will receive emails.</p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Cancel</button>
              <button
                onClick={handleSend}
                disabled={!templateId || loading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                {loading ? 'Sending…' : 'Send Emails'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
