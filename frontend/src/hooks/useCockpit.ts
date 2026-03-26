import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCockpitToday, fetchCockpitTargets, updateCockpitTargets,
  fetchCockpitHotLeads, fetchCockpitAlerts,
} from '../lib/api';

export function useCockpitMetrics() {
  return useQuery({
    queryKey: ['cockpit', 'today'],
    queryFn: fetchCockpitToday,
    refetchInterval: 30_000,
  });
}

export function useCockpitTargets() {
  return useQuery({
    queryKey: ['cockpit', 'targets'],
    queryFn: fetchCockpitTargets,
  });
}

export function useUpdateCockpitTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCockpitTargets,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cockpit', 'targets'] }),
  });
}

export function useCockpitHotLeads() {
  return useQuery({
    queryKey: ['cockpit', 'hot-leads'],
    queryFn: fetchCockpitHotLeads,
    refetchInterval: 60_000,
  });
}

export function useCockpitAlerts() {
  return useQuery({
    queryKey: ['cockpit', 'alerts'],
    queryFn: fetchCockpitAlerts,
    refetchInterval: 60_000,
  });
}
