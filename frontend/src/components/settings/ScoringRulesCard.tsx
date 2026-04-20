import { useState } from 'react';
import { Trash2, Pencil, Plus, X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useScoringRules, useCreateScoringRule, useUpdateScoringRule, useDeleteScoringRule, useToggleScoringRule } from '../../hooks/useScoringRules';
import type { ScoringRule, ScoringRuleTrigger, ScoringRuleAction, ScoringRuleConditionType } from '../../types';

const TRIGGER_LABELS: Record<ScoringRuleTrigger, string> = {
  email_opened: 'Email Opened',
  email_clicked: 'Email Clicked',
  email_replied: 'Email Replied',
  sms_replied: 'SMS Replied',
  no_activity_days: 'No Activity (days)',
};

const ACTION_LABELS: Record<ScoringRuleAction, string> = {
  add: 'Add',
  subtract: 'Subtract',
  set: 'Set to',
};

interface RuleForm {
  name: string;
  trigger: ScoringRuleTrigger;
  action: ScoringRuleAction;
  value: string;
  condition_type: ScoringRuleConditionType;
  condition_value: string;
}

const DEFAULT_FORM: RuleForm = {
  name: '',
  trigger: 'email_opened',
  action: 'add',
  value: '10',
  condition_type: null,
  condition_value: '',
};

function ruleFormFromRule(rule: ScoringRule): RuleForm {
  return {
    name: rule.name,
    trigger: rule.trigger,
    action: rule.action,
    value: String(rule.value),
    condition_type: rule.condition_type,
    condition_value: rule.condition_value != null ? String(rule.condition_value) : '',
  };
}

function actionSummary(rule: ScoringRule) {
  const sign = rule.action === 'add' ? '+' : rule.action === 'subtract' ? '-' : '=';
  return `${sign}${rule.value} pts`;
}

export function ScoringRulesCard() {
  const { data: rules = [], isLoading } = useScoringRules();
  const create = useCreateScoringRule();
  const update = useUpdateScoringRule();
  const remove = useDeleteScoringRule();
  const toggle = useToggleScoringRule();

  const [editId, setEditId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);

  function openNew() {
    setForm(DEFAULT_FORM);
    setEditId('new');
  }

  function openEdit(rule: ScoringRule) {
    setForm(ruleFormFromRule(rule));
    setEditId(rule.id);
  }

  function cancel() {
    setEditId(null);
  }

  function save() {
    const payload = {
      name: form.name.trim() || TRIGGER_LABELS[form.trigger],
      trigger: form.trigger,
      action: form.action,
      value: parseInt(form.value) || 0,
      condition_type: form.condition_type,
      condition_value: form.condition_type && form.condition_value ? parseInt(form.condition_value) : null,
      enabled: 1 as const,
    };

    if (editId === 'new') {
      create.mutate(payload, { onSuccess: () => setEditId(null) });
    } else if (editId != null) {
      update.mutate({ id: editId, data: payload }, { onSuccess: () => setEditId(null) });
    }
  }

  const valueLabel = (trigger: ScoringRuleTrigger) =>
    trigger === 'no_activity_days' ? 'Days inactive' : 'Points';

  return (
    <div className="bg-zinc-900 rounded-xl border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Scoring Rules</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Auto-adjust heat scores when events occur</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-orange-500 hover:bg-orange-400 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </button>
      </div>

      {isLoading && <p className="text-xs text-zinc-500">Loading…</p>}

      <div className="space-y-2">
        {rules.map(rule => (
          <div key={rule.id}>
            {editId === rule.id ? (
              <RuleFormUI
                form={form}
                setForm={setForm}
                onSave={save}
                onCancel={cancel}
                saving={update.isPending}
                valueLabel={valueLabel(form.trigger)}
              />
            ) : (
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
                rule.enabled ? 'bg-zinc-800/50 border-white/[0.04]' : 'bg-zinc-900 border-white/[0.03] opacity-50'
              )}>
                {/* Toggle */}
                <button
                  onClick={() => toggle.mutate(rule.id)}
                  className={cn('relative w-8 h-4 rounded-full transition-colors shrink-0', rule.enabled ? 'bg-orange-500' : 'bg-zinc-700')}
                >
                  <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform', rule.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-200">{rule.name}</span>
                    <span className="text-[10px] text-zinc-500">on {TRIGGER_LABELS[rule.trigger]}</span>
                  </div>
                  {rule.condition_type && rule.condition_value != null && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      Only if score {rule.condition_type === 'score_above' ? '>' : '<'} {rule.condition_value}
                    </p>
                  )}
                </div>

                {/* Action badge */}
                <span className={cn(
                  'text-xs font-data font-semibold px-2 py-0.5 rounded shrink-0',
                  rule.action === 'add' ? 'text-emerald-400 bg-emerald-500/10' :
                  rule.action === 'subtract' ? 'text-red-400 bg-red-500/10' :
                  'text-blue-400 bg-blue-500/10'
                )}>
                  {actionSummary(rule)}
                </span>

                {/* Actions */}
                <button onClick={() => openEdit(rule)} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove.mutate(rule.id)}
                  className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {rules.length === 0 && !isLoading && (
          <p className="text-xs text-zinc-600 text-center py-3">No rules yet. Add one to get started.</p>
        )}

        {editId === 'new' && (
          <RuleFormUI
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={cancel}
            saving={create.isPending}
            valueLabel={valueLabel(form.trigger)}
          />
        )}
      </div>
    </div>
  );
}

function RuleFormUI({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  valueLabel,
}: {
  form: RuleForm;
  setForm: (f: RuleForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  valueLabel: string;
}) {
  const inputCls = 'w-full bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/40 [color-scheme:dark]';
  const selectCls = inputCls;

  return (
    <div className="bg-zinc-800/70 rounded-lg border border-white/[0.06] p-3 space-y-2.5">
      <input
        className={inputCls}
        placeholder="Rule name (optional)"
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
      />
      <div className="grid grid-cols-3 gap-2">
        <select className={selectCls} value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value as ScoringRuleTrigger })}>
          {(Object.keys(TRIGGER_LABELS) as ScoringRuleTrigger[]).map(t => (
            <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
          ))}
        </select>
        <select className={selectCls} value={form.action} onChange={e => setForm({ ...form, action: e.target.value as ScoringRuleAction })}>
          {(Object.keys(ACTION_LABELS) as ScoringRuleAction[]).map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <input
          className={inputCls}
          type="number"
          min={0}
          placeholder={valueLabel}
          value={form.value}
          onChange={e => setForm({ ...form, value: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className={selectCls}
          value={form.condition_type ?? ''}
          onChange={e => setForm({ ...form, condition_type: (e.target.value || null) as ScoringRuleConditionType })}
        >
          <option value="">No condition</option>
          <option value="score_above">Only if score above</option>
          <option value="score_below">Only if score below</option>
        </select>
        <input
          className={cn(inputCls, !form.condition_type && 'opacity-40 pointer-events-none')}
          type="number"
          min={0}
          max={100}
          placeholder="Score threshold"
          value={form.condition_value}
          disabled={!form.condition_type}
          onChange={e => setForm({ ...form, condition_value: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <X className="w-3 h-3" /> Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white transition-colors"
        >
          <Check className="w-3 h-3" /> Save
        </button>
      </div>
    </div>
  );
}
