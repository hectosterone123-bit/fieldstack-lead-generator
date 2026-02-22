import type { Lead, FinderResult, Stats, Template, TemplatePreview, TemplateVariable, Conversation, ChatMessage, CopilotContext } from '../types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data as T;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export interface LeadsFilters {
  status?: string;
  service_type?: string;
  search?: string;
  tag?: string;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
}

export interface LeadsPaginated {
  leads: Lead[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchLeads(filters: LeadsFilters = {}): Promise<LeadsPaginated> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v != null) params.set(k, String(v)); });
  const res = await fetch(`${BASE}/leads?${params}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return { leads: json.data, pagination: json.pagination };
}

export async function fetchLead(id: number): Promise<Lead & { activities: any[] }> {
  return request(`/leads/${id}`);
}

export async function createLead(data: Partial<Lead>): Promise<Lead> {
  return request('/leads', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
  return request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function patchLeadStatus(id: number, status: string): Promise<Lead> {
  return request(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function patchLeadHeatScore(id: number, heat_score: number): Promise<Lead> {
  return request(`/leads/${id}/heat-score`, { method: 'PATCH', body: JSON.stringify({ heat_score }) });
}

export async function deleteLead(id: number): Promise<void> {
  return request(`/leads/${id}`, { method: 'DELETE' });
}

export async function logActivity(leadId: number, data: { type: string; title: string; description?: string }): Promise<any> {
  return request(`/leads/${leadId}/activities`, { method: 'POST', body: JSON.stringify(data) });
}

export async function enrichLead(id: number): Promise<Lead & { activities: any[] }> {
  return request(`/leads/${id}/enrich`, { method: 'POST' });
}

export async function bulkUpdateLeads(ids: number[], action: string, value?: string): Promise<{ affected: number }> {
  return request('/leads/bulk', { method: 'PATCH', body: JSON.stringify({ ids, action, value }) });
}

export async function importCsv(csv: string): Promise<{ imported: number; skipped: number }> {
  return request('/leads/import-csv', { method: 'POST', body: JSON.stringify({ csv }) });
}

export async function fetchFollowups(): Promise<{ overdue: Lead[]; due_today: Lead[] }> {
  return request('/leads/followups/today');
}

export async function snoozeLead(id: number, days: number): Promise<Lead> {
  return request(`/leads/${id}/snooze`, { method: 'PATCH', body: JSON.stringify({ days }) });
}

export async function bulkEnrichLeads(ids?: number[]): Promise<{ total: number; enriched: number; failed: number; skipped: number }> {
  return request('/leads/bulk/enrich', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
}

// ─── Finder ───────────────────────────────────────────────────────────────────

export interface FinderSearch {
  service_type: string;
  city: string;
  state: string;
  radius_km?: number;
  source?: 'google' | 'osm' | 'both';
}

export interface FinderSearchResult {
  results: FinderResult[];
  meta: { geocoded: any; total: number; new: number };
}

export async function searchBusinesses(params: FinderSearch): Promise<FinderSearchResult> {
  const res = await fetch(`${BASE}/finder/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return { results: json.data, meta: json.meta };
}

export async function importLeads(leads: FinderResult[]): Promise<{ imported: number; skipped: number }> {
  return request('/finder/import', { method: 'POST', body: JSON.stringify({ leads }) });
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface TemplatesFilters {
  channel?: string;
  status_stage?: string;
}

export async function fetchTemplates(filters: TemplatesFilters = {}): Promise<Template[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v != null) params.set(k, String(v)); });
  return request(`/templates?${params}`);
}

export async function fetchTemplate(id: number): Promise<Template> {
  return request(`/templates/${id}`);
}

export async function createTemplate(data: Partial<Template>): Promise<Template> {
  return request('/templates', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTemplate(id: number, data: Partial<Template>): Promise<Template> {
  return request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteTemplate(id: number): Promise<void> {
  return request(`/templates/${id}`, { method: 'DELETE' });
}

export async function previewTemplate(templateId: number, leadId: number): Promise<TemplatePreview> {
  return request(`/templates/${templateId}/preview`, { method: 'POST', body: JSON.stringify({ lead_id: leadId }) });
}

export async function fetchTemplateVariables(): Promise<TemplateVariable[]> {
  return request('/templates/variables');
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function fetchStats(): Promise<Stats> {
  return request('/stats');
}

// ─── Chat / Copilot ─────────────────────────────────────────────────────────

export async function fetchConversations(): Promise<Conversation[]> {
  return request('/chat/conversations');
}

export async function createConversation(context?: CopilotContext): Promise<Conversation> {
  return request('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ context }),
  });
}

export async function deleteConversation(id: number): Promise<void> {
  return request(`/chat/conversations/${id}`, { method: 'DELETE' });
}

export async function fetchMessages(conversationId: number): Promise<ChatMessage[]> {
  return request(`/chat/conversations/${conversationId}/messages`);
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_done' | 'done' | 'error';
  text?: string;
  tool?: string;
  message?: string;
}

export function streamMessage(
  conversationId: number,
  content: string,
  context: CopilotContext | null,
  onChunk: (chunk: StreamChunk) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, context }),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'done') { onDone(); return; }
            if (data.type === 'error') { onError(new Error(data.message)); return; }
            onChunk(data);
          } catch {}
        }
      }
    }
    onDone();
  }).catch((err) => {
    if (err.name !== 'AbortError') onError(err);
  });

  return controller;
}
