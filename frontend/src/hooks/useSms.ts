import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSmsStatus, fetchSmsConversation, fetchSmsInbox, sendSms, fetchSmsThreads, fetchMissedCallSettings, fetchReviewSettings } from '../lib/api';

export function useSmsStatus() {
  return useQuery({
    queryKey: ['sms-status'],
    queryFn: fetchSmsStatus,
  });
}

export function useSmsThreads() {
  return useQuery({
    queryKey: ['sms-threads'],
    queryFn: fetchSmsThreads,
    refetchInterval: 15000,
  });
}

export function useSmsInbox(limit?: number) {
  return useQuery({
    queryKey: ['sms-inbox', limit],
    queryFn: () => fetchSmsInbox(limit),
    refetchInterval: 15000,
  });
}

export function useSmsConversation(leadId: number | null) {
  return useQuery({
    queryKey: ['sms-conversation', leadId],
    queryFn: () => fetchSmsConversation(leadId!),
    enabled: leadId != null,
    refetchInterval: 10000,
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lead_id, body }: { lead_id: number; body: string }) =>
      sendSms(lead_id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['sms-conversation', variables.lead_id] });
      qc.invalidateQueries({ queryKey: ['sms-inbox'] });
      qc.invalidateQueries({ queryKey: ['sms-threads'] });
    },
  });
}

export function useMissedCallSettings() {
  return useQuery({
    queryKey: ['missed-call-settings'],
    queryFn: fetchMissedCallSettings,
  });
}

export function useReviewSettings() {
  return useQuery({
    queryKey: ['review-settings'],
    queryFn: fetchReviewSettings,
  });
}
