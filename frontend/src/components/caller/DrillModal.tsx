import { useState, useRef, useEffect } from 'react';
import { X, Zap, Send, Loader2, RefreshCw, FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { roleplayDrill, fetchRealObjections } from '../../lib/api';

const OBJECTIONS = [
  "Just send me an email.",
  "We already use someone for our follow-ups.",
  "I'm not interested.",
  "How much does it cost?",
  "Call me back next month — it's not a good time.",
  "We don't really get leads from the internet.",
  "I handle all my follow-ups myself.",
  "We're already set up with ServiceTitan.",
  "How is this different from what I already have?",
  "I need to think about it and get back to you.",
];

const TOTAL_ROUNDS = 10;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function Stars({ score }: { score: number }) {
  return (
    <span className="text-amber-400 tracking-tight text-sm">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < score ? 'text-amber-400' : 'text-zinc-700'}>★</span>
      ))}
    </span>
  );
}

function getGrade(total: number): { grade: string; color: string } {
  if (total >= 45) return { grade: 'A', color: 'text-emerald-400' };
  if (total >= 38) return { grade: 'B', color: 'text-blue-400' };
  if (total >= 28) return { grade: 'C', color: 'text-amber-400' };
  return { grade: 'D', color: 'text-red-400' };
}

interface DrillResult {
  objection: string;
  response: string;
  score: number;
  feedback: string;
}

interface Props {
  onClose: () => void;
}

export function DrillModal({ onClose }: Props) {
  const [objections, setObjections] = useState(() => shuffle(OBJECTIONS));
  const [round, setRound] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [done, setDone] = useState(false);
  const [usingRealObjections, setUsingRealObjections] = useState(false);
  const [loadingReal, setLoadingReal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [round]);

  useEffect(() => {
    if (done) summaryRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [done]);

  async function fire() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setInput('');
    try {
      const res = await roleplayDrill(objections[round], text);
      const result: DrillResult = {
        objection: objections[round],
        response: text,
        score: res.score,
        feedback: res.feedback,
      };
      const newResults = [...results, result];
      setResults(newResults);
      if (round + 1 >= TOTAL_ROUNDS) {
        setDone(true);
      } else {
        setRound(r => r + 1);
      }
    } catch {
      // still advance on error
      const newResults = [...results, { objection: objections[round], response: text, score: 3, feedback: 'Could not evaluate — AI unavailable.' }];
      setResults(newResults);
      if (round + 1 >= TOTAL_ROUNDS) setDone(true);
      else setRound(r => r + 1);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      fire();
    }
  }

  async function toggleRealObjections() {
    if (usingRealObjections) {
      setObjections(shuffle(OBJECTIONS));
      setUsingRealObjections(false);
      return;
    }
    setLoadingReal(true);
    try {
      const real = await fetchRealObjections();
      if (real.length >= 5) {
        setObjections(shuffle(real).slice(0, TOTAL_ROUNDS));
        setUsingRealObjections(true);
      } else {
        alert('Not enough real call data yet — keep calling and check back later.');
      }
    } catch {
      alert('Could not load real objections.');
    } finally {
      setLoadingReal(false);
    }
  }

  function drillAgain() {
    setObjections(usingRealObjections ? objections : shuffle(OBJECTIONS));
    setRound(0);
    setInput('');
    setResults([]);
    setDone(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const runningScore = results.reduce((s, r) => s + r.score, 0);
  const lastResult = results[results.length - 1];
  const { grade, color: gradeColor } = getGrade(runningScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-zinc-900 border border-white/[0.06] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-100">Sprint Drill</span>
            {usingRealObjections && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400">Real</span>
            )}
            {!done && (
              <span className="text-xs text-zinc-500">Round {round + 1} of {TOTAL_ROUNDS}</span>
            )}
            {done && (
              <span className="text-xs text-zinc-500">Complete</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleRealObjections}
              disabled={loadingReal}
              title={usingRealObjections ? 'Switch to standard objections' : 'Use real objections from your calls'}
              className={cn('flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border transition-colors',
                usingRealObjections
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20'
                  : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400')}
            >
              {loadingReal ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              {usingRealObjections ? 'Standard' : 'Real'}
            </button>
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active drill */}
        {!done && (
          <div className="flex flex-col flex-1 px-5 py-5 gap-4 overflow-y-auto">
            {/* Objection card */}
            <div className="rounded-xl bg-zinc-800 border border-white/[0.06] px-4 py-3.5">
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold mb-1.5">Objection</p>
              <p className="text-sm text-zinc-100 leading-relaxed">"{objections[round]}"</p>
            </div>

            {/* Last round feedback */}
            {lastResult && (
              <div className="rounded-lg bg-zinc-800/40 border border-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Stars score={lastResult.score} />
                  <span className="text-xs text-zinc-500">{lastResult.score}/5</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{lastResult.feedback}</p>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your reframe..."
                className="flex-1 rounded-xl bg-zinc-800 border border-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors"
                disabled={loading}
              />
              <button
                onClick={fire}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-900 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      i < results.length
                        ? results[i].score >= 4 ? 'bg-emerald-500' : results[i].score === 3 ? 'bg-amber-500' : 'bg-red-500'
                        : i === round ? 'bg-zinc-500' : 'bg-zinc-700'
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-zinc-500 font-data">
                {runningScore > 0 && `Running: ${runningScore}/${results.length * 5}`}
              </span>
            </div>
          </div>
        )}

        {/* Summary screen */}
        {done && (
          <div className="flex-1 overflow-y-auto px-5 py-5" ref={summaryRef}>
            {/* Score hero */}
            <div className="text-center mb-6">
              <p className={cn('text-6xl font-bold font-data', gradeColor)}>{grade}</p>
              <p className="text-sm text-zinc-400 mt-1">{runningScore} / {TOTAL_ROUNDS * 5} points</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                {grade === 'A' ? 'Excellent — these objections are handled.' : grade === 'B' ? 'Solid — a few spots to sharpen.' : grade === 'C' ? 'Keep drilling — the reps will get there.' : 'The objections are winning. More reps needed.'}
              </p>
            </div>

            {/* Round breakdown */}
            <div className="space-y-2 mb-5">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 px-3.5 py-3 rounded-lg bg-zinc-800/40 border border-white/[0.03]">
                  <div className="shrink-0 mt-0.5">
                    <Stars score={r.score} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 truncate">"{r.objection}"</p>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{r.feedback}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Drill again */}
            <button
              onClick={drillAgain}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Drill Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
