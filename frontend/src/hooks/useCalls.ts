import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveCalls, fetchCallHistory, fetchCallQueue,
  startAiCall, endAiCall, setCallQueue, callNextInQueue, clearCallQueue,
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
    onError: (err: Error) => toast(err.message, 'error'),
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
