import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2, Link, Mail, Globe, User, Star, BarChart3, Zap, Repeat, ChevronDown, PhoneOutgoing } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSetting, fetchReviewStats, fetchSequences, fetchTemplates } from '../lib/api';
import { useToast } from '../lib/toast';

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
  const [dailySendLimit, setDailySendLimit] = useState('20');
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
  const [speedToLeadEnabled, setSpeedToLeadEnabled] = useState(false);
  const [speedToLeadTemplateId, setSpeedToLeadTemplateId] = useState('');
  const [vapiCampaignEnabled, setVapiCampaignEnabled] = useState(false);
  const [vapiCampaignCallsPerDay, setVapiCampaignCallsPerDay] = useState('0');

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
      setDailySendLimit(settings.daily_send_limit || '20');
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
      setSpeedToLeadEnabled(settings.speed_to_lead_enabled === '1');
      setSpeedToLeadTemplateId(settings.speed_to_lead_template_id || '');
      setVapiCampaignEnabled(settings.vapi_campaign_enabled === '1');
      setVapiCampaignCallsPerDay(settings.vapi_campaign_calls_per_day || '0');
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
      { key: 'daily_send_limit', value: dailySendLimit },
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
      { key: 'speed_to_lead_enabled', value: speedToLeadEnabled ? '1' : '0' },
      { key: 'speed_to_lead_template_id', value: speedToLeadTemplateId },
      { key: 'vapi_campaign_enabled', value: vapiCampaignEnabled ? '1' : '0' },
      { key: 'vapi_campaign_calls_per_day', value: vapiCampaignCallsPerDay },
    ]);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="w-4 h-4 text-orange-400" />
        <h1 className="text-sm font-semibold text-zinc-100">Settings</h1>
      </div>

      <div className="space-y-6">
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

        {/* Email From Address */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Email From Address</h2>
          </div>
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

        {/* Save */}
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
