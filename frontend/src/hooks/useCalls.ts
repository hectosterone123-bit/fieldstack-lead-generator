import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveCalls, fetchCallHistory, fetchCallQueue,
  startAiCall, endAiCall, setCallQueue, callNextInQueue, clearCallQueue, updateCallOutcome,
  bulkUpdateCallOutcomes,
} from '../lib/api';
import { useToast } from '../lib/toast';

export function useActiveCalls() {
  return useQuery({
    queryKey: ['active-calls'],
    queryFn: fetchActiveCalls,
    refetchInterval: 3000,
  });
}

export function useCallHistory() {
  return useQuery({
    queryKey: ['call-history'],
    queryFn: fetchCallHistory,
  });
}

export function useCallQueue() {
  return useQuery({
    queryKey: ['call-queue'],
    queryFn: fetchCallQueue,
  });
}

export function useStartCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ leadId, templateId }: { leadId: number; templateId: number }) =>
      startAiCall(leadId, templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-calls'] });
      qc.invalidateQueries({ queryKey: ['call-queue'] });
      qc.invalidateQueries({ queryKey: ['call-history'] });
      toast('AI call started');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}

export function useEndCall() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (callId: number) => endAiCall(callId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-calls'] });
      qc.invalidateQueries({ queryKey: ['call-history'] });
      toast('Call ended');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}

export function useSetCallQueue() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ leadIds, templateId }: { leadIds: number[]; templateId: number }) =>
      setCallQueue(leadIds, templateId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['call-queue'] });
      toast(`${data.queued} leads queued for calling`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}

export function useCallNextInQueue() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => callNextInQueue(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['active-calls'] });
      qc.invalidateQueries({ queryKey: ['call-queue'] });
      qc.invalidateQueries({ queryKey: ['call-history'] });
      if (data) {
        toast('Calling next lead');
      } else {
        toast('Queue is empty', 'error');
      }
    },
    onError: (err: Error) => {
      if (err.message === 'outside_window') {
        toast('Outside calling window — try 8–10 AM or 4–6 PM local time', 'error');
      } else {
        toast(err.message, 'error');
      }
    },
  });
}

export function useClearCallQueue() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => clearCallQueue(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-queue'] });
      toast('Queue cleared');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}

export function useUpdateCallOutcome() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ callId, outcome }: { callId: number; outcome: string }) =>
      updateCallOutcome(callId, outcome),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-history'] });
      toast('Outcome updated');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}

export function useBulkUpdateCallOutcomes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ callIds, outcome }: { callIds: number[]; outcome: string }) =>
      bulkUpdateCallOutcomes(callIds, outcome),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['call-history'] });
      toast(`${data.updated} calls updated`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });
}
