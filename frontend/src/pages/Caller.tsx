import { useState, useEffect, useRef } from 'react';
import {
  PhoneOutgoing, PhoneOff, Mic, MicOff, Play,
  Phone, Clock, CheckCircle2, ArrowRight,
  Loader2, UserCheck,
} from 'lucide-react';
import Vapi from '@vapi-ai/web';
import { useActiveCalls, useCallHistory, useCallQueue, useEndCall, useCallNextInQueue, useClearCallQueue, useSetCallQueue } from '../hooks/useCalls';
import { fetchLeads, fetchTemplates, fetchSettings, takeoverCall } from '../lib/api';
import type { Template, Lead } from '../types';
import { cn } from '../lib/utils';
import { useToast } from '../lib/toast';

const CALL_STATUS_LABELS: Record<string, string> = {
  queued: 'Dialing...',
  ringing: 'Ringing...',
  in_progress: 'Connected',
  completed: 'Completed',
  failed: 'Failed',
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  interested: { label: 'Interested', color: 'text-emerald-400' },
  callback_requested: { label: 'Callback', color: 'text-amber-400' },
  not_interested: { label: 'Not Interested', color: 'text-red-400' },
  no_answer: { label: 'No Answer', color: 'text-zinc-500' },
  voicemail: { label: 'Voicemail', color: 'text-zinc-400' },
  wrong_number: { label: 'Wrong Number', color: 'text-red-400' },
  transferred: { label: 'Transferred', color: 'text-blue-400' },
};

export function Caller() {
  const { data: activeCalls = [] } = useActiveCalls();
  const { data: history = [] } = useCallHistory();
  const { data: queue = [] } = useCallQueue();
  const endCall = useEndCall();
  const callNext = useCallNextInQueue();
  const clearQueue = useClearCallQueue();
  const setQueue = useSetCallQueue();
  const { toast } = useToast();

  const [scripts, setScripts] = useState<Template[]>([]);
  const [selectedScript, setSelectedScript] = useState<number | null>(null);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bargedIn, setBargedIn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [takingOver, setTakingOver] = useState(false);
  const [takeoverPhone, setTakeoverPhone] = useState<string | null>(null);

  const vapiRef = useRef<Vapi | null>(null);

  const activeCall = activeCalls.length > 0 ? activeCalls[0] : null;

  // Initialize Vapi SDK with public key from settings
  useEffect(() => {
    fetchSettings().then(s => {
      const pubKey = s.vapi_public_key;
      if (!pubKey) return;
      const v = new Vapi(pubKey);
      v.on('call-end', () => {
        setBargedIn(false);
        setMuted(true);
      });
      vapiRef.current = v;
    }).catch(() => {});
    return () => {
      vapiRef.current?.stop().catch(() => {});
    };
  }, []);

  // Reset takeover state when active call changes
  useEffect(() => {
    setBargedIn(false);
    setMuted(true);
    setTakingOver(false);
    setTakeoverPhone(null);
  }, [activeCall?.id]);

  // Load call scripts
  useEffect(() => {
    fetchTemplates({ channel: 'call_script' }).then(setScripts).catch(() => {});
  }, []);

  // Set default script
  useEffect(() => {
    if (scripts.length > 0 && !selectedScript) {
      setSelectedScript(scripts[0].id);
    }
  }, [scripts, selectedScript]);

  // Load leads for queue builder
  useEffect(() => {
    if (showAddLeads) {
      fetchLeads({ limit: 50, sort: 'heat_score', order: 'desc' }).then(r => {
        setAvailableLeads((r.leads || []).filter((l: Lead) => l.phone));
      }).catch(() => {});
    }
  }, [showAddLeads]);

  const handleStartNext = () => {
    if (!selectedScript) return;
    if (queue.length > 0) {
      callNext.mutate();
    }
  };

  const handleAddToQueue = () => {
    if (selectedLeadIds.size === 0 || !selectedScript) return;
    setQueue.mutate(
      { leadIds: Array.from(selectedLeadIds), templateId: selectedScript },
      { onSuccess: () => { setShowAddLeads(false); setSelectedLeadIds(new Set()); } }
    );
  };

  const handleJumpIn = async () => {
    if (!activeCall) return;
    setTakingOver(true);
    try {
      const result = await takeoverCall(activeCall.id);
      setTakeoverPhone(result.contractor_phone);
      setBargedIn(true);
      setMuted(false);
      if (result.control_available) {
        toast('Transfer initiated — call will route to your fallback phone');
      } else {
        toast('Call your fallback phone to speak with the contractor directly');
      }
    } catch {
      toast('Failed to initiate takeover', 'error');
    } finally {
      setTakingOver(false);
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    if (vapiRef.current) {
      vapiRef.current.setMuted(next);
    }
    setMuted(next);
  };

  const handleEndCall = () => {
    if (activeCall) {
      endCall.mutate(activeCall.id);
      setBargedIn(false);
      setMuted(true);
      setTakeoverPhone(null);
    }
  };

  // Call timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!activeCall || activeCall.status === 'completed') {
      setElapsed(0);
      return;
    }
    const start = activeCall.started_at ? new Date(activeCall.started_at).getTime() : Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall?.id, activeCall?.status]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Stats from today's history
  const totalCalls = history.length;
  const pickedUp = history.filter(c => c.outcome && !['no_answer', 'voicemail'].includes(c.outcome)).length;
  const interested = history.filter(c => c.outcome === 'interested').length;
  const callbacks = history.filter(c => c.outcome === 'callback_requested').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">AI Cold Caller</h1>
          <p className="text-sm text-zinc-500 mt-0.5">VAPI-powered outbound calls with live monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Script selector */}
          <select
            value={selectedScript || ''}
            onChange={e => setSelectedScript(Number(e.target.value))}
            className="px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 [color-scheme:dark]"
          >
            <option value="">Select Script</option>
            {scripts.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="px-3 py-1.5 rounded-full bg-zinc-800 border border-white/[0.06] text-xs font-data text-zinc-400">
            Queue: {queue.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Call */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Call Card */}
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            {activeCall ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      activeCall.status === 'in_progress' ? 'bg-emerald-400 animate-pulse' :
                      activeCall.status === 'ringing' || activeCall.status === 'queued' ? 'bg-amber-400 animate-pulse' :
                      'bg-zinc-600'
                    )} />
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{activeCall.business_name || 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{activeCall.phone} {activeCall.city ? `- ${activeCall.city}, ${activeCall.state}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{CALL_STATUS_LABELS[activeCall.status] || activeCall.status}</span>
                    <span className="text-lg font-data text-zinc-200">{formatTime(elapsed)}</span>
                  </div>
                </div>

                {/* Transcript area */}
                <div className="bg-zinc-950 rounded-lg border border-white/[0.04] p-4 h-64 overflow-y-auto">
                  {activeCall.transcript ? (
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">
                      {typeof activeCall.transcript === 'string' ? activeCall.transcript : JSON.stringify(activeCall.transcript, null, 2)}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                      {activeCall.status === 'in_progress'
                        ? 'Transcript will appear after call ends...'
                        : 'Waiting for call to connect...'}
                    </div>
                  )}
                </div>

                {/* Takeover phone banner */}
                {takeoverPhone && (
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/20">
                    <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-emerald-300">Transfer initiated — call them directly:</p>
                      <p className="text-sm font-data font-medium text-emerald-200">{takeoverPhone}</p>
                    </div>
                  </div>
                )}

                {/* Call actions */}
                <div className="flex items-center gap-3">
                  {!bargedIn ? (
                    <button
                      onClick={handleJumpIn}
                      disabled={activeCall.status !== 'in_progress' || takingOver}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-30"
                    >
                      {takingOver ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      Jump In
                    </button>
                  ) : (
                    <button
                      onClick={handleToggleMute}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        muted ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      )}
                    >
                      {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      {muted ? 'Muted' : 'Live'}
                    </button>
                  )}
                  <button
                    onClick={handleEndCall}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                  >
                    <PhoneOff className="w-4 h-4" />
                    End Call
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PhoneOutgoing className="w-10 h-10 text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-500 mb-4">No active call</p>
                <button
                  onClick={handleStartNext}
                  disabled={queue.length === 0 || !selectedScript || callNext.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-30"
                >
                  {callNext.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Start Next Call
                </button>
              </div>
            )}
          </div>

          {/* Recent Calls */}
          {history.length > 0 && (
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Today's Calls</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map(call => {
                  const out = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
                  return (
                    <div key={call.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50">
                      <div className="flex items-center gap-3">
                        <Phone className="w-3.5 h-3.5 text-zinc-600" />
                        <div>
                          <p className="text-sm text-zinc-200">{call.business_name}</p>
                          <p className="text-xs text-zinc-500">{call.phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {call.duration_seconds != null && (
                          <span className="text-xs font-data text-zinc-500">{formatTime(call.duration_seconds)}</span>
                        )}
                        {out && (
                          <span className={cn('text-xs font-medium', out.color)}>{out.label}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Queue + Stats */}
        <div className="space-y-4">
          {/* Call Queue */}
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-zinc-400">Call Queue</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddLeads(true)}
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  + Add Leads
                </button>
                {queue.length > 0 && (
                  <button
                    onClick={() => clearQueue.mutate()}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {queue.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-6">No leads in queue. Add leads to start calling.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {queue.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-800/40">
                    <span className="text-xs font-data text-zinc-600 w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 truncate">{item.business_name}</p>
                      <p className="text-[10px] text-zinc-600">{item.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {queue.length > 0 && !activeCall && (
              <button
                onClick={handleStartNext}
                disabled={!selectedScript || callNext.isPending}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-30"
              >
                <ArrowRight className="w-4 h-4" />
                Start Next Call
              </button>
            )}
          </div>

          {/* Today's Stats */}
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Today</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatPill icon={Phone} label="Calls" value={totalCalls} color="text-zinc-200" />
              <StatPill icon={CheckCircle2} label="Picked Up" value={pickedUp} color="text-emerald-400" />
              <StatPill icon={ArrowRight} label="Interested" value={interested} color="text-orange-400" />
              <StatPill icon={Clock} label="Callbacks" value={callbacks} color="text-amber-400" />
            </div>
            {totalCalls > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.04]">
                <p className="text-xs text-zinc-500">
                  Pickup rate: <span className="font-data text-zinc-300">{totalCalls > 0 ? Math.round((pickedUp / totalCalls) * 100) : 0}%</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Leads Modal */}
      {showAddLeads && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddLeads(false)}>
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-200">Add Leads to Queue</h3>
              <span className="text-xs text-zinc-500">{selectedLeadIds.size} selected</span>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {availableLeads.map(lead => (
                <label key={lead.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.has(lead.id)}
                    onChange={(e) => {
                      const next = new Set(selectedLeadIds);
                      if (e.target.checked) next.add(lead.id);
                      else next.delete(lead.id);
                      setSelectedLeadIds(next);
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 [color-scheme:dark]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{lead.business_name}</p>
                    <p className="text-xs text-zinc-500">{lead.phone} {lead.city ? `- ${lead.city}` : ''}</p>
                  </div>
                  <span className="text-xs font-data text-zinc-600">{lead.heat_score}</span>
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddLeads(false)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToQueue}
                disabled={selectedLeadIds.size === 0 || !selectedScript}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-30"
              >
                Add {selectedLeadIds.size} to Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50">
      <Icon className="w-3.5 h-3.5 text-zinc-600" />
      <div>
        <p className={cn('text-sm font-data font-medium', color)}>{value}</p>
        <p className="text-[10px] text-zinc-600">{label}</p>
      </div>
    </div>
  );
}
