import { useState, useRef, useEffect } from 'react';
import { X, Swords, Send, Loader2, Star, Trophy, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { roleplayMessage, roleplayCoach } from '../../lib/api';
import type { Lead } from '../../types';

const SCENARIOS = [
  { id: 'cold_opener', label: 'Cold Opener' },
  { id: 'warm_followup', label: 'Warm Follow-up' },
  { id: 'price_objection', label: 'Price Objection' },
  { id: 'close_demo', label: 'Close the Demo' },
  { id: 'already_has_system', label: 'Already Has System' },
  { id: 'send_email', label: 'Send Me Email' },
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function getDifficulty(lead: Lead): { label: string; score: number } {
  let score = 0;
  if ((lead as any).gatekeeper_count > 1) score++;
  if ((lead.contact_count ?? 0) > 2) score++;
  if ((lead.rating ?? 0) >= 4.5) score++;
  if (!lead.has_website) score++;
  if (lead.status === 'contacted') score++;
  const label = score <= 2 ? 'Easy' : score === 3 ? 'Medium' : 'Hard';
  return { label, score };
}

function DifficultyBar({ score }: { score: number }) {
  const pct = Math.min((score / 5) * 100, 100);
  const color = score <= 2 ? 'bg-emerald-500' : score === 3 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface Props {
  lead: Lead;
  onClose: () => void;
}

export function RoleplayModal({ lead, onClose }: Props) {
  const [scenario, setScenario] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const difficulty = getDifficulty(lead);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, report]);

  async function selectScenario(s: string) {
    setScenario(s);
    setMessages([]);
    setOutcome(null);
    setReport(null);
    setLoading(true);
    try {
      const res = await roleplayMessage(lead.id, s, []);
      setMessages([{ role: 'assistant', content: res.reply }]);
    } catch {
      setMessages([{ role: 'assistant', content: "Yeah, who's this?" }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || outcome) return;
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const res = await roleplayMessage(lead.id, scenario, newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.outcome) setOutcome(res.outcome);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, could not reach AI.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function endAndCoach() {
    setCoachLoading(true);
    try {
      const res = await roleplayCoach(lead.id, scenario, messages, outcome);
      setReport(res.report);
    } catch {
      setReport('Could not generate coaching report. Check AI configuration.');
    } finally {
      setCoachLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const canCoach = messages.length >= 3 && !report;
  const isGameOver = !!outcome || !!report;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-zinc-900 border border-white/[0.06] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
          <div className="flex items-center gap-2.5">
            <Swords className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-zinc-100">Roleplay Practice</span>
            <span className="text-xs text-zinc-500">—</span>
            <span className="text-xs text-zinc-400">{lead.business_name}</span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Prospect profile strip */}
        <div className="px-5 py-3 bg-zinc-800/40 border-b border-white/[0.04] shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
              <span className="font-medium text-zinc-200">{lead.business_name}</span>
              {lead.city && <span>{lead.city}{lead.state ? `, ${lead.state}` : ''}</span>}
              {lead.service_type && <span className="capitalize">{lead.service_type}</span>}
              {lead.rating && (
                <span className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  {lead.rating} ({lead.review_count ?? 0})
                </span>
              )}
              {(lead.contact_count ?? 0) > 0 && (
                <span className="text-zinc-500">Contacted ×{lead.contact_count}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-[10px] font-medium', difficulty.label === 'Easy' ? 'text-emerald-400' : difficulty.label === 'Medium' ? 'text-amber-400' : 'text-red-400')}>
                {difficulty.label}
              </span>
              <DifficultyBar score={difficulty.score} />
            </div>
          </div>
        </div>

        {/* Scenario selector (only before starting) */}
        {!scenario && (
          <div className="px-5 py-5 shrink-0">
            <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-semibold">Pick a scenario</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectScenario(s.id)}
                  className="px-3 py-2.5 rounded-lg border border-white/[0.06] text-xs text-zinc-300 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-300 transition-colors text-left"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat area */}
        {scenario && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-violet-600/20 text-violet-100 border border-violet-500/20'
                      : 'bg-zinc-800 text-zinc-200 border border-white/[0.04]'
                  )}>
                    {m.role === 'assistant' && (
                      <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-semibold">Contractor</p>
                    )}
                    {m.role === 'user' && (
                      <p className="text-[9px] text-violet-400/60 uppercase tracking-widest mb-1 font-semibold">You</p>
                    )}
                    <p>{m.content}</p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 border border-white/[0.04] rounded-xl px-3.5 py-2.5">
                    <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                  </div>
                </div>
              )}

              {/* Outcome badge */}
              {outcome && !report && (
                <div className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium',
                  outcome === 'booked'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/20 text-red-300'
                )}>
                  {outcome === 'booked'
                    ? <><Trophy className="w-4 h-4" /> Demo booked! Well done.</>
                    : <><AlertCircle className="w-4 h-4" /> Prospect lost. Get coaching below.</>
                  }
                </div>
              )}

              {/* Coaching report */}
              {report && (
                <div className="bg-zinc-800/60 border border-white/[0.05] rounded-xl p-4">
                  <p className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold mb-3">Coaching Report</p>
                  <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{report}</div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input + actions */}
            {!report && (
              <div className="px-5 py-4 border-t border-white/[0.04] shrink-0 space-y-2.5">
                {!isGameOver && (
                  <div className="flex gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Your response..."
                      rows={2}
                      className="flex-1 resize-none rounded-xl bg-zinc-800 border border-white/[0.06] px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/40 transition-colors"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      className="w-9 h-9 self-end rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {canCoach || isGameOver ? (
                    <button
                      onClick={endAndCoach}
                      disabled={coachLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {coachLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trophy className="w-3 h-3" />}
                      {coachLoading ? 'Analyzing...' : 'End & Get Coaching'}
                    </button>
                  ) : (
                    <p className="text-[10px] text-zinc-600">Keep going — coaching unlocks after 3+ exchanges</p>
                  )}
                  <button
                    onClick={() => { setScenario(''); setMessages([]); setOutcome(null); setReport(null); }}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Change scenario
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
