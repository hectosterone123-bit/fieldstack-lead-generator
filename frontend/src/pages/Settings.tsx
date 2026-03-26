import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2, Link, Mail, Globe, User, Star, BarChart3, Zap, Repeat, ChevronDown, PhoneOutgoing } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSetting, fetchReviewStats, fetchSequences } from '../lib/api';
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
        {/* Sender Name */}
        <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Sender Name</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Used in email templates as {'{sender_name}'} and auto-prefixed to your From address (e.g. "Hector &lt;you@domain.com&gt;").
          </p>
          <input
            type="text"
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder="Hector"
            className="w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]"
          />
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
