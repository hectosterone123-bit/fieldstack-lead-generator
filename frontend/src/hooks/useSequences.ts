import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSequences, fetchSequence, createSequence, updateSequence, deleteSequence, toggleSequence,
  enrollLeads, fetchEnrollments, pauseEnrollment, resumeEnrollment, cancelEnrollment, skipEnrollmentStep,
  fetchOutreachQueue, fetchQueueStats, markQueueItemSent, markQueueItemReplied, dismissQueueItem,
  sendQueueEmail, fetchEmailStatus, sendQueueSms, fetchSmsChannelStatus,
  setEnrollmentAutoSend, flushOverdue,
} from '../lib/api';
import { useToast } from '../lib/toast';

// ─── Sequences ───────────────────────────────────────────────────────────────

export function useSequences() {
  return useQuery({ queryKey: ['sequences'], queryFn: fetchSequences });
}

export function useSequence(id: number | null) {
  return useQuery({
    queryKey: ['sequence', id],
    queryFn: () => fetchSequence(id!),
    enabled: id != null,
  });
}

export function useCreateSequence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: createSequence,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences'] });
      toast('Sequence created');
    },
  });
}

export function useUpdateSequence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; steps?: any[]; auto_send?: boolean; auto_send_after_step?: number; auto_flush_overdue?: boolean }) =>
      updateSequence(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['sequences'] });
      qc.invalidateQueries({ queryKey: ['sequence', vars.id] });
      toast('Sequence updated');
    },
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: deleteSequence,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences'] });
      toast('Sequence deleted');
    },
  });
}

export function useToggleSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleSequence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sequences'] }),
  });
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export function useEnrollLeads() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ lead_ids, sequence_id }: { lead_ids: number[]; sequence_id: number }) =>
      enrollLeads(lead_ids, sequence_id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['sequences'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      toast(`Enrolled ${data.enrolled} lead(s)`);
    },
  });
}

export function useEnrollments(leadId: number | null) {
  return useQuery({
    queryKey: ['enrollments', leadId],
    queryFn: () => fetchEnrollments(leadId!),
    enabled: leadId != null,
  });
}

export function usePauseEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pauseEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useResumeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resumeEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useCancelEnrollment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: cancelEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      toast('Enrollment cancelled');
    },
  });
}

export function useSkipStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: skipEnrollmentStep,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

// ─── Outreach Queue ──────────────────────────────────────────────────────────

export function useOutreachQueue() {
  return useQuery({
    queryKey: ['queue'],
    queryFn: fetchOutreachQueue,
    refetchInterval: 60_000,
  });
}

export function useQueueStats() {
  return useQuery({
    queryKey: ['queue', 'stats'],
    queryFn: fetchQueueStats,
    refetchInterval: 60_000,
  });
}

export function useMarkSent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: markQueueItemSent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast('Marked as sent');
    },
  });
}

export function useMarkReplied() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: markQueueItemReplied,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast('Marked as replied — sequences paused');
    },
  });
}

export function useDismissQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dismissQueueItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
    },
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: sendQueueEmail,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast('Email sent');
    },
    onError: (err: Error) => {
      toast(err.message, 'error');
    },
  });
}

export function useEmailStatus() {
  return useQuery({
    queryKey: ['email-status'],
    queryFn: fetchEmailStatus,
    staleTime: 5 * 60_000,
  });
}

export function useSmsStatus() {
  return useQuery({
    queryKey: ['sms-status'],
    queryFn: fetchSmsChannelStatus,
    staleTime: 5 * 60_000,
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: sendQueueSms,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast('SMS sent');
    },
    onError: (err: Error) => {
      toast(err.message, 'error');
    },
  });
}

export function useSetEnrollmentAutoSend() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: setEnrollmentAutoSend,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      toast('Follow-ups will auto-send on schedule');
    },
  });
}

export function useFlushOverdue() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: flushOverdue,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['queue', 'stats'] });
      toast(`Flushed ${data.sent} overdue item(s)`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}
