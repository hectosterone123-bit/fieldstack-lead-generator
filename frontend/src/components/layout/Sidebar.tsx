import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Users, Flame, MapPin, FileText, Repeat, MessageSquare, Settings, Target, Mail, Crosshair, PhoneOutgoing } from 'lucide-react';
import { cn } from '../../lib/utils';

const navGroups = [
  {
    items: [
      { to: '/cockpit', icon: Crosshair, label: 'Cockpit' },
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/finder', icon: Search, label: 'Find Leads' },
      { to: '/scraper', icon: Mail, label: 'Email Scraper' },
      { to: '/leads', icon: Users, label: 'Pipeline' },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { to: '/caller', icon: PhoneOutgoing, label: 'AI Caller' },
      { to: '/campaigns', icon: Target, label: 'Campaigns' },
      { to: '/sms', icon: MessageSquare, label: 'SMS Inbox' },
      { to: '/sequences', icon: Repeat, label: 'Sequences' },
      { to: '/templates', icon: FileText, label: 'Templates' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-950 border-r border-white/[0.04] flex flex-col h-screen sticky top-0 relative">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.04]">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/10 border border-orange-500/20 shadow-[0_0_12px_-2px_rgba(249,115,22,0.3)]">
          <Flame className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <div className="text-zinc-100 font-semibold text-sm leading-tight">Fieldstack</div>
          <div className="text-zinc-500 text-[10px] leading-none mt-0.5">Lead Generator</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p className="text-overline text-zinc-700 px-3 mb-2">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
                      isActive
                        ? 'bg-orange-500/10 text-orange-400 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-[60%] bg-orange-500 rounded-r-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                      )}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/[0.04]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02]">
          <MapPin className="w-3 h-3 text-zinc-600 flex-shrink-0" />
          <span className="text-[10px] text-zinc-600 leading-tight">Powered by OpenStreetMap</span>
          <span className="ml-auto text-[10px] text-zinc-700">v1.0</span>
        </div>
      </div>
    </aside>
  );
}
