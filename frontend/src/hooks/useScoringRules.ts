import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchScoringRules, createScoringRule, updateScoringRule, deleteScoringRule, toggleScoringRule } from '../lib/api';
import type { ScoringRule } from '../types';

const KEY = ['scoring-rules'];

export function useScoringRules() {
  return useQuery({ queryKey: KEY, queryFn: fetchScoringRules });
}

export function useCreateScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createScoringRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<ScoringRule, 'id' | 'created_at'>> }) =>
      updateScoringRule(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteScoringRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleScoringRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
