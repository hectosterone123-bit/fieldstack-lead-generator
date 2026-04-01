import { useState, useEffect, useRef } from 'react';
import {
  PhoneOutgoing, PhoneOff, Mic, MicOff, Play,
  Phone, Clock, CheckCircle2, ArrowRight,
  Loader2, UserCheck, ExternalLink, MapPin, Ban, StickyNote, SkipForward, Headphones, MessageSquare,
  Bot, Zap,
} from 'lucide-react';
import Vapi from '@vapi-ai/web';
import {
  useActiveCalls, useCallHistory, useCallQueue, useEndCall,
  useCallNextInQueue, useClearCallQueue, useSetCallQueue, useUpdateCallOutcome,
  useBulkUpdateCallOutcomes,
} from '../hooks/useCalls';
import { useUpdateLead } from '../hooks/useLeads';
import { fetchLeads, fetchTemplates, fetchSettings, takeoverCall, logActivity, whisperCall, validateLeadPhone, coachCall, previewTemplate, patchLeadStatus } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { Template, Lead, Call } from '../types';
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

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  interested: { label: 'Interested', color: 'text-emerald-400', bg: 'bg-emerald-500/[0.06]' },
  callback_requested: { label: 'Callback', color: 'text-amber-400', bg: 'bg-amber-500/[0.06]' },
  not_interested: { label: 'Not Interested', color: 'text-red-400', bg: 'bg-red-500/[0.04]' },
  no_answer: { label: 'No Answer', color: 'text-zinc-500', bg: '' },
  voicemail: { label: 'Voicemail', color: 'text-zinc-400', bg: '' },
  wrong_number: { label: 'Wrong Number', color: 'text-red-400', bg: 'bg-red-500/[0.04]' },
  transferred: { label: 'Transferred', color: 'text-blue-400', bg: 'bg-blue-500/[0.06]' },
};

export function Caller() {
  const { data: activeCalls = [] } = useActiveCalls();
  const { data: history = [], refetch: refetchHistory } = useCallHistory();
  const { data: queue = [] } = useCallQueue();
  const endCall = useEndCall();
  const callNext = useCallNextInQueue();
  const clearQueue = useClearCallQueue();
  const setQueue = useSetCallQueue();
  const updateOutcome = useUpdateCallOutcome();
  const bulkOutcome = useBulkUpdateCallOutcomes();
  const updateLead = useUpdateLead();
  const { toast } = useToast();

  const [scripts, setScripts] = useState<Template[]>([]);
  const [selectedScript, setSelectedScript] = useState<number | null>(null);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [leadSearch, setLeadSearch] = useState('');
  const [leadServiceFilter, setLeadServiceFilter] = useState('');

  const [bargedIn, setBargedIn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [takingOver, setTakingOver] = useState(false);
  const [takeoverPhone, setTakeoverPhone] = useState<string | null>(null);

  // Feature 1: Auto-advance
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const prevActiveCallRef = useRef<Call | null>(null);

  // Feature 2: Post-call outcome
  const [justCompletedCall, setJustCompletedCall] = useState<Call | null>(null);

  // Feature 5: DNC tracking (local session state for instant UI feedback)
  const [dncLeadIds, setDncLeadIds] = useState<Set<number>>(new Set());

  // Bulk outcome selection
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());

  // Recording playback
  const [playingCallId, setPlayingCallId] = useState<number | null>(null);

  // Daily call goal
  const [dailyGoal, setDailyGoal] = useState(0);

  // Whisper coaching
  const [whisperText, setWhisperText] = useState('');
  const [sendingWhisper, setSendingWhisper] = useState(false);

  // Campaign mode badge
  const [campaignActive, setCampaignActive] = useState(false);

  // Phone validation
  const [validating, setValidating] = useState(false);
  const queryClient = useQueryClient();

  // Manual caller mode
  const [callerMode, setCallerMode] = useState<'ai' | 'manual'>('ai');
  const [manualLead, setManualLead] = useState<Lead | null>(null);
  const [manualLeadSearch, setManualLeadSearch] = useState('');
  const [manualLeads, setManualLeads] = useState<Lead[]>([]);
  const [manualScriptBody, setManualScriptBody] = useState('');
  const [manualObjection, setManualObjection] = useState('');
  const [coaching, setCoaching] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [manualOutcome, setManualOutcome] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);

  // Feature 6: Call notes
  const [callNote, setCallNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Live transcript during call
  const [liveTranscript, setLiveTranscript] = useState<{ role: 'assistant' | 'user'; text: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const [isListening, setIsListening] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const activeCall = activeCalls.length > 0 ? activeCalls[0] : null;

  function decodeMulaw(encoded: Uint8Array): Float32Array {
    const pcm = new Float32Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      const u = ~encoded[i];
      const sign = u & 0x80;
      const exp = (u >> 4) & 0x07;
      const mantissa = u & 0x0F;
      let linear = ((mantissa << 3) + 132) << exp;
      linear -= 132;
      pcm[i] = (sign ? -linear : linear) / 32768;
    }
    return pcm;
  }

  function scheduleChunk(ctx: AudioContext, pcm: Float32Array) {
    const buf = ctx.createBuffer(1, pcm.length, 8000);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now + 0.1;
    src.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buf.duration;
  }

  // Initialize Vapi SDK + load settings
  useEffect(() => {
    fetchSettings().then(s => {
      setDailyGoal(parseInt(s.daily_call_goal || '0', 10) || 0);
      setCampaignActive(s.vapi_campaign_enabled === '1');
      const pubKey = s.vapi_public_key;
      if (!pubKey) return;
      const v = new Vapi(pubKey);
      v.on('call-end', () => { setBargedIn(false); setMuted(true); });
      vapiRef.current = v;
    }).catch(() => {});
    return () => {
      vapiRef.current?.stop().catch(() => {});
      wsRef.current?.close();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Reset takeover state + live transcript when active call changes
  useEffect(() => {
    setBargedIn(false);
    setMuted(true);
    setTakingOver(false);
    setTakeoverPhone(null);
    setLiveTranscript([]);
  }, [activeCall?.id]);

  // Feature 1 + 2: Detect call ended
  useEffect(() => {
    const prev = prevActiveCallRef.current;
    prevActiveCallRef.current = activeCall;

    if (prev && !activeCall) {
      // Stop listen-in WebSocket
      wsRef.current?.close();
      audioCtxRef.current?.close().catch(() => {});
      wsRef.current = null;
      audioCtxRef.current = null;
      setIsListening(false);

      // Auto-save pending note
      if (callNote.trim()) {
        logActivity(prev.lead_id, { type: 'note', title: 'Call note', description: callNote.trim() })
          .catch(() => {});
        setCallNote('');
      }

      // Show outcome buttons for just-ended call
      setJustCompletedCall(prev);
      setTimeout(() => setJustCompletedCall(c => c?.id === prev.id ? null : c), 60000);

      // Start auto-advance countdown
      if (autoAdvance && queue.length > 0) {
        setCountdown(8);
      }

      refetchHistory();
    }
  }, [activeCall]);

  // Countdown tick (Feature 1)
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      callNext.mutate();
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c !== null ? c - 1 : null), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Load call scripts
  useEffect(() => {
    fetchTemplates({ channel: 'call_script' }).then(setScripts).catch(() => {});
  }, []);

  useEffect(() => {
    if (scripts.length > 0 && !selectedScript) {
      setSelectedScript(scripts[0].id);
    }
  }, [scripts, selectedScript]);

  // Load leads for queue builder
  useEffect(() => {
    if (showAddLeads) {
      fetchLeads({ limit: 200, sort: 'heat_score', order: 'desc' }).then(r => {
        setAvailableLeads((r.leads || []).filter((l: Lead) => l.phone));
      }).catch(() => {});
    }
  }, [showAddLeads]);

  const handleStartNext = () => {
    if (!selectedScript) return;
    if (queue.length > 0) callNext.mutate();
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
    if (vapiRef.current) vapiRef.current.setMuted(next);
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

  const handleListen = () => {
    if (isListening) {
      wsRef.current?.close();
      audioCtxRef.current?.close().catch(() => {});
      wsRef.current = null;
      audioCtxRef.current = null;
      setIsListening(false);
      return;
    }
    if (!activeCall?.monitor_listen_url) return;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    nextPlayTimeRef.current = 0;
    const ws = new WebSocket(activeCall.monitor_listen_url);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.event === 'media') {
          const bytes = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0));
          scheduleChunk(audioCtx, decodeMulaw(bytes));
        }
        if (msg.event === 'transcript' && msg.transcript?.isFinal) {
          const role = msg.transcript.role === 'assistant' ? 'assistant' : 'user';
          setLiveTranscript(prev => [...prev, { role, text: msg.transcript.text }]);
        }
        if (msg.event === 'stop') { ws.close(); }
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => { setIsListening(false); };
    wsRef.current = ws;
    setIsListening(true);
  };

  const handleOutcome = (callId: number, outcome: string) => {
    updateOutcome.mutate({ callId, outcome }, {
      onSuccess: () => setJustCompletedCall(null),
    });
  };

  const handleDnc = (leadId: number, businessName: string) => {
    updateLead.mutate({ id: leadId, data: { dnc_at: new Date().toISOString() } }, {
      onSuccess: () => {
        setDncLeadIds(prev => new Set([...prev, leadId]));
        toast(`${businessName} marked as DNC`);
      },
    });
  };

  const handleSaveNote = async () => {
    if (!callNote.trim() || !activeCall) return;
    setSavingNote(true);
    try {
      await logActivity(activeCall.lead_id, { type: 'note', title: 'Call note', description: callNote.trim() });
      setCallNote('');
      toast('Note saved');
    } catch {
      toast('Failed to save note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleWhisper = async () => {
    if (!whisperText.trim() || !activeCall) return;
    setSendingWhisper(true);
    try {
      await whisperCall(activeCall.id, whisperText.trim());
      setWhisperText('');
      toast('Whisper sent to AI');
    } catch {
      toast('Failed to send whisper', 'error');
    } finally {
      setSendingWhisper(false);
    }
  };

  const handleValidateQueue = async () => {
    setValidating(true);
    let valid = 0; let invalid = 0;
    for (const item of queue) {
      try {
        const r = await validateLeadPhone(item.lead_id);
        r.phone_valid ? valid++ : invalid++;
      } catch { /* skip */ }
    }
    setValidating(false);
    toast(`Validated: ${valid} ok, ${invalid} invalid`);
    queryClient.invalidateQueries({ queryKey: ['call-queue'] });
  };

  // Reload rendered script when lead or template changes (manual mode)
  useEffect(() => {
    if (manualLead && selectedScript) {
      previewTemplate(selectedScript, manualLead.id)
        .then(p => setManualScriptBody(p.rendered_body || ''))
        .catch(() => setManualScriptBody(''));
    }
  }, [selectedScript, manualLead?.id]);

  const handleManualLeadSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setManualLeadSearch(val);
    setManualLead(null);
    setCoaching('');
    if (val.length < 2) { setManualLeads([]); return; }
    try {
      const r = await fetchLeads({ search: val, limit: 20 });
      setManualLeads((r.leads || []).filter((l: Lead) => l.phone));
    } catch { /* ignore */ }
  };

  const selectManualLead = async (lead: Lead) => {
    setManualLead(lead);
    setManualLeadSearch('');
    setManualLeads([]);
    setCoaching('');
    setManualOutcome('');
    if (selectedScript) {
      try {
        const preview = await previewTemplate(selectedScript, lead.id);
        setManualScriptBody(preview.rendered_body || '');
      } catch { setManualScriptBody(''); }
    }
  };

  const handleCoach = async (objection: string) => {
    if (!objection.trim()) return;
    setCoachLoading(true);
    setCoaching('');
    try {
      const result = await coachCall(manualLead?.id ?? null, objection, manualScriptBody || undefined);
      setCoaching(result.suggestion);
    } catch {
      toast('AI coach failed', 'error');
    } finally {
      setCoachLoading(false);
      setManualObjection('');
    }
  };

  const handleLogManualCall = async () => {
    if (!manualLead) return;
    setLoggingCall(true);
    try {
      const desc = [
        manualOutcome && `Outcome: ${OUTCOME_LABELS[manualOutcome]?.label || manualOutcome}`,
        manualNote.trim(),
      ].filter(Boolean).join('\n');
      await logActivity(manualLead.id, {
        type: 'call_attempt',
        title: `Manual call${manualOutcome ? ` — ${OUTCOME_LABELS[manualOutcome]?.label || manualOutcome}` : ''}`,
        description: desc || undefined,
      } as any);
      if (manualOutcome === 'interested') {
        await patchLeadStatus(manualLead.id, 'qualified');
      } else if (manualOutcome && !['no_answer', 'voicemail'].includes(manualOutcome)) {
        await patchLeadStatus(manualLead.id, 'contacted');
      }
      toast('Call logged');
      setManualOutcome('');
      setManualNote('');
      setCoaching('');
    } catch {
      toast('Failed to log call', 'error');
    } finally {
      setLoggingCall(false);
    }
  };

  // Call timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!activeCall || activeCall.status === 'completed') { setElapsed(0); return; }
    const start = activeCall.started_at ? new Date(activeCall.started_at).getTime() : Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [activeCall?.id, activeCall?.status]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Auto-scroll transcript box when live lines arrive
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  const totalCalls = history.length;
  const pickedUp = history.filter(c => c.outcome && !['no_answer', 'voicemail'].includes(c.outcome)).length;
  const interested = history.filter(c => c.outcome === 'interested').length;
  const callbacks = history.filter(c => c.outcome === 'callback_requested').length;

  const scriptStats = scripts.map(script => {
    const sc = history.filter(c => c.template_id === script.id);
    const t = sc.length;
    const p = sc.filter(c => c.outcome && !['no_answer', 'voicemail'].includes(c.outcome)).length;
    const i = sc.filter(c => c.outcome === 'interested').length;
    return { id: script.id, name: script.name, total: t, pickedUp: p, interested: i, pickupRate: t > 0 ? Math.round((p / t) * 100) : 0 };
  }).filter(s => s.total > 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Cold Caller</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {callerMode === 'ai' ? 'VAPI-powered AI calls with live monitoring' : 'You call — AI coaches objections in real time'}
            </p>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-800 border border-white/[0.06]">
            <button
              onClick={() => setCallerMode('ai')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                callerMode === 'ai' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Bot className="w-3.5 h-3.5" />
              AI Auto
            </button>
            <button
              onClick={() => setCallerMode('manual')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                callerMode === 'manual' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Phone className="w-3.5 h-3.5" />
              Manual + Coach
            </button>
          </div>
        </div>

        {callerMode === 'ai' && (
          <div className="flex items-center gap-3 flex-wrap">
            {dailyGoal > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-48 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', totalCalls >= dailyGoal ? 'bg-emerald-500' : 'bg-orange-500')}
                    style={{ width: `${Math.min(100, (totalCalls / dailyGoal) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-data text-zinc-400">{totalCalls}/{dailyGoal}</span>
              </div>
            )}
            {campaignActive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Campaign
              </div>
            )}
            <button
              onClick={() => { setAutoAdvance(v => !v); setCountdown(null); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                autoAdvance
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  : 'bg-zinc-800 border-white/[0.06] text-zinc-500'
              )}
            >
              <SkipForward className="w-3.5 h-3.5" />
              Auto-advance {autoAdvance ? 'on' : 'off'}
            </button>
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
        )}

        {callerMode === 'manual' && (
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
        )}
      </div>

      {/* Auto-advance countdown banner */}
      {countdown !== null && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm text-orange-300">
              Next call starting in <span className="font-data font-semibold">{countdown}s</span>…
            </span>
          </div>
          <button
            onClick={() => setCountdown(null)}
            className="text-xs text-orange-400 hover:text-orange-200 transition-colors px-2 py-1 rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Manual Caller Mode ──────────────────────────────────────────── */}
      {callerMode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lead selector + Script + Log */}
          <div className="lg:col-span-2 space-y-4">
            {/* Lead selector */}
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Select Lead</p>
              {manualLead ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{manualLead.business_name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {manualLead.phone}{manualLead.city ? ` · ${manualLead.city}, ${manualLead.state}` : ''}{manualLead.service_type ? ` · ${manualLead.service_type}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => { setManualLead(null); setManualScriptBody(''); setCoaching(''); }}
                    className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search by name or city..."
                    value={manualLeadSearch}
                    onChange={handleManualLeadSearch}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 [color-scheme:dark]"
                  />
                  {manualLeads.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.06] bg-zinc-800/50 divide-y divide-white/[0.04]">
                      {manualLeads.map(l => (
                        <button
                          key={l.id}
                          onClick={() => selectManualLead(l)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm text-zinc-200">{l.business_name}</p>
                            <p className="text-xs text-zinc-500">{l.phone}{l.city ? ` · ${l.city}` : ''}</p>
                          </div>
                          <span className="text-xs font-data text-zinc-600">{l.heat_score}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {manualLeadSearch.length >= 2 && manualLeads.length === 0 && (
                    <p className="text-xs text-zinc-600 px-1">No leads with a phone found.</p>
                  )}
                </div>
              )}
            </div>

            {/* Script panel */}
            {manualLead && (
              <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Script</p>
                {manualScriptBody ? (
                  <div className="bg-zinc-950 rounded-lg border border-white/[0.04] p-4 max-h-80 overflow-y-auto">
                    <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">{manualScriptBody}</pre>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 py-4 text-center">
                    {selectedScript ? 'Loading script...' : 'Select a script at the top to see it here.'}
                  </p>
                )}
              </div>
            )}

            {/* Log call */}
            {manualLead && (
              <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Log This Call</p>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { outcome: 'interested', label: 'Interested', cls: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20' },
                      { outcome: 'callback_requested', label: 'Callback', cls: 'border-amber-500/30 text-amber-400 hover:bg-amber-500/20' },
                      { outcome: 'voicemail', label: 'Voicemail', cls: 'border-white/[0.06] text-zinc-400 hover:bg-zinc-700' },
                      { outcome: 'no_answer', label: 'No Answer', cls: 'border-white/[0.06] text-zinc-400 hover:bg-zinc-700' },
                      { outcome: 'not_interested', label: 'Not Interested', cls: 'border-red-500/30 text-red-400 hover:bg-red-600/20' },
                    ] as const).map(({ outcome, label, cls }) => (
                      <button
                        key={outcome}
                        onClick={() => setManualOutcome(o => o === outcome ? '' : outcome)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                          cls,
                          manualOutcome === outcome ? 'ring-1 ring-offset-1 ring-offset-zinc-900' : ''
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={manualNote}
                    onChange={e => setManualNote(e.target.value)}
                    placeholder="Notes from the call..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:border-orange-500/50 [color-scheme:dark]"
                  />
                  <button
                    onClick={handleLogManualCall}
                    disabled={loggingCall}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {loggingCall ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Log Call
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: AI Coach */}
          <div className="space-y-4">
            <div className="bg-zinc-900 rounded-xl border border-orange-500/20 p-5 sticky top-6">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-orange-400">AI Coach</h2>
              </div>
              <p className="text-xs text-zinc-600 mb-4">Tap an objection — get a response to say right now</p>

              {!manualLead && (
                <p className="text-xs text-zinc-600 py-6 text-center">Select a lead to activate coaching</p>
              )}

              {manualLead && (
                <>
                  <div className="space-y-1.5 mb-4">
                    {([
                      'Not interested',
                      'I already have someone for that',
                      "We're too busy right now",
                      'Call me back in a few months',
                      'How much does it cost?',
                      'Just send me an email',
                      "We don't have the budget",
                      'Is this spam / a robot?',
                    ]).map(obj => (
                      <button
                        key={obj}
                        onClick={() => handleCoach(obj)}
                        disabled={coachLoading}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-zinc-300 bg-zinc-800/60 hover:bg-zinc-700/80 border border-white/[0.04] hover:border-orange-500/20 transition-colors disabled:opacity-40"
                      >
                        "{obj}"
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={manualObjection}
                      onChange={e => setManualObjection(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCoach(manualObjection)}
                      placeholder="Or type what they said..."
                      className="flex-1 px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-orange-500/50 [color-scheme:dark]"
                    />
                    <button
                      onClick={() => handleCoach(manualObjection)}
                      disabled={!manualObjection.trim() || coachLoading}
                      className="px-3 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-30"
                    >
                      {coachLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    </button>
                  </div>

                  {coaching && (
                    <div className="mt-4 p-4 rounded-lg bg-orange-500/[0.08] border border-orange-500/20">
                      <p className="text-[10px] font-medium text-orange-500/70 uppercase tracking-wide mb-2">Say this</p>
                      <p className="text-sm font-medium text-orange-100 leading-relaxed">{coaching}</p>
                    </div>
                  )}

                  {coachLoading && !coaching && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-zinc-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Coaching...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Caller Mode ──────────────────────────────────────────────── */}
      {callerMode === 'ai' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Call */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            {activeCall ? (
              <div className="space-y-4">
                {/* Call header */}
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
                      <p className="text-xs text-zinc-500">{activeCall.phone}{activeCall.city ? ` · ${activeCall.city}, ${activeCall.state}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{CALL_STATUS_LABELS[activeCall.status] || activeCall.status}</span>
                    <span className="text-lg font-data text-zinc-200">{formatTime(elapsed)}</span>
                  </div>
                </div>

                {/* Transcript */}
                <div ref={transcriptRef} className="bg-zinc-950 rounded-lg border border-white/[0.04] p-4 h-48 overflow-y-auto">
                  {activeCall.transcript ? (
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">
                      {typeof activeCall.transcript === 'string' ? activeCall.transcript : JSON.stringify(activeCall.transcript, null, 2)}
                    </pre>
                  ) : liveTranscript.length > 0 ? (
                    <div className="space-y-2">
                      {liveTranscript.map((line, i) => (
                        <div key={i} className="flex gap-2">
                          <span className={cn(
                            'text-[10px] font-medium uppercase tracking-wide shrink-0 w-12',
                            line.role === 'assistant' ? 'text-orange-400' : 'text-blue-400'
                          )}>
                            {line.role === 'assistant' ? 'Agent' : 'Lead'}
                          </span>
                          <span className="text-sm text-zinc-300">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                      {activeCall.status === 'in_progress' ? 'Listening for transcript…' : 'Waiting for call to connect…'}
                    </div>
                  )}
                </div>

                {/* Feature 3: Lead info panel */}
                {(activeCall.rating || activeCall.contact_count || activeCall.website || activeCall.notes) && (
                  <div className="px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-white/[0.04] space-y-1.5">
                    <div className="flex items-center gap-4 flex-wrap">
                      {activeCall.rating && (
                        <span className="text-xs text-zinc-400">
                          ★ <span className="font-data">{activeCall.rating.toFixed(1)}</span>
                          {activeCall.review_count ? <span className="text-zinc-600"> ({activeCall.review_count})</span> : null}
                        </span>
                      )}
                      {(activeCall.contact_count ?? 0) > 0 && (
                        <span className="text-xs text-zinc-500">
                          Called <span className="font-data text-zinc-400">{activeCall.contact_count}x</span> before
                        </span>
                      )}
                      {activeCall.website && (
                        <a
                          href={activeCall.website.startsWith('http') ? activeCall.website : `https://${activeCall.website}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {activeCall.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}
                      {activeCall.google_maps_url && (
                        <a
                          href={activeCall.google_maps_url}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          <MapPin className="w-3 h-3" />
                          Maps
                        </a>
                      )}
                    </div>
                    {activeCall.notes && (
                      <p className="text-xs text-zinc-600 line-clamp-2">
                        <span className="text-zinc-500">Notes: </span>{activeCall.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Feature 6: Call notes */}
                <div className="space-y-1.5">
                  <textarea
                    value={callNote}
                    onChange={e => setCallNote(e.target.value)}
                    placeholder="Quick note while listening…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:border-orange-500/50 [color-scheme:dark]"
                  />
                  {callNote.trim() && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveNote}
                        disabled={savingNote}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
                      >
                        {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
                        Save Note
                      </button>
                    </div>
                  )}
                </div>

                {/* Whisper coaching */}
                <div className="flex items-center gap-2">
                  <input
                    value={whisperText}
                    onChange={e => setWhisperText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleWhisper()}
                    placeholder="Whisper to AI (lead can't hear this)…"
                    className="flex-1 px-3 py-2 rounded-lg text-sm bg-amber-950/30 border border-amber-500/20 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/40 [color-scheme:dark]"
                  />
                  <button
                    onClick={handleWhisper}
                    disabled={!whisperText.trim() || sendingWhisper || activeCall?.status !== 'in_progress'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-30"
                  >
                    {sendingWhisper ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    Whisper
                  </button>
                </div>

                {/* Takeover banner */}
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
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleListen}
                    disabled={activeCall.status !== 'in_progress' || !activeCall.monitor_listen_url}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-30',
                      isListening
                        ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30'
                        : 'bg-zinc-800 border-white/[0.06] text-zinc-400 hover:bg-zinc-700'
                    )}
                  >
                    <Headphones className="w-4 h-4" />
                    {isListening ? 'Listening' : 'Listen In'}
                  </button>
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
            ) : justCompletedCall ? (
              /* Feature 2: Post-call outcome buttons */
              (() => {
                // Merge with live history data so AI-set fields appear as soon as they arrive
                const live = history.find(c => c.id === justCompletedCall.id) ?? justCompletedCall;
                return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{live.business_name} — How did it go?</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {live.duration_seconds != null ? `${formatTime(live.duration_seconds)} · ` : ''}
                      AI classified as: <span className="text-zinc-400">{live.outcome ? OUTCOME_LABELS[live.outcome]?.label || live.outcome : 'Unknown'}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setJustCompletedCall(null)}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
                {/* AI call report */}
                {(live.ai_next_step || live.ai_key_intel) && (
                  <div className="rounded-lg bg-zinc-800/60 border border-white/[0.05] px-3 py-3 space-y-1.5">
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">AI Report</p>
                    {live.ai_next_step && (
                      <p className="text-sm text-zinc-200">{live.ai_next_step}</p>
                    )}
                    {live.ai_key_intel && (
                      <p className="text-xs text-zinc-500">{live.ai_key_intel}</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {[
                    { outcome: 'interested', label: 'Interested', cls: 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30' },
                    { outcome: 'callback_requested', label: 'Callback', cls: 'bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30' },
                    { outcome: 'voicemail', label: 'Voicemail', cls: 'bg-zinc-800 border-white/[0.06] text-zinc-400 hover:bg-zinc-700' },
                    { outcome: 'no_answer', label: 'No Answer', cls: 'bg-zinc-800 border-white/[0.06] text-zinc-400 hover:bg-zinc-700' },
                    { outcome: 'not_interested', label: 'Not Interested', cls: 'bg-red-600/20 border-red-500/30 text-red-400 hover:bg-red-600/30' },
                  ].map(({ outcome, label, cls }) => (
                    <button
                      key={outcome}
                      onClick={() => handleOutcome(justCompletedCall.id, outcome)}
                      disabled={updateOutcome.isPending}
                      className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40', cls)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {queue.length > 0 && !countdown && (
                  <button
                    onClick={handleStartNext}
                    disabled={!selectedScript || callNext.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-30"
                  >
                    {callNext.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Start Next Call
                  </button>
                )}
              </div>
                );
              })()
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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-400">Today's Calls</h2>
                <button
                  onClick={() => {
                    if (selectedCallIds.size === history.length) setSelectedCallIds(new Set());
                    else setSelectedCallIds(new Set(history.map(c => c.id)));
                  }}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {selectedCallIds.size === history.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              {selectedCallIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-white/[0.04]">
                  <span className="text-[10px] text-zinc-500 mr-1">{selectedCallIds.size} selected:</span>
                  {(['interested', 'callback_requested', 'voicemail', 'no_answer', 'not_interested'] as const).map(outcome => {
                    const o = OUTCOME_LABELS[outcome];
                    return (
                      <button
                        key={outcome}
                        onClick={() => { bulkOutcome.mutate({ callIds: [...selectedCallIds], outcome }); setSelectedCallIds(new Set()); }}
                        disabled={bulkOutcome.isPending}
                        className={cn('px-2 py-1 rounded text-[10px] font-medium border transition-colors disabled:opacity-40', o.color, 'border-white/[0.06] bg-zinc-800/50 hover:bg-zinc-700')}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setSelectedCallIds(new Set())}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-1"
                  >
                    Clear
                  </button>
                </div>
              )}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map(call => {
                  const out = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
                  const isDnc = dncLeadIds.has(call.lead_id);
                  return (
                    <div key={call.id}>
                      <div className={cn('flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50', out?.bg, isDnc && 'opacity-40')}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedCallIds.has(call.id)}
                            onChange={e => {
                              const s = new Set(selectedCallIds);
                              e.target.checked ? s.add(call.id) : s.delete(call.id);
                              setSelectedCallIds(s);
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-orange-500 [color-scheme:dark]"
                          />
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
                          {out && <span className={cn('text-xs font-medium', out.color)}>{out.label}</span>}
                          {call.recording_url && (
                            <button
                              onClick={() => setPlayingCallId(prev => prev === call.id ? null : call.id)}
                              title={playingCallId === call.id ? 'Hide recording' : 'Play recording'}
                              className="p-1 rounded text-zinc-700 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* Feature 5: DNC button */}
                          {!isDnc && (
                            <button
                              onClick={() => handleDnc(call.lead_id, call.business_name || 'Lead')}
                              title="Mark as Do Not Call"
                              className="p-1 rounded text-zinc-700 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {playingCallId === call.id && call.recording_url && (
                        <div className="px-3 pb-2 pt-1">
                          <audio
                            controls
                            autoPlay
                            src={call.recording_url}
                            className="w-full h-8 [color-scheme:dark]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Queue + Stats */}
        <div className="space-y-4">
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
                    onClick={handleValidateQueue}
                    disabled={validating}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    {validating ? 'Validating...' : 'Validate'}
                  </button>
                )}
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
            ) : (() => {
              const activeQueue = queue.filter(item => !item.scheduled_for);
              const scheduledQueue = queue.filter(item => !!item.scheduled_for);
              return (
                <div className="max-h-72 overflow-y-auto space-y-1.5">
                  {activeQueue.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-800/40">
                      <span className="text-xs font-data text-zinc-600 w-5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 truncate">{item.business_name}</p>
                        <p className="text-[10px] text-zinc-600">{item.phone}</p>
                      </div>
                      {(item.contact_count ?? 0) > 0 && (
                        <span className="text-[10px] font-data text-amber-500/70 shrink-0">Called {item.contact_count}x</span>
                      )}
                    </div>
                  ))}
                  {scheduledQueue.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/[0.04]">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Scheduled Retries</p>
                      {scheduledQueue.map(item => (
                        <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-800/30">
                          <Clock className="w-3 h-3 text-zinc-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-400 truncate">{item.business_name}</p>
                          </div>
                          <span className="text-[10px] text-zinc-600 font-data whitespace-nowrap">
                            {item.scheduled_for
                              ? new Date(item.scheduled_for + 'Z').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                              : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {queue.length > 0 && !activeCall && !justCompletedCall && (
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
                  Pickup rate: <span className="font-data text-zinc-300">{Math.round((pickedUp / totalCalls) * 100)}%</span>
                </p>
              </div>
            )}
          </div>

          {/* Script A/B Stats */}
          {scriptStats.length > 1 && (
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">By Script</h2>
              <div className="space-y-3">
                {scriptStats.map(s => (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-400 truncate max-w-[140px]">{s.name}</p>
                      <span className="text-xs font-data text-zinc-500">{s.total} calls</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${s.pickupRate}%` }} />
                      </div>
                      <span className="text-[10px] font-data text-zinc-500 w-8 text-right">{s.pickupRate}%</span>
                    </div>
                    {s.interested > 0 && (
                      <p className="text-[10px] text-emerald-500">{s.interested} interested</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* Add Leads Modal */}
      {showAddLeads && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => { setShowAddLeads(false); setLeadSearch(''); setLeadServiceFilter(''); }}
        >
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-200">Add Leads to Queue</h3>
              <span className="text-xs text-zinc-500">{selectedLeadIds.size} selected</span>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
              <input
                type="text"
                placeholder="Search by name or city..."
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-orange-500/50 [color-scheme:dark]"
              />
              <select
                value={leadServiceFilter}
                onChange={e => setLeadServiceFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-300 [color-scheme:dark]"
              >
                <option value="">All types</option>
                <option value="hvac">HVAC</option>
                <option value="roofing">Roofing</option>
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="landscaping">Landscaping</option>
                <option value="pest_control">Pest Control</option>
                <option value="general">General</option>
              </select>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {availableLeads
                .filter(l =>
                  (!leadServiceFilter || l.service_type === leadServiceFilter) &&
                  (!leadSearch || l.business_name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.city?.toLowerCase().includes(leadSearch.toLowerCase()))
                )
                .map(lead => (
                  <label key={lead.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={e => {
                        const next = new Set(selectedLeadIds);
                        if (e.target.checked) next.add(lead.id);
                        else next.delete(lead.id);
                        setSelectedLeadIds(next);
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 [color-scheme:dark]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{lead.business_name}</p>
                      <p className="text-xs text-zinc-500">{lead.phone}{lead.city ? ` · ${lead.city}` : ''}{lead.service_type ? ` · ${lead.service_type}` : ''}</p>
                    </div>
                    <span className="text-xs font-data text-zinc-600">{lead.heat_score}</span>
                  </label>
                ))}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAddLeads(false); setLeadSearch(''); setLeadServiceFilter(''); }}
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
