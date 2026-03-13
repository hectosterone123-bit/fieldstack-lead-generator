import { useState, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, MapPin, Trash2, Download, X, Globe, Star, ChevronsUpDown, Phone, Sparkles, Loader2, CheckCheck, MailOpen, Repeat } from 'lucide-react';
import type { Lead, LeadStatus, ServiceType } from '../../types';
import { STATUS_LABELS, SERVICE_LABELS, SERVICE_COLORS, PREDEFINED_TAGS, TAG_COLORS, TAG_COLOR_DEFAULT } from '../../types';
import { StatusBadge } from '../shared/StatusBadge';
import { HeatScore } from '../shared/HeatScore';
import { EmptyState } from '../shared/EmptyState';
import { formatCurrency, formatRelativeTime, cn } from '../../lib/utils';
import { useLeads, useDeleteLead, useBulkUpdateLeads, useBulkEnrich } from '../../hooks/useLeads';
import { useSequences, useEnrollLeads } from '../../hooks/useSequences';
import { Users } from 'lucide-react';
import { useToast } from '../../lib/toast';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Proposal', value: 'proposal_sent' },
  { label: 'Booked', value: 'booked' },
  { label: 'Lost', value: 'lost' },
];

interface Props {
  onRowClick: (lead: Lead) => void;
}

export function LeadsTable({ onRowClick }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [tagFilter, setTagFilter] = useState('');
  const [noResponseFilter, setNoResponseFilter] = useState(false);
  const [noWebsiteFilter, setNoWebsiteFilter] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');

  const { data, isLoading } = useLeads({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    service_type: serviceFilter !== 'all' ? serviceFilter : undefined,
    tag: tagFilter || undefined,
    no_response: noResponseFilter || undefined,
    no_website: noWebsiteFilter || undefined,
    sort, order, page, limit: 25,
  });

  const [enrollSeqId, setEnrollSeqId] = useState<number | ''>('');

  const deleteLead = useDeleteLead();
  const bulkUpdate = useBulkUpdateLeads();
  const bulkEnrich = useBulkEnrich();
  const enrollLeads = useEnrollLeads();
  const { data: sequences } = useSequences();
  const activeSequences = (sequences || []).filter(s => s.is_active);
  const { toast } = useToast();

  useEffect(() => {
    setSelected(new Set());
  }, [search, statusFilter, serviceFilter, tagFilter, noResponseFilter, noWebsiteFilter, sort, order, page]);

  function handleSort(col: string) {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('desc'); }
  }

  function SortIcon({ col }: { col: string }) {
    if (sort !== col) return <ChevronsUpDown className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return order === 'asc'
      ? <ChevronUp className="w-3 h-3 text-orange-400" />
      : <ChevronDown className="w-3 h-3 text-orange-400" />;
  }

  const leads = data?.leads || [];
  const pagination = data?.pagination;

  function parseTags(tags: string | null): string[] {
    if (!tags) return [];
    try { return JSON.parse(tags); } catch { return []; }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (leads.every(l => selected.has(l.id))) {
      setSelected(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.add(l.id));
        return next;
      });
    }
  }

  async function handleBulkStatusChange(status: string) {
    if (!status) return;
    const ids = Array.from(selected);
    const result = await bulkUpdate.mutateAsync({ ids, action: 'status', value: status });
    toast(`Updated ${result.affected} lead${result.affected !== 1 ? 's' : ''}`);
    setSelected(new Set());
    setBulkStatus('');
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!window.confirm(`Delete ${ids.length} leads? This cannot be undone.`)) return;
    const result = await bulkUpdate.mutateAsync({ ids, action: 'delete' });
    toast(`Deleted ${result.affected} lead${result.affected !== 1 ? 's' : ''}`);
    setSelected(new Set());
  }

  async function handleBulkExport() {
    const ids = Array.from(selected);
    try {
      const res = await fetch('/api/leads/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  }

  async function handleBulkEnrich(ids?: number[]) {
    try {
      const result = await bulkEnrich.mutateAsync(ids);
      const parts = [`Enriched ${result.enriched}`];
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      if (result.failed) parts.push(`${result.failed} failed`);
      toast(parts.join(', '));
      if (ids) setSelected(new Set());
    } catch {
      toast('Bulk enrichment failed', 'error');
    }
  }

  const allOnPageSelected = leads.length > 0 && leads.every(l => selected.has(l.id));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-5 py-3.5 border-b border-white/[0.04] space-y-3">
        <div className="flex gap-2.5">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
            />
          </div>
          {/* Service type */}
          <div className="relative">
            <select
              value={serviceFilter}
              onChange={e => { setServiceFilter(e.target.value); setPage(1); }}
              className="appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 cursor-pointer transition-colors"
            >
              <option value="all">All Services</option>
              {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
          <button
            onClick={() => handleBulkEnrich()}
            disabled={bulkEnrich.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-white/[0.06] hover:border-white/[0.10] rounded-lg disabled:opacity-50 transition-colors ml-auto"
          >
            {bulkEnrich.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            }
            {bulkEnrich.isPending ? 'Enriching...' : 'Enrich All'}
          </button>
        </div>

        {/* Status tabs — pill style */}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                statusFilter === f.value
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tag filter pills */}
        <div className="flex gap-1 overflow-x-auto">
          {PREDEFINED_TAGS.map(t => (
            <button
              key={t}
              onClick={() => { setTagFilter(prev => prev === t ? '' : t); setPage(1); }}
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
          <button
            onClick={() => { setNoResponseFilter(f => !f); setPage(1); }}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
              noResponseFilter
                ? 'bg-red-500/15 border-red-500/30 text-red-400'
                : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50',
            )}
          >
            No Response
          </button>
          <button
            onClick={() => { setNoWebsiteFilter(f => !f); setPage(1); }}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
              noWebsiteFilter
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50',
            )}
          >
            No Website
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-px pt-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-zinc-900/40 animate-pulse mx-0" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <EmptyState icon={Users} title="No leads found" description="Try adjusting your filters or import leads from the Finder." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                {[
                  { label: 'Business', col: 'business_name' },
                  { label: 'Status', col: 'status' },
                  { label: 'Heat', col: 'heat_score' },
                  { label: 'Value', col: 'estimated_value' },
                  { label: 'Last Contact', col: 'last_contacted_at' },
                ].map(h => (
                  <th
                    key={h.col}
                    onClick={() => handleSort(h.col)}
                    className="group text-left px-4 py-3 text-overline text-zinc-500 cursor-pointer hover:text-zinc-300 select-none transition-colors"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {h.label} <SortIcon col={h.col} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {leads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => onRowClick(lead)}
                  className={cn(
                    'group cursor-pointer transition-colors duration-100',
                    selected.has(lead.id)
                      ? 'bg-orange-500/[0.04]'
                      : 'hover:bg-white/[0.04]',
                  )}
                >
                  <td className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </td>

                  {/* Business */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-zinc-200 truncate max-w-[180px]">{lead.business_name}</span>
                      {lead.next_followup_at && (() => {
                        const date = lead.next_followup_at.slice(0, 10);
                        const today = new Date().toISOString().slice(0, 10);
                        if (date < today) return <span className="text-[10px] font-semibold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded shrink-0">Overdue</span>;
                        if (date === today) return <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded shrink-0">Due today</span>;
                        return null;
                      })()}
                      {lead.test_submitted_at && (() => {
                        const sub = new Date(lead.test_submitted_at).getTime();
                        const end = lead.test_responded_at ? new Date(lead.test_responded_at).getTime() : Date.now();
                        const mins = Math.floor((end - sub) / 60000);
                        if (lead.test_responded_at) {
                          if (mins < 60)  return <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">Fast</span>;
                          if (mins < 240) return <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded shrink-0">Slow</span>;
                          return <span className="text-[10px] font-semibold bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">Very Slow</span>;
                        }
                        if (mins >= 240) return <span className="text-[10px] font-semibold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded shrink-0">Ghost</span>;
                        return null;
                      })()}
                      {lead.email && lead.loom_url && lead.test_submitted_at && (
                        <span title="Pitch ready: has email, Loom, and response test" className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                      )}
                      {lead.email_opened_at && (
                        <span title="Prospect opened your email" className="flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">
                          <MailOpen className="w-2.5 h-2.5" />Opened
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {lead.phone && (
                        <span className="text-xs text-zinc-600">{lead.phone}</span>
                      )}
                      {lead.city && (
                        <span className="flex items-center gap-0.5 text-xs text-zinc-600">
                          {lead.phone && <span className="text-zinc-700 mx-0.5">·</span>}
                          <MapPin className="w-2.5 h-2.5" />{lead.city}{lead.state ? `, ${lead.state}` : ''}
                        </span>
                      )}
                      {lead.service_type && (
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', SERVICE_COLORS[lead.service_type as ServiceType])}>
                          {SERVICE_LABELS[lead.service_type as ServiceType]}
                        </span>
                      )}
                      {lead.rating != null && (
                        <span className="flex items-center gap-0.5 text-yellow-400">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span className="text-xs text-zinc-400">{lead.rating.toFixed(1)}</span>
                          {lead.review_count != null && (
                            <span className="text-xs text-zinc-600">({lead.review_count})</span>
                          )}
                        </span>
                      )}
                    </div>
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-zinc-600 hover:text-orange-400 mt-0.5 truncate max-w-[200px] transition-colors"
                      >
                        <Globe className="w-2.5 h-2.5 shrink-0" />
                        {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    )}
                    {parseTags(lead.tags).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {parseTags(lead.tags).map(tag => (
                          <span key={tag} className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', TAG_COLORS[tag] || TAG_COLOR_DEFAULT)}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5">
                    <StatusBadge status={lead.status as LeadStatus} />
                  </td>

                  <td className="px-4 py-3.5 w-24">
                    <HeatScore score={lead.heat_score} compact />
                  </td>

                  <td className="px-4 py-3.5 text-zinc-300 font-data tabular-nums text-sm">
                    {formatCurrency(lead.estimated_value)}
                  </td>

                  <td className="px-4 py-3.5 text-zinc-500 text-xs font-data">
                    {formatRelativeTime(lead.last_contacted_at)}
                  </td>

                  {/* Hover-reveal row actions */}
                  <td className="px-3 py-3.5 text-right">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={e => e.stopPropagation()}
                          className="w-7 h-7 rounded-md hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Delete this lead?')) {
                            deleteLead.mutate(lead.id, { onSuccess: () => toast('Lead deleted') });
                          }
                        }}
                        className="w-7 h-7 rounded-md hover:bg-red-500/10 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 bg-zinc-900/95 backdrop-blur-sm border-t border-white/[0.06] px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-200 font-medium">{selected.size} selected</span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={bulkStatus}
                onChange={e => handleBulkStatusChange(e.target.value)}
                disabled={bulkUpdate.isPending}
                className="appearance-none bg-zinc-800 border border-white/[0.08] rounded-lg pl-3 pr-8 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 cursor-pointer"
              >
                <option value="">Change Status...</option>
                {(Object.entries(STATUS_LABELS) as [LeadStatus, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
            <button
              onClick={() => handleBulkEnrich(Array.from(selected))}
              disabled={bulkEnrich.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] rounded-lg disabled:opacity-50 transition-colors"
            >
              {bulkEnrich.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              }
              Enrich
            </button>
            <button
              onClick={() => {
                bulkUpdate.mutate(
                  { ids: Array.from(selected), action: 'mark_contacted' },
                  { onSuccess: (data) => { toast(`Marked ${(data as any).affected} lead(s) as contacted`); setSelected(new Set()); } }
                );
              }}
              disabled={bulkUpdate.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] rounded-lg disabled:opacity-40 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Mark Contacted
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={enrollSeqId}
                onChange={e => setEnrollSeqId(e.target.value ? Number(e.target.value) : '')}
                className="text-xs bg-zinc-800 border border-white/[0.06] text-zinc-400 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              >
                <option value="">Enroll in sequence...</option>
                {activeSequences.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {enrollSeqId !== '' && (
                <button
                  onClick={async () => {
                    const result = await enrollLeads.mutateAsync({
                      lead_ids: Array.from(selected),
                      sequence_id: enrollSeqId as number,
                    });
                    toast(`Enrolled ${result.enrolled} lead(s)${result.skipped ? `, ${result.skipped} already active` : ''}`);
                    setEnrollSeqId('');
                    setSelected(new Set());
                  }}
                  disabled={enrollLeads.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 text-white rounded-lg disabled:opacity-40 transition-colors"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  {enrollLeads.isPending ? 'Enrolling...' : 'Enroll'}
                </button>
              )}
            </div>
            <button
              onClick={handleBulkExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.06] rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkUpdate.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 ring-1 ring-red-500/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between text-sm">
          <span className="text-zinc-500 text-xs font-data">{pagination.total} leads</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors text-xs font-medium"
            >
              Prev
            </button>
            <span className="text-zinc-500 text-xs font-data">{page} / {pagination.totalPages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === pagination.totalPages}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors text-xs font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
