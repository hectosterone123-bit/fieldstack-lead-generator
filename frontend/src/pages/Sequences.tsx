import { useState } from 'react';
import {
  Repeat, Plus, Trash2, Power, PowerOff, Users, Clock, ChevronRight, Zap, Mail,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SequenceBuilder } from '../components/sequences/SequenceBuilder';
import { useSequences, useCreateSequence, useUpdateSequence, useDeleteSequence, useToggleSequence } from '../hooks/useSequences';
import type { SequenceStep } from '../types';

export function Sequences() {
  const { data: sequences, isLoading } = useSequences();
  const createSequence = useCreateSequence();
  const updateSequence = useUpdateSequence();
  const deleteSequence = useDeleteSequence();
  const toggleSequence = useToggleSequence();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const selectedSequence = sequences?.find(s => s.id === selectedId) || null;
  const showBuilder = creating || selectedId != null;

  function handleSave(data: { name: string; description: string; steps: SequenceStep[]; auto_send?: boolean }) {
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
        <button
          onClick={() => { setCreating(true); setSelectedId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Sequence
        </button>
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
                  onClick={() => { setSelectedId(seq.id); setCreating(false); }}
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
                      {!!seq.auto_send && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> Auto
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

        {/* Right: Builder/Editor */}
        {showBuilder && (
          <div className="flex-1 overflow-y-auto p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">
              {creating ? 'New Sequence' : `Edit: ${selectedSequence?.name}`}
            </h2>
            <SequenceBuilder
              sequence={creating ? null : selectedSequence}
              onSave={handleSave}
              onCancel={handleCancel}
              saving={createSequence.isPending || updateSequence.isPending}
            />
          </div>
        )}
      </div>
    </div>
  );
}
