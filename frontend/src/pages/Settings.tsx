import { useState, useEffect } from 'react';
import { ScoringRulesCard } from '../components/settings/ScoringRulesCard';
import { Settings as SettingsIcon, Save, Loader2, Link, Mail, Globe, User, Star, BarChart3, Zap, Repeat, ChevronDown, PhoneOutgoing, Copy, CheckCheck, MailCheck, CheckCircle2, AlertCircle, FileText as FileIcon, Code2, FlaskConical, Trash2, MessageSquare, Plus, Play, CloudLightning, ShieldCheck, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSetting, fetchReviewStats, fetchSequences, fetchTemplates, runAutopilotImport } from '../lib/api';
import { useToast } from '../lib/toast';
import { cn } from '../lib/utils';

export function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const { data: reviewStats } = useQuery({
    queryKey: ['review-stats'],
    queryFn: fetchReviewStats,
  });

  const [bookingLink, setBookingLink] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFrom, setResendFrom] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderWebsite, setSenderWebsite] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [googleReviewLink, setGoogleReviewLink] = useState('');
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState('');
  const [defaultSequenceId, setDefaultSequenceId] = useState('');
  const [digestEmail, setDigestEmail] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [morningAlertPhone, setMorningAlertPhone] = useState('');
  const [outcomeSeqCallback, setOutcomeSeqCallback] = useState('');
  const [outcomeSeqVoicemail, setOutcomeSeqVoicemail] = useState('');
  const [outcomeSeqGatekeeper, setOutcomeSeqGatekeeper] = useState('');
  const [outcomeSeqNoAnswer, setOutcomeSeqNoAnswer] = useState('');
  const [hailTriggerEnabled, setHailTriggerEnabled] = useState(false);
  const [hailSequenceId, setHailSequenceId] = useState('');
  const [dailySendLimit, setDailySendLimit] = useState('20');
  const [monthlyReportEnabled, setMonthlyReportEnabled] = useState(true);
  const [monthlyPlanCost, setMonthlyPlanCost] = useState('');
  const [hotAlertEnabled, setHotAlertEnabled] = useState(true);
  const [hotAlertThreshold, setHotAlertThreshold] = useState('70');
  const [warmupStartDate, setWarmupStartDate] = useState('');
  const [requeueEnabled, setRequeueEnabled] = useState(false);
  const [requeueDelayDays, setRequeueDelayDays] = useState('30');
  const [requeueSequenceId, setRequeueSequenceId] = useState('');
  const [requeueMaxTimes, setRequeueMaxTimes] = useState('2');
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState('');
  const [vapiVoiceId, setVapiVoiceId] = useState('');
  const [vapiFallbackPhone, setVapiFallbackPhone] = useState('');
  const [vapiVoicemailMessage, setVapiVoicemailMessage] = useState('');
  const [vapiBestTimeEnabled, setVapiBestTimeEnabled] = useState(false);
  const [vapiLocalNumbers, setVapiLocalNumbers] = useState('{}');
  const [vapiMaxDuration, setVapiMaxDuration] = useState('180');
  const [vapiFirstMessage, setVapiFirstMessage] = useState('');
  const [vapiMaxNoAnswer, setVapiMaxNoAnswer] = useState('3');
  const [dailyCallGoal, setDailyCallGoal] = useState('50');
  const [morningQueueCount, setMorningQueueCount] = useState('100');
  const [autopilotConfigs, setAutopilotConfigs] = useState<{ city: string; state: string; service_type: string }[]>([]);
  const [apNewCity, setApNewCity] = useState('');
  const [apNewState, setApNewState] = useState('TX');
  const [apNewService, setApNewService] = useState('hvac');
  const [speedToLeadEnabled, setSpeedToLeadEnabled] = useState(false);
  const [speedToLeadTemplateId, setSpeedToLeadTemplateId] = useState('');
  const [vapiCampaignEnabled, setVapiCampaignEnabled] = useState(false);
  const [vapiCampaignCallsPerDay, setVapiCampaignCallsPerDay] = useState('0');
  const [missedCallTextbackEnabled, setMissedCallTextbackEnabled] = useState(false);
  const [missedCallTextbackMessage, setMissedCallTextbackMessage] = useState('');
  const [callbackAutoSmsEnabled, setCallbackAutoSmsEnabled] = useState(true);
  const [samAutoReplyEnabled, setSamAutoReplyEnabled] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [widgetApiKey, setWidgetApiKey] = useState('');
  const [widgetEmbedCopied, setWidgetEmbedCopied] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [inboundCopied, setInboundCopied] = useState(false);
  const [voiceWebhookCopied, setVoiceWebhookCopied] = useState(false);
  const [tab, setTab] = useState<'general' | 'email' | 'calling' | 'automation' | 'advanced'>('general');

  const { data: callScripts } = useQuery({
    queryKey: ['call-scripts'],
    queryFn: () => fetchTemplates({ channel: 'call_script' }),
  });

  const { data: sequences } = useQuery({
    queryKey: ['sequences'],
    queryFn: fetchSequences,
  });

  useEffect(() => {
    if (settings) {
      setBookingLink(settings.booking_link || '');
      setResendApiKey(settings.resend_api_key || '');
      setResendFrom(settings.resend_from || '');
      setAppUrl(settings.app_url || '');
      setSenderName(settings.sender_name || '');
      setSenderPhone(settings.sender_phone || '');
      setSenderWebsite(settings.sender_website || '');
      setCompanyName(settings.company_name || '');
      setGoogleReviewLink(settings.google_review_link || '');
      setReviewEnabled(settings.review_request_enabled === 'true');
      setReplyToEmail(settings.reply_to_email || '');
      setDefaultSequenceId(settings.default_sequence_id || '');
      setDigestEmail(settings.digest_email || '');
      setAlertPhone(settings.alert_phone || '');
      setMorningAlertPhone(settings.morning_alert_phone || '');
      setOutcomeSeqCallback(settings.outcome_sequence_callback_requested || '');
      setOutcomeSeqVoicemail(settings.outcome_sequence_voicemail || '');
      setOutcomeSeqGatekeeper(settings.outcome_sequence_gatekeeper || '');
      setOutcomeSeqNoAnswer(settings.outcome_sequence_no_answer || '');
      setHailTriggerEnabled(settings.hail_trigger_enabled === '1');
      setHailSequenceId(settings.hail_sequence_id || '');
      setDailySendLimit(settings.daily_send_limit || '20');
      setMonthlyReportEnabled(settings.monthly_report_enabled !== '0');
      setMonthlyPlanCost(settings.monthly_plan_cost || '');
      setHotAlertEnabled(settings.hot_alert_enabled !== '0');
      setHotAlertThreshold(settings.hot_alert_threshold || '70');
      setWarmupStartDate(settings.warmup_start_date || '');
      setRequeueEnabled(settings.requeue_enabled === '1');
      setRequeueDelayDays(settings.requeue_delay_days || '30');
      setRequeueSequenceId(settings.requeue_sequence_id || '');
      setRequeueMaxTimes(settings.requeue_max_times || '2');
      setVapiPhoneNumberId(settings.vapi_phone_number_id || '');
      setVapiVoiceId(settings.vapi_voice_id || '');
      setVapiFallbackPhone(settings.vapi_fallback_phone || '');
      setVapiVoicemailMessage(settings.vapi_voicemail_message || '');
      setVapiBestTimeEnabled(settings.vapi_best_time_enabled === '1');
      setVapiLocalNumbers(settings.vapi_local_numbers || '{}');
      setVapiMaxDuration(settings.vapi_max_duration_seconds || '180');
      setVapiFirstMessage(settings.vapi_first_message || '');
      setVapiMaxNoAnswer(settings.vapi_max_no_answer_attempts || '3');
      setDailyCallGoal(settings.daily_call_goal || '50');
      setMorningQueueCount(settings.morning_queue_count || '100');
      try { setAutopilotConfigs(JSON.parse(settings.autopilot_configs || '[]')); } catch { setAutopilotConfigs([]); }
      setSpeedToLeadEnabled(settings.speed_to_lead_enabled === '1');
      setSpeedToLeadTemplateId(settings.speed_to_lead_template_id || '');
      setVapiCampaignEnabled(settings.vapi_campaign_enabled === '1');
      setVapiCampaignCallsPerDay(settings.vapi_campaign_calls_per_day || '0');
      setMissedCallTextbackEnabled(settings.missed_call_textback_enabled === '1');
      setMissedCallTextbackMessage(settings.missed_call_textback_message || '');
      setCallbackAutoSmsEnabled(settings.callback_auto_sms_enabled !== '0');
      setSamAutoReplyEnabled(settings.sam_auto_reply_enabled === '1');
      setWidgetEnabled(settings.widget_enabled !== '0');
      setWidgetApiKey(settings.widget_api_key || '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (entries: { key: string; value: string }[]) => {
      for (const { key, value } of entries) {
        await updateSetting(key, value);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['review-stats'] });
      toast('Settings saved');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  function handleSave() {
    saveMutation.mutate([
      { key: 'booking_link', value: bookingLink },
      { key: 'resend_api_key', value: resendApiKey },
      { key: 'resend_from', value: resendFrom },
      { key: 'reply_to_email', value: replyToEmail },
      { key: 'app_url', value: appUrl },
      { key: 'sender_name', value: senderName },
      { key: 'sender_phone', value: senderPhone },
      { key: 'sender_website', value: senderWebsite },
      { key: 'company_name', value: companyName },
      { key: 'google_review_link', value: googleReviewLink },
      { key: 'review_request_enabled', value: reviewEnabled ? 'true' : 'false' },
      { key: 'default_sequence_id', value: defaultSequenceId },
      { key: 'digest_email', value: digestEmail },
      { key: 'alert_phone', value: alertPhone },
      { key: 'morning_alert_phone', value: morningAlertPhone },
      { key: 'outcome_sequence_callback_requested', value: outcomeSeqCallback },
      { key: 'outcome_sequence_voicemail', value: outcomeSeqVoicemail },
      { key: 'outcome_sequence_gatekeeper', value: outcomeSeqGatekeeper },
      { key: 'outcome_sequence_no_answer', value: outcomeSeqNoAnswer },
      { key: 'hail_trigger_enabled', value: hailTriggerEnabled ? '1' : '0' },
      { key: 'hail_sequence_id', value: hailSequenceId },
      { key: 'daily_send_limit', value: dailySendLimit },
      { key: 'monthly_report_enabled', value: monthlyReportEnabled ? '1' : '0' },
      { key: 'monthly_plan_cost', value: monthlyPlanCost },
      { key: 'hot_alert_enabled', value: hotAlertEnabled ? '1' : '0' },
      { key: 'hot_alert_threshold', value: hotAlertThreshold },
      { key: 'warmup_start_date', value: warmupStartDate },
      { key: 'requeue_enabled', value: requeueEnabled ? '1' : '0' },
      { key: 'requeue_delay_days', value: requeueDelayDays },
      { key: 'requeue_sequence_id', value: requeueSequenceId },
      { key: 'requeue_max_times', value: requeueMaxTimes },
      { key: 'vapi_phone_number_id', value: vapiPhoneNumberId },
      { key: 'vapi_voice_id', value: vapiVoiceId },
      { key: 'vapi_fallback_phone', value: vapiFallbackPhone },
      { key: 'vapi_voicemail_message', value: vapiVoicemailMessage },
      { key: 'vapi_best_time_enabled', value: vapiBestTimeEnabled ? '1' : '0' },
      { key: 'vapi_local_numbers', value: vapiLocalNumbers },
      { key: 'vapi_max_duration_seconds', value: vapiMaxDuration },
      { key: 'vapi_first_message', value: vapiFirstMessage },
      { key: 'vapi_max_no_answer_attempts', value: vapiMaxNoAnswer },
      { key: 'daily_call_goal', value: dailyCallGoal },
      { key: 'morning_queue_count', value: morningQueueCount },
      { key: 'autopilot_configs', value: JSON.stringify(autopilotConfigs) },
      { key: 'speed_to_lead_enabled', value: speedToLeadEnabled ? '1' : '0' },
      { key: 'speed_to_lead_template_id', value: speedToLeadTemplateId },
      { key: 'vapi_campaign_enabled', value: vapiCampaignEnabled ? '1' : '0' },
      { key: 'vapi_campaign_calls_per_day', value: vapiCampaignCallsPerDay },
      { key: 'missed_call_textback_enabled', value: missedCallTextbackEnabled ? '1' : '0' },
      { key: 'missed_call_textback_message', value: missedCallTextbackMessage },
      { key: 'callback_auto_sms_enabled', value: callbackAutoSmsEnabled ? '1' : '0' },
      { key: 'widget_enabled', value: widgetEnabled ? '1' : '0' },
      { key: 'sam_auto_reply_enabled', value: samAutoReplyEnabled ? '1' : '0' },
    ]);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const TABS = [
    { key: 'general' as const, label: 'General', icon: User },
    { key: 'email' as const, label: 'Email', icon: Mail },
    { key: 'calling' as const, label: 'Calling', icon: PhoneOutgoing },
    { key: 'automation' as const, label: 'Automation', icon: Zap },
    { key: 'advanced' as const, label: 'Advanced', icon: Code2 },
  ];

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <SettingsIcon className="w-4 h-4 text-orange-400" />
        <h1 className="text-sm font-semibold text-zinc-100">Settings</h1>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-px">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
                tab === t.key
                  ? 'text-orange-400 border-orange-500 bg-orange-500/[0.06]'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/[0.02]',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {/* === GENERAL TAB === */}
        {tab === 'general' && <>
        {/* Compliance Checklist */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-medium text-zinc-200">Compliance & Setup</h2>
          </div>
          <div className="space-y-2.5">
            {/* Resend API */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Resend API Key</span>
              </div>
              {resendFrom ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>

            {/* VAPI Configured */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <PhoneOutgoing className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">VAPI Configured</span>
              </div>
              {vapiPhoneNumberId ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>

            {/* Email Warmup */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Email Warmup</span>
              </div>
              {warmupStartDate ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>

            {/* Booking Link */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Booking Link</span>
              </div>
              {bookingLink ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>

            {/* A2P 10DLC */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <FileIcon className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">A2P 10DLC</span>
              </div>
              <a
                href="/FieldStack%20-%20Client%20SMS%20Setup%20Guide.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-orange-400 hover:text-orange-300 font-medium"
              >
                Setup Guide →
              </a>
            </div>

            {/* Daily Send Limit */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30">
              <div className="flex items-center gap-2">
                <MailCheck className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-300">Daily Send Limit</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-data">{dailySendLimit}/day</span>
            </div>
          </div>
        </div>

        {/* Sender Identity */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Sender Identity</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Appears in email signatures as plain text. Used as {'{sender_name}'}, {'{sender_phone}'}, {'{sender_website}'}.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Name</label>
              <input
                type="text"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                placeholder="Hector"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Phone</label>
              <input
                type="tel"
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
                placeholder="(512) 555-0100"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Website</label>
              <input
                type="text"
                value={senderWebsite}
                onChange={e => setSenderWebsite(e.target.value)}
                placeholder="fieldstack.co"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        {/* Booking Link */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Booking Link</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Your Calendly, Cal.com, or scheduling page URL. Used in templates as {'{booking_link}'}.
          </p>
          <input
            type="url"
            value={bookingLink}
            onChange={e => setBookingLink(e.target.value)}
            placeholder="https://calendly.com/your-link"
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
        </div>
        </>}

        {/* === EMAIL TAB === */}
        {tab === 'email' && <>
        {/* Email Deliverability Checklist */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-medium text-zinc-200">Email Deliverability</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">Complete all steps to ensure emails land in inboxes and replies come back.</p>
          <div className="space-y-2">
            {[
              { ok: !!resendApiKey, label: 'Resend API key configured' },
              { ok: !!resendFrom && !resendFrom.includes('resend.dev'), label: 'Custom sending domain (not sandbox)' },
              { ok: !!replyToEmail, label: 'Reply-to address set (required for reply capture)' },
              { ok: !!appUrl, label: 'App URL configured (for unsubscribe links)' },
              { ok: !!warmupStartDate, label: 'Warmup schedule active' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {item.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className={cn('text-xs', item.ok ? 'text-zinc-400' : 'text-zinc-300')}>{item.label}</span>
              </div>
            ))}
          </div>
          {(!resendFrom || resendFrom.includes('resend.dev') || !replyToEmail) && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[10px] text-red-400">Emails will land in spam or replies won't be captured until red items are resolved. Sequence auto-send is paused until reply-to is set.</p>
            </div>
          )}
        </div>

        {/* Sam AI Auto-Reply */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">Sam AI Auto-Reply</h2>
            </div>
            <button
              type="button"
              onClick={() => setSamAutoReplyEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${samAutoReplyEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${samAutoReplyEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            When a contractor texts back, Sam AI automatically responds to qualify them and push toward booking. If the reply shows clear interest, your booking link is appended automatically.
          </p>
        </div>

        {/* Resend API Key */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Resend API Key</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Resend dashboard</a>. Required for email sending.
          </p>
          <input
            type="password"
            value={resendApiKey}
            onChange={e => setResendApiKey(e.target.value)}
            placeholder="re_..."
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
        </div>

        {/* Email From Address */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Email From Address</h2>
          </div>
          {(!resendFrom || resendFrom.includes('resend.dev')) && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-xs font-medium text-red-300">Emails going to spam</span>
              </div>
              <p className="text-[11px] text-red-400/80 mb-2">
                You're using Resend's sandbox domain. All outbound emails will land in spam until you add a custom domain.
              </p>
              <ol className="text-[11px] text-zinc-400 space-y-1 list-none">
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">1.</span> Add your domain at <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">resend.com/domains</a></li>
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">2.</span> Add SPF + DKIM DNS records (Resend gives you the values)</li>
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">3.</span> Set your From Address below once verified</li>
              </ol>
            </div>
          )}
          <p className="text-xs text-zinc-500 mb-3">
            Must be a verified domain in Resend. Enter just the email, or "Name &lt;email&gt;" to control the display name.
          </p>
          <input
            type="text"
            value={resendFrom}
            onChange={e => setResendFrom(e.target.value)}
            placeholder="hector@yourdomain.com"
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
        </div>

        {/* Reply-To */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Reply-To Address</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            When prospects reply to your emails, their reply goes here. Set this to your real inbox.
          </p>
          <input
            type="email"
            value={replyToEmail}
            onChange={e => setReplyToEmail(e.target.value)}
            placeholder="hector@yourdomain.com"
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
        </div>

        {/* App URL */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">App URL</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Your deployed app URL. Used to generate {'{unsubscribe_url}'} links in templates (e.g. https://yourapp.up.railway.app).
          </p>
          <input
            type="url"
            value={appUrl}
            onChange={e => setAppUrl(e.target.value)}
            placeholder="https://yourapp.up.railway.app"
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
        </div>

        {/* Email Tracking Setup */}
        {appUrl && (
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">Email Tracking Setup</h2>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Add this webhook URL in your <a href="https://resend.com/webhooks" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Resend dashboard</a> to track opens, clicks, and bounces.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 truncate border border-white/[0.04]">
                {appUrl}/api/webhooks/resend
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${appUrl}/api/webhooks/resend`);
                  setWebhookCopied(true);
                  setTimeout(() => setWebhookCopied(false), 2000);
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {webhookCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {webhookCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-zinc-600">Enable events: email.opened · email.clicked · email.bounced · email.complained</p>
          </div>
        )}
        </>}

        {/* === AUTOMATION TAB === */}
        {tab === 'automation' && <>
        {/* Autopilot */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-medium text-zinc-200">Autopilot</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            New leads auto-enroll into the default sequence. You only need to record Loom videos — everything else fires automatically.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Default Sequence</label>
              <select
                value={defaultSequenceId}
                onChange={e => setDefaultSequenceId(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None (no auto-enroll)</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} {s.auto_send_after_step > 0 ? `(auto after step ${s.auto_send_after_step})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">
                Leads from Finder, CSV import, and manual create auto-enroll into this sequence.
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Daily Digest Email</label>
              <input
                type="email"
                value={digestEmail}
                onChange={e => setDigestEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                7 AM daily: how many Loom videos are due + overnight send stats.
              </p>
            </div>

            {/* Monthly ROI Report */}
            <div className="border border-white/[0.05] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-300 font-medium">Monthly ROI Report</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Emailed on the 1st of each month with last month's revenue, deals, and ROI.</p>
                </div>
                <button
                  onClick={() => setMonthlyReportEnabled(!monthlyReportEnabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${monthlyReportEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${monthlyReportEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Plan Cost (for ROI calculation)</label>
                <input
                  type="number"
                  min={0}
                  value={monthlyPlanCost}
                  onChange={e => setMonthlyPlanCost(e.target.value)}
                  placeholder="3500"
                  className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Monthly cost of this plan in $. Leave blank to hide the ROI line.</p>
              </div>
            </div>

            {/* Hot Lead Decay Alert */}
            <div className="border border-white/[0.05] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-300 font-medium">Hot Lead Decay Alert</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Morning email listing hot leads not contacted in 24+ hours.</p>
                </div>
                <button
                  onClick={() => setHotAlertEnabled(!hotAlertEnabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${hotAlertEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hotAlertEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Heat Score Threshold</label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={hotAlertThreshold}
                  onChange={e => setHotAlertThreshold(e.target.value)}
                  placeholder="70"
                  className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Leads at or above this score trigger the alert (default 70).</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Hot Lead Alert Phone</label>
              <input
                type="tel"
                value={alertPhone}
                onChange={e => setAlertPhone(e.target.value)}
                placeholder="+15125551234"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Get an SMS when a prospect opens your email 2+ times.
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Morning Alert Phone</label>
              <input
                type="tel"
                value={morningAlertPhone}
                onChange={e => setMorningAlertPhone(e.target.value)}
                placeholder="+15125551234"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Get a text at 8 AM CT with your queue count and yesterday's call stats.
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Daily Email Limit</label>
              <input
                type="number"
                min={1}
                max={500}
                value={dailySendLimit}
                onChange={e => setDailySendLimit(e.target.value)}
                placeholder="20"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Max emails sent per day across all sequences. Start low (5-20) on a new domain.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-400">Domain Warmup</label>
                <button
                  type="button"
                  onClick={() => setWarmupStartDate(warmupStartDate ? '' : new Date().toISOString().split('T')[0])}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    warmupStartDate ? 'bg-orange-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      warmupStartDate ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>
              {warmupStartDate && (() => {
                const dayNum = Math.floor((Date.now() - new Date(warmupStartDate).getTime()) / 86400000) + 1;
                const effectiveLimit = dayNum <= 3 ? 5 : dayNum <= 7 ? 15 : dayNum <= 14 ? 30 : dayNum <= 21 ? 50 : parseInt(dailySendLimit) || 50;
                return (
                  <p className="text-xs text-orange-400 mb-1">
                    Day {dayNum} of warmup — sending up to {effectiveLimit} emails/day
                  </p>
                );
              })()}
              <p className="text-[10px] text-zinc-600 mt-1">
                Auto-ramps sending volume: 5/day → 15 → 30 → 50 over 3 weeks.
              </p>
            </div>
          </div>
        </div>

        {/* Smart Re-Queue */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-medium text-zinc-200">Smart Re-Queue</h2>
            </div>
            <button
              type="button"
              onClick={() => setRequeueEnabled(!requeueEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                requeueEnabled ? 'bg-orange-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  requeueEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Automatically re-enroll leads that completed a sequence or went silent after a configurable delay. Runs daily at 7am.
          </p>
          {requeueEnabled && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Re-engagement Sequence</label>
                <div className="relative">
                  <select
                    value={requeueSequenceId}
                    onChange={e => setRequeueSequenceId(e.target.value)}
                    className="w-full appearance-none bg-zinc-800 border border-white/[0.06] rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark] cursor-pointer"
                  >
                    <option value="">Select a sequence...</option>
                    {sequences?.filter((s: any) => s.is_active).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Delay (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={requeueDelayDays}
                    onChange={e => setRequeueDelayDays(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Days after last activity before re-queuing</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Max re-queues</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={requeueMaxTimes}
                    onChange={e => setRequeueMaxTimes(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Max times a lead can be auto re-queued</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Review Request Automation */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-medium text-zinc-200">Review Request Automation</h2>
            </div>
            <button
              type="button"
              onClick={() => setReviewEnabled(!reviewEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                reviewEnabled ? 'bg-orange-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  reviewEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            When a lead reaches "Closed Won", automatically ask for a rating via SMS. Only 4-5 star ratings get directed to Google Reviews.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Company Name (for SMS)</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Austin Premier HVAC"
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Google Review Link</label>
              <input
                type="url"
                value={googleReviewLink}
                onChange={e => setGoogleReviewLink(e.target.value)}
                placeholder="https://search.google.com/local/writereview?placeid=..."
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Find your link: Google Maps → your business → Share → "Write a review" link
              </p>
            </div>
          </div>

          {/* Review Stats */}
          {reviewStats && reviewStats.total_sent > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500 font-medium">Review Funnel Stats</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-lg font-semibold text-zinc-200 font-data">{reviewStats.total_sent}</div>
                  <div className="text-[10px] text-zinc-500">Sent</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-zinc-200 font-data">{reviewStats.response_rate}%</div>
                  <div className="text-[10px] text-zinc-500">Response</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-zinc-200 font-data">{reviewStats.avg_rating || '—'}</div>
                  <div className="text-[10px] text-zinc-500">Avg Rating</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-orange-400 font-data">{reviewStats.google_reviews_directed}</div>
                  <div className="text-[10px] text-zinc-500">To Google</div>
                </div>
              </div>
            </div>
          )}
        </div>
        </>}

        {/* === CALLING TAB === */}
        {tab === 'calling' && <>
        {/* AI Cold Caller (VAPI) */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-1">
            <PhoneOutgoing className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-medium text-zinc-200">AI Cold Caller</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">VAPI-powered AI voice agent for outbound calls. Set VAPI_API_KEY and VAPI_PUBLIC_KEY in your .env file.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">VAPI Phone Number ID</label>
              <input
                value={vapiPhoneNumberId}
                onChange={e => setVapiPhoneNumberId(e.target.value)}
                placeholder="e.g. abc123-def456..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">ElevenLabs Voice ID</label>
              <input
                value={vapiVoiceId}
                onChange={e => setVapiVoiceId(e.target.value)}
                placeholder="e.g. rachel, drew, or custom voice ID"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Fallback Phone (for transfers)</label>
              <input
                value={vapiFallbackPhone}
                onChange={e => setVapiFallbackPhone(e.target.value)}
                placeholder="e.g. +15125550123"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Your phone number — AI transfers here when you click "Jump In" or it can't handle the conversation</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Voicemail Drop Message</label>
              <textarea
                rows={3}
                value={vapiVoicemailMessage}
                onChange={e => setVapiVoicemailMessage(e.target.value)}
                placeholder="Hey, this is [your name] with FieldStack. I'll keep this short — I had a quick idea for your business I wanted to share. I'll send you a text with the details. Have a great day."
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 resize-none [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Spoken automatically when the call hits an answering machine. Leave blank to use the AI agent for voicemail too.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">First Message (AI Opener)</label>
              <textarea
                rows={2}
                value={vapiFirstMessage}
                onChange={e => setVapiFirstMessage(e.target.value)}
                placeholder="Hey, is this {business_name}?"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 resize-none [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">First thing the AI says when the lead picks up. Use {'{business_name}'} for their name. Leave blank to have AI wait for lead to speak first.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Local Numbers (by state)</label>
              <textarea
                rows={4}
                value={vapiLocalNumbers}
                onChange={e => setVapiLocalNumbers(e.target.value)}
                placeholder={'{\n  "TX": "your-tx-phone-id",\n  "CA": "your-ca-phone-id"\n}'}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 resize-none font-mono [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Map state abbreviations to VAPI phone number IDs for local presence dialing. Falls back to the default number above.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Max Call Duration (seconds)</label>
              <input
                type="number"
                min={30}
                max={600}
                value={vapiMaxDuration}
                onChange={e => setVapiMaxDuration(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Hard cap per call. 180 = 3 min. Prevents runaway calls from burning VAPI minutes.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Max No-Answer Attempts (Auto-DNC)</label>
              <input
                type="number"
                min={0}
                max={20}
                value={vapiMaxNoAnswer}
                onChange={e => setVapiMaxNoAnswer(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Automatically mark lead as Do Not Call after this many no-answer or voicemail outcomes. Set to 0 to disable.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Daily Call Goal</label>
              <input
                type="number"
                min={0}
                max={500}
                value={dailyCallGoal}
                onChange={e => setDailyCallGoal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Shows a progress bar in the Caller page. Set to 0 to hide.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Morning Queue Size</label>
              <input
                type="number"
                min={10}
                max={500}
                value={morningQueueCount}
                onChange={e => setMorningQueueCount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
              />
              <p className="text-[10px] text-zinc-600 mt-1">How many leads to load into the AI call queue each morning at 8 AM. Default 100.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs text-zinc-400">Best Time Windows</label>
                <p className="text-[10px] text-zinc-600 mt-0.5">Only call during 8–10 AM and 4–6 PM in the lead's local timezone.</p>
              </div>
              <button
                type="button"
                onClick={() => setVapiBestTimeEnabled(!vapiBestTimeEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  vapiBestTimeEnabled ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    vapiBestTimeEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs text-zinc-400">Speed-to-Lead Auto-Dial</label>
                <p className="text-[10px] text-zinc-600 mt-0.5">Auto-queue new leads for immediate calling when imported or created.</p>
              </div>
              <button
                type="button"
                onClick={() => setSpeedToLeadEnabled(!speedToLeadEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  speedToLeadEnabled ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    speedToLeadEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
            {speedToLeadEnabled && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Speed-to-Lead Script</label>
                <select
                  value={speedToLeadTemplateId}
                  onChange={e => setSpeedToLeadTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
                >
                  <option value="">Select a call script...</option>
                  {callScripts?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs text-zinc-400">Campaign Mode</label>
                <p className="text-[10px] text-zinc-600 mt-0.5">Auto-dial from queue every 5 min during business hours. No overlap.</p>
              </div>
              <button
                type="button"
                onClick={() => setVapiCampaignEnabled(!vapiCampaignEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  vapiCampaignEnabled ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    vapiCampaignEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
            {vapiCampaignEnabled && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Daily Call Cap</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={vapiCampaignCallsPerDay}
                  onChange={e => setVapiCampaignCallsPerDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 [color-scheme:dark]"
                />
                <p className="text-[10px] text-zinc-600 mt-1">Max calls per day in campaign mode. 0 = unlimited.</p>
              </div>
            )}
          </div>
        </div>

        {/* Call Outcome → Sequences */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <PhoneOutgoing className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Call Outcome — Sequences</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Auto-enroll leads into a sequence based on how a call ends. Runs on both AI calls and manual outcome overrides.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Interested</label>
              <select
                value={defaultSequenceId}
                onChange={e => setDefaultSequenceId(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">Lead is also advanced to Qualified. Uses the Default Sequence setting.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Callback Requested</label>
              <select
                value={outcomeSeqCallback}
                onChange={e => setOutcomeSeqCallback(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">Next-day callback is also scheduled automatically.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Voicemail</label>
              <select
                value={outcomeSeqVoicemail}
                onChange={e => setOutcomeSeqVoicemail(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">Fires after the post-call SMS is sent.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Gatekeeper</label>
              <select
                value={outcomeSeqGatekeeper}
                onChange={e => setOutcomeSeqGatekeeper(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">Hit a receptionist. Next-day 7:30 AM callback is also scheduled.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">No Answer</label>
              <select
                value={outcomeSeqNoAnswer}
                onChange={e => setOutcomeSeqNoAnswer(e.target.value)}
                className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
              >
                <option value="">None</option>
                {sequences?.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 mt-1">Nobody picked up. Fires after the post-call SMS.</p>
            </div>
          </div>
        </div>

        {/* Hailstorm Trigger */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CloudLightning className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">Hailstorm Trigger</h2>
            </div>
            <button
              type="button"
              onClick={() => setHailTriggerEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hailTriggerEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${hailTriggerEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Checks NOAA every 6 hours for TX hail alerts. Boosts matching roofing leads +25 heat score and alerts you.
          </p>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Auto-enroll flagged leads in sequence</label>
            <select
              value={hailSequenceId}
              onChange={e => setHailSequenceId(e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
            >
              <option value="">None (heat boost only)</option>
              {(sequences as any[])?.filter((s: any) => s.is_active).map((s: any) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">Tip: create a "Roofing Storm Follow-Up" sequence and select it here.</p>
          </div>
        </div>

        {/* Inbound Reply Detection */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <MailCheck className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Inbound Reply Detection</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            When a lead replies to a sequence email, their sequences auto-pause and they're marked <span className="text-violet-400">Qualified</span>. You'll get an SMS alert with their reply.
          </p>
          {(!replyToEmail || !appUrl) && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] text-red-400">Set your Reply-To Address and App URL above first. Without these, replies can't be captured.</p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Setup (3 steps)</label>
              <ol className="text-[11px] text-zinc-400 space-y-1.5 list-none">
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">1.</span> In <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Resend → Domains</a>, enable <strong className="text-zinc-300">Inbound</strong> on your domain</li>
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">2.</span> Add this MX record to your DNS: <code className="text-zinc-500">{replyToEmail ? replyToEmail.split('@')[1] : 'yourdomain.com'} MX 10 inbound.resend.com</code></li>
                <li className="flex items-start gap-1.5"><span className="text-zinc-600 shrink-0">3.</span> In <a href="https://resend.com/webhooks" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Resend → Webhooks</a>, add <strong className="text-zinc-300">email.received</strong> event to your existing webhook</li>
              </ol>
            </div>
            {appUrl && (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Your Resend Webhook URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 truncate border border-white/[0.04]">
                    {appUrl}/api/webhooks/resend
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${appUrl}/api/webhooks/resend`);
                      setInboundCopied(true);
                      setTimeout(() => setInboundCopied(false), 2000);
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    {inboundCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {inboundCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Same URL handles opens, clicks, bounces, AND inbound replies. Enable all events in Resend.</p>
              </div>
            )}
            <p className="text-[10px] text-zinc-600">Replies to <span className="text-zinc-500">reply+*@{replyToEmail ? replyToEmail.split('@')[1] : 'yourdomain.com'}</span> are auto-captured, sequences paused, and lead qualified.</p>
          </div>
        </div>

        {/* Missed Call Text-Back */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PhoneOutgoing className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">Missed Call Follow-Up Email</h2>
            </div>
            <button
              onClick={() => setMissedCallTextbackEnabled(!missedCallTextbackEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${missedCallTextbackEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${missedCallTextbackEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Auto-sends an email when a call goes unanswered, busy, or fails. Requires Resend configured and the Twilio StatusCallback URL set on your phone number. Only sends if the lead has a valid email.
          </p>
          <div className="mb-3">
            <label className="text-xs text-zinc-500 mb-1 block">Email Body Template</label>
            <textarea
              value={missedCallTextbackMessage}
              onChange={e => setMissedCallTextbackMessage(e.target.value)}
              placeholder={`Hey, this is {sender_name} — I tried calling about your {service_type} inquiry but missed you. When's a good time to connect? Feel free to reply here.`}
              rows={3}
              className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark] resize-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1">Leave blank to use the default. Supports {'{sender_name}'} and {'{service_type}'}.</p>
          </div>
          {appUrl && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">StatusCallback URL <span className="text-zinc-600">(Twilio → Phone Number → Voice → Call Status Changes)</span></label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 truncate border border-white/[0.04]">
                    {appUrl}/api/webhooks/twilio-call-status
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${appUrl}/api/webhooks/twilio-call-status`);
                      setWebhookCopied(true);
                      setTimeout(() => setWebhookCopied(false), 2000);
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    {webhookCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {webhookCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Voice Webhook URL <span className="text-zinc-600">(Twilio → Phone Number → Voice → "A call comes in")</span></label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 truncate border border-white/[0.04]">
                    {appUrl}/api/sms/voice-webhook
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${appUrl}/api/sms/voice-webhook`);
                      setVoiceWebhookCopied(true);
                      setTimeout(() => setVoiceWebhookCopied(false), 2000);
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    {voiceWebhookCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {voiceWebhookCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Set this as Webhook → HTTP POST in Twilio. Fires on no-answer, busy, or failed calls and auto-texts the caller.</p>
              </div>
            </div>
          )}
        </div>

        {/* Callback Auto-SMS */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneOutgoing className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-medium text-zinc-200">Callback Confirmation SMS</h2>
            </div>
            <button
              onClick={() => setCallbackAutoSmsEnabled(!callbackAutoSmsEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${callbackAutoSmsEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${callbackAutoSmsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Auto-sends an SMS to the lead when you schedule a callback from the Caller page. Message: "Got it! We'll call you back on [date]. Talk soon."
          </p>
        </div>

        {/* Lead Capture Widget */}
        {appUrl && widgetApiKey && (
          <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-medium text-zinc-200">Lead Capture Widget</h2>
              </div>
              <button
                onClick={() => setWidgetEnabled(!widgetEnabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${widgetEnabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${widgetEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Paste this one-line snippet on your "Get a Quote" page. Adds a floating button → contact form. Submissions create a lead instantly and trigger speed-to-lead calling.
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 break-all border border-white/[0.04] leading-relaxed">
                {`<script src="${appUrl}/api/widget/embed.js" data-key="${widgetApiKey}" data-service="hvac"></script>`}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`<script src="${appUrl}/api/widget/embed.js" data-key="${widgetApiKey}" data-service="hvac"></script>`);
                  setWidgetEmbedCopied(true);
                  setTimeout(() => setWidgetEmbedCopied(false), 2000);
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {widgetEmbedCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {widgetEmbedCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">Change <span className="text-zinc-500">data-service</span> to: hvac · roofing · plumbing · electrical · landscaping · general</p>
          </div>
        )}
        </>}

        {/* === ADVANCED TAB === */}
        {tab === 'advanced' && <>
        {/* Lead Autopilot */}
        <div className="bg-zinc-900 rounded-xl p-5 shadow-surface border border-white/[0.04]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Lead Autopilot</h2>
            </div>
            <button
              onClick={async () => {
                try {
                  await runAutopilotImport();
                  toast('Autopilot import triggered');
                } catch (e: any) {
                  toast(e.message, 'error');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors"
            >
              <Play className="w-3 h-3" /> Run Now
            </button>
          </div>
          <p className="text-xs text-zinc-500 mb-4">Runs every Sunday at 10 PM — automatically searches for new leads and imports them. Configure which cities and services to target.</p>

          {/* Existing configs */}
          {autopilotConfigs.length > 0 && (
            <div className="space-y-2 mb-4">
              {autopilotConfigs.map((cfg, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/60 border border-white/[0.04] text-xs">
                  <span className="text-zinc-300">{cfg.city}, {cfg.state} — <span className="text-zinc-500 capitalize">{cfg.service_type}</span></span>
                  <button onClick={() => setAutopilotConfigs(prev => prev.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new config */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-zinc-600 mb-1">City</label>
              <input
                type="text"
                placeholder="Austin"
                value={apNewCity}
                onChange={e => setApNewCity(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-white/[0.06] text-xs text-zinc-200"
              />
            </div>
            <div className="w-20">
              <label className="block text-[10px] text-zinc-600 mb-1">State</label>
              <input
                type="text"
                placeholder="TX"
                maxLength={2}
                value={apNewState}
                onChange={e => setApNewState(e.target.value.toUpperCase())}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-white/[0.06] text-xs text-zinc-200"
              />
            </div>
            <div className="w-32">
              <label className="block text-[10px] text-zinc-600 mb-1">Service</label>
              <select
                value={apNewService}
                onChange={e => setApNewService(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-white/[0.06] text-xs text-zinc-200 [color-scheme:dark]"
              >
                {['hvac','plumbing','electrical','roofing','landscaping','pest_control','general'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (!apNewCity.trim() || !apNewState.trim()) return;
                setAutopilotConfigs(prev => [...prev, { city: apNewCity.trim(), state: apNewState.trim(), service_type: apNewService }]);
                setApNewCity('');
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/[0.06] text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-3">Changes save when you click Save Settings above.</p>
        </div>

        {/* Scoring Rules */}
        <ScoringRulesCard />

        {/* Demo Data */}
        <DemoDataCard />
        </>}

        {/* Save — always visible */}
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

function DemoDataCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const seedMutation = useMutation({
    mutationFn: () => fetch('/api/demo/seed', { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.skipped) {
        toast('Demo leads already exist — reset first to re-seed', 'error');
      } else {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        toast(`${data.inserted ?? 15} demo leads added`);
      }
    },
    onError: () => toast('Failed to seed demo data', 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: () => fetch('/api/demo/reset', { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setConfirmReset(false);
      toast(`Removed ${data.deleted ?? 0} demo lead(s)`);
    },
    onError: () => toast('Failed to reset demo data', 'error'),
  });

  return (
    <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-medium text-zinc-200">Demo Data</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Populate the pipeline with 15 realistic HVAC leads for demos and testing. Demo leads are tagged with source&nbsp;=&nbsp;"demo" and can be wiped at any time.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending || resetMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
          Seed Demo Data
        </button>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={seedMutation.isPending || resetMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Remove all demo leads?</span>
            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {resetMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
