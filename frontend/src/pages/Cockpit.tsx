import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair, PhoneCall, Mail, ClipboardList, Pencil, Check, X,
  Phone, Target, Users, Flame, Copy, Timer, Play, Pause,
  BarChart2, Zap, Trophy, MessageSquare, CalendarCheck, ArrowRight,
} from 'lucide-react';
import {
  useCockpitMetrics, useCockpitTargets, useUpdateCockpitTargets,
  useCockpitHotLeads, useCockpitAlerts,
} from '../hooks/useCockpit';
import { cn } from '../lib/utils';
import type { HotLead, CockpitAlerts } from '../lib/api';

// ─── Checklist Data ───────────────────────────────────────────────────────────

const CHECKLIST_GROUPS = [
  {
    id: 'prep', label: 'Pre-Call Prep', icon: Crosshair,
    items: [
      { id: 'load-leads', label: 'Load 40 leads into pipeline' },
      { id: 'enrich-leads', label: 'Enrich leads (emails + phones)' },
      { id: 'open-tools', label: 'Open phone + call script' },
    ],
  },
  {
    id: 'calls', label: 'Call Block', icon: PhoneCall,
    items: [
      { id: 'dial-all', label: 'Dial all 40 leads' },
      { id: 'track-pickups', label: 'Track pickups and demos' },
    ],
  },
  {
    id: 'followup', label: 'Follow-Up', icon: Mail,
    items: [
      { id: 'email-nonresponders', label: 'Email non-responders' },
      { id: 'update-statuses', label: 'Update lead statuses' },
      { id: 'confirm-demos', label: 'Confirm booked demos' },
    ],
  },
  {
    id: 'log', label: 'Daily Log', icon: ClipboardList,
    items: [
      { id: 'log-numbers', label: "Log today's numbers" },
      { id: 'set-followups', label: 'Set follow-up dates' },
      { id: 'review-tomorrow', label: "Review tomorrow's follow-ups" },
    ],
  },
];

const ALL_ITEMS = CHECKLIST_GROUPS.flatMap(g => g.items);

// ─── localStorage Helpers ─────────────────────────────────────────────────────

function dateKey(prefix: string, d = new Date()) {
  return `${prefix}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(dateKey('cockpit-checklist'));
    if (raw) return JSON.parse(raw);
  } catch {}
  return Object.fromEntries(ALL_ITEMS.map(i => [i.id, false]));
}

function cleanOldStorage() {
  const today = new Date();
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('cockpit-')) continue;
    const parts = key.split('-');
    const dateStr = parts.slice(-3).join('-');
    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && (today.getTime() - d.getTime()) / 86400000 > 30) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

function computeStreak(todayChecklist: Record<string, boolean>): number {
  const todayDone = ALL_ITEMS.every(i => todayChecklist[i.id]);
  let streak = todayDone ? 1 : 0;
  const today = new Date();
  for (let i = 1; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    try {
      const raw = localStorage.getItem(dateKey('cockpit-checklist', d));
      if (!raw) break;
      const data = JSON.parse(raw);
      if (!ALL_ITEMS.every(item => data[item.id] === true)) break;
      streak++;
    } catch { break; }
  }
  return streak;
}

function getWeekData(): { label: string; pct: number; isToday: boolean }[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - idx));
    const isToday = idx === 6;
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    try {
      const raw = localStorage.getItem(dateKey('cockpit-checklist', d));
      if (!raw) return { label, pct: 0, isToday };
      const data = JSON.parse(raw);
      const done = ALL_ITEMS.filter(i => data[i.id]).length;
      return { label, pct: Math.round((done / ALL_ITEMS.length) * 100), isToday };
    } catch {
      return { label, pct: 0, isToday };
    }
  });
}

function getPaceText(callsToday: number, targetCalls: number): string | null {
  const now = new Date();
  const elapsed = (now.getHours() - 10) + now.getMinutes() / 60;
  if (elapsed < 0.1 || callsToday === 0) return null;
  const remaining = Math.max(0, 2.5 - elapsed);
  const rate = callsToday / elapsed;
  const projected = Math.round(callsToday + rate * remaining);
  const diff = projected - targetCalls;
  const status = diff >= 0 ? `+${diff} ahead` : `${Math.abs(diff)} short of goal`;
  return `${rate.toFixed(1)} calls/hr · ~${projected} by 12:30pm · ${status}`;
}

function relTime(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ─── Sprint Timer ─────────────────────────────────────────────────────────────

const SPRINT_SECS = 25 * 60;

function SprintTimer({ callsToday }: { callsToday: number }) {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SPRINT_SECS);
  const [sprintStart, setSprintStart] = useState(0);
  const [sprintNum, setSprintNum] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [running]);

  const elapsed = SPRINT_SECS - secondsLeft;
  const callsThisSprint = Math.max(0, callsToday - sprintStart);
  const callsPerMin = elapsed > 30 ? (callsThisSprint / (elapsed / 60)).toFixed(1) : null;
  const done = secondsLeft === 0;
  const pct = (elapsed / SPRINT_SECS) * 100;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  function start() { setSprintStart(callsToday); setRunning(true); }
  function pause() { setRunning(false); }
  function reset() { setRunning(false); setSecondsLeft(SPRINT_SECS); }
  function next() { setSprintNum(n => n + 1); setSecondsLeft(SPRINT_SECS); setSprintStart(callsToday); setRunning(true); }

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">Call Sprint</span>
          <span className="text-xs text-zinc-600">#{sprintNum}</span>
        </div>
        {callsPerMin && <span className="text-xs text-zinc-500 font-data">{callsPerMin}/min</span>}
      </div>
      <div className={cn('text-3xl font-semibold font-data text-center mb-3 tabular-nums',
        done ? 'text-emerald-400' : running ? 'text-orange-400' : 'text-zinc-400'
      )}>
        {done ? 'Done!' : `${mm}:${ss}`}
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-3">
        <div className={cn('h-full rounded-full transition-all', running ? 'bg-orange-500' : done ? 'bg-emerald-500' : 'bg-zinc-700')}
             style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-2">
        {!running && !done && (
          <button onClick={start} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-medium transition-colors">
            <Play className="w-3 h-3" /> Start
          </button>
        )}
        {running && (
          <button onClick={pause} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors">
            <Pause className="w-3 h-3" /> Pause
          </button>
        )}
        {done && (
          <button onClick={next} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors">
            Next Sprint
          </button>
        )}
        {elapsed > 0 && !done && (
          <button onClick={reset} className="h-8 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-500 text-xs transition-colors">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Call Outcome Logger ──────────────────────────────────────────────────────

function OutcomeLogger() {
  const [outcomes, setOutcomes] = useState<{ dials: number; pickups: number; interested: number }>(() => {
    try {
      const raw = localStorage.getItem(dateKey('cockpit-outcomes'));
      if (raw) return JSON.parse(raw);
    } catch {}
    return { dials: 0, pickups: 0, interested: 0 };
  });

  function update(field: keyof typeof outcomes, delta: number) {
    setOutcomes(prev => {
      const next = { ...prev, [field]: Math.max(0, prev[field] + delta) };
      localStorage.setItem(dateKey('cockpit-outcomes'), JSON.stringify(next));
      return next;
    });
  }

  const pickupRate = outcomes.dials > 0 ? Math.round((outcomes.pickups / outcomes.dials) * 100) : 0;
  const intRate = outcomes.pickups > 0 ? Math.round((outcomes.interested / outcomes.pickups) * 100) : 0;

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Call Outcomes</span>
      </div>
      <div className="space-y-2.5">
        {([
          { field: 'dials' as const, label: 'Dials', rate: null },
          { field: 'pickups' as const, label: 'Pickups', rate: outcomes.dials > 0 ? `${pickupRate}%` : null },
          { field: 'interested' as const, label: 'Interested', rate: outcomes.pickups > 0 ? `${intRate}%` : null },
        ]).map(({ field, label, rate }) => (
          <div key={field} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-16 flex-shrink-0">{label}</span>
            <button onClick={() => update(field, -1)} className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm leading-none transition-colors">−</button>
            <span className="w-7 text-center text-sm font-data font-medium text-zinc-200">{outcomes[field]}</span>
            <button onClick={() => update(field, 1)} className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm leading-none transition-colors">+</button>
            {rate && <span className="ml-1 text-xs text-zinc-600 font-data">{rate}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Monthly Goal Bar ─────────────────────────────────────────────────────────

function MonthlyGoalBar({ demosThisMonth, monthlyGoal, onUpdateGoal }: {
  demosThisMonth: number;
  monthlyGoal: number;
  onUpdateGoal: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(monthlyGoal));

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - today.getDate();
  const remaining = Math.max(0, monthlyGoal - demosThisMonth);
  const neededPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const pct = monthlyGoal > 0 ? Math.min((demosThisMonth / monthlyGoal) * 100, 100) : 0;
  const expectedByNow = monthlyGoal * (today.getDate() / daysInMonth);
  const onTrack = demosThisMonth >= expectedByNow - 0.5;

  function save() {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v > 0) onUpdateGoal(v);
    setEditing(false);
  }

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-zinc-300">Monthly Demo Goal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{daysLeft}d left · need {neededPerDay}/day</span>
          {editing ? (
            <div className="flex items-center gap-1">
              <input type="number" value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                className="w-12 bg-zinc-800 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none"
                autoFocus />
              <button onClick={save}><Check className="w-3 h-3 text-emerald-400" /></button>
              <button onClick={() => setEditing(false)}><X className="w-3 h-3 text-zinc-500" /></button>
            </div>
          ) : (
            <button onClick={() => { setDraft(String(monthlyGoal)); setEditing(true); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-500', pct >= 100 ? 'bg-emerald-500' : 'bg-orange-500')}
               style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-xl font-semibold font-data', pct >= 100 ? 'text-emerald-400' : 'text-orange-400')}>
            {demosThisMonth}
          </span>
          <span className="text-zinc-600 text-sm">/ {monthlyGoal}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full', onTrack ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
            {onTrack ? 'on track' : 'behind'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Target Card ──────────────────────────────────────────────────────────────

function TargetCard({ icon: Icon, label, current, target, onUpdateTarget }: {
  icon: typeof Phone;
  label: string;
  current: number;
  target: number;
  onUpdateTarget: (val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-orange-500' : 'bg-zinc-500';
  const textColor = pct >= 100 ? 'text-emerald-400' : pct >= 50 ? 'text-orange-400' : 'text-zinc-400';

  function save() {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v > 0) onUpdateTarget(v);
    setEditing(false);
  }

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">{label}</span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <input type="number" value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              className="w-14 bg-zinc-800 border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              autoFocus />
            <button onClick={save} className="w-5 h-5 flex items-center justify-center text-emerald-400 hover:text-emerald-300">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => setEditing(false)} className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => { setDraft(String(target)); setEditing(true); }}
            className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className={cn('text-2xl font-semibold font-data', textColor)}>
        {current} <span className="text-sm text-zinc-600">/ {target}</span>
      </div>
      <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Hot Call Queue ───────────────────────────────────────────────────────────

function HotQueue({ leads }: { leads: HotLead[] }) {
  const [copied, setCopied] = useState<number | null>(null);

  function copyPhone(id: number, phone: string) {
    navigator.clipboard.writeText(phone);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-medium text-zinc-300">Hot Leads to Call</span>
        <span className="ml-auto text-xs text-zinc-600">{leads.length} ready</span>
      </div>
      {leads.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-6">No leads with phones yet. Find some in Finder.</p>
      ) : (
        <div className="space-y-1">
          {leads.map(lead => (
            <div key={lead.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03]">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate leading-tight">{lead.business_name}</p>
                <p className="text-xs text-zinc-600 truncate">{[lead.city, lead.state].filter(Boolean).join(', ')}</p>
              </div>
              <span className={cn('text-xs font-data font-medium flex-shrink-0',
                lead.heat_score >= 70 ? 'text-orange-400' : 'text-zinc-500'
              )}>
                {lead.heat_score}
              </span>
              <button onClick={() => copyPhone(lead.id, lead.phone)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex-shrink-0">
                {copied === lead.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="font-data">{lead.phone}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Alerts Section ───────────────────────────────────────────────────────────

function AlertsSection({ alerts }: { alerts: CockpitAlerts }) {
  if (!alerts.hot_replies.length && !alerts.upcoming_demos.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {alerts.hot_replies.length > 0 && (
        <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-300">Replies Pending</span>
            <span className="ml-auto text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
              {alerts.hot_replies.length}
            </span>
          </div>
          <div className="space-y-1.5 mb-2">
            {alerts.hot_replies.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-zinc-200 truncate">{r.business_name}</span>
                <span className="text-xs text-zinc-500 flex-shrink-0">{relTime(r.created_at)}</span>
              </div>
            ))}
          </div>
          <Link to="/leads" className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-1 transition-colors">
            Open pipeline <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
      {alerts.upcoming_demos.length > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Upcoming Demos</span>
            <span className="ml-auto text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {alerts.upcoming_demos.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {alerts.upcoming_demos.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-zinc-200 truncate">{d.business_name}</span>
                <span className="text-xs text-zinc-400 flex-shrink-0">
                  {new Date(d.next_followup_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Win Field ────────────────────────────────────────────────────────────────

function WinField() {
  const [win, setWin] = useState(() => {
    try { return localStorage.getItem(dateKey('cockpit-win')) || ''; } catch { return ''; }
  });

  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-zinc-300">Win of the Day</span>
      </div>
      <textarea
        value={win}
        onChange={e => {
          setWin(e.target.value);
          try { localStorage.setItem(dateKey('cockpit-win'), e.target.value); } catch {}
        }}
        placeholder="Best thing that happened today? Demo booked, great conversation, breakthrough..."
        rows={2}
        className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/30"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Cockpit() {
  const { data: metrics } = useCockpitMetrics();
  const { data: targets } = useCockpitTargets();
  const { data: hotLeads = [] } = useCockpitHotLeads();
  const { data: alerts } = useCockpitAlerts();
  const updateTargets = useUpdateCockpitTargets();

  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist);

  useEffect(() => { cleanOldStorage(); }, []);
  useEffect(() => {
    localStorage.setItem(dateKey('cockpit-checklist'), JSON.stringify(checklist));
  }, [checklist]);

  function toggle(id: string) {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = ALL_ITEMS.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const streak = computeStreak(checklist);
  const weekData = getWeekData();

  const m = metrics ?? {
    calls_today: 0, emails_today: 0, sms_today: 0, leads_added_today: 0,
    demos_booked_today: 0, demos_this_month: 0, followups_completed_today: 0,
    status_changes_today: 0, enriched_today: 0, followups_due: 0, followups_overdue: 0,
  };
  const t = targets ?? { calls: 40, emails: 20, demos: 1, leads: 40, monthly_goal: 5 };
  const safeAlerts = alerts ?? { hot_replies: [], upcoming_demos: [] };

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const paceText = getPaceText(m.calls_today, t.calls);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Monthly Goal */}
      <MonthlyGoalBar
        demosThisMonth={m.demos_this_month}
        monthlyGoal={t.monthly_goal}
        onUpdateGoal={v => updateTargets.mutate({ monthly_goal: v })}
      />

      {/* Header + Streak + Heatmap + Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-zinc-100 font-semibold text-base">{todayStr}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{completedCount}/{totalCount} tasks complete</p>
          </div>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                <Flame className="w-3 h-3 text-orange-400" />
                <span className="text-xs font-medium text-orange-400">{streak} day streak</span>
              </div>
            )}
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full',
              progressPct >= 100 ? 'bg-emerald-500/10 text-emerald-400' :
              progressPct >= 50 ? 'bg-orange-500/10 text-orange-400' :
              'bg-zinc-800 text-zinc-500'
            )}>
              {progressPct}%
            </span>
          </div>
        </div>

        {/* Week Heatmap */}
        <div className="flex items-end gap-1.5 mb-2.5">
          {weekData.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1" title={`${day.label}: ${day.pct}% complete`}>
              <div className={cn('w-7 h-3.5 rounded-sm transition-colors',
                day.isToday ? 'ring-1 ring-orange-500/50' : '',
                day.pct === 0 ? 'bg-zinc-800' :
                day.pct < 50 ? 'bg-orange-900/60' :
                day.pct < 100 ? 'bg-orange-500/50' :
                'bg-emerald-500/70'
              )} />
              <span className="text-[9px] text-zinc-600 leading-none">{day.label}</span>
            </div>
          ))}
          <span className="ml-1 text-[10px] text-zinc-700 pb-3">7d</span>
        </div>

        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-500',
            progressPct >= 100 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-orange-500' : 'bg-zinc-600'
          )} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Sprint Timer + Call Outcomes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SprintTimer callsToday={m.calls_today} />
        <OutcomeLogger />
      </div>

      {/* Target Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TargetCard icon={Phone} label="Calls" current={m.calls_today} target={t.calls}
          onUpdateTarget={v => updateTargets.mutate({ calls: v })} />
        <TargetCard icon={Mail} label="Emails" current={m.emails_today} target={t.emails}
          onUpdateTarget={v => updateTargets.mutate({ emails: v })} />
        <TargetCard icon={Target} label="Demos" current={m.demos_booked_today} target={t.demos}
          onUpdateTarget={v => updateTargets.mutate({ demos: v })} />
        <TargetCard icon={Users} label="Leads Loaded" current={m.leads_added_today} target={t.leads}
          onUpdateTarget={v => updateTargets.mutate({ leads: v })} />
      </div>

      {/* Pace Projection */}
      {paceText && (
        <p className="text-xs text-zinc-500 px-1">{paceText}</p>
      )}

      {/* Checklist + Hot Call Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="grid grid-cols-2 gap-3">
          {CHECKLIST_GROUPS.map(group => {
            const groupDone = group.items.filter(i => checklist[i.id]).length;
            return (
              <div key={group.id} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <group.icon className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-medium text-zinc-300 truncate">{group.label}</span>
                  <span className="ml-auto text-xs text-zinc-600 flex-shrink-0">{groupDone}/{group.items.length}</span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map(item => {
                    const done = checklist[item.id];
                    return (
                      <button key={item.id} onClick={() => toggle(item.id)}
                        className={cn('w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-left transition-colors',
                          done ? 'text-zinc-600' : 'text-zinc-300 hover:bg-white/[0.03]'
                        )}>
                        <div className={cn('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                          done ? 'bg-orange-500/20 border-orange-500/30' : 'border-white/[0.10] hover:border-white/[0.20]'
                        )}>
                          {done && <Check className="w-2.5 h-2.5 text-orange-400" />}
                        </div>
                        <span className={cn('text-xs', done ? 'line-through' : '')}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <HotQueue leads={hotLeads} />
      </div>

      {/* Alerts: Pending Replies + Upcoming Demos */}
      <AlertsSection alerts={safeAlerts} />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Enriched', value: m.enriched_today },
          { label: 'Status Changes', value: m.status_changes_today },
          { label: 'Follow-ups Done', value: m.followups_completed_today },
          { label: 'Follow-ups Due', value: m.followups_due },
          { label: 'Overdue', value: m.followups_overdue, warn: m.followups_overdue > 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-zinc-900 border border-white/[0.06] rounded-xl px-4 py-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={cn('text-lg font-semibold font-data', stat.warn ? 'text-red-400' : 'text-zinc-300')}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Win of the Day */}
      <WinField />

    </div>
  );
}
