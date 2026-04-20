import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Repeat, Plus, Trash2, Power, PowerOff, Users, Clock, ChevronRight, Zap, Mail, BarChart2, LayoutTemplate, X, MessageSquare,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SequenceBuilder } from '../components/sequences/SequenceBuilder';
import { useSequences, useCreateSequence, useUpdateSequence, useDeleteSequence, useToggleSequence, useSequenceAnalytics, useSequenceTemplates, useCloneTemplate } from '../hooks/useSequences';
import type { Sequence, SequenceStep } from '../types';

export function Sequences() {
  const navigate = useNavigate();
  const { data: sequences, isLoading } = useSequences();
  const createSequence = useCreateSequence();
  const updateSequence = useUpdateSequence();
  const deleteSequence = useDeleteSequence();
  const toggleSequence = useToggleSequence();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'analytics'>('edit');
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: templates } = useSequenceTemplates();
  const cloneTemplate = useCloneTemplate();

  const selectedSequence = sequences?.find(s => s.id === selectedId) || null;
  const showBuilder = creating || selectedId != null;

  const { data: analytics } = useSequenceAnalytics(activeTab === 'analytics' ? selectedId : null);

  function handleSave(data: { name: string; description: string; steps: SequenceStep[]; auto_send?: boolean; auto_send_after_step?: number }) {
    if (creating) {
      createSequence.mutate(data, {
        onSuccess: () => setCreating(false),
      });
    } else if (selectedId) {
      updateSequence.mutate({ id: selectedId, ...data });
    }
  }

  function handleCancel() {
    setCreating(false);
    setSelectedId(null);
  }

  function handleDelete(id: number) {
    if (selectedId === id) setSelectedId(null);
    deleteSequence.mutate(id);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-orange-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Sequences</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors border border-white/[0.06]"
          >
            <LayoutTemplate className="w-4 h-4" /> Templates
          </button>
          <button
            onClick={() => { setCreating(true); setSelectedId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Sequence
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Sequence list */}
        <div className={cn(
          'border-r border-white/[0.04] overflow-y-auto',
          showBuilder ? 'w-[340px]' : 'flex-1'
        )}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">Loading...</div>
          ) : !sequences?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Repeat className="w-10 h-10 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-400 mb-1">No sequences yet</p>
              <p className="text-xs text-zinc-600">Create a sequence to automate your outreach pipeline.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {sequences.map(seq => (
                <div
                  key={seq.id}
                  onClick={() => { setSelectedId(seq.id); setCreating(false); setActiveTab('edit'); }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors group',
                    selectedId === seq.id && 'bg-orange-500/[0.04] border-l-2 border-orange-500'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm font-medium truncate', seq.is_active ? 'text-zinc-200' : 'text-zinc-500')}>
                        {seq.name}
                      </p>
                      {!seq.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">Inactive</span>
                      )}
                      {(!!seq.auto_send || !!seq.auto_send_after_step) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          {seq.auto_send ? 'Auto' : `Auto after step ${seq.auto_send_after_step}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {seq.steps.length} steps
                      </span>
                      {(seq.active_enrollments ?? 0) > 0 && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {seq.active_enrollments} active
                        </span>
                      )}
                      {(seq.emails_sent ?? 0) > 0 && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {seq.emails_sent} sent
                          <span className="text-zinc-600">·</span>
                          <span className={(seq.emails_opened ?? 0) / (seq.emails_sent ?? 1) >= 0.3 ? 'text-emerald-400' : 'text-zinc-400'}>
                            {Math.round(((seq.emails_opened ?? 0) / (seq.emails_sent ?? 1)) * 100)}% opened
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); toggleSequence.mutate(seq.id); }}
                      className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                      title={seq.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {seq.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(seq.id); }}
                      className="w-7 h-7 rounded-md hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <ChevronRight className="w-4 h-4 text-zinc-700 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Builder/Editor or Analytics */}
        {showBuilder && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs (only when editing existing, not creating) */}
            {!creating && selectedId && (
              <div className="flex items-center gap-1 px-5 pt-4 pb-0 border-b border-white/[0.04]">
                <button
                  onClick={() => setActiveTab('edit')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-md transition-colors border-b-2 -mb-px',
                    activeTab === 'edit' ? 'text-zinc-200 border-orange-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  )}
                >
                  Edit
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-md transition-colors border-b-2 -mb-px',
                    activeTab === 'analytics' ? 'text-zinc-200 border-orange-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  )}
                >
                  <BarChart2 className="w-3 h-3" /> Analytics
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5">
              {(creating || activeTab === 'edit') ? (
                <>
                  {!creating && <h2 className="text-sm font-medium text-zinc-300 mb-4">{selectedSequence?.name}</h2>}
                  {creating && <h2 className="text-sm font-medium text-zinc-300 mb-4">New Sequence</h2>}
                  <SequenceBuilder
                    sequence={creating ? null : selectedSequence}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    saving={createSequence.isPending || updateSequence.isPending}
                  />
                </>
              ) : analytics ? (
                <div className="space-y-5">
                  {/* Totals */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Enrolled', value: analytics.totals.enrolled, onClick: () => navigate('/campaigns') },
                      { label: 'Active', value: analytics.totals.active, onClick: () => navigate('/campaigns') },
                      { label: 'Completed', value: analytics.totals.completed, onClick: () => navigate('/leads', { state: { preset: { status: 'closed_won' } } }) },
                      { label: 'Cancelled', value: analytics.totals.cancelled, onClick: () => navigate('/leads') },
                    ].map(({ label, value, onClick }) => (
                      <button key={label} onClick={onClick} className="bg-zinc-800/50 rounded-lg p-3 text-center hover:bg-zinc-800 transition-colors">
                        <p className="text-lg font-semibold text-zinc-100 font-data">{value}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
                      </button>
                    ))}
                  </div>

                  {/* Per-step funnel */}
                  <div>
                    <p className="text-overline text-zinc-600 mb-3">Step Funnel</p>
                    <div className="space-y-3">
                      {analytics.steps.map(step => {
                        const openRate = step.sent > 0 ? Math.round((step.opened / step.sent) * 100) : 0;
                        const replyRate = step.sent > 0 ? Math.round((step.replied / step.sent) * 100) : 0;
                        return (
                          <div key={step.step} className="bg-zinc-800/50 rounded-lg p-3 border border-white/[0.04]">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] flex items-center justify-center font-medium">{step.step}</span>
                                <span className="text-xs text-zinc-300">{step.label}</span>
                              </div>
                              <span className="text-xs text-zinc-500">{step.sent} sent</span>
                            </div>
                            {step.sent > 0 && (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${openRate}%` }} />
                                  </div>
                                  <span className="text-[10px] text-zinc-400 w-20 text-right">{step.opened} opened ({openRate}%)</span>
                                </div>
                                {step.clicked > 0 && (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((step.clicked / step.sent) * 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] text-zinc-400 w-20 text-right">{step.clicked} clicked</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${replyRate}%` }} />
                                  </div>
                                  <span className="text-[10px] text-zinc-400 w-20 text-right">{step.replied} replied ({replyRate}%)</span>
                                </div>
                                {step.bounced > 0 && (
                                  <p className="text-[10px] text-red-400">{step.bounced} bounced</p>
                                )}
                              </div>
                            )}
                            {step.sent === 0 && (
                              <p className="text-[10px] text-zinc-600">No sends yet</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">Loading analytics...</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template Library Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowTemplates(false)} />
          <div className="relative bg-zinc-900 border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-orange-400" />
                  Sequence Templates
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">Pre-built sequences — clone in one click and customize from there.</p>
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template cards */}
            <div className="overflow-y-auto p-6">
              {!templates?.length ? (
                <p className="text-sm text-zinc-500 text-center py-8">No templates found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {templates.map((tpl: Sequence) => {
                    const channels = [...new Set(tpl.steps.map(s => s.channel))];
                    const hasEmail = channels.includes('email');
                    const hasSms = channels.includes('sms');
                    return (
                      <div key={tpl.id} className="bg-zinc-800/60 border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{tpl.name}</p>
                          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{tpl.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />{tpl.steps.length} steps
                          </span>
                          {hasEmail && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 flex items-center gap-1">
                              <Mail className="w-2.5 h-2.5" />Email
                            </span>
                          )}
                          {hasSms && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                              <MessageSquare className="w-2.5 h-2.5" />SMS
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            cloneTemplate.mutate(tpl.id, {
                              onSuccess: (newSeq) => {
                                setShowTemplates(false);
                                setSelectedId(newSeq.id);
                                setCreating(false);
                                setActiveTab('edit');
                              },
                            });
                          }}
                          disabled={cloneTemplate.isPending}
                          className="mt-auto w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          Use Template
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
