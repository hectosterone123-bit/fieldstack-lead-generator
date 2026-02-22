import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Bell, ChevronRight, BotMessageSquare } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { CopilotSidebar } from '../copilot/CopilotSidebar';
import { CopilotContextProvider } from '../../lib/copilotContext';
import { cn } from '../../lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/finder': 'Find Leads',
  '/leads': 'Pipeline',
};

export function AppLayout() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'FieldStack';
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <CopilotContextProvider>
      <div className="flex min-h-screen bg-zinc-950">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="flex-shrink-0 h-12 flex items-center justify-between px-6 border-b border-white/[0.04] bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-zinc-600">FieldStack</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
              <span className="text-zinc-300 font-medium">{pageTitle}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCopilotOpen(!copilotOpen)}
                className={cn(
                  'w-8 h-8 rounded-lg transition-colors flex items-center justify-center',
                  copilotOpen
                    ? 'bg-orange-500/10 text-orange-400'
                    : 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                )}
                title="AI Copilot"
              >
                <BotMessageSquare className="w-4 h-4" />
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
