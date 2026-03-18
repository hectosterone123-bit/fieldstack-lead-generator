import { useState, useRef, useEffect } from 'react';
import { Download, Upload, List, Columns3, Repeat, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Lead } from '../types';
import { LeadsTable } from '../components/leads/LeadsTable';
import { KanbanBoard } from '../components/leads/KanbanBoard';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { importCsv } from '../lib/api';
import { useCopilotContext } from '../lib/copilotContext';
import { useSequences, useEnrollLeads } from '../hooks/useSequences';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

export function Leads() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [enrollAfterImport, setEnrollAfterImport] = useState<{ leadIds: number[]; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { setLeadContext } = useCopilotContext();

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
      } else {
        setImportStatus(`No leads imported${result.skipped ? `, ${result.skipped} skipped` : ''}`);
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
    // h-[calc(100vh-3rem)] accounts for the 3rem (h-12) AppLayout top header
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Page header */}
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
        <h1 className="text-zinc-100 font-semibold text-sm tracking-tight">Lead Pipeline</h1>
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
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'table' ? (
          <LeadsTable onRowClick={setSelectedLead} />
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
