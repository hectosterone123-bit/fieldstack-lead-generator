import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Loader2, Link, Mail, Globe } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSetting } from '../lib/api';
import { useToast } from '../lib/toast';

export function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const [bookingLink, setBookingLink] = useState('');
  const [resendFrom, setResendFrom] = useState('');
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    if (settings) {
      setBookingLink(settings.booking_link || '');
      setResendFrom(settings.resend_from || '');
      setAppUrl(settings.app_url || '');
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
      toast('Settings saved');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  function handleSave() {
    saveMutation.mutate([
      { key: 'booking_link', value: bookingLink },
      { key: 'resend_from', value: resendFrom },
      { key: 'app_url', value: appUrl },
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
            Sender address for outgoing emails. Must be verified in your Resend dashboard.
          </p>
          <input
            type="email"
            value={resendFrom}
            onChange={e => setResendFrom(e.target.value)}
            placeholder="sam@fieldstack.io"
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
