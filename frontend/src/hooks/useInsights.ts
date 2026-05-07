import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchInsights, fetchAiInsightSummary } from '../lib/api';

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: fetchInsights,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAiInsightSummary() {
  return useMutation({
    mutationFn: fetchAiInsightSummary,
  });
}
