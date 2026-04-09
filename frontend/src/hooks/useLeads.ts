import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLeads, fetchLead, createLead, updateLead,
  deleteLead, patchLeadStatus, patchLeadHeatScore, logActivity, enrichLead,
  fetchFollowups, snoozeLead, bulkUpdateLeads, bulkEnrichLeads,
  testSubmitLead, testRespondLead, sendLeadEmail,
  fetchScheduledEmails, cancelScheduledEmail, findLeadEmail, sendSms, fetchGbpData,
  type LeadsFilters
} from '../lib/api';

export function useLeads(filters: LeadsFilters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => fetchLeads(filters),
  });
}

export function useLead(id: number | null) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => fetchLead(id!),
    enabled: id != null,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createLead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateLead(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function usePatchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => patchLeadStatus(id, status),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function usePatchHeatScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, heat_score }: { id: number; heat_score: number }) => patchLeadHeatScore(id, heat_score),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
  });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, data }: { leadId: number; data: any }) => logActivity(leadId, data),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function useEnrichLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => enrichLead(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useFollowups() {
  return useQuery({
    queryKey: ['followups'],
    queryFn: fetchFollowups,
  });
}

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action, value }: { ids: number[]; action: string; value?: string }) => bulkUpdateLeads(ids, action, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['followups'] });
    },
  });
}

export function useBulkEnrich() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => bulkEnrichLeads(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useSnoozeLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) => snoozeLead(id, days),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
  });
}

export function useTestSubmitLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testSubmitLead(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useTestRespondLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => testRespondLead(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useSendLeadEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, templateId }: { leadId: number; templateId: number }) =>
      sendLeadEmail(leadId, templateId),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['scheduled-emails', leadId] });
    },
  });
}

export function useScheduledEmails(leadId: number | null) {
  return useQuery({
    queryKey: ['scheduled-emails', leadId],
    queryFn: () => fetchScheduledEmails(leadId!),
    enabled: leadId != null,
  });
}

export function useCancelScheduledEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, schedId }: { leadId: number; schedId: number }) =>
      cancelScheduledEmail(leadId, schedId),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['scheduled-emails', leadId] });
    },
  });
}

export function useFindLeadEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => findLeadEmail(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useFetchGbpData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchGbpData(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
  });
}

export function useSendLeadSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, templateId }: { leadId: number; templateId: number }) =>
      sendSms(leadId, undefined, templateId),
    onSuccess: (_, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
