import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTemplates, createTemplate, updateTemplate, deleteTemplate,
  previewTemplate, fetchTemplateVariables,
  type TemplatesFilters
} from '../lib/api';

export function useTemplates(filters: TemplatesFilters = {}) {
  return useQuery({
    queryKey: ['templates', filters],
    queryFn: () => fetchTemplates(filters),
  });
}

export function useTemplateVariables() {
  return useQuery({
    queryKey: ['template-variables'],
    queryFn: fetchTemplateVariables,
    staleTime: Infinity,
  });
}

export function usePreviewTemplate() {
  return useMutation({
    mutationFn: ({ templateId, leadId }: { templateId: number; leadId: number }) =>
      previewTemplate(templateId, leadId),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}
