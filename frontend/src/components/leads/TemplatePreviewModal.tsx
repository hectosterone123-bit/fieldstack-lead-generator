import { useState, useEffect } from 'react';
import {
  X, Mail, MessageSquare, PhoneCall, Copy, Check,
  ChevronRight, Loader2,
} from 'lucide-react';
import type { Lead, Template, TemplateChannel, TemplatePreview } from '../../types';
import { STATUS_LABELS } from '../../types';
import { cn } from '../../lib/utils';
import { useTemplates, usePreviewTemplate } from '../../hooks/useTemplates';
import { useLogActivity } from '../../hooks/useLeads';
import { useToast } from '../../lib/toast';

const CHANNEL_TABS: { key: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'call_script', label: 'Call Script', icon: PhoneCall },
];

const CHANNEL_COLORS: Record<TemplateChannel, string> = {
  email: 'text-violet-400',
  sms: 'text-green-400',
  call_script: 'text-amber-400',
};

interface Props {
  lead: Lead;
  onClose: () => void;
}

export function TemplatePreviewModal({ lead, onClose }: Props) {
  const [channel, setChannel] = useState<TemplateChannel>('email');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: templates, isLoading } = useTemplates({ channel });
  const previewMutation = usePreviewTemplate();
  const logActivity = useLogActivity();
  const { toast } = useToast();

  // Group templates by step_order
  const grouped = (templates || []).reduce<Record<number, Template[]>>((acc, t) => {
    const step = t.step_order || 0;
    if (!acc[step]) acc[step] = [];
    acc[step].push(t);
    return acc;
  }, {});
  const steps = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  // Auto-select first template when channel changes
  useEffect(() => {
    setSelectedId(null);
    setPreview(null);
  }, [channel]);

  function handleSelect(template: Template) {
    setSelectedId(template.id);
    setCopied(false);
    previewMutation.mutate(
      { templateId: template.id, leadId: lead.id },
      { onSuccess: (data) => setPreview(data) }
    );
  }

  async function handleCopy() {
    if (!preview) return;

    const text = channel === 'email' && preview.rendered_subject
      ? `Subject: ${preview.rendered_subject}\n\n${preview.rendered_body}`
      : preview.rendered_body;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Log activity
      const activityType = channel === 'email' ? 'email_sent' : channel === 'sms' ? 'sms_sent' : 'call_attempt';
      const activityTitle = channel === 'email' ? 'Email template copied' : channel === 'sms' ? 'SMS template copied' : 'Call script copied';
      logActivity.mutate({
        leadId: lead.id,
        data: {
          type: activityType,
          title: activityTitle,
          description: `Template: ${preview.name}`,
        },
      });

      toast('Copied to clipboard');
    } catch {
      toast('Failed to copy', 'error');
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-zinc-900 border border-white/[0.08] rounded-2xl z-[61] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Outreach Templates</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lead.business_name} · {STATUS_LABELS[lead.status]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Channel tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-white/[0.04] flex-shrink-0 bg-zinc-950/40">
          {CHANNEL_TABS.map(tab => {
            const Icon = tab.icon;
            const active = channel === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setChannel(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-zinc-800 text-white border border-white/[0.08]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                )}
              >
                <Icon className={cn('w-4 h-4', active && CHANNEL_COLORS[tab.key])} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body: list + preview */}
        <div className="flex-1 flex overflow-hidden">

          {/* Template list */}
          <div className="w-72 border-r border-white/[0.04] overflow-y-auto flex-shrink-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              </div>
            ) : steps.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-600">
                No templates for this channel yet.
              </div>
            ) : (
              <div className="py-2">
                {steps.map(step => (
                  <div key={step}>
                    {step > 0 && (
                      <div className="px-4 pt-4 pb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                          Step {step}
                        </p>
                      </div>
                    )}
                    {grouped[step].map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleSelect(t)}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 transition-all group',
                          selectedId === t.id
                            ? 'bg-zinc-800 border-l-2 border-orange-500'
                            : 'hover:bg-zinc-800/50 border-l-2 border-transparent',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm font-medium truncate',
                            selectedId === t.id ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300',
                          )}>
                            {t.name}
                          </p>
                          <p className="text-xs text-zinc-600 mt-0.5 capitalize">
                            {t.status_stage.replace('_', ' ')}
                          </p>
                        </div>
                        <ChevronRight className={cn(
                          'w-3.5 h-3.5 flex-shrink-0 transition-colors',
                          selectedId === t.id ? 'text-orange-500' : 'text-zinc-700 group-hover:text-zinc-500',
                        )} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!preview && !previewMutation.isPending ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Mail className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">Select a template to preview</p>
                  <p className="text-xs text-zinc-600 mt-1">Variables will be filled with lead data</p>
                </div>
              </div>
            ) : previewMutation.isPending ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : preview ? (
              <>
                {/* Preview header */}
                <div className="px-6 py-4 border-b border-white/[0.04] flex-shrink-0 bg-zinc-950/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{preview.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Step {preview.step_order} · {preview.channel === 'email' ? 'Email' : preview.channel === 'sms' ? 'SMS' : 'Call Script'}
                      </p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                        copied
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                          : 'bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_16px_-4px_rgba(249,115,22,0.5)]',
                      )}
                    >
                      {copied ? (
                        <><Check className="w-4 h-4" /> Copied!</>
                      ) : (
                        <><Copy className="w-4 h-4" /> Copy to Clipboard</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Preview body */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Email subject line */}
                  {channel === 'email' && preview.rendered_subject && (
                    <div className="mb-4 pb-4 border-b border-white/[0.04]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">Subject Line</p>
                      <p className="text-sm font-medium text-white">{preview.rendered_subject}</p>
                    </div>
                  )}

                  {/* Body */}
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed bg-transparent p-0 m-0 border-none">
                      {preview.rendered_body}
                    </pre>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
