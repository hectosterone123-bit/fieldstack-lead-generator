import { useState } from 'react';
import {
  Mail, MessageSquare, PhoneCall, Video, Plus, Pencil, Trash2,
  ChevronDown, ChevronRight, Save, X, Info,
} from 'lucide-react';
import type { Template, TemplateChannel, LeadStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { cn } from '../lib/utils';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '../hooks/useTemplates';
import { useToast } from '../lib/toast';

const CHANNEL_TABS: { key: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'call_script', label: 'Call Script', icon: PhoneCall },
  { key: 'loom_script', label: 'Loom Script', icon: Video },
];

const VARIABLES = [
  '{business_name}', '{first_name}', '{last_name}', '{email}',
  '{phone}', '{city}', '{state}', '{service_type}', '{estimated_value}',
];

const EMPTY_FORM = {
  name: '',
  channel: 'email' as TemplateChannel,
  status_stage: 'new' as LeadStatus,
  step_order: 1,
  subject: '',
  body: '',
};

export function Templates() {
  const [channel, setChannel] = useState<TemplateChannel>('email');
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: templates, isLoading } = useTemplates({ channel });
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const { toast } = useToast();

  // Group by step_order
  const grouped = (templates || []).reduce<Record<number, Template[]>>((acc, t) => {
    const step = t.step_order || 0;
    if (!acc[step]) acc[step] = [];
    acc[step].push(t);
    return acc;
  }, {});
  const steps = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  const STEP_LABELS: Record<number, string> = {
    1: 'Mystery Shopper Test',
    2: 'Problem Reveal',
    3: 'Loom Video Delivery',
    4: 'Follow-Up #1',
    5: 'Follow-Up #2 — Social Proof',
    6: 'Breakup / Last Chance',
    7: 'Re-engagement',
  };

  function handleStartEdit(t: Template) {
    setEditing(t);
    setForm({
      name: t.name,
      channel: t.channel,
      status_stage: t.status_stage as LeadStatus,
      step_order: t.step_order,
      subject: t.subject || '',
      body: t.body,
    });
    setCreating(false);
  }

  function handleStartCreate() {
    setEditing(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM, channel });
  }

  function handleSave() {
    if (!form.name || !form.body) {
      toast('Name and body are required', 'error');
      return;
    }

    if (editing) {
      updateTemplate.mutate(
        { id: editing.id, data: { ...form, subject: form.subject || null } },
        {
          onSuccess: () => { toast('Template updated'); setEditing(null); setCreating(false); },
          onError: () => toast('Failed to update', 'error'),
        }
      );
    } else {
      createTemplate.mutate(
        { ...form, subject: form.subject || null } as any,
        {
          onSuccess: () => { toast('Template created'); setCreating(false); },
          onError: () => toast('Failed to create', 'error'),
        }
      );
    }
  }

  function handleDelete(t: Template) {
    if (t.is_default) {
      toast('Cannot delete default templates', 'error');
      return;
    }
    deleteTemplate.mutate(t.id, {
      onSuccess: () => toast('Template deleted'),
      onError: () => toast('Failed to delete', 'error'),
    });
  }

  function handleCancel() {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Outreach Templates</h1>
            <p className="text-sm text-zinc-500 mt-1">Pre-built sequences for the Fieldstack outreach flow</p>
          </div>
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors shadow-[0_0_16px_-4px_rgba(249,115,22,0.5)]"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>

        {/* Channel tabs */}
        <div className="flex gap-1 mb-6">
          {CHANNEL_TABS.map(tab => {
            const Icon = tab.icon;
            const active = channel === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setChannel(tab.key); handleCancel(); }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-zinc-800 text-white border border-white/[0.08]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Create/Edit form */}
        {(creating || editing) && (
          <div className="mb-6 bg-zinc-900 border border-white/[0.08] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {editing ? 'Edit Template' : 'New Template'}
              </h3>
              <button onClick={handleCancel} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Template name..."
                  className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Stage</label>
                  <select
                    value={form.status_stage}
                    onChange={e => setForm({ ...form, status_stage: e.target.value as LeadStatus })}
                    className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40 [color-scheme:dark]"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Step Order</label>
                  <input
                    type="number"
                    min="0"
                    value={form.step_order}
                    onChange={e => setForm({ ...form, step_order: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
                  />
                </div>
              </div>
            </div>

            {form.channel === 'email' && (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Subject Line</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                  placeholder="Email subject..."
                  className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Body</label>
              <textarea
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                rows={10}
                placeholder="Template body... Use {business_name}, {city}, etc."
                className="w-full bg-zinc-800/60 border border-white/[0.06] rounded-lg px-3 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500/40 resize-y font-mono"
              />
            </div>

            {/* Variable reference */}
            <div className="flex items-start gap-2 bg-zinc-800/40 rounded-lg px-3 py-2.5">
              <Info className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(v => (
                  <code key={v} className="px-1.5 py-0.5 bg-zinc-700/50 text-orange-400/80 text-xs rounded font-mono">
                    {v}
                  </code>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={createTemplate.isPending || updateTemplate.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white transition-colors"
              >
                <Save className="w-4 h-4" />
                {editing ? 'Save Changes' : 'Create Template'}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Template list by step */}
        {isLoading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">Loading templates...</div>
        ) : steps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No templates for this channel yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map(step => {
              const isExpanded = expandedStep === step;
              const stepTemplates = grouped[step];
              return (
                <div key={step} className="bg-zinc-900 border border-white/[0.06] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : step)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">
                        {step}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {STEP_LABELS[step] || `Step ${step}`}
                        </p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {stepTemplates.length} template{stepTemplates.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-zinc-500" />
                      : <ChevronRight className="w-4 h-4 text-zinc-500" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/[0.04]">
                      {stepTemplates.map(t => (
                        <div key={t.id} className="px-5 py-4 border-b border-white/[0.04] last:border-b-0">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-zinc-300">{t.name}</p>
                              {t.subject && (
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  Subject: <span className="text-zinc-400">{t.subject}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleStartEdit(t)}
                                className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {!t.is_default && (
                                <button
                                  onClick={() => handleDelete(t)}
                                  className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <pre className="text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap font-sans max-h-32 overflow-hidden relative">
                            {t.body}
                            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent" />
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
