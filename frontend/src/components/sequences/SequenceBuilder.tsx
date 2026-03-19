import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Save, X, Mail, MessageSquare, PhoneCall, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTemplates } from '../../hooks/useTemplates';
import type { Sequence, SequenceStep, TemplateChannel } from '../../types';

const CHANNEL_OPTIONS: { value: TemplateChannel; label: string; icon: React.ElementType }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
  { value: 'call_script', label: 'Call', icon: PhoneCall },
];

interface Props {
  sequence?: Sequence | null;
  onSave: (data: { name: string; description: string; steps: SequenceStep[]; auto_send?: boolean; auto_send_after_step?: number }) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function SequenceBuilder({ sequence, onSave, onCancel, saving }: Props) {
  const [name, setName] = useState(sequence?.name || '');
  const [description, setDescription] = useState(sequence?.description || '');
  const [autoSendMode, setAutoSendMode] = useState<string>(
    sequence?.auto_send ? 'all' :
    sequence?.auto_send_after_step ? String(sequence.auto_send_after_step) : '0'
  );
  const [steps, setSteps] = useState<SequenceStep[]>(
    sequence?.steps?.length ? sequence.steps : [
      { order: 1, delay_days: 0, channel: 'email', template_id: 0, label: 'Step 1' },
    ]
  );

  const { data: templates } = useTemplates({});

  useEffect(() => {
    if (sequence) {
      setName(sequence.name);
      setDescription(sequence.description || '');
      setAutoSendMode(
        sequence.auto_send ? 'all' :
        sequence.auto_send_after_step ? String(sequence.auto_send_after_step) : '0'
      );
      setSteps(sequence.steps?.length ? sequence.steps : [{ order: 1, delay_days: 0, channel: 'email', template_id: 0, label: 'Step 1' }]);
    }
  }, [sequence]);

  function updateStep(index: number, patch: Partial<SequenceStep>) {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function addStep() {
    const lastStep = steps[steps.length - 1];
    setSteps(prev => [...prev, {
      order: prev.length + 1,
      delay_days: (lastStep?.delay_days || 0) + 3,
      channel: 'email',
      template_id: 0,
      label: `Step ${prev.length + 1}`,
    }]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
  }

  function handleSave() {
    if (!name.trim()) return;
    if (steps.some(s => !s.template_id)) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      steps,
      auto_send: autoSendMode === 'all',
      auto_send_after_step: autoSendMode !== '0' && autoSendMode !== 'all' ? parseInt(autoSendMode) : 0,
    });
  }

  const filteredTemplates = (channel: TemplateChannel) =>
    (templates || []).filter(t => t.channel === channel);

  const isValid = name.trim() && steps.every(s => s.template_id > 0);

  return (
    <div className="space-y-5">
      {/* Name + Description */}
      <div className="space-y-3">
        <div>
          <label className="text-overline text-zinc-500 mb-1 block">Sequence Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., 7-Step Outreach"
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
        </div>
        <div>
          <label className="text-overline text-zinc-500 mb-1 block">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
        </div>
        {/* Auto-send mode */}
        <div className="px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-2">
            <Zap className={cn('w-4 h-4', autoSendMode !== '0' ? 'text-orange-400' : 'text-zinc-600')} />
            <div>
              <p className="text-sm text-zinc-200">Auto-send follow-ups</p>
              <p className="text-xs text-zinc-500">Steps after the cutoff send automatically on schedule</p>
            </div>
          </div>
          <select
            value={autoSendMode}
            onChange={e => setAutoSendMode(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-zinc-900 border border-white/[0.06] text-sm text-zinc-200 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
          >
            <option value="0">Manual (all steps)</option>
            <option value="1">Auto after step 1</option>
            <option value="2">Auto after step 2 (recommended)</option>
            <option value="3">Auto after step 3</option>
            <option value="all">Auto (all steps)</option>
          </select>
        </div>
      </div>

      {/* Steps Timeline */}
      <div>
        <label className="text-overline text-zinc-500 mb-3 block">Steps</label>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="relative flex gap-3">
              {/* Timeline connector */}
              <div className="flex flex-col items-center pt-3">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
                  step.template_id > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                )}>
                  {step.order}
                </div>
                {index < steps.length - 1 && (
                  <div className="w-px flex-1 bg-white/[0.06] mt-1" />
                )}
              </div>

              {/* Step card */}
              <div className="flex-1 rounded-lg bg-zinc-800/50 border border-white/[0.04] p-3 space-y-2">
                {/* Label + delay */}
                <div className="flex items-center gap-2">
                  <input
                    value={step.label}
                    onChange={e => updateStep(index, { label: e.target.value })}
                    placeholder="Step label"
                    className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                  />
                  {autoSendMode !== '0' && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded shrink-0',
                      (autoSendMode === 'all' || step.order > parseInt(autoSendMode || '0'))
                        ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-700/50 text-zinc-500'
                    )}>
                      {(autoSendMode === 'all' || step.order > parseInt(autoSendMode || '0')) ? 'Auto' : 'Manual'}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-zinc-500">Day</span>
                    <input
                      type="number"
                      min={0}
                      value={step.delay_days}
                      onChange={e => updateStep(index, { delay_days: parseInt(e.target.value) || 0 })}
                      className="w-14 px-2 py-1 rounded bg-zinc-900 border border-white/[0.06] text-sm text-zinc-200 text-center focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                </div>

                {/* Channel + Template */}
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md overflow-hidden border border-white/[0.06]">
                    {CHANNEL_OPTIONS.map(ch => {
                      const Icon = ch.icon;
                      return (
                        <button
                          key={ch.value}
                          onClick={() => updateStep(index, { channel: ch.value, template_id: 0 })}
                          className={cn(
                            'px-2 py-1 text-xs flex items-center gap-1 transition-colors',
                            step.channel === ch.value
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>

                  <select
                    value={step.template_id}
                    onChange={e => updateStep(index, { template_id: parseInt(e.target.value) })}
                    className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-white/[0.06] text-sm text-zinc-200 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
                  >
                    <option value={0}>Select template...</option>
                    {filteredTemplates(step.channel).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => moveStep(index, -1)} disabled={index === 0} className="w-6 h-6 rounded hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-default">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="w-6 h-6 rounded hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-default">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeStep(index)} disabled={steps.length <= 1} className="w-6 h-6 rounded hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-default">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addStep}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/[0.08] text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/[0.15] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Step
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4 inline mr-1" />Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="px-4 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4 inline mr-1" />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
