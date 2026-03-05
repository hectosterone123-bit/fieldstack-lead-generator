import { useState, useMemo } from 'react';
import { Search, MapPin, Globe, Phone, CheckSquare, Square, ExternalLink, Loader2, CheckCircle, Wrench, ChevronDown, Star, Zap, LayoutList, LayoutGrid, X, Sparkles, ListChecks } from 'lucide-react';
import type { FinderResult, ImportOptions, Sequence } from '../types';
import { SERVICE_LABELS } from '../types';
import { HeatScore } from '../components/shared/HeatScore';
import { cn } from '../lib/utils';
import { useFinderSearch, useBatchSearch, useImportLeads } from '../hooks/useFinder';
import { useSequences } from '../hooks/useSequences';
import { EmptyState } from '../components/shared/EmptyState';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../lib/toast';

const RADIUS_OPTIONS = [5, 10, 25, 50];
const SOURCE_OPTIONS = [
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'google', label: 'Google Places' },
  { value: 'both', label: 'Both' },
] as const;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const CITY_PRESETS: Record<string, Array<{ city: string; state: string }>> = {
  'Top TX Markets': [
    { city: 'Austin', state: 'TX' }, { city: 'San Antonio', state: 'TX' },
    { city: 'Dallas', state: 'TX' }, { city: 'Houston', state: 'TX' },
    { city: 'Fort Worth', state: 'TX' }, { city: 'Plano', state: 'TX' },
    { city: 'Arlington', state: 'TX' }, { city: 'Round Rock', state: 'TX' },
    { city: 'McKinney', state: 'TX' }, { city: 'Frisco', state: 'TX' },
  ],
  'Top FL Markets': [
    { city: 'Miami', state: 'FL' }, { city: 'Orlando', state: 'FL' },
    { city: 'Tampa', state: 'FL' }, { city: 'Jacksonville', state: 'FL' },
    { city: 'Fort Lauderdale', state: 'FL' }, { city: 'St. Petersburg', state: 'FL' },
    { city: 'Cape Coral', state: 'FL' }, { city: 'Sarasota', state: 'FL' },
    { city: 'Naples', state: 'FL' }, { city: 'Gainesville', state: 'FL' },
  ],
  'Top AZ Markets': [
    { city: 'Phoenix', state: 'AZ' }, { city: 'Tucson', state: 'AZ' },
    { city: 'Mesa', state: 'AZ' }, { city: 'Scottsdale', state: 'AZ' },
    { city: 'Chandler', state: 'AZ' }, { city: 'Gilbert', state: 'AZ' },
    { city: 'Tempe', state: 'AZ' }, { city: 'Peoria', state: 'AZ' },
    { city: 'Surprise', state: 'AZ' }, { city: 'Goodyear', state: 'AZ' },
  ],
};

function resultKey(r: FinderResult): string {
  return r.osm_id || r.google_place_id || r.business_name;
}

function ProspectBadge({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    : score >= 35 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    : 'bg-zinc-800 text-zinc-500 border-white/[0.06]';
  const label = score >= 60 ? 'High potential' : score >= 35 ? 'Worth a look' : null;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', color)}>
        <Zap className="w-2.5 h-2.5" />
        {score}
      </span>
      {label && (
        <span className={cn('text-[9px] font-medium', score >= 60 ? 'text-orange-400' : 'text-amber-500/70')}>
          {label}
        </span>
      )}
    </div>
  );
}

function ImportModal({ onConfirm, onCancel, count, sequences }: {
  onConfirm: (opts: ImportOptions) => void;
  onCancel: () => void;
  count: number;
  sequences: Sequence[];
}) {
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [autoEnroll, setAutoEnroll] = useState(false);
  const [sequenceId, setSequenceId] = useState<number | undefined>(undefined);

  const activeSequences = sequences.filter(s => s.is_active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-white/[0.08] shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-zinc-200">Import {count} Lead{count !== 1 ? 's' : ''}</h3>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoEnrich}
              onChange={e => setAutoEnrich(e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <div>
              <span className="text-sm text-zinc-200 group-hover:text-white transition-colors">Auto-enrich websites</span>
              <p className="text-xs text-zinc-500 mt-0.5">Scrape each lead's website for emails, services, and tech stack in the background</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoEnroll}
              onChange={e => setAutoEnroll(e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <div>
              <span className="text-sm text-zinc-200 group-hover:text-white transition-colors">Auto-enroll in sequence</span>
              <p className="text-xs text-zinc-500 mt-0.5">Automatically start outreach for imported leads</p>
            </div>
          </label>

          {autoEnroll && (
            <div className="ml-6">
              <label className="text-overline text-zinc-500 block mb-1.5">Select Sequence</label>
              <div className="relative">
                <select
                  value={sequenceId ?? ''}
                  onChange={e => setSequenceId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors cursor-pointer"
                >
                  <option value="">Choose a sequence...</option>
                  {activeSequences.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.steps.length} steps)</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
              {activeSequences.length === 0 && (
                <p className="text-xs text-zinc-600 mt-1">No active sequences. Create one in the Sequences page first.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({
              auto_enrich: autoEnrich,
              auto_enroll: autoEnroll && !!sequenceId,
              sequence_id: autoEnroll ? sequenceId : undefined,
            })}
            disabled={autoEnroll && !sequenceId}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-colors shadow-[0_0_12px_-2px_rgba(249,115,22,0.5)]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Import {count} Lead{count !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Finder() {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [form, setForm] = useState<{ service_type: string; city: string; state: string; radius_km: number; source: 'osm' | 'google' | 'both' }>({ service_type: 'hvac', city: '', state: 'TX', radius_km: 10, source: 'osm' });
  const [batchCities, setBatchCities] = useState('');
  const [batchState, setBatchState] = useState('TX');
  const [results, setResults] = useState<FinderResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [minProspect, setMinProspect] = useState(0);
  const [cityLog, setCityLog] = useState<Array<{ city: string; state: string; found: number; error?: string }>>([]);

  const search = useFinderSearch();
  const batchSearch = useBatchSearch();
  const importLeads = useImportLeads();
  const { data: sequences = [] } = useSequences();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isSearching = search.isPending || batchSearch.isPending;

  function handleSingleSearch() {
    if (!form.city || !form.state) return;
    setResults([]);
    setSelected(new Set());
    setImported(false);
    setCityLog([]);
    search.mutate(
      { service_type: form.service_type, city: form.city, state: form.state, radius_km: form.radius_km, source: form.source },
      { onSuccess: (data) => setResults(data.results) }
    );
  }

  function handleBatchSearch() {
    const cities = batchCities
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(city => ({ city, state: batchState }));

    if (cities.length === 0) return;
    if (cities.length > 10) {
      toast('Max 10 cities per batch', 'error');
      return;
    }

    setResults([]);
    setSelected(new Set());
    setImported(false);
    setCityLog([]);
    batchSearch.mutate(
      { service_type: form.service_type, cities, radius_km: form.radius_km, source: form.source },
      {
        onSuccess: (data) => {
          setResults(data.results);
          setCityLog(data.meta.city_log);
        },
      }
    );
  }

  function handleSearch() {
    if (mode === 'single') handleSingleSearch();
    else handleBatchSearch();
  }

  function applyPreset(name: string) {
    const cities = CITY_PRESETS[name];
    if (!cities) return;
    setBatchCities(cities.map(c => c.city).join('\n'));
    setBatchState(cities[0].state);
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    const importable = filteredResults.filter(r => !r.already_imported);
    setSelected(new Set(importable.map(resultKey)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleImportClick() {
    setShowImportModal(true);
  }

  function handleImportConfirm(options: ImportOptions) {
    const toImport = results.filter(r => selected.has(resultKey(r)));
    setShowImportModal(false);
    importLeads.mutate(
      { leads: toImport, options },
      {
        onSuccess: (data) => {
          setImported(true);
          toast(`Imported ${data.imported} leads${options.auto_enrich ? ' (enriching in background)' : ''}`);
          setResults(prev => prev.map(r => selected.has(resultKey(r)) ? { ...r, already_imported: true } : r));
          setSelected(new Set());
          setTimeout(() => navigate('/leads'), 1500);
        },
      }
    );
  }

  const filteredResults = useMemo(() =>
    results.filter(r => r.prospect_score >= minProspect),
    [results, minProspect]
  );

  const newResults = filteredResults.filter(r => !r.already_imported);
  const alreadyImported = filteredResults.filter(r => r.already_imported);

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* Left: Search form */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] shadow-surface overflow-hidden sticky top-0">
          {/* Form header */}
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-zinc-200 tracking-tight">Smart Prospecting</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Find businesses likely to buy</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Mode toggle */}
            <div>
              <label className="text-overline text-zinc-500 block mb-1.5">Search Mode</label>
              <div className="flex rounded-lg border border-white/[0.06] overflow-hidden">
                <button
                  onClick={() => setMode('single')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                    mode === 'single'
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-zinc-800/40 text-zinc-500 hover:text-zinc-400',
                  )}
                >
                  <LayoutList className="w-3 h-3" /> Single City
                </button>
                <button
                  onClick={() => setMode('batch')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                    mode === 'batch'
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-zinc-800/40 text-zinc-500 hover:text-zinc-400',
                  )}
                >
                  <LayoutGrid className="w-3 h-3" /> Multi-City
                </button>
              </div>
            </div>

            {/* Service Type */}
            <div>
              <label className="text-overline text-zinc-500 block mb-1.5">Service Type</label>
              <div className="relative">
                <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
                <select
                  value={form.service_type}
                  onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
                  className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-9 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors cursor-pointer"
                >
                  {Object.entries(SERVICE_LABELS).filter(([k]) => k !== 'general').map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* City input — single or batch */}
            {mode === 'single' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-overline text-zinc-500 block mb-1.5">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Austin"
                    className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-overline text-zinc-500 block mb-1.5">State</label>
                  <div className="relative">
                    <select
                      value={form.state}
                      onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-7 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors cursor-pointer"
                    >
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-overline text-zinc-500">Cities (one per line)</label>
                  <span className="text-[10px] text-zinc-600 font-data">max 10</span>
                </div>
                <textarea
                  value={batchCities}
                  onChange={e => setBatchCities(e.target.value)}
                  placeholder={'Austin\nSan Antonio\nDallas\nHouston'}
                  rows={5}
                  className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors resize-none"
                />
                <div className="flex items-center gap-2">
                  <label className="text-overline text-zinc-500">State</label>
                  <div className="relative flex-1">
                    <select
                      value={batchState}
                      onChange={e => setBatchState(e.target.value)}
                      className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-7 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors cursor-pointer"
                    >
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-overline text-zinc-500 block mb-1">Presets</label>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(CITY_PRESETS).map(name => (
                      <button
                        key={name}
                        onClick={() => applyPreset(name)}
                        className="text-[10px] font-medium px-2 py-1 rounded-md bg-zinc-800/60 border border-white/[0.04] text-zinc-400 hover:text-orange-400 hover:border-orange-500/20 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                  className="w-full appearance-none bg-zinc-800/60 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 focus:border-orange-500/30 transition-colors cursor-pointer"
                >
                  {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r} km</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            {/* Source */}
            <div>
              <label className="text-overline text-zinc-500 block mb-1.5">Data Source</label>
              <div className="flex rounded-lg border border-white/[0.06] overflow-hidden">
                {SOURCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, source: opt.value }))}
                    className={cn(
                      'flex-1 py-2 text-xs font-medium transition-colors',
                      form.source === opt.value
                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                        : 'bg-zinc-800/40 text-zinc-500 hover:text-zinc-400',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Min Prospect Score filter */}
            {results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-overline text-zinc-500">Min Prospect Score</label>
                  <span className="text-xs font-semibold text-orange-400 font-data">{minProspect}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={minProspect}
                  onChange={e => setMinProspect(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                  <span>All</span>
                  <span>Top only</span>
                </div>
              </div>
            )}

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={isSearching || (mode === 'single' ? !form.city : !batchCities.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-400 transition-colors duration-150 shadow-[0_0_20px_-6px_rgba(249,115,22,0.6)] hover:shadow-[0_0_24px_-4px_rgba(249,115,22,0.8)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching{mode === 'batch' ? ' cities...' : '...'}
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  {mode === 'batch' ? 'Search All Cities' : 'Search for Leads'}
                </>
              )}
            </button>

            {isSearching && (
              <p className="text-zinc-600 text-xs text-center">
                {mode === 'batch'
                  ? 'Searching multiple cities — this may take 30-60 seconds'
                  : `Searching ${form.source === 'osm' ? 'OpenStreetMap' : form.source === 'google' ? 'Google Places' : 'OSM + Google'} — may take 5-15 seconds`
                }
              </p>
            )}
            {(search.isError || batchSearch.isError) && (
              <p className="text-red-400 text-xs text-center">
                {((search.error || batchSearch.error) as Error)?.message}
              </p>
            )}

            {/* City log for batch */}
            {cityLog.length > 0 && (
              <div>
                <label className="text-overline text-zinc-500 block mb-1.5">City Results</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {cityLog.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{c.city}, {c.state}</span>
                      {c.error ? (
                        <span className="text-red-400">error</span>
                      ) : (
                        <span className="text-zinc-500 font-data">{c.found}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {results.length === 0 && !isSearching && !search.isError && !batchSearch.isError && (
          <EmptyState
            icon={Search}
            title="Search for local businesses"
            description="Configure your search on the left to discover businesses via OpenStreetMap or Google Places. Use Multi-City mode to search across multiple markets at once."
          />
        )}

        {filteredResults.length > 0 && (
          <>
            {/* Results toolbar */}
            <div className="flex items-center justify-between mb-4 bg-zinc-900 rounded-xl border border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-400">
                  <span className="font-semibold text-zinc-200">{newResults.length}</span> new
                  {alreadyImported.length > 0 && (
                    <> · <span className="text-zinc-600">{alreadyImported.length} already imported</span></>
                  )}
                  {minProspect > 0 && results.length !== filteredResults.length && (
                    <> · <span className="text-zinc-600">{results.length - filteredResults.length} filtered</span></>
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
                    onClick={handleImportClick}
                    disabled={importLeads.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors shadow-[0_0_12px_-2px_rgba(249,115,22,0.5)]"
                  >
                    {importLeads.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
                    Import Selected ({selected.size})
                  </button>
                )}
              </div>
            </div>

            {/* Result cards */}
            <div className="space-y-2">
              {filteredResults.map(result => {
                const key = resultKey(result);
                const isSelected = selected.has(key);
                const isAlready = result.already_imported;

                return (
                  <div
                    key={key}
                    onClick={() => !isAlready && toggleSelect(key)}
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
                          <ProspectBadge score={result.prospect_score} />
                          <HeatScore score={result.heat_score} compact />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {result.phone && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500">
                            <Phone className="w-2.5 h-2.5" /> {result.phone}
                          </span>
                        )}
                        {result.rating != null && (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <Star className="w-2.5 h-2.5 fill-amber-400" /> {result.rating}
                            {result.review_count != null && (
                              <span className="text-zinc-600">({result.review_count})</span>
                            )}
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

        {/* No results after filtering */}
        {results.length > 0 && filteredResults.length === 0 && (
          <EmptyState
            icon={Zap}
            title="No results match filter"
            description={`No leads with prospect score ${minProspect}+. Try lowering the minimum.`}
          />
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          count={selected.size}
          sequences={sequences}
          onConfirm={handleImportConfirm}
          onCancel={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}
