import { useState, useRef, useEffect } from 'react';
import { Download, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Lead } from '../types';
import { LeadsTable } from '../components/leads/LeadsTable';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { importCsv } from '../lib/api';
import { useCopilotContext } from '../lib/copilotContext';

export function Leads() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
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
      setImportStatus(`Imported ${result.imported} lead${result.imported !== 1 ? 's' : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setTimeout(() => setImportStatus(null), 5000);
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
        <div>
          <h1 className="text-zinc-100 font-semibold text-lg tracking-tight">Lead Pipeline</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Track and manage your discovered leads</p>
        </div>
        <div className="flex items-center gap-2.5">
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
        <LeadsTable onRowClick={setSelectedLead} />
      </div>

      <LeadDrawer
        leadId={selectedLead?.id ?? null}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
