import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PhoneOutgoing, PhoneOff, Mic, MicOff, Play,
  Phone, Clock, CheckCircle2, ArrowRight,
  Loader2, UserCheck, ExternalLink, MapPin, Ban, StickyNote, SkipForward, Headphones, MessageSquare,
  Bot, Zap, X, Square, Brain, Search, Shield, Mail,
  ShieldAlert, UserPlus, RefreshCw, Smartphone, Flame, Sparkles, PhoneIncoming, Star, ChevronDown,
} from 'lucide-react';
import Vapi from '@vapi-ai/web';
import {
  useActiveCalls, useCallHistory, useCallQueue, useEndCall,
  useCallNextInQueue, useClearCallQueue, useSetCallQueue, useUpdateCallOutcome,
  useBulkUpdateCallOutcomes, useAutoLoadQueue, useTemplateStats,
} from '../hooks/useCalls';
import { useSequences, useEnrollLeads } from '../hooks/useSequences';
import { useUpdateLead } from '../hooks/useLeads';
import { useSendSms } from '../hooks/useSms';
import { fetchLeads, fetchLead, fetchTemplates, fetchSettings, takeoverCall, logActivity, whisperCall, validateLeadPhone, coachCall, previewTemplate, patchLeadStatus, sendOutcomeSms, scheduleCallback, logManualCall, uploadVoiceNote, enrichLead, quickEmail, fetchRepliedLeads, fetchCallPrep } from '../lib/api';
import type { CallPrep } from '../lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { getMorningStatus } from '../lib/api';
import type { Template, Lead, Call } from '../types';
import { cn, formatRelativeTime, getCallWindow } from '../lib/utils';
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
  gatekeeper: { label: 'Gatekeeper', color: 'text-violet-400', bg: 'bg-violet-500/[0.06]' },
  not_a_fit: { label: 'Not a Fit', color: 'text-zinc-400', bg: 'bg-zinc-800/60' },
};

function CallDot({ state }: { state?: string | null }) {
  const w = getCallWindow(state);
  return (
    <span
      title={w === 'prime' ? 'Prime calling time' : w === 'ok' ? 'OK to call' : 'Outside call hours'}
      className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', {
        'bg-emerald-400': w === 'prime',
        'bg-amber-400': w === 'ok',
        'bg-zinc-600': w === 'off',
      })}
    />
  );
}

export function Caller() {
  const { data: activeCalls = [] } = useActiveCalls();
  const { data: history = [], refetch: refetchHistory } = useCallHistory();
  const { data: queue = [], isLoading: queueLoading } = useCallQueue();
  const endCall = useEndCall();
  const callNext = useCallNextInQueue();
  const clearQueue = useClearCallQueue();
  const setQueue = useSetCallQueue();
  const autoLoadQueue = useAutoLoadQueue();
  const updateOutcome = useUpdateCallOutcome();
  const bulkOutcome = useBulkUpdateCallOutcomes();
  const updateLead = useUpdateLead();
  const { toast } = useToast();
  const { data: templateStatsData = [] } = useTemplateStats();

  // Transform template stats into UI format
  const scriptStats = templateStatsData.map((stat: any) => ({
    id: stat.template_id,
    name: stat.template_name || 'Unknown Script',
    total: stat.total,
    pickupRate: stat.conversion_rate || 0,
    interested: stat.interested || 0,
  }));

  const [scripts, setScripts] = useState<Template[]>([]);
  const [selectedScript, setSelectedScript] = useState<number | null>(null);
  const [showAddLeads, setShowAddLeads] = useState(false);
  const [showManualLeadBrowser, setShowManualLeadBrowser] = useState(false);
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
  const prevQueueLenRef = useRef(0);

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
  const [callPrep, setCallPrep] = useState<CallPrep | null>(null);
  const [callPrepLoading, setCallPrepLoading] = useState(false);
  const [callPrepFailed, setCallPrepFailed] = useState(false);
  const [manualLeadSearch, setManualLeadSearch] = useState('');
  const [manualLeads, setManualLeads] = useState<Lead[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [manualScriptBody, setManualScriptBody] = useState('');
  const [manualObjection, setManualObjection] = useState('');
  const [coaching, setCoaching] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiObjection, setAiObjection] = useState('');
  const [aiCoachSuggestion, setAiCoachSuggestion] = useState('');
  const [aiCoachLoading, setAiCoachLoading] = useState(false);
  const [manualOutcome, setManualOutcome] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);

  // Manual mode: Lead queue
  const [queueView, setQueueView] = useState<any[]>([]);
  const [selectedQueueIndex, setSelectedQueueIndex] = useState<number>(0);
  const [manualCountdown, setManualCountdown] = useState<number | null>(null);
  const [autoAdvanceManual, setAutoAdvanceManual] = useState(true);
  const [queueCallView, setQueueCallView] = useState(true);

  // Owner name lookup
  const [lookingUpOwner, setLookingUpOwner] = useState(false);
  const [repliedLeadIds, setRepliedLeadIds] = useState<Set<number>>(new Set());

  // Post-call email composer
  const [bookingLink, setBookingLink] = useState('');
  const [postCallEmail, setPostCallEmail] = useState<{
    type: 'voicemail' | 'demo';
    subject: string;
    body: string;
    leadId: number;
    leadEmail: string | null | undefined;
  } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Text Instead (gatekeeper bypass SMS)
  const [textInsteadLeadId, setTextInsteadLeadId] = useState<number | null>(null);
  const [textInsteadBody, setTextInsteadBody] = useState('');
  const sendSmsMutation = useSendSms();

  function openTextInstead(lead: { id: number; business_name: string; first_name?: string | null }) {
    const name = (lead.first_name || '').trim() || lead.business_name;
    setTextInsteadBody(`Hey ${name}, this is Hector — quick question about ${lead.business_name}'s lead follow-up. Worth 2 min?`);
    setTextInsteadLeadId(lead.id);
  }

  // Phase 7: Batch Mode
  const [showBatchStart, setShowBatchStart] = useState(false);
  const [batchTarget, setBatchTarget] = useState<number | null>(null);
  const [batchTargetInput, setBatchTargetInput] = useState('40');
  const [batchServiceFilter, setBatchServiceFilter] = useState('');
  const [morningBannerDismissed, setMorningBannerDismissed] = useState(false);
  const { data: morningStatus } = useQuery({
    queryKey: ['morning-status'],
    queryFn: getMorningStatus,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Phase 4: Auto-SMS toggle + Phase 9: Callback scheduling
  const [autoSmsEnabled, setAutoSmsEnabled] = useState(false);
  const [callbackModal, setCallbackModal] = useState<{ leadId: number; leadName: string } | null>(null);
  const [callbackDatetime, setCallbackDatetime] = useState('');
  const [schedulingCallback, setSchedulingCallback] = useState(false);

  // Voice notes
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');

  // Floating widget
  const [widgetExpanded, setWidgetExpanded] = useState(false);

  // Pitch Pivot
  const [activePivot, setActivePivot] = useState<string | null>(null);

  // Speed Mode + Session stats (Phase 2 + 5)
  const [speedMode, setSpeedMode] = useState(false);
  const [manualCallStartTime, setManualCallStartTime] = useState<number | null>(null);
  const [manualElapsed, setManualElapsed] = useState(0);
  const [sessionStartTime] = useState<number>(Date.now());
  const [sessionCallCount, setSessionCallCount] = useState(0);
  const [sessionPickupCount, setSessionPickupCount] = useState(0);
  const [sessionCallbackCount, setSessionCallbackCount] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [streak, setStreak] = useState(0);

  // Enroll in sequence popup (after Interested outcome)
  const [enrollModal, setEnrollModal] = useState<{ leadId: number; leadName: string } | null>(null);
  const [enrollSeqId, setEnrollSeqId] = useState<number | ''>('');
  const { data: sequences = [] } = useSequences();
  const enrollMutation = useEnrollLeads();

  // Feature 6: Call notes
  const [callNote, setCallNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Live transcript during call
  const [liveTranscript, setLiveTranscript] = useState<{ role: 'assistant' | 'user'; text: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isListening, setIsListening] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const activeCall = activeCalls.length > 0 ? activeCalls[0] : null;
  const [searchParams] = useSearchParams();

  // Prior voicemail/no-answer count for current lead (for banner)
  const priorMissedCalls = useMemo(
    () => !manualLead ? 0 : history.filter(
      c => c.lead_id === manualLead.id && ['voicemail', 'no_answer'].includes(c.outcome ?? '')
    ).length,
    [history, manualLead?.id]
  );

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

  // Fetch AI call prep brief when a lead is selected
  useEffect(() => {
    if (!manualLead) { setCallPrep(null); setCallPrepFailed(false); return; }
    setCallPrepLoading(true);
    setCallPrep(null);
    setCallPrepFailed(false);
    fetchCallPrep(manualLead.id)
      .then(setCallPrep)
      .catch(() => setCallPrepFailed(true))
      .finally(() => setCallPrepLoading(false));
  }, [manualLead?.id]);

  // Initialize Vapi SDK + load settings
  useEffect(() => {
    fetchRepliedLeads().then(leads => {
      setRepliedLeadIds(new Set(leads.map(l => l.id)));
    }).catch(() => {});
    fetchSettings().then(s => {
      setDailyGoal(parseInt(s.daily_call_goal || '0', 10) || 0);
      setCampaignActive(s.vapi_campaign_enabled === '1');
      setBookingLink(s.booking_link || '');
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

  // Reset takeover state + live transcript + coach when active call changes
  useEffect(() => {
    setBargedIn(false);
    setMuted(true);
    setTakingOver(false);
    setTakeoverPhone(null);
    setLiveTranscript([]);
    setAiObjection('');
    setAiCoachSuggestion('');
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

  const handleAiCoach = async () => {
    if (!aiObjection.trim() || !activeCall?.lead_id) return;
    setAiCoachLoading(true);
    try {
      const result = await coachCall(activeCall.lead_id, aiObjection, '');
      setAiCoachSuggestion(result.suggestion);
    } catch {
      toast('Coach failed', 'error');
    } finally {
      setAiCoachLoading(false);
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

  const handleManualLeadSearchFocus = async () => {
    setSearchFocused(true);
    if (recentLeads.length > 0) return;
    try {
      const r = await fetchLeads({ limit: 40, sort: 'last_contacted_at', order: 'desc' });
      setRecentLeads((r.leads || []).filter((l: Lead) => l.phone));
    } catch { /* ignore */ }
  };

  const handleManualLeadSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setManualLeadSearch(val);
    setManualLead(null);
    setCoaching('');
    if (val.length < 2) { setManualLeads([]); return; }
    // Filter client-side first (instant)
    const q = val.toLowerCase();
    const local = recentLeads.filter(l =>
      l.business_name?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.phone?.includes(q)
    );
    setManualLeads(local);
    // Also fetch from API in case lead isn't in recent list
    try {
      const r = await fetchLeads({ search: val, limit: 20 });
      const remote = (r.leads || []).filter((l: Lead) => l.phone);
      // Merge: remote first, deduplicate by id
      const seen = new Set(local.map((l: Lead) => l.id));
      setManualLeads([...local, ...remote.filter((l: Lead) => !seen.has(l.id))]);
    } catch { /* ignore */ }
  };

  const selectManualLead = async (lead: Lead) => {
    setManualLead(lead);
    setPostCallEmail(null);
    setManualLeadSearch('');
    setManualLeads([]);
    setSearchFocused(false);
    setCoaching('');
    setManualOutcome('');
    setWidgetExpanded(false);
    setVoiceNote('');
    setManualCallStartTime(Date.now());
    if (selectedScript) {
      try {
        const preview = await previewTemplate(selectedScript, lead.id);
        setManualScriptBody(preview.rendered_body || '');
      } catch { setManualScriptBody(''); }
    }
    // Auto-lookup owner name in background if missing and website exists
    if (!lead.owner_name && lead.website) {
      setLookingUpOwner(true);
      enrichLead(lead.id)
        .then(updated => {
          if (updated.owner_name) {
            setManualLead(prev => prev?.id === lead.id ? { ...prev, owner_name: updated.owner_name } : prev);
          }
        })
        .catch(() => {})
        .finally(() => setLookingUpOwner(false));
    }
  };

  // Pre-load a specific lead when navigating from /callbacks?lead_id=X
  useEffect(() => {
    const preloadId = searchParams.get('lead_id');
    if (!preloadId) return;
    fetchLead(Number(preloadId)).then(lead => {
      if (lead) {
        setCallerMode('manual');
        selectManualLead(lead);
      }
    }).catch(() => {});
  }, []); // mount-only

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

  const selectQueueLead = async (queueItem: any, index: number) => {
    setSelectedQueueIndex(index);
    setManualCountdown(null); // Cancel any pending countdown
    setQueueCallView(true); // always show phone card when navigating queue
    try {
      const fullLead = await fetchLead(queueItem.lead_id);
      if (fullLead) {
        await selectManualLead(fullLead);
      }
    } catch { /* ignore */ }
  };

  const skipQueueLead = () => {
    if (queueView.length > selectedQueueIndex + 1) {
      selectQueueLead(queueView[selectedQueueIndex + 1], selectedQueueIndex + 1);
    }
  };

  const handleLogManualCall = async (outcomeOverride?: string) => {
    if (!manualLead) return;
    const outcome = outcomeOverride ?? manualOutcome;
    const loggedLeadId = manualLead.id;
    const loggedLeadName = manualLead.business_name;
    const loggedLeadEmail = manualLead.email;
    const loggedLeadFirstName = manualLead.first_name;
    const loggedLeadServiceType = (manualLead as any).service_type as string | undefined;
    setLoggingCall(true);
    try {
      // Log to calls table (for cockpit stats + history) — fire and forget, but invalidate cache on success
      logManualCall(loggedLeadId, outcome || undefined, manualElapsed > 0 ? manualElapsed : undefined, selectedScript || undefined)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['call-history'] });
          queryClient.invalidateQueries({ queryKey: ['cockpit'] });
        })
        .catch(() => {});

      const desc = [
        outcome && `Outcome: ${OUTCOME_LABELS[outcome]?.label || outcome}`,
        manualNote.trim(),
      ].filter(Boolean).join('\n');
      await logActivity(loggedLeadId, {
        type: 'call_attempt',
        title: `Manual call${outcome ? ` — ${OUTCOME_LABELS[outcome]?.label || outcome}` : ''}`,
        description: desc || undefined,
      } as any);
      if (outcome === 'not_a_fit') {
        await patchLeadStatus(loggedLeadId, 'lost');
        await new Promise<void>((resolve) => updateLead.mutate({ id: loggedLeadId, data: { dnc_at: new Date().toISOString() } }, { onSuccess: () => resolve(), onError: () => resolve() }));
        toast('Lead removed from pipeline');
        setManualOutcome('');
        setManualNote('');
        setCoaching('');
        setManualLead(null);
        setManualCallStartTime(null);
        setLoggingCall(false);
        return;
      }
      if (outcome === 'interested') {
        await patchLeadStatus(loggedLeadId, 'qualified');
      } else if (outcome && !['no_answer', 'voicemail'].includes(outcome)) {
        await patchLeadStatus(loggedLeadId, 'contacted');
      }
      toast('Call logged');
      setManualOutcome('');
      setManualNote('');
      setCoaching('');
      setManualLead(null);
      setManualCallStartTime(null);

      // Post-call email composer
      if (outcome === 'voicemail' || outcome === 'no_answer') {
        const name = loggedLeadFirstName?.trim() || loggedLeadName;
        setPostCallEmail({
          type: 'voicemail',
          leadId: loggedLeadId,
          leadEmail: loggedLeadEmail,
          subject: `Quick note for ${loggedLeadName}`,
          body: `Hey ${name},\n\nJust tried calling and got voicemail. I'll be brief — I help ${loggedLeadServiceType || 'contractors'} in your area stop losing website leads when they can't answer fast enough.\n\nIf you've got 10 minutes this week, here's a link to grab a slot:\n${bookingLink || '[add your booking link in Settings]'}\n\nNo pressure either way.\n\nHector`,
        });
      } else if (outcome === 'interested') {
        const name = loggedLeadFirstName?.trim() || loggedLeadName;
        setPostCallEmail({
          type: 'demo',
          leadId: loggedLeadId,
          leadEmail: loggedLeadEmail,
          subject: `Here's that link — ${loggedLeadName}`,
          body: `Hey ${name},\n\nGreat talking with you! As promised, here's the link to book our 10-minute demo:\n\n${bookingLink || '[add your booking link in Settings]'}\n\nLooking forward to showing you how Sam works for ${loggedLeadName}.\n\nHector`,
        });
      }

      // Session stats (Phase 5)
      setSessionCallCount(n => n + 1);
      const isPickup = ['interested', 'callback_requested', 'not_interested', 'transferred'].includes(outcome);
      if (isPickup) setSessionPickupCount(n => n + 1);
      if (outcome === 'callback_requested') setSessionCallbackCount(n => n + 1);
      if (outcome === 'interested') setStreak(n => n + 1);
      else setStreak(0);

      // Detect last lead in queue for session summary
      if (!queueView[selectedQueueIndex + 1]) setSessionDone(true);

      // Phase 4: Auto-SMS on outcome
      if (autoSmsEnabled && outcome && ['interested', 'callback_requested', 'voicemail', 'no_answer', 'not_interested'].includes(outcome)) {
        sendOutcomeSms(loggedLeadId, outcome).catch(() => {});
      }

      // Phase 9: Callback scheduling
      if (outcome === 'callback_requested') {
        setCallbackModal({ leadId: loggedLeadId, leadName: loggedLeadName });
      }

      // Show enroll popup for interested leads (defers auto-advance)
      if (outcome === 'interested') {
        setEnrollModal({ leadId: loggedLeadId, leadName: loggedLeadName });
        return;
      }

      // Auto-advance to next queue lead
      if (autoAdvanceManual && queueView.length > selectedQueueIndex + 1) {
        setManualCountdown(6);
      }
    } catch {
      toast('Failed to log call', 'error');
    } finally {
      setLoggingCall(false);
    }
  };

  // Enroll & continue after Interested outcome
  function handleEnrollAndContinue(skip = false) {
    if (!enrollModal) return;
    if (!skip && enrollSeqId !== '') {
      enrollMutation.mutate({ lead_ids: [enrollModal.leadId], sequence_id: Number(enrollSeqId) });
    }
    setEnrollModal(null);
    setEnrollSeqId('');
    if (autoAdvanceManual && queueView.length > selectedQueueIndex + 1) {
      setManualCountdown(6);
    }
  }

  // Call timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!activeCall || activeCall.status === 'completed') { setElapsed(0); return; }
    const start = activeCall.started_at ? new Date(activeCall.started_at).getTime() : Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [activeCall?.id, activeCall?.status]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Manual mode: Auto-advance countdown
  useEffect(() => {
    if (manualCountdown === null) return;
    if (manualCountdown === 0) {
      const nextQueueItem = queueView[selectedQueueIndex + 1];
      if (nextQueueItem) {
        selectQueueLead(nextQueueItem, selectedQueueIndex + 1);
      }
      setManualCountdown(null);
      return;
    }
    const t = setTimeout(() => setManualCountdown(c => c !== null ? c - 1 : null), 1000);
    return () => clearTimeout(t);
  }, [manualCountdown, queueView, selectedQueueIndex]);

  // Manual call elapsed timer
  useEffect(() => {
    if (!manualCallStartTime) { setManualElapsed(0); return; }
    const timer = setInterval(() => setManualElapsed(Math.floor((Date.now() - manualCallStartTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [manualCallStartTime]);

  // Speed Mode keyboard shortcuts
  useEffect(() => {
    if (!speedMode || callerMode !== 'manual' || !manualLead || loggingCall) return;
    const KEYMAP: Record<string, string> = {
      '1': 'interested',
      '2': 'callback_requested',
      '3': 'no_answer',
      '4': 'voicemail',
      '5': 'gatekeeper',
      '6': 'not_interested',
      '7': 'not_a_fit',
    };
    const handler = (e: KeyboardEvent) => {
      // Don't fire if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Escape') { setManualCountdown(null); return; }
      const outcome = KEYMAP[e.key];
      if (outcome) handleLogManualCall(outcome);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [speedMode, callerMode, manualLead, loggingCall]);

  // Sync queue data from call-queue query — always, regardless of mode, so queue persists across navigation
  useEffect(() => {
    if (queue.length > 0) {
      if (prevQueueLenRef.current === 0) {
        setSelectedQueueIndex(0); // only reset index on initial load
        setSessionDone(false);    // fresh batch arrived — dismiss session complete card
      }
      prevQueueLenRef.current = queue.length;
      setQueueView(queue.slice(0, 10));
      // NOTE: do NOT clear manualLead here — queue refetches every 3s and would wipe the selection
    }
  }, [queue]);

  // Auto-load queue when entering manual mode — only if queue is genuinely empty (not mid-fetch)
  useEffect(() => {
    if (callerMode === 'manual' && selectedScript && !queueLoading && queue.length === 0 && queueView.length === 0) {
      autoLoadQueue.mutate(
        { serviceType: undefined, count: 10, templateId: selectedScript },
        { onError: () => toast('Could not load queue — check settings', 'error') }
      );
    }
  }, [callerMode, selectedScript, queue, queueLoading]);

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

  const handleStartBatch = async () => {
    if (!selectedScript) return;
    const target = Math.max(1, parseInt(batchTargetInput) || 40);
    setBatchTarget(target);
    setShowBatchStart(false);
    setSessionCallCount(0);
    setSessionPickupCount(0);
    setStreak(0);
    autoLoadQueue.mutate({ serviceType: batchServiceFilter || undefined, count: Math.min(target, 100), templateId: selectedScript });
  };

  const handleScheduleCallback = async () => {
    if (!callbackModal || !callbackDatetime) return;
    setSchedulingCallback(true);
    try {
      await scheduleCallback(callbackModal.leadId, callbackDatetime);
      toast(`Callback scheduled for ${callbackModal.leadName}`);
      setCallbackModal(null);
      setCallbackDatetime('');
    } catch {
      toast('Failed to schedule callback', 'error');
    } finally {
      setSchedulingCallback(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      // Auto-stop after 30s
      setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') handleStopRecording(); }, 30000);
    } catch {
      toast('Microphone access denied', 'error');
    }
  };

  const handleStopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    setRecording(false);
    setTranscribing(true);
    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        // Convert to base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
            if (!manualLead) { setTranscribing(false); return; }
            const { transcription } = await uploadVoiceNote(manualLead.id, base64, mimeType);
            setVoiceNote(transcription);
            setManualNote(transcription);
            toast('Voice note transcribed');
          } catch {
            toast('Transcription failed', 'error');
          } finally {
            setTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        setTranscribing(false);
        toast('Recording error', 'error');
      }
      // Stop mic tracks
      recorder.stream.getTracks().forEach(t => t.stop());
    };
    recorder.stop();
  };

  // Pitch Pivot — services config
  const PIVOT_SERVICES = [
    {
      id: 'sam_ai',
      label: 'Sam AI',
      icon: Bot,
      signal: (l: any) => !!l.has_website,
      badge: () => 'has website',
      color: 'text-orange-400',
      bg: 'bg-orange-500/[0.06] border-orange-500/20',
      transition: 'Quick question — when someone fills your contact form, who follows up with them?',
      points: [
        'Texts every new lead back in under 60 seconds — even at midnight',
        'Works 24/7 so you never lose a hot lead on a job site',
        'Books appointments automatically, no back-and-forth',
      ],
      close: 'We can set this up this week — 5 booked quotes guaranteed or you don\'t pay.',
    },
    {
      id: 'reviews',
      label: 'Review Recovery',
      icon: Star,
      signal: (l: any) => (l.rating && l.rating < 4.0) || (l.review_count != null && l.review_count < 15),
      badge: (l: any) => l.rating ? `${l.rating}★ · ${l.review_count ?? 0} reviews` : `${l.review_count ?? 0} reviews`,
      color: 'text-amber-400',
      bg: 'bg-amber-500/[0.06] border-amber-500/20',
      transition: (l: any) => `I pulled up your Google profile — you\'re at ${l.rating ? `${l.rating} stars` : 'very few reviews'}. Competitors at 4.8 get 3x more calls.`,
      points: [
        'After every job, Sam auto-texts your customer with a direct Google review link',
        'Gets you 5–10 new reviews per month on autopilot',
        'Bumps you above competitors in local search — more inbound calls',
      ],
      close: 'Takes 10 minutes to set up. Add-on to Sam or standalone — your call.',
    },
    {
      id: 'missed_call',
      label: 'Missed Call Text-Back',
      icon: PhoneIncoming,
      signal: () => true,
      badge: () => 'always relevant',
      color: 'text-blue-400',
      bg: 'bg-blue-500/[0.06] border-blue-500/20',
      transition: 'How often do you miss calls when you\'re on a job site?',
      points: [
        'When you miss a call, Sam texts back in 30 seconds: "Hey, saw I missed you — I\'m on a job. Can I call you at 5?"',
        'Keeps the lead warm instead of them calling your competitor',
        'Already included in Sam — just needs to be activated',
      ],
      close: 'It\'s already included — takes 2 minutes to turn on.',
    },
    {
      id: 'follow_up',
      label: 'Quote Follow-Up',
      icon: RefreshCw,
      signal: (l: any) => l.status === 'proposal_sent' || (l.estimated_value && l.estimated_value > 0) || (l.contact_count && l.contact_count >= 3),
      badge: (l: any) => l.status === 'proposal_sent' ? 'quote sent' : 'established',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/[0.06] border-emerald-500/20',
      transition: 'What\'s your close rate on quotes you send out — do most people just ghost you?',
      points: [
        '5-touch automated follow-up over 7 days after you send a quote',
        'SMS + email combo — stops the moment they reply',
        'Closes 20–30% more quotes that would\'ve ghosted',
      ],
      close: 'Also includes reactivation blasts to your past customers — easy repeat revenue.',
    },
  ] as const;

  const pivots = manualLead ? PIVOT_SERVICES.filter(p => p.signal(manualLead as any)) : [];

  // Pace projection (Phase 5)
  const elapsedSessionMin = (Date.now() - sessionStartTime) / 60000;
  const callsPerMin = sessionCallCount > 0 && elapsedSessionMin > 0.1 ? sessionCallCount / elapsedSessionMin : 0;
  const now = new Date();
  const minutesToTarget = Math.max(0, (12 * 60 + 30) - (now.getHours() * 60 + now.getMinutes()));
  const projectedByTarget = sessionCallCount + Math.round(callsPerMin * minutesToTarget);

  return (
    <>
    {/* Speed Mode Overlay */}
    {speedMode && callerMode === 'manual' && manualLead && (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        {/* Speed Mode Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-zinc-900/80">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{manualLead.business_name}</h2>
            {(manualLead as any).owner_name && (
              <p className="text-sm text-orange-400">Owner: {(manualLead as any).owner_name}</p>
            )}
            <p className="text-sm text-zinc-500">
              {(manualLead as any).direct_phone
                ? <span className="text-emerald-400 font-data">Direct: {(manualLead as any).direct_phone}</span>
                : <span className="font-data">{manualLead.phone}</span>
              }
              {manualLead.city ? ` · ${manualLead.city}` : ''}
              {manualLead.service_type ? ` · ${manualLead.service_type}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-data font-bold text-zinc-200">{formatTime(manualElapsed)}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">elapsed</p>
            </div>
            {sessionCallCount > 0 && callsPerMin > 0 && (
              <div className="text-center">
                <p className="text-sm font-data font-semibold text-zinc-300">{callsPerMin.toFixed(1)}/min</p>
                <p className="text-[10px] text-zinc-600">{projectedByTarget} by 12:30</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-data font-semibold text-zinc-300">{sessionCallCount}</p>
              <p className="text-[10px] text-zinc-600">calls today</p>
            </div>
            {sessionCallCount > 0 && (
              <div className="text-center">
                <p className="text-sm font-data font-semibold text-zinc-300">
                  {sessionCallCount > 0 ? Math.round((sessionPickupCount / sessionCallCount) * 100) : 0}%
                </p>
                <p className="text-[10px] text-zinc-600">pickup</p>
              </div>
            )}
            {streak >= 2 && (
              <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-emerald-400">{streak} streak</p>
              </div>
            )}
            <button
              onClick={() => setSpeedMode(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-white/[0.06] transition-colors"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Batch progress bar in speed mode */}
        {batchTarget !== null && (
          <div className="px-6 py-2 bg-zinc-900/60 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', sessionCallCount >= batchTarget ? 'bg-emerald-500' : 'bg-violet-500')}
                  style={{ width: `${Math.min(100, (sessionCallCount / batchTarget) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-data text-zinc-500 shrink-0">{sessionCallCount}/{batchTarget}</span>
            </div>
          </div>
        )}

        {/* Script */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {queueView.length > 0 && (
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-4 text-center">
              Lead {selectedQueueIndex + 1} of {queueView.length}
            </p>
          )}
          {manualScriptBody ? (
            <pre className="text-[17px] leading-8 text-zinc-100 whitespace-pre-wrap font-sans max-w-3xl mx-auto">{manualScriptBody}</pre>
          ) : (
            <p className="text-zinc-600 text-center py-20 text-sm">Loading script…</p>
          )}
          {/* Voice note mic button in Speed Mode */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {!recording && !transcribing && (
              <button
                onClick={handleStartRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800/60 border border-white/[0.06] transition-colors"
              >
                <Mic className="w-3.5 h-3.5" />
                Voice note
              </button>
            )}
            {recording && (
              <button
                onClick={handleStopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/20 animate-pulse"
              >
                <Square className="w-3.5 h-3.5" />
                Stop recording
              </button>
            )}
            {transcribing && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Transcribing…
              </div>
            )}
            {voiceNote && !recording && !transcribing && (
              <span className="text-[10px] text-emerald-500">Voice note saved</span>
            )}
          </div>
        </div>

        {/* Gatekeeper time advisory */}
        {queueView.some(item => (item.gatekeeper_count ?? 0) > 0) && (() => {
          const hour = new Date().getHours();
          const good = hour < 9 || hour >= 17;
          return (
            <div className={cn(
              'flex items-center gap-2 px-6 py-2.5 border-t text-xs',
              good
                ? 'bg-emerald-500/[0.04] border-emerald-500/20 text-emerald-400'
                : 'bg-violet-500/[0.04] border-violet-500/20 text-violet-400'
            )}>
              <Shield className="w-3 h-3 shrink-0" />
              <span>Gatekeeper batch — {good ? 'good window to call now' : 'best before 9am or after 5pm'}</span>
            </div>
          );
        })()}

        {/* Auto-advance banner */}
        {manualCountdown !== null && (
          <div className="flex items-center justify-between px-6 py-3 bg-amber-500/10 border-t border-amber-500/20">
            <span className="text-sm text-amber-300">Next lead in <span className="font-data font-semibold">{manualCountdown}s</span>…</span>
            <button onClick={() => setManualCountdown(null)} className="text-xs text-amber-400 hover:text-amber-200 px-2 py-1 rounded">Cancel <span className="opacity-50">[Esc]</span></button>
          </div>
        )}

        {/* Enroll in sequence popup (after Interested) */}
        {enrollModal ? (
          <div className="px-6 py-5 border-t border-emerald-500/20 bg-emerald-500/[0.04]">
            <p className="text-sm font-medium text-emerald-400 mb-3">
              Enroll <span className="text-emerald-300">{enrollModal.leadName}</span> in a sequence?
            </p>
            <select
              value={enrollSeqId}
              onChange={e => setEnrollSeqId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-300 [color-scheme:dark] mb-3"
            >
              <option value="">Pick a sequence...</option>
              {sequences.filter(s => !!s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => handleEnrollAndContinue(false)}
                disabled={enrollSeqId === '' || enrollMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
              >
                {enrollMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enroll & Continue'}
              </button>
              <button
                onClick={() => handleEnrollAndContinue(true)}
                className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-white/[0.06] transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          /* Big outcome buttons */
          <div className="px-6 py-5 border-t border-white/[0.06] bg-zinc-900/80">
            <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
              {([
                { outcome: 'interested', label: 'Interested', key: '1', cls: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30' },
                { outcome: 'callback_requested', label: 'Callback', key: '2', cls: 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30' },
                { outcome: 'no_answer', label: 'No Answer', key: '3', cls: 'bg-zinc-800/80 border-white/[0.08] text-zinc-400 hover:bg-zinc-700' },
                { outcome: 'voicemail', label: 'Voicemail', key: '4', cls: 'bg-zinc-800/80 border-white/[0.08] text-zinc-400 hover:bg-zinc-700' },
                { outcome: 'gatekeeper', label: 'Gatekeeper', key: '5', cls: 'bg-violet-500/20 border-violet-500/40 text-violet-300 hover:bg-violet-500/30' },
                { outcome: 'not_interested', label: 'Not Interested', key: '6', cls: 'bg-red-600/20 border-red-500/40 text-red-400 hover:bg-red-600/30' },
                { outcome: 'not_a_fit', label: 'Not a Fit', key: '7', cls: 'bg-zinc-800/80 border-white/[0.06] text-zinc-500 hover:bg-zinc-700 col-span-2' },
              ] as const).map(({ outcome, label, key, cls }) => (
                <button
                  key={outcome}
                  onClick={() => handleLogManualCall(outcome)}
                  disabled={loggingCall}
                  className={cn('relative py-5 rounded-xl text-base font-semibold border-2 transition-colors disabled:opacity-40', cls)}
                >
                  {loggingCall ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : label}
                  <span className="absolute top-1.5 right-2 text-[10px] font-mono opacity-40">[{key}]</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )}

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

        {callerMode === 'manual' && dailyGoal > 0 && (
          <div className="flex items-center gap-3">
            <div className="w-48 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', totalCalls >= dailyGoal ? 'bg-emerald-500' : 'bg-orange-500')}
                style={{ width: `${Math.min(100, (totalCalls / dailyGoal) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-data text-zinc-400">{totalCalls}/{dailyGoal} calls</span>
          </div>
        )}

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
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowBatchStart(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {batchTarget ? `Batch: ${sessionCallCount}/${batchTarget}` : 'Start Batch'}
            </button>
            <button
              onClick={() => setAutoSmsEnabled(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                autoSmsEnabled
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-zinc-800 border-white/[0.06] text-zinc-500'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Auto-SMS {autoSmsEnabled ? 'on' : 'off'}
            </button>
            <button
              onClick={() => setSpeedMode(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                speedMode
                  ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-800 border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              Speed Mode
            </button>
            <button
              onClick={() => setAutoAdvanceManual(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                autoAdvanceManual
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                  : 'bg-zinc-800 border-white/[0.06] text-zinc-500'
              )}
            >
              <SkipForward className="w-3.5 h-3.5" />
              Auto-advance {autoAdvanceManual ? 'on' : 'off'}
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
          </div>
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

      {/* Manual mode auto-advance countdown banner */}
      {callerMode === 'manual' && manualCountdown !== null && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm text-amber-300">
              Next lead in <span className="font-data font-semibold">{manualCountdown}s</span>…
            </span>
          </div>
          <button
            onClick={() => setManualCountdown(null)}
            className="text-xs text-amber-400 hover:text-amber-200 transition-colors px-2 py-1 rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Morning queue ready banner */}
      {morningStatus?.loaded_today && !morningBannerDismissed && (morningStatus?.queue_count ?? 0) > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm text-orange-300">
              Morning queue ready — <span className="font-semibold">{morningStatus.queue_count} leads</span> loaded by priority. Start calling now.
            </span>
          </div>
          <button onClick={() => setMorningBannerDismissed(true)} className="text-zinc-500 hover:text-zinc-300 transition-colors ml-4">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Session stats bar + batch progress (always visible in manual mode) */}
      {callerMode === 'manual' && (
        <div className="rounded-xl bg-zinc-900 border border-white/[0.06] px-4 py-3 space-y-2">
          {/* Batch progress row */}
          {batchTarget !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">
                  {sessionCallCount} / {batchTarget} calls
                  {sessionCallCount >= batchTarget && <span className="text-emerald-400 ml-2">Batch complete!</span>}
                </span>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  {callsPerMin > 0 && <span className="font-data">{callsPerMin.toFixed(1)}/min · {projectedByTarget} by 12:30</span>}
                  <button onClick={() => { setBatchTarget(null); }} className="text-zinc-700 hover:text-zinc-400 transition-colors">End batch</button>
                </div>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', sessionCallCount >= batchTarget ? 'bg-emerald-500' : 'bg-violet-500')}
                  style={{ width: `${Math.min(100, (sessionCallCount / batchTarget) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {/* Session stats strip */}
          <div className="flex items-center gap-5 text-xs">
            <span className="text-zinc-600">Session:</span>
            <span className="text-zinc-500">Calls <span className="font-data text-zinc-300">{sessionCallCount}</span></span>
            <span className="text-zinc-500">Pickups <span className="font-data text-zinc-300">{sessionPickupCount}</span>
              {sessionCallCount > 0 && <span className="text-zinc-600"> ({Math.round((sessionPickupCount / sessionCallCount) * 100)}%)</span>}
            </span>
            {callsPerMin > 0 && (
              <span className="text-zinc-500">Pace <span className="font-data text-zinc-300">{callsPerMin.toFixed(1)}/min</span>
                <span className="text-zinc-600"> · {projectedByTarget} by 12:30</span>
              </span>
            )}
            {streak >= 2 && <span className="text-emerald-500 font-medium">{streak} interested streak</span>}
          </div>
        </div>
      )}

      {/* ── Manual Caller Mode ──────────────────────────────────────────── */}
      {callerMode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Queue sidebar */}
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Queue</p>
                  {queueView.length > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{selectedQueueIndex + 1} of {queueView.length}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {queueView.length > 0 && (
                    <button
                      onClick={() => { clearQueue.mutate(); setQueueView([]); setManualLead(null); prevQueueLenRef.current = 0; }}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => selectedScript && autoLoadQueue.mutate({ serviceType: undefined, count: 10, templateId: selectedScript })}
                    disabled={!selectedScript || autoLoadQueue.isPending}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-40"
                  >
                    {autoLoadQueue.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                    Load
                  </button>
                </div>
              </div>

              {sessionDone ? (
                <div className="p-3 rounded-lg bg-zinc-800/60 border border-white/[0.06] space-y-3">
                  <p className="text-xs font-medium text-zinc-300 text-center">Session Complete</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-data font-semibold text-zinc-200">{sessionCallCount}</p>
                      <p className="text-[10px] text-zinc-600">Called</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-data font-semibold text-emerald-400">{sessionPickupCount}</p>
                      <p className="text-[10px] text-zinc-600">Reached</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-data font-semibold text-amber-400">{sessionCallbackCount}</p>
                      <p className="text-[10px] text-zinc-600">Callbacks</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSessionDone(false);
                      setSessionCallCount(0);
                      setSessionPickupCount(0);
                      setSessionCallbackCount(0);
                      setStreak(0);
                      autoLoadQueue.mutate({ count: 40, filter: 'morning', templateId: selectedScript || 0 });
                    }}
                    disabled={autoLoadQueue.isPending}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40"
                  >
                    {autoLoadQueue.isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Load New Batch'}
                  </button>
                </div>
              ) : queueView.length === 0 ? (
                <p className="text-[10px] text-zinc-600 text-center py-4">
                  {autoLoadQueue.isPending ? 'Loading leads...' : 'No queue — click Load'}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {queueView.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => selectQueueLead(item, idx)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 rounded-lg transition-colors border-l-2',
                        idx === selectedQueueIndex
                          ? 'bg-emerald-500/[0.08] border-l-emerald-500'
                          : 'bg-zinc-800/40 border-l-transparent hover:bg-zinc-800/70'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CallDot state={item.state} />
                            <p className="text-xs text-zinc-200 truncate">{item.business_name}</p>
                          </div>
                          <p className="text-[10px] text-zinc-600 truncate">{item.city || item.phone}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(item.contact_count ?? 0) >= 5 && ['new', 'contacted'].includes(item.status ?? '') && (
                            <span className="text-[9px] font-medium bg-red-500/15 text-red-400 px-1 rounded">stale</span>
                          )}
                          {repliedLeadIds.has(item.id) && (
                            <span className="text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1 rounded">replied</span>
                          )}
                          {(item.gatekeeper_count ?? 0) > 0 && (
                            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              GK×{item.gatekeeper_count}
                            </span>
                          )}
                          <span className="text-[10px] font-data text-zinc-600">{item.heat_score ?? '—'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {queueView[selectedQueueIndex] && (
              <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100 leading-tight">{queueView[selectedQueueIndex].business_name}</p>
                  {/* Owner name + direct phone */}
                  {queueView[selectedQueueIndex].owner_name && (
                    <p className="text-xs text-orange-400 mt-1">Owner: {queueView[selectedQueueIndex].owner_name}</p>
                  )}
                  <p className="text-xs text-zinc-400 mt-1 font-data">
                    {queueView[selectedQueueIndex].direct_phone
                      ? <span className="text-emerald-400">Direct: {queueView[selectedQueueIndex].direct_phone}</span>
                      : queueView[selectedQueueIndex].phone
                    }
                  </p>
                  {queueView[selectedQueueIndex].city && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{queueView[selectedQueueIndex].city}{queueView[selectedQueueIndex].state ? `, ${queueView[selectedQueueIndex].state}` : ''}</p>
                  )}
                </div>

                {/* Gatekeeper warning */}
                {(queueView[selectedQueueIndex].gatekeeper_count ?? 0) > 0 && (
                  <div className="px-2.5 py-2 rounded-lg bg-violet-500/[0.08] border border-violet-500/20">
                    <p className="text-[10px] font-medium text-violet-400 mb-1">Gatekeeper hit {queueView[selectedQueueIndex].gatekeeper_count}x</p>
                    <p className="text-[10px] text-zinc-500">
                      {queueView[selectedQueueIndex].owner_name
                        ? `Try: "Is ${queueView[selectedQueueIndex].owner_name} in? Quick question about their equipment."`
                        : 'Try before 8 AM or after 5 PM. Ask for owner by first name.'
                      }
                    </p>
                    {textInsteadLeadId !== queueView[selectedQueueIndex].id ? (
                      <button
                        onClick={() => openTextInstead(queueView[selectedQueueIndex])}
                        className="mt-2 w-full text-[10px] py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >Text instead (bypasses gatekeeper)</button>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        <textarea
                          value={textInsteadBody}
                          onChange={e => setTextInsteadBody(e.target.value)}
                          rows={2}
                          className="w-full text-[11px] bg-zinc-800 border border-white/[0.06] rounded px-2 py-1.5 text-zinc-200 resize-none focus:outline-none focus:border-blue-500/50"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={async () => {
                              try {
                                await sendSmsMutation.mutateAsync({ lead_id: queueView[selectedQueueIndex].id, body: textInsteadBody });
                                setTextInsteadLeadId(null);
                                toast('SMS sent');
                              } catch { toast('Failed to send SMS', 'error'); }
                            }}
                            disabled={sendSmsMutation.isPending || !textInsteadBody.trim()}
                            className="flex-1 text-[10px] py-1.5 rounded bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
                          >{sendSmsMutation.isPending ? 'Sending…' : 'Send'}</button>
                          <button
                            onClick={() => setTextInsteadLeadId(null)}
                            className="text-[10px] px-2.5 py-1.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {queueView[selectedQueueIndex].heat_score != null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Heat</p>
                      <span className="text-[10px] font-data text-zinc-500">{queueView[selectedQueueIndex].heat_score}/100</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          queueView[selectedQueueIndex].heat_score >= 70 ? 'bg-orange-500' :
                          queueView[selectedQueueIndex].heat_score >= 40 ? 'bg-amber-500' : 'bg-zinc-600'
                        )}
                        style={{ width: `${queueView[selectedQueueIndex].heat_score}%` }}
                      />
                    </div>
                  </div>
                )}

                {queueView[selectedQueueIndex].last_contacted_at && (
                  <p className="text-[10px] text-zinc-600">
                    Last: {formatRelativeTime(queueView[selectedQueueIndex].last_contacted_at)}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <a
                    href={`tel:${queueView[selectedQueueIndex].direct_phone || queueView[selectedQueueIndex].phone}`}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex-1"
                  >
                    <Phone className="w-3 h-3" />
                    {queueView[selectedQueueIndex].direct_phone ? 'Dial Direct' : 'Dial'}
                  </a>
                  <button
                    onClick={skipQueueLead}
                    disabled={queueView.length <= selectedQueueIndex + 1}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-30"
                  >
                    <SkipForward className="w-3 h-3" />
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main: Lead selector + Script + Log */}
          <div className="lg:col-span-2 space-y-4">

            {/* ── Queue Phone Card ── */}
            {queueCallView && queueView.length > 0 && manualLead && queueView[selectedQueueIndex]?.lead_id === manualLead.id ? (
              <div className="space-y-4">
                <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-6">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                        Lead {selectedQueueIndex + 1} of {queueView.length}
                      </p>
                      <h2 className="text-2xl font-semibold text-zinc-100 leading-tight truncate">{manualLead.business_name}</h2>
                      {(manualLead as any).owner_name && (
                        <p className="text-base text-orange-400 mt-0.5">
                          Ask for: <span className="font-semibold">{(manualLead as any).owner_name.split(' ')[0]}</span>
                        </p>
                      )}
                      {manualLead.city && (
                        <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {manualLead.city}{manualLead.state ? `, ${manualLead.state}` : ''}
                          {manualLead.service_type ? ` · ${manualLead.service_type}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => setQueueCallView(false)}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Detail
                      </button>
                      <button
                        onClick={skipQueueLead}
                        disabled={queueView.length <= selectedQueueIndex + 1}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800 border border-white/[0.06] transition-colors disabled:opacity-30"
                      >
                        <SkipForward className="w-3 h-3" />
                        Skip
                      </button>
                    </div>
                  </div>

                  {/* AI Call Prep Brief */}
                  {(callPrepLoading || callPrep || callPrepFailed) && (
                    <div className="mb-5 rounded-xl bg-zinc-800/60 border border-white/[0.05] p-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Zap className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold">AI Brief</span>
                      </div>
                      {callPrepLoading ? (
                        <div className="space-y-2">
                          {[78, 86, 62].map((w, n) => (
                            <div key={n} className="h-3 rounded bg-zinc-700 animate-pulse" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      ) : callPrep ? (
                        <div className="space-y-2.5 text-xs">
                          <p className="text-zinc-200 font-medium leading-relaxed">"{callPrep.opener}"</p>
                          {callPrep.context && <p className="text-zinc-400 leading-relaxed">{callPrep.context}</p>}
                          {callPrep.goal && <p className="text-emerald-400">Goal: {callPrep.goal}</p>}
                          {callPrep.objections?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {callPrep.objections.slice(0, 2).map((obj, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-md bg-zinc-700 text-zinc-400 text-[10px]">{obj}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : callPrepFailed ? (
                        <p className="text-xs text-zinc-600 italic">Brief unavailable — check AI settings</p>
                      ) : null}
                    </div>
                  )}

                  {/* Big dial button */}
                  <a
                    href={`tel:${(manualLead as any).direct_phone || manualLead.phone}`}
                    className="flex items-center justify-center gap-4 w-full py-7 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-colors mb-5 group"
                  >
                    <Phone className="w-8 h-8 text-emerald-400" />
                    <div className="text-center">
                      {(manualLead as any).direct_phone && (
                        <p className="text-[10px] text-emerald-600 uppercase tracking-widest mb-0.5">Direct Line</p>
                      )}
                      <span className="text-3xl font-data font-bold text-emerald-200 tracking-wider">
                        {(manualLead as any).direct_phone || manualLead.phone}
                      </span>
                    </div>
                  </a>

                  {/* Auto-advance countdown */}
                  {manualCountdown !== null && (
                    <div className="flex items-center justify-between px-3 py-2 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <span className="text-xs text-amber-300">Next lead in <span className="font-data font-semibold">{manualCountdown}s</span>…</span>
                      <button onClick={() => setManualCountdown(null)} className="text-xs text-amber-400 hover:text-amber-200 px-1 rounded">Cancel [Esc]</button>
                    </div>
                  )}

                  {/* Outcome buttons */}
                  {enrollModal ? (
                    <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
                      <p className="text-sm font-medium text-emerald-400 mb-3">
                        Enroll <span className="text-emerald-300">{enrollModal.leadName}</span> in a sequence?
                      </p>
                      <select
                        value={enrollSeqId}
                        onChange={e => setEnrollSeqId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-300 [color-scheme:dark] mb-3"
                      >
                        <option value="">Pick a sequence...</option>
                        {sequences.filter(s => !!s.is_active).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEnrollAndContinue(false)}
                          disabled={enrollSeqId === '' || enrollMutation.isPending}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
                        >
                          {enrollMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enroll & Continue'}
                        </button>
                        <button
                          onClick={() => handleEnrollAndContinue(true)}
                          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-white/[0.06] transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        { outcome: 'interested', label: 'Interested', cls: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30' },
                        { outcome: 'callback_requested', label: 'Callback', cls: 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30' },
                        { outcome: 'no_answer', label: 'No Answer', cls: 'bg-zinc-800/80 border-white/[0.08] text-zinc-400 hover:bg-zinc-700' },
                        { outcome: 'voicemail', label: 'Voicemail', cls: 'bg-zinc-800/80 border-white/[0.08] text-zinc-400 hover:bg-zinc-700' },
                        { outcome: 'gatekeeper', label: 'Gatekeeper', cls: 'bg-violet-500/20 border-violet-500/40 text-violet-300 hover:bg-violet-500/30' },
                        { outcome: 'not_interested', label: 'Not Interested', cls: 'bg-red-600/20 border-red-500/40 text-red-400 hover:bg-red-600/30' },
                        { outcome: 'not_a_fit', label: 'Not a Fit — Remove', cls: 'bg-zinc-800/60 border-white/[0.06] text-zinc-500 hover:bg-zinc-700 col-span-2' },
                      ] as const).map(({ outcome, label, cls }) => (
                        <button
                          key={outcome}
                          onClick={() => handleLogManualCall(outcome)}
                          disabled={loggingCall}
                          className={cn('py-4 rounded-xl text-sm font-semibold border-2 transition-colors disabled:opacity-40', cls)}
                        >
                          {loggingCall ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick note */}
                  <div className="mt-4 pt-4 border-t border-white/[0.04]">
                    <textarea
                      value={manualNote}
                      onChange={e => setManualNote(e.target.value)}
                      placeholder="Quick note… (optional)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:border-orange-500/50 [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Post-call email (queue call view) */}
                {postCallEmail && (
                  <div className={cn(
                    'bg-zinc-900 rounded-xl border p-5',
                    postCallEmail.type === 'demo' ? 'border-emerald-500/20' : 'border-amber-500/20'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        {postCallEmail.type === 'voicemail' ? 'Follow-up Email' : 'Demo Booking Email'}
                      </p>
                      <button onClick={() => setPostCallEmail(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Skip</button>
                    </div>
                    {!postCallEmail.leadEmail && (
                      <p className="text-xs text-amber-400 mb-3">No email on file — add one in Lead Details to send.</p>
                    )}
                    <input
                      type="text"
                      value={postCallEmail.subject}
                      onChange={e => setPostCallEmail(p => p ? { ...p, subject: e.target.value } : p)}
                      className="w-full px-3 py-2 mb-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 outline-none focus:border-orange-500/40 [color-scheme:dark]"
                      placeholder="Subject"
                    />
                    <textarea
                      rows={7}
                      value={postCallEmail.body}
                      onChange={e => setPostCallEmail(p => p ? { ...p, body: e.target.value } : p)}
                      className="w-full px-3 py-2 mb-3 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 outline-none focus:border-orange-500/40 resize-none [color-scheme:dark]"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={!postCallEmail.leadEmail || sendingEmail}
                        onClick={async () => {
                          if (!postCallEmail.leadEmail) return;
                          setSendingEmail(true);
                          try {
                            await quickEmail(postCallEmail.leadId, postCallEmail.subject, postCallEmail.body);
                            toast('Email sent');
                            setPostCallEmail(null);
                          } catch { toast('Failed to send email', 'error'); }
                          finally { setSendingEmail(false); }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-40"
                      >
                        {sendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        Send Email
                      </button>
                      <button
                        disabled
                        title="SMS coming soon — configure Twilio in Settings"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-800 border border-white/[0.06] text-zinc-600 cursor-not-allowed"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Text (coming soon)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Back to Queue View button */}
                {queueView.length > 0 && manualLead && queueView[selectedQueueIndex]?.lead_id === manualLead.id && (
                  <button
                    onClick={() => setQueueCallView(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-emerald-400 bg-emerald-500/[0.06] border border-emerald-500/20 hover:bg-emerald-500/10 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Back to Queue View
                  </button>
                )}

            {/* Lead selector */}
            <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Select Lead</p>
                <button
                  onClick={() => {
                    setShowManualLeadBrowser(true);
                    fetchLeads({ limit: 200, sort: 'heat_score', order: 'desc' }).then(r => {
                      setAvailableLeads((r.leads || []).filter((l: Lead) => l.phone));
                    }).catch(() => {});
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  <Search className="w-3 h-3" />
                  Browse
                </button>
              </div>
              {manualLead ? (
                <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{manualLead.business_name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {manualLead.phone}{manualLead.city ? ` · ${manualLead.city}, ${manualLead.state}` : ''}{manualLead.service_type ? ` · ${manualLead.service_type}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => { setManualLead(null); setManualScriptBody(''); setCoaching(''); setLookingUpOwner(false); setPostCallEmail(null); }}
                      className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1"
                    >
                      Change
                    </button>
                  </div>
                  {/* Ask for — owner name gatekeeper helper */}
                  <div className="px-3 py-2 border-t border-emerald-500/10 bg-orange-500/[0.04] flex items-center gap-2">
                    <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide shrink-0">Ask for:</span>
                    {manualLead.owner_name ? (
                      <span className="text-sm font-bold text-orange-400">{manualLead.owner_name.split(' ')[0]}</span>
                    ) : lookingUpOwner ? (
                      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Looking up owner name...
                      </span>
                    ) : manualLead.website ? (
                      <span className="text-xs text-zinc-600 italic">not found on site</span>
                    ) : (
                      <span className="text-xs text-zinc-600 italic">no website — ask "What's the owner's name?"</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Click to browse recent leads..."
                    value={manualLeadSearch}
                    onChange={handleManualLeadSearch}
                    onFocus={handleManualLeadSearchFocus}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 [color-scheme:dark]"
                  />
                  {(manualLeads.length > 0 || (searchFocused && manualLeadSearch.length < 2 && recentLeads.length > 0)) && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.06] bg-zinc-800/50 divide-y divide-white/[0.04]">
                      {manualLeadSearch.length < 2 && (
                        <p className="px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wide">Recent leads</p>
                      )}
                      {[...(manualLeads.length > 0 ? manualLeads : recentLeads)].sort((a, b) =>
                        (repliedLeadIds.has(b.id) ? 1 : 0) - (repliedLeadIds.has(a.id) ? 1 : 0)
                      ).map(l => (
                        <button
                          key={l.id}
                          onClick={() => selectManualLead(l)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-700/50 transition-colors text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <CallDot state={(l as any).state} />
                              <p className="text-sm text-zinc-200 truncate">{l.business_name}</p>
                              {repliedLeadIds.has(l.id) && (
                                <span className="text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1.5 rounded shrink-0">Replied</span>
                              )}
                              {(l.contact_count ?? 0) >= 5 && ['new', 'contacted'].includes(l.status ?? '') && (
                                <span className="text-[9px] font-medium bg-red-500/15 text-red-400 px-1 rounded shrink-0">stale</span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">{l.phone}{l.city ? ` · ${l.city}` : ''}</p>
                          </div>
                          <span className="text-xs font-data text-zinc-600 shrink-0">{l.heat_score}</span>
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
                {priorMissedCalls > 0 && (
                  <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/20">
                    <PhoneOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-300">
                      <span className="font-semibold">{priorMissedCalls}x voicemail / no answer</span>
                      {' — '}use <span className="font-bold">Section A (Callback Opener)</span>
                    </p>
                  </div>
                )}
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
                      { outcome: 'gatekeeper', label: 'Gatekeeper', cls: 'border-violet-500/30 text-violet-400 hover:bg-violet-500/20' },
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
                  <div className="relative">
                    <textarea
                      value={manualNote}
                      onChange={e => setManualNote(e.target.value)}
                      placeholder="Notes from the call..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:border-orange-500/50 [color-scheme:dark]"
                    />
                  </div>
                  {/* Voice note mic button */}
                  <div className="flex items-center gap-2">
                    {!recording && !transcribing && (
                      <button
                        onClick={handleStartRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Voice note
                      </button>
                    )}
                    {recording && (
                      <button
                        onClick={handleStopRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors animate-pulse"
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop recording
                      </button>
                    )}
                    {transcribing && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Transcribing…
                      </div>
                    )}
                    {voiceNote && !recording && !transcribing && (
                      <span className="text-[10px] text-emerald-500">Voice note saved</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleLogManualCall()}
                    disabled={loggingCall}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {loggingCall ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Log Call
                  </button>
                </div>
              </div>
            )}

            {/* Post-call email composer */}
            {postCallEmail && (
              <div className={cn(
                'bg-zinc-900 rounded-xl border p-5',
                postCallEmail.type === 'demo' ? 'border-emerald-500/20' : 'border-amber-500/20'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    {postCallEmail.type === 'voicemail' ? 'Follow-up Email' : 'Demo Booking Email'}
                  </p>
                  <button onClick={() => setPostCallEmail(null)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    Skip
                  </button>
                </div>
                {!postCallEmail.leadEmail && (
                  <p className="text-xs text-amber-400 mb-3">No email on file — add one in Lead Details to send.</p>
                )}
                <input
                  type="text"
                  value={postCallEmail.subject}
                  onChange={e => setPostCallEmail(p => p ? { ...p, subject: e.target.value } : p)}
                  className="w-full px-3 py-2 mb-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 outline-none focus:border-orange-500/40 [color-scheme:dark]"
                  placeholder="Subject"
                />
                <textarea
                  rows={7}
                  value={postCallEmail.body}
                  onChange={e => setPostCallEmail(p => p ? { ...p, body: e.target.value } : p)}
                  className="w-full px-3 py-2 mb-3 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 outline-none focus:border-orange-500/40 resize-none [color-scheme:dark]"
                />
                <div className="flex gap-2">
                  <button
                    disabled={!postCallEmail.leadEmail || sendingEmail}
                    onClick={async () => {
                      if (!postCallEmail.leadEmail) return;
                      setSendingEmail(true);
                      try {
                        await quickEmail(postCallEmail.leadId, postCallEmail.subject, postCallEmail.body);
                        toast('Email sent');
                        setPostCallEmail(null);
                      } catch { toast('Failed to send email', 'error'); }
                      finally { setSendingEmail(false); }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-40"
                  >
                    {sendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Email
                  </button>
                  <button
                    disabled
                    title="SMS coming soon — configure Twilio in Settings"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-800 border border-white/[0.06] text-zinc-600 cursor-not-allowed"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Text (coming soon)
                  </button>
                </div>
              </div>
            )}
              </div>
            )}
          </div>

          {/* Right: Pitch Pivot + AI Coach */}
          <div className="space-y-4">

            {/* Pitch Pivot Panel */}
            {manualLead && pivots.length > 0 && (
              <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-4">
                <p className="text-[10px] text-zinc-600 mb-2.5 uppercase tracking-wide font-medium">Pitch Pivot</p>
                <div className="space-y-1.5">
                  {pivots.map(p => {
                    const Icon = p.icon;
                    const isOpen = activePivot === p.id;
                    const badge = p.badge(manualLead as any);
                    const transition = typeof p.transition === 'function' ? p.transition(manualLead as any) : p.transition;
                    return (
                      <div key={p.id}>
                        <button
                          onClick={() => setActivePivot(isOpen ? null : p.id)}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-colors',
                            isOpen
                              ? `${p.bg} ${p.color}`
                              : 'bg-zinc-800/40 border-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.10]'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="font-medium">{p.label}</span>
                            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', isOpen ? 'bg-white/[0.08] border-white/10' : 'bg-zinc-700/60 border-white/[0.05]')}>{badge}</span>
                          </div>
                          <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
                        </button>
                        {isOpen && (
                          <div className={cn('mt-1 p-3 rounded-lg border text-xs space-y-2.5', p.bg)}>
                            <p className="text-zinc-300 italic leading-relaxed">"{transition}"</p>
                            <ul className="space-y-1.5">
                              {p.points.map((pt, i) => (
                                <li key={i} className="flex items-start gap-2 text-zinc-400">
                                  <span className={cn('mt-0.5 w-1 h-1 rounded-full flex-shrink-0', p.color.replace('text-', 'bg-'))} />
                                  {pt}
                                </li>
                              ))}
                            </ul>
                            <p className={cn('font-medium leading-relaxed', p.color)}>"{p.close}"</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  {/* Gatekeeper coaching tip */}
                  {(manualLead as any).gatekeeper_count > 0 && (
                    <div className="mb-4 px-3 py-2.5 rounded-lg bg-violet-500/[0.08] border border-violet-500/20">
                      <p className="text-[10px] font-semibold text-violet-400 mb-1">Gatekeeper hit {(manualLead as any).gatekeeper_count}x — try this:</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {(manualLead as any).owner_name
                          ? `"Hey, is ${(manualLead as any).owner_name} around? I had a quick question about their equipment."`
                          : '"Hey, what\'s the owner\'s first name? I want to make sure I reach the right person."'
                        }
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-1.5">Also try calling before 8 AM or after 5 PM — no secretary.</p>
                      {textInsteadLeadId !== manualLead.id ? (
                        <button
                          onClick={() => openTextInstead(manualLead)}
                          className="mt-2 w-full text-[10px] py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                        >Text instead (bypasses gatekeeper)</button>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          <textarea
                            value={textInsteadBody}
                            onChange={e => setTextInsteadBody(e.target.value)}
                            rows={2}
                            className="w-full text-[11px] bg-zinc-800 border border-white/[0.06] rounded px-2 py-1.5 text-zinc-200 resize-none focus:outline-none focus:border-blue-500/50"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                try {
                                  await sendSmsMutation.mutateAsync({ lead_id: manualLead.id, body: textInsteadBody });
                                  setTextInsteadLeadId(null);
                                  toast('SMS sent');
                                } catch { toast('Failed to send SMS', 'error'); }
                              }}
                              disabled={sendSmsMutation.isPending || !textInsteadBody.trim()}
                              className="flex-1 text-[10px] py-1.5 rounded bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
                            >{sendSmsMutation.isPending ? 'Sending…' : 'Send'}</button>
                            <button
                              onClick={() => setTextInsteadLeadId(null)}
                              className="text-[10px] px-2.5 py-1.5 rounded bg-zinc-800 border border-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                      {(activeCall.gatekeeper_count ?? 0) > 0 && (
                        <span className="text-xs text-amber-700">
                          GK <span className="font-data">{activeCall.gatekeeper_count}x</span>
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

                {/* Objection Coach */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={aiObjection}
                      onChange={e => setAiObjection(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAiCoach()}
                      placeholder="Type objection to get a rebuttal…"
                      className="flex-1 px-3 py-2 rounded-lg text-sm bg-violet-950/30 border border-violet-500/20 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/40 [color-scheme:dark]"
                    />
                    <button
                      onClick={handleAiCoach}
                      disabled={!aiObjection.trim() || aiCoachLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-30"
                    >
                      {aiCoachLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                      Coach
                    </button>
                  </div>
                  {aiCoachSuggestion && (
                    <p className="text-xs text-violet-300 bg-violet-950/40 border border-violet-500/20 rounded-lg px-3 py-2 leading-relaxed">
                      {aiCoachSuggestion}
                    </p>
                  )}
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

      {/* ── Today's Calls (shared: AI + Manual) ─────────────────────────── */}
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
              {(['interested', 'callback_requested', 'voicemail', 'no_answer', 'not_interested', 'gatekeeper'] as const).map(outcome => {
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
                      {call.source === 'manual' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">manual</span>
                      )}
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
            {/* Outreach Modes */}
            <div className="px-4 py-2.5 border-b border-white/[0.04]">
              <span className="text-[10px] text-zinc-600 mb-2 block">Outreach Modes</span>
              <div className="grid grid-cols-4 gap-1.5">
              {([
                { label: 'Direct Lines', filter: 'direct_phone', icon: Phone },
                { label: 'Gatekeepers', filter: 'gatekeeper', icon: ShieldAlert },
                { label: 'Hot Leads', filter: 'hot', icon: Flame },
                { label: 'Callbacks', filter: 'callbacks_due', icon: PhoneIncoming },
                { label: 'New This Week', filter: 'this_week', icon: Sparkles },
                { label: 'Never Called', filter: 'never_contacted', icon: UserPlus },
                { label: 'Re-engage', filter: 'stale', icon: RefreshCw },
                { label: 'Mobile Only', filter: 'mobile', icon: Smartphone },
              ] as const).map(p => (
                <button
                  key={p.label}
                  disabled={!selectedScript}
                  onClick={() => {
                    if (!selectedScript) return;
                    autoLoadQueue.mutate(
                      { count: 10, templateId: selectedScript, filter: p.filter },
                      { onSuccess: () => setShowAddLeads(false) }
                    );
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-orange-500/40 transition-colors disabled:opacity-30"
                >
                  <p.icon className="w-3 h-3 flex-shrink-0" />
                  {p.label}
                </button>
              ))}
              </div>
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

    {/* Manual Lead Browser Modal */}
    {showManualLeadBrowser && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={() => { setShowManualLeadBrowser(false); setLeadSearch(''); setLeadServiceFilter(''); }}
      >
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-200">Select Lead</h3>
            <button onClick={() => { setShowManualLeadBrowser(false); setLeadSearch(''); setLeadServiceFilter(''); }} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by name or city..."
              value={leadSearch}
              onChange={e => setLeadSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-orange-500/50 [color-scheme:dark]"
              autoFocus
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
            {availableLeads.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-6">Loading leads...</p>
            )}
            {availableLeads
              .filter(l =>
                (!leadServiceFilter || l.service_type === leadServiceFilter) &&
                (!leadSearch || l.business_name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.city?.toLowerCase().includes(leadSearch.toLowerCase()))
              )
              .map(lead => (
                <button
                  key={lead.id}
                  onClick={() => {
                    selectManualLead(lead);
                    setShowManualLeadBrowser(false);
                    setLeadSearch('');
                    setLeadServiceFilter('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/70 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{lead.business_name}</p>
                    <p className="text-xs text-zinc-500">{lead.phone}{lead.city ? ` · ${lead.city}` : ''}{lead.service_type ? ` · ${lead.service_type}` : ''}</p>
                  </div>
                  <span className="text-xs font-data text-zinc-600 shrink-0">{lead.heat_score}</span>
                </button>
              ))}
          </div>
        </div>
      </div>
    )}

    {/* Batch Start Modal (Phase 7) */}
    {showBatchStart && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={() => setShowBatchStart(false)}
      >
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Start Calling Session</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Set your target and we'll load your queue automatically.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wide block mb-1">Target calls</label>
              <input
                type="number"
                min={1}
                max={500}
                value={batchTargetInput}
                onChange={e => setBatchTargetInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-lg font-data font-bold text-zinc-100 bg-zinc-800 border border-white/[0.06] outline-none focus:border-violet-500/50 [color-scheme:dark] text-center"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-600 uppercase tracking-wide block mb-1">Service type (optional)</label>
              <select
                value={batchServiceFilter}
                onChange={e => setBatchServiceFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-300 [color-scheme:dark]"
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
          </div>

          {!selectedScript && (
            <p className="text-xs text-amber-500/80">Select a script first using the dropdown above.</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowBatchStart(false)}
              className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 border border-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartBatch}
              disabled={!selectedScript || autoLoadQueue.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40"
            >
              {autoLoadQueue.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Batch
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Callback Scheduling Modal (Phase 9) */}
    {callbackModal && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={() => setCallbackModal(null)}
      >
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Schedule Callback</h3>
            <p className="text-xs text-zinc-500 mt-0.5">When should we call {callbackModal.leadName}?</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(() => {
              const presets: { label: string; val: string }[] = [];
              const now = new Date();
              // Build next 5 business days (skip weekends) with clean Date objects
              const bizDays: Date[] = [];
              let cursor = new Date(now);
              while (bizDays.length < 5) {
                cursor = new Date(cursor);
                cursor.setDate(cursor.getDate() + 1);
                if (cursor.getDay() !== 0 && cursor.getDay() !== 6) bizDays.push(cursor);
              }
              for (const dayBase of bizDays.slice(0, 2)) {
                for (const h of [9, 14, 16]) {
                  const dt = new Date(dayBase);
                  dt.setHours(h, 0, 0, 0);
                  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
                  const val = dt.toISOString().slice(0, 16);
                  presets.push({ label, val });
                }
              }
              return presets.slice(0, 6).map(p => (
                <button
                  key={p.val}
                  onClick={() => setCallbackDatetime(p.val)}
                  className={cn(
                    'px-2 py-2 rounded-lg text-xs border transition-colors text-center',
                    callbackDatetime === p.val
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                      : 'bg-zinc-800 border-white/[0.06] text-zinc-400 hover:bg-zinc-700'
                  )}
                >
                  {p.label}
                </button>
              ));
            })()}
          </div>

          <div>
            <p className="text-[10px] text-zinc-600 mb-1 uppercase tracking-wide">Custom date/time</p>
            <input
              type="datetime-local"
              value={callbackDatetime}
              onChange={e => setCallbackDatetime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-800 border border-white/[0.06] text-zinc-200 outline-none focus:border-orange-500/50 [color-scheme:dark]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setCallbackModal(null)}
              className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 border border-white/[0.06] transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleScheduleCallback}
              disabled={!callbackDatetime || schedulingCallback}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-40"
            >
              {schedulingCallback ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Schedule + SMS'}
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ── Floating Call Widget ────────────────────────────────────────── */}
    {callerMode === 'manual' && manualLead && !speedMode && (
      <div className="fixed bottom-6 right-6 z-40 w-64 rounded-xl bg-zinc-900 border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header — click to expand/collapse */}
        <button
          onClick={() => setWidgetExpanded(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-zinc-100 truncate">{manualLead.business_name}</p>
              <p className="text-[10px] text-zinc-500">
                <span className="font-data">{formatTime(manualElapsed)}</span>
                {manualLead.phone ? ` · ${manualLead.phone}` : ''}
              </p>
            </div>
          </div>
          <span className="text-zinc-600 text-xs ml-2">{widgetExpanded ? '▲' : '▼'}</span>
        </button>

        {/* Expanded: quick outcome buttons */}
        {widgetExpanded && (
          <div className="border-t border-white/[0.06] p-3 space-y-1.5">
            {([
              { outcome: 'interested', label: 'Interested', cls: 'text-emerald-400 hover:bg-emerald-600/20' },
              { outcome: 'callback_requested', label: 'Callback', cls: 'text-amber-400 hover:bg-amber-500/20' },
              { outcome: 'no_answer', label: 'No Answer', cls: 'text-zinc-400 hover:bg-zinc-700' },
              { outcome: 'voicemail', label: 'Voicemail', cls: 'text-zinc-400 hover:bg-zinc-700' },
              { outcome: 'gatekeeper', label: 'Gatekeeper', cls: 'text-violet-400 hover:bg-violet-500/20' },
              { outcome: 'not_interested', label: 'Not Interested', cls: 'text-red-400 hover:bg-red-600/20' },
            ] as const).map(({ outcome, label, cls }) => (
              <button
                key={outcome}
                onClick={() => { handleLogManualCall(outcome); setWidgetExpanded(false); }}
                disabled={loggingCall}
                className={cn('w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40', cls)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Footer: Speed Mode + dismiss */}
        <div className="border-t border-white/[0.06] px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => setSpeedMode(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
          >
            <Zap className="w-3 h-3" />
            Speed Mode
          </button>
          <button
            onClick={() => { setManualLead(null); setManualScriptBody(''); setCoaching(''); }}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Clear lead"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )}
    </>
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
