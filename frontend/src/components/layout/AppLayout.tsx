import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell, BotMessageSquare, AlertTriangle, UserPlus, MailX, ShieldAlert, Wifi } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { CopilotSidebar } from '../copilot/CopilotSidebar';
import { CopilotContextProvider } from '../../lib/copilotContext';
import { cn } from '../../lib/utils';
import { formatRelativeTime } from '../../lib/utils';
import { useToast } from '../../lib/toast';

type NotifType = 'new_lead' | 'new_leads' | 'email_bounced' | 'email_complained' | 'send_failed';
interface Notification { id: string; type: NotifType; message: string; time: Date; }

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/cockpit': 'Daily Cockpit',
  '/finder': 'Find Leads',
  '/leads': 'Pipeline',
  '/campaigns': 'Campaigns',
  '/sms': 'SMS Inbox',
  '/sms-blast': 'SMS Blast',
  '/insights': 'Strategy Insights',
  '/sequences': 'Sequences',
  '/templates': 'Templates',
  '/settings': 'Settings',
};

export function AppLayout() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Fieldstack';
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addNotification = useCallback((type: NotifType, message: string) => {
    const note: Notification = { id: Math.random().toString(36).slice(2), type, message, time: new Date() };
    setNotifications(prev => [note, ...prev].slice(0, 20));
    setUnreadCount(prev => prev + 1);
  }, []);

  // Use refs to avoid recreating EventSource when callbacks change
  const toastRef = useRef(toast);
  const addNotificationRef = useRef(addNotification);
  const queryClientRef = useRef(queryClient);

  useEffect(() => {
    toastRef.current = toast;
    addNotificationRef.current = addNotification;
    queryClientRef.current = queryClient;
  }, [toast, addNotification, queryClient]);

  // Real-time lead notifications via SSE (stable connection)
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        const toast = toastRef.current;
        const addNotification = addNotificationRef.current;
        const queryClient = queryClientRef.current;

        if (event.type === 'new_lead') {
          const msg = `New lead: ${event.name}`;
          toast(msg);
          addNotification('new_lead', msg);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        } else if (event.type === 'new_leads') {
          const msg = `${event.count} new lead${event.count > 1 ? 's' : ''} imported`;
          toast(msg);
          addNotification('new_leads', msg);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        } else if (event.type === 'email_bounced') {
          const msg = `Email bounced — ${event.business} removed from future sends`;
          toast(msg, 'error');
          addNotification('email_bounced', msg);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        } else if (event.type === 'email_complained') {
          const msg = `Spam complaint from ${event.business} — unsubscribed automatically`;
          toast(msg, 'error');
          addNotification('email_complained', msg);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        } else if (event.type === 'send_failed') {
          const ch = event.channel === 'email' ? 'Email' : 'SMS';
          const msg = `${ch} failed to send — ${event.lead_name}`;
          toast(msg, 'error');
          addNotification('send_failed', msg);
        }
      } catch {}
    };

    es.onerror = (err) => {
      console.error('SSE connection error:', err);
      es.close();
    };

    return () => es.close();
  }, []);

  // Close bell dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bellOpen]);

  // Ctrl+K / Cmd+K to toggle copilot
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setCopilotOpen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <CopilotContextProvider>
      <div className="flex min-h-screen bg-zinc-950">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="flex-shrink-0 h-14 flex items-center justify-between px-6 border-b border-white/[0.04] bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
            <h1 className="text-zinc-100 font-semibold text-sm">{pageTitle}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCopilotOpen(!copilotOpen)}
                className={cn(
                  'h-8 rounded-lg transition-colors flex items-center gap-1.5 px-2.5',
                  copilotOpen
                    ? 'bg-orange-500/10 text-orange-400'
                    : 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                )}
                title="Toggle AI Copilot (Ctrl+K)"
              >
                <BotMessageSquare className="w-4 h-4" />
                <span className="text-[10px] text-zinc-600 hidden sm:inline">Ctrl+K</span>
              </button>
              <div ref={bellRef} className="relative">
                <button
                  onClick={() => { setBellOpen(v => !v); setUnreadCount(0); }}
                  className={cn(
                    'w-8 h-8 rounded-lg transition-colors flex items-center justify-center relative',
                    bellOpen ? 'bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 top-10 w-80 bg-zinc-900 border border-white/[0.06] rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                      <span className="text-xs font-semibold text-zinc-200">Notifications</span>
                      {notifications.length > 0 && (
                        <button onClick={() => setNotifications([])} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                          Clear all
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                        <Wifi className="w-5 h-5 mb-2 opacity-40" />
                        <p className="text-xs">No notifications yet</p>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.03]">
                        {notifications.map(n => {
                          const Icon = n.type === 'new_lead' || n.type === 'new_leads' ? UserPlus
                            : n.type === 'email_bounced' ? MailX
                            : n.type === 'email_complained' ? ShieldAlert
                            : AlertTriangle;
                          const iconColor = n.type === 'new_lead' || n.type === 'new_leads'
                            ? 'text-emerald-400' : 'text-red-400';
                          return (
                            <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors">
                              <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', iconColor)} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-300 leading-snug">{n.message}</p>
                                <p className="text-[10px] text-zinc-600 mt-0.5 font-data">{formatRelativeTime(n.time.toISOString())}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main content + copilot sidebar */}
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
            <CopilotSidebar open={copilotOpen} onClose={() => setCopilotOpen(false)} />
          </div>
        </div>
      </div>
    </CopilotContextProvider>
  );
}
