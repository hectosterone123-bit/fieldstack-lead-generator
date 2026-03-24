import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell, BotMessageSquare } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { CopilotSidebar } from '../copilot/CopilotSidebar';
import { CopilotContextProvider } from '../../lib/copilotContext';
import { cn } from '../../lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/finder': 'Find Leads',
  '/leads': 'Pipeline',
  '/campaigns': 'Campaigns',
  '/sms': 'SMS Inbox',
  '/sequences': 'Sequences',
  '/templates': 'Templates',
  '/settings': 'Settings',
};

export function AppLayout() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Fieldstack';
  const [copilotOpen, setCopilotOpen] = useState(false);

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
              <button className="w-8 h-8 rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-500 hover:text-zinc-300">
                <Bell className="w-4 h-4" />
              </button>
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
