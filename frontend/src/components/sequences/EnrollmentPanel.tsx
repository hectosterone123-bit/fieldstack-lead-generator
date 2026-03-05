import { useState } from 'react';
import { Repeat, Play, Pause, X, SkipForward, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useEnrollments, useSequences, useEnrollLeads,
  usePauseEnrollment, useResumeEnrollment, useCancelEnrollment, useSkipStep,
} from '../../hooks/useSequences';
import type { LeadSequenceEnrollment } from '../../types';

interface Props {
  leadId: number;
}

export function EnrollmentPanel({ leadId }: Props) {
  const { data: enrollments } = useEnrollments(leadId);
  const { data: sequences } = useSequences();
  const enrollLeads = useEnrollLeads();
  const pauseEnrollment = usePauseEnrollment();
  const resumeEnrollment = useResumeEnrollment();
  const cancelEnrollment = useCancelEnrollment();
  const skipStep = useSkipStep();

  const [expanded, setExpanded] = useState(true);
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);

  const activeEnrollments = (enrollments || []).filter(e => e.status === 'active' || e.status === 'paused');
  const pastEnrollments = (enrollments || []).filter(e => e.status === 'completed' || e.status === 'cancelled');
  const activeSequences = (sequences || []).filter(s => s.is_active);

  function handleEnroll() {
    if (!selectedSequenceId) return;
    enrollLeads.mutate(
      { lead_ids: [leadId], sequence_id: selectedSequenceId },
      { onSuccess: () => setSelectedSequenceId(null) },
    );
  }

  return (
    <div className="px-5 py-4 border-b border-white/[0.04]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 mb-3 w-full text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />}
        <Repeat className="w-3 h-3 text-zinc-600" />
        <p className="text-overline text-zinc-600">Sequences</p>
        {activeEnrollments.length > 0 && (
          <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-medium ml-1">
            {activeEnrollments.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Active enrollments */}
          {activeEnrollments.map(enrollment => (
            <EnrollmentCard
              key={enrollment.id}
              enrollment={enrollment}
              onPause={() => pauseEnrollment.mutate(enrollment.id)}
              onResume={() => resumeEnrollment.mutate(enrollment.id)}
              onCancel={() => cancelEnrollment.mutate(enrollment.id)}
              onSkip={() => skipStep.mutate(enrollment.id)}
            />
          ))}

          {/* Past enrollments (collapsed summary) */}
          {pastEnrollments.length > 0 && activeEnrollments.length === 0 && (
            <div className="text-xs text-zinc-500">
              {pastEnrollments.length} past enrollment{pastEnrollments.length !== 1 ? 's' : ''}
              {pastEnrollments.some(e => e.status === 'completed') && ' (completed)'}
            </div>
          )}

          {/* Enroll button */}
          {activeEnrollments.length === 0 && (
            <div className="flex gap-2">
              <select
                value={selectedSequenceId || ''}
                onChange={e => setSelectedSequenceId(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-800/60 border border-white/[0.06] text-xs text-zinc-300 focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
              >
                <option value="">Select sequence...</option>
                {activeSequences.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.steps.length} steps)</option>
                ))}
              </select>
              <button
                onClick={handleEnroll}
                disabled={!selectedSequenceId || enrollLeads.isPending}
                className="px-3 py-1.5 rounded-lg text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Enroll
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrollmentCard({ enrollment, onPause, onResume, onCancel, onSkip }: {
  enrollment: LeadSequenceEnrollment;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSkip: () => void;
}) {
  const totalSteps = enrollment.steps.length;
  const isPaused = enrollment.status === 'paused';

  return (
    <div className={cn(
      'rounded-lg border p-2.5 space-y-2',
      isPaused ? 'bg-zinc-800/30 border-white/[0.04]' : 'bg-orange-500/[0.04] border-orange-500/10',
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{enrollment.sequence_name}</span>
        {isPaused && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">Paused</span>}
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1">
        {enrollment.steps.map((step, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < enrollment.current_step;
          const isCurrent = stepNum === enrollment.current_step;
          return (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full flex-1 transition-all',
                isCompleted ? 'bg-orange-500' :
                isCurrent ? 'bg-orange-500/50' :
                'bg-zinc-700',
              )}
              title={`Step ${stepNum}: ${step.label}`}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500">
          Step {Math.min(enrollment.current_step, totalSteps)}/{totalSteps}
          {enrollment.current_step <= totalSteps && ` — ${enrollment.steps[enrollment.current_step - 1]?.label}`}
        </span>

        <div className="flex items-center gap-1">
          {isPaused ? (
            <button onClick={onResume} className="w-5 h-5 rounded hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-emerald-400 transition-colors" title="Resume">
              <Play className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={onPause} className="w-5 h-5 rounded hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-amber-400 transition-colors" title="Pause">
              <Pause className="w-3 h-3" />
            </button>
          )}
          <button onClick={onSkip} className="w-5 h-5 rounded hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors" title="Skip step">
            <SkipForward className="w-3 h-3" />
          </button>
          <button onClick={onCancel} className="w-5 h-5 rounded hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors" title="Cancel">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
