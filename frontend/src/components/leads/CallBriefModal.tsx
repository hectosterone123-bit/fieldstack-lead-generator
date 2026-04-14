import { useEffect, useState } from 'react';
import { X, Phone, Star, Globe, User, MapPin, Clock, FileText, ChevronDown } from 'lucide-react';
import { useTemplates, usePreviewTemplate } from '../../hooks/useTemplates';
import { useLogActivity, useSnoozeLead } from '../../hooks/useLeads';
import { useToast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import type { Lead } from '../../types';

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function CallBriefModal({ lead, onClose }: Props) {
  const { toast } = useToast();
  const { data: templates = [] } = useTemplates({ channel: 'call_script' });
  const previewTemplate = usePreviewTemplate();
  const logActivity = useLogActivity();
  const snoozeLead = useSnoozeLead();

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  // Default to step 1 template on open
  useEffect(() => {
    if (templates.length > 0 && selectedTemplateId === null) {
      const sorted = [...templates].sort((a, b) => a.step_order - b.step_order);
      setSelectedTemplateId(sorted[0].id);
    }
  }, [templates, selectedTemplateId]);

  // Re-fetch preview when template or lead changes
  useEffect(() => {
    if (selectedTemplateId && lead) {
      previewTemplate.mutate({ templateId: selectedTemplateId, leadId: lead.id });
    }
  }, [selectedTemplateId, lead?.id, previewTemplate]);

  if (!lead) return null;

  const sortedTemplates = [...templates].sort((a, b) => a.step_order - b.step_order);
  const renderedBody = previewTemplate.data?.rendered_body || '';

  function handleLogCall() {
    logActivity.mutate(
      { leadId: lead!.id, data: { type: 'call_attempt', title: 'Call logged from script' } },
      { onSuccess: () => { toast('Call logged — follow-up set for 3 days'); onClose(); } },
    );
  }

  function handleSnooze() {
    snoozeLead.mutate(
      { id: lead!.id, days: 3 },
      { onSuccess: () => { toast('Snoozed 3 days'); onClose(); } },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{lead.business_name}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lead.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : 'Call Brief'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Intel strip */}
        <div className="px-5 py-3 border-b border-white/[0.04] bg-zinc-950/40 grid grid-cols-2 gap-2">
          {lead.owner_name && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <User className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="truncate">{lead.owner_name}</span>
            </div>
          )}
          {(lead.direct_phone || lead.phone) && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Phone className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="truncate font-data">{lead.direct_phone || lead.phone}</span>
            </div>
          )}
          {lead.rating != null && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span>{lead.rating.toFixed(1)} · {lead.review_count ?? 0} reviews</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Globe className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
            <span className={lead.website_live ? 'text-emerald-400' : lead.has_website ? 'text-amber-400' : 'text-zinc-600'}>
              {lead.website_live ? 'Website live' : lead.has_website ? 'Website (unverified)' : 'No website'}
            </span>
          </div>
          {lead.service_type && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <MapPin className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="capitalize">{lead.service_type.replace(/_/g, ' ')}</span>
            </div>
          )}
          {lead.contact_count > 0 && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Clock className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span>{lead.contact_count} prior contact{lead.contact_count !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Template selector */}
        {sortedTemplates.length > 0 && (
          <div className="px-5 py-3 border-b border-white/[0.04]">
            <div className="relative">
              <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
              <select
                value={selectedTemplateId ?? ''}
                onChange={e => setSelectedTemplateId(Number(e.target.value))}
                className="w-full pl-8 pr-8 py-2 bg-zinc-800 border border-white/[0.06] rounded-lg text-xs text-zinc-300 appearance-none focus:outline-none focus:border-orange-500/50 [color-scheme:dark]"
              >
                {sortedTemplates.map(t => (
                  <option key={t.id} value={t.id}>Step {t.step_order} — {t.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Script body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {previewTemplate.isPending ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={cn('h-3 bg-zinc-800 rounded animate-pulse', i % 3 === 2 ? 'w-3/4' : 'w-full')} />
              ))}
            </div>
          ) : previewTemplate.isError ? (
            <p className="text-xs text-red-400 italic">Failed to load template preview. Please try again.</p>
          ) : renderedBody ? (
            <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
              {renderedBody}
            </pre>
          ) : (
            <p className="text-xs text-zinc-600 italic">Select a script template above.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleLogCall}
            disabled={logActivity.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Phone className="w-4 h-4" />
            {logActivity.isPending ? 'Logging…' : 'Log Call'}
          </button>
          <button
            onClick={handleSnooze}
            disabled={snoozeLead.isPending}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
          >
            Snooze 3d
          </button>
        </div>
      </div>
    </div>
  );
}
