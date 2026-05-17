import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, Copy, Save, RotateCcw, AlertTriangle, CheckCircle, Clock, ChevronDown, History, RefreshCw } from 'lucide-react';
import { analyzeEstimate, saveEstimate, fetchEstimates, type EstimateResult, type EstimateLineItem, type SavedEstimate } from '../lib/api';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

const JOB_TYPES = [
  { value: 'hvac', label: 'HVAC' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'general', label: 'General / Other' },
];

const CONFIDENCE_CONFIG = {
  high: { label: 'High Confidence', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  medium: { label: 'Medium Confidence', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  low: { label: 'Low Confidence', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function buildSummaryText(jobType: string, result: EstimateResult): string {
  const label = JOB_TYPES.find(j => j.value === jobType)?.label ?? jobType;
  const lines = [
    `${label.toUpperCase()} ESTIMATE`,
    '',
    result.scope,
    '',
    'LINE ITEMS:',
    ...result.line_items.map(li =>
      `  ${li.description} (${li.quantity} ${li.unit}) — ${fmt(li.cost_low)}–${fmt(li.cost_high)}`
    ),
    '',
    `TOTAL: ${fmt(result.total_low)} – ${fmt(result.total_high)}`,
    `Confidence: ${result.confidence.toUpperCase()}`,
    ...(result.flags.length > 0 ? ['', 'Flags:', ...result.flags.map(f => `  • ${f}`)] : []),
  ];
  return lines.join('\n');
}

export function Estimate() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'new' | 'history'>('new');

  // New estimate state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [jobType, setJobType] = useState('roofing');
  const [notes, setNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // History state
  const [history, setHistory] = useState<SavedEstimate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchEstimates();
      setHistory(data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('Only image files are supported', 'error');
      return;
    }
    setImageMime(file.type);
    setResult(null);
    setSaved(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = async () => {
    if (!imageBase64) { toast('Upload a photo first', 'error'); return; }
    setAnalyzing(true);
    setResult(null);
    setSaved(false);
    try {
      const data = await analyzeEstimate(imageBase64, imageMime, jobType, notes || undefined);
      setResult(data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await saveEstimate({
        job_type: jobType,
        notes: notes || undefined,
        scope: result.scope,
        line_items: result.line_items,
        total_low: result.total_low,
        total_high: result.total_high,
        confidence: result.confidence,
        flags: result.flags,
      });
      setSaved(true);
      toast('Estimate saved');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(buildSummaryText(jobType, result));
    toast('Estimate copied to clipboard');
  };

  const handleReset = () => {
    setImagePreview(null);
    setImageBase64(null);
    setResult(null);
    setSaved(false);
    setNotes('');
  };

  const conf = result ? CONFIDENCE_CONFIG[result.confidence] : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Camera className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h1 className="text-zinc-100 font-semibold text-base">Photo Estimator</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Snap a job site → get a line-item estimate instantly</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'new' && result && (
            <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
              New Estimate
            </button>
          )}
          {/* Tab switcher */}
          <div className="flex bg-zinc-900 border border-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => setTab('new')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                tab === 'new' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Camera className="w-3 h-3" />
              New
            </button>
            <button
              onClick={() => setTab('history')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                tab === 'history' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <History className="w-3 h-3" />
              History
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">

        {/* New Estimate tab */}
        {tab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">

            {/* LEFT: Upload + Config */}
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-white/[0.04] flex flex-col gap-5">

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => !imagePreview && fileRef.current?.click()}
                className={cn(
                  'relative rounded-xl border-2 border-dashed transition-colors overflow-hidden',
                  imagePreview
                    ? 'border-white/[0.06] cursor-default'
                    : 'border-white/[0.08] hover:border-orange-500/40 cursor-pointer'
                )}
                style={{ minHeight: 200 }}
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Job site" className="w-full object-cover max-h-72 rounded-xl" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReset(); }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-zinc-900/80 flex items-center justify-center hover:bg-zinc-800 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-300" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Upload className="w-8 h-8 text-zinc-600 mb-3" />
                    <p className="text-zinc-400 text-sm font-medium">Drop a photo here</p>
                    <p className="text-zinc-600 text-xs mt-1">or click to browse · JPG, PNG, HEIC</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              {/* Job type */}
              <div>
                <label className="text-overline text-zinc-600 block mb-2">Job Type</label>
                <div className="relative">
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-200 appearance-none pr-8 focus:outline-none focus:border-orange-500/40"
                  >
                    {JOB_TYPES.map(j => (
                      <option key={j.value} value={j.value}>{j.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-overline text-zinc-600 block mb-2">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 2-story home, cedar shake roof, ~2,400 sqft..."
                  rows={3}
                  className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-orange-500/40 resize-none"
                />
              </div>

              {/* Analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={!imageBase64 || analyzing}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {analyzing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Analyze Photo
                  </>
                )}
              </button>
            </div>

            {/* RIGHT: Results */}
            <div className="p-6 flex flex-col gap-5">
              {!result && !analyzing && (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <Camera className="w-12 h-12 text-zinc-700 mb-4" />
                  <p className="text-zinc-500 text-sm">Upload a photo and click Analyze</p>
                  <p className="text-zinc-600 text-xs mt-1">AI will generate a detailed line-item estimate</p>
                </div>
              )}

              {analyzing && (
                <div className="flex flex-col items-center justify-center h-full py-16">
                  <span className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin mb-4" />
                  <p className="text-zinc-400 text-sm">Analyzing photo with AI...</p>
                  <p className="text-zinc-600 text-xs mt-1">Usually takes 5–10 seconds</p>
                </div>
              )}

              {result && !analyzing && (
                <>
                  {conf && (
                    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm', conf.bg, conf.border)}>
                      <conf.icon className={cn('w-4 h-4 flex-shrink-0', conf.color)} />
                      <span className={conf.color}>{conf.label}</span>
                    </div>
                  )}

                  <div>
                    <p className="text-overline text-zinc-600 mb-2">Scope of Work</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">{result.scope}</p>
                  </div>

                  <div>
                    <p className="text-overline text-zinc-600 mb-2">Line Items</p>
                    <div className="rounded-xl overflow-hidden border border-white/[0.04]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white/[0.03] text-zinc-500 text-xs">
                            <th className="text-left px-3 py-2 font-medium">Description</th>
                            <th className="text-right px-3 py-2 font-medium">Qty</th>
                            <th className="text-right px-3 py-2 font-medium">Low</th>
                            <th className="text-right px-3 py-2 font-medium">High</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.line_items.map((li: EstimateLineItem, i: number) => (
                            <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                              <td className="px-3 py-2.5 text-zinc-300">{li.description}</td>
                              <td className="px-3 py-2.5 text-zinc-400 text-right whitespace-nowrap">{li.quantity} {li.unit}</td>
                              <td className="px-3 py-2.5 text-zinc-300 text-right font-data whitespace-nowrap">{fmt(li.cost_low)}</td>
                              <td className="px-3 py-2.5 text-zinc-300 text-right font-data whitespace-nowrap">{fmt(li.cost_high)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <span className="text-orange-300 font-semibold text-sm">Estimated Total</span>
                    <span className="text-orange-400 font-bold font-data text-lg">{fmt(result.total_low)} – {fmt(result.total_high)}</span>
                  </div>

                  {result.flags.length > 0 && (
                    <div>
                      <p className="text-overline text-zinc-600 mb-2">Flags / Concerns</p>
                      <div className="flex flex-wrap gap-2">
                        {result.flags.map((flag, i) => (
                          <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.08] text-zinc-300 hover:text-zinc-100 hover:border-white/[0.14] text-sm transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Summary
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || saved}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        saved
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-default'
                          : 'bg-zinc-800 hover:bg-zinc-700 border border-white/[0.06] text-zinc-200 disabled:opacity-40'
                      )}
                    >
                      {saved ? (
                        <><CheckCircle className="w-3.5 h-3.5" />Saved</>
                      ) : (
                        <><Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save Estimate'}</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="text-zinc-400 text-sm">{history.length} saved estimate{history.length !== 1 ? 's' : ''}</p>
              <button
                onClick={loadHistory}
                disabled={historyLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.06] text-zinc-400 hover:text-zinc-200 text-xs transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn('w-3 h-3', historyLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            {historyLoading && (
              <div className="flex items-center justify-center py-16">
                <span className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
              </div>
            )}

            {!historyLoading && history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <History className="w-10 h-10 text-zinc-700 mb-3" />
                <p className="text-zinc-500 text-sm">No saved estimates yet</p>
                <p className="text-zinc-600 text-xs mt-1">Analyze a photo and click Save Estimate</p>
              </div>
            )}

            {!historyLoading && history.length > 0 && (
              <div className="rounded-xl overflow-hidden border border-white/[0.04]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.03] text-zinc-500 text-xs">
                      <th className="text-left px-4 py-3 font-medium">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Job Type</th>
                      <th className="text-right px-4 py-3 font-medium">Total Range</th>
                      <th className="text-center px-4 py-3 font-medium">Confidence</th>
                      <th className="text-left px-4 py-3 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const c = CONFIDENCE_CONFIG[row.confidence as keyof typeof CONFIDENCE_CONFIG];
                      const jobLabel = JOB_TYPES.find(j => j.value === row.job_type)?.label ?? row.job_type;
                      return (
                        <tr key={row.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                            {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{jobLabel}</td>
                          <td className="px-4 py-3 text-right font-data whitespace-nowrap text-zinc-200">
                            {fmt(row.total_low)} – {fmt(row.total_high)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c ? (
                              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border', c.bg, c.border, c.color)}>
                                <c.icon className="w-2.5 h-2.5" />
                                {row.confidence}
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {row.flags.length === 0 ? (
                              <span className="text-zinc-700">—</span>
                            ) : row.flags.length === 1 ? (
                              row.flags[0]
                            ) : (
                              <span>{row.flags[0]} <span className="text-zinc-600">+{row.flags.length - 1} more</span></span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
