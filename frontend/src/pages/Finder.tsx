import { useState } from 'react';
import { Search, MapPin, Globe, Phone, CheckSquare, Square, ExternalLink, Loader2, CheckCircle, Wrench, ChevronDown } from 'lucide-react';
import type { FinderResult } from '../types';
import { SERVICE_LABELS } from '../types';
import { HeatScore } from '../components/shared/HeatScore';
import { cn } from '../lib/utils';
import { useFinderSearch, useImportLeads } from '../hooks/useFinder';
import { EmptyState } from '../components/shared/EmptyState';
import { useNavigate } from 'react-router-dom';

const RADIUS_OPTIONS = [5, 10, 25, 50];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export function Finder() {
  const [form, setForm] = useState({ service_type: 'hvac', city: '', state: 'TX', radius_km: 10 });
  const [results, setResults] = useState<FinderResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState(false);

  const search = useFinderSearch();
  const importLeads = useImportLeads();
  const navigate = useNavigate();

  function handleSearch() {
    if (!form.city || !form.state) return;
    setResults([]);
    setSelected(new Set());
    setImported(false);
    search.mutate(
      { service_type: form.service_type, city: form.city, state: form.state, radius_km: form.radius_km },
      { onSuccess: (data) => setResults(data.results) }
    );
  }

  function toggleSelect(osmId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(osmId)) next.delete(osmId);
      else next.add(osmId);
      return next;
    });
  }

  function selectAll() {
    const importable = results.filter(r => !r.already_imported);
    setSelected(new Set(importable.map(r => r.osm_id!)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleImport() {
    const toImport = results.filter(r => selected.has(r.osm_id!));
    importLeads.mutate(toImport, {
      onSuccess: () => {
        setImported(true);
        setResults(prev => prev.map(r => selected.has(r.osm_id!) ? { ...r, already_imported: true } : r));
        setSelected(new Set());
        setTimeout(() => navigate('/leads'), 1200);
      }
    });
  }

  const newResults = results.filter(r => !r.already_imported);
  const alreadyImported = results.filter(r => r.already_imported);

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* Left: Search form */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] shadow-surface overflow-hidden sticky top-0">
          {/* Form header */}
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Find Local Leads</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Discover businesses via OpenStreetMap</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Service Type */}
            <div>
              <label className="text-overline text-zinc-500 block mb-1.5">Service Type</label>
              <div className="relative">
                <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
                <select
                  value={form.service_type}
                  onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
                  className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-all cursor-pointer"
                >
                  {Object.entries(SERVICE_LABELS).filter(([k]) => k !== 'general').map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* City + State row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-overline text-zinc-500 block mb-1.5">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Austin"
                  className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-all"
                />
              </div>
              <div>
                <label className="text-overline text-zinc-500 block mb-1.5">State</label>
                <div className="relative">
                  <select
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-7 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-all cursor-pointer"
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Radius */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-overline text-zinc-500">Search Radius</label>
                <span className="text-xs font-semibold text-orange-400 font-data">{form.radius_km} km</span>
              </div>
              <div className="relative">
                <select
                  value={form.radius_km}
                  onChange={e => setForm(f => ({ ...f, radius_km: parseInt(e.target.value) }))}
                  className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-all cursor-pointer"
                >
                  {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r} km</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={search.isPending || !form.city}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-400 transition-all duration-150 shadow-[0_0_20px_-6px_rgba(249,115,22,0.6)] hover:shadow-[0_0_24px_-4px_rgba(249,115,22,0.8)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {search.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search for Leads
                </>
              )}
            </button>

            {search.isPending && (
              <p className="text-zinc-600 text-xs text-center">Searching OpenStreetMap — may take 5–15 seconds</p>
            )}
            {search.isError && (
              <p className="text-red-400 text-xs text-center">{(search.error as Error).message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-zinc-100 font-semibold text-lg tracking-tight">Find Leads</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Discover local businesses and import them into your pipeline</p>
        </div>

        {results.length === 0 && !search.isPending && !search.isError && (
          <EmptyState
            icon={Search}
            title="Search for local businesses"
            description="Configure your search on the left to discover businesses via OpenStreetMap."
          />
        )}

        {results.length > 0 && (
          <>
            {/* Results toolbar */}
            <div className="flex items-center justify-between mb-4 bg-zinc-900 rounded-xl border border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-400">
                  <span className="font-semibold text-zinc-200">{newResults.length}</span> new
                  {alreadyImported.length > 0 && (
                    <> · <span className="text-zinc-600">{alreadyImported.length} already imported</span></>
                  )}
                </span>
                {newResults.length > 0 && (
                  <>
                    <button onClick={selectAll} className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors">
                      Select all new
                    </button>
                    {selected.size > 0 && (
                      <button onClick={clearAll} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                        Clear
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                {imported && (
                  <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle className="w-4 h-4" /> Imported! Redirecting...
                  </div>
                )}
                {selected.size > 0 && (
                  <button
                    onClick={handleImport}
                    disabled={importLeads.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-all shadow-[0_0_12px_-2px_rgba(249,115,22,0.5)]"
                  >
                    {importLeads.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Import Selected ({selected.size})
                  </button>
                )}
              </div>
            </div>

            {/* Result cards */}
            <div className="space-y-2">
              {results.map(result => {
                const isSelected = selected.has(result.osm_id!);
                const isAlready = result.already_imported;

                return (
                  <div
                    key={result.osm_id}
                    onClick={() => !isAlready && toggleSelect(result.osm_id!)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border transition-all duration-150',
                      isAlready
                        ? 'bg-zinc-900/30 border-white/[0.03] opacity-50 cursor-default'
                        : isSelected
                          ? 'bg-orange-500/[0.06] border-orange-500/25 cursor-pointer'
                          : 'bg-zinc-900 border-white/[0.04] cursor-pointer hover:border-white/[0.08] hover:bg-zinc-800/40',
                    )}
                  >
                    {/* Checkbox icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      {isAlready
                        ? <CheckCircle className="w-4 h-4 text-zinc-600" />
                        : isSelected
                          ? <CheckSquare className="w-4 h-4 text-orange-400" />
                          : <Square className="w-4 h-4 text-zinc-700" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 leading-snug truncate">{result.business_name}</p>
                          {(result.city || result.address) && (
                            <div className="flex items-center gap-1 text-zinc-600 text-xs mt-0.5">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">
                                {[result.address, result.city, result.state].filter(Boolean).join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isAlready && (
                            <span className="text-[10px] font-medium bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full border border-white/[0.04]">
                              In Pipeline
                            </span>
                          )}
                          <HeatScore score={result.heat_score} compact />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {result.phone && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Phone className="w-2.5 h-2.5" /> {result.phone}
                          </span>
                        )}
                        {result.website ? (
                          <span className={cn(
                            'flex items-center gap-1 text-xs',
                            result.website_live ? 'text-emerald-500' : 'text-zinc-600',
                          )}>
                            <Globe className="w-2.5 h-2.5" />
                            {result.website_live ? 'Website live' : 'Website (offline)'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-zinc-700">
                            <Globe className="w-2.5 h-2.5" /> No website
                          </span>
                        )}
                        {result.google_maps_url && (
                          <a
                            href={result.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Maps <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
