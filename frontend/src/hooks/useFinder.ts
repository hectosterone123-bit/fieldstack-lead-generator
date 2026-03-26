import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchBusinesses, importLeads, batchSearchBusinesses, scrapeFinderEmails, type FinderSearch } from '../lib/api';
import type { FinderResult, ImportOptions, BatchSearchParams } from '../types';

export function useFinderSearch() {
  return useMutation({
    mutationFn: (params: FinderSearch) => searchBusinesses(params),
  });
}

export function useBatchSearch() {
  return useMutation({
    mutationFn: (params: BatchSearchParams) => batchSearchBusinesses(params),
  });
}

export function useScrapeEmails() {
  return useMutation({
    mutationFn: (urls: string[]) => scrapeFinderEmails(urls),
  });
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leads, options }: { leads: FinderResult[]; options?: ImportOptions }) =>
      importLeads(leads, options),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
  });
}
