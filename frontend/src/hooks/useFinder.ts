import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchBusinesses, importLeads, type FinderSearch } from '../lib/api';
import type { FinderResult } from '../types';

export function useFinderSearch() {
  return useMutation({
    mutationFn: (params: FinderSearch) => searchBusinesses(params),
  });
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leads: FinderResult[]) => importLeads(leads),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
