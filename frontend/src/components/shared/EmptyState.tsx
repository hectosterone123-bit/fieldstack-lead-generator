import { type LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="relative mb-5">
        {/* Outer ring glow */}
        <div className="absolute inset-0 rounded-2xl ring-8 ring-zinc-900" />
        <div className="relative w-16 h-16 rounded-2xl bg-zinc-900 border border-white/[0.06] shadow-surface flex items-center justify-center">
          <Icon className="w-7 h-7 text-zinc-600" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-zinc-300 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-600 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
