import { useState } from 'react';
import { Mail, MessageSquare, PhoneCall, CheckCircle, SkipForward, Eye, X, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOutreachQueue, useMarkSent, useDismissQueueItem, useSendEmail, useEmailStatus, useSendSms, useSmsStatus } from '../../hooks/useSequences';
import type { OutreachQueueItem, TemplateChannel } from '../../types';

const CHANNEL_ICONS: Record<TemplateChannel, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  call_script: PhoneCall,
  loom_script: Eye,
};

const CHANNEL_COLORS: Record<TemplateChannel, string> = {
  email: 'text-violet-400',
  sms: 'text-emerald-400',
  call_script: 'text-blue-400',
  loom_script: 'text-amber-400',
};

export function OutreachQueue() {
  const { data: queue } = useOutreachQueue();
  const markSent = useMarkSent();
  const dismiss = useDismissQueueItem();
  const sendEmail = useSendEmail();
  const sendSms = useSendSms();
  const { data: emailStatus } = useEmailStatus();
  const { data: smsStatus } = useSmsStatus();
  const [previewItem, setPreviewItem] = useState<OutreachQueueItem | null>(null);

  const emailConfigured = emailStatus?.configured ?? false;
  const smsConfigured = smsStatus?.configured ?? false;

  if (!queue?.length) return null;

  const overdue = queue.filter(q => q.is_overdue);
  const dueToday = queue.filter(q => !q.is_overdue);

  const handleSend = (item: OutreachQueueItem) => {
    if (item.channel === 'email') sendEmail.mutate(item.enrollment_id);
    else if (item.channel === 'sms') sendSms.mutate(item.enrollment_id);
  };

  const isSending = sendEmail.isPending || sendSms.isPending;

  return (
    <>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-surface mb-6 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
          <Send className="w-4 h-4 text-orange-400" />
          <h2 className="text-zinc-300 font-medium text-sm">Outreach Queue</h2>
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-medium">
            {queue.length}
          </span>
        </div>

        <div className="divide-y divide-white/[0.03]">
          {overdue.map(item => (
            <QueueRow key={item.enrollment_id} item={item} isOverdue onPreview={setPreviewItem} onMarkSent={() => markSent.mutate(item.enrollment_id)} onSkip={() => dismiss.mutate(item.enrollment_id)} onSend={handleSend} emailConfigured={emailConfigured} smsConfigured={smsConfigured} sending={isSending} />
          ))}
          {dueToday.map(item => (
            <QueueRow key={item.enrollment_id} item={item} isOverdue={false} onPreview={setPreviewItem} onMarkSent={() => markSent.mutate(item.enrollment_id)} onSkip={() => dismiss.mutate(item.enrollment_id)} onSend={handleSend} emailConfigured={emailConfigured} smsConfigured={smsConfigured} sending={isSending} />
          ))}
        </div>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onMarkSent={() => { markSent.mutate(previewItem.enrollment_id); setPreviewItem(null); }}
          onSend={() => { handleSend(previewItem); setPreviewItem(null); }}
          emailConfigured={emailConfigured}
          smsConfigured={smsConfigured}
          sending={isSending}
        />
      )}
    </>
  );
}

function canSendItem(item: OutreachQueueItem, emailConfigured: boolean, smsConfigured: boolean): boolean {
  if (item.channel === 'email') return emailConfigured && !!item.lead_email;
  if (item.channel === 'sms') return smsConfigured && !!item.lead_phone;
  return false;
}

function getSendLabel(channel: TemplateChannel): string {
  if (channel === 'email') return 'Send';
  if (channel === 'sms') return 'Send SMS';
  return 'Send';
}

function getSendIcon(channel: TemplateChannel) {
  if (channel === 'sms') return MessageSquare;
  return Mail;
}

function QueueRow({ item, isOverdue, onPreview, onMarkSent, onSkip, onSend, emailConfigured, smsConfigured, sending }: {
  item: OutreachQueueItem;
  isOverdue: boolean;
  onPreview: (item: OutreachQueueItem) => void;
  onMarkSent: () => void;
  onSkip: () => void;
  onSend: (item: OutreachQueueItem) => void;
  emailConfigured: boolean;
  smsConfigured: boolean;
  sending: boolean;
}) {
  const ChannelIcon = CHANNEL_ICONS[item.channel];
  const channelColor = CHANNEL_COLORS[item.channel];
  const canSend = canSendItem(item, emailConfigured, smsConfigured);
  const SendIcon = getSendIcon(item.channel);

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3 transition-colors',
      isOverdue ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]' : 'bg-amber-500/[0.03] hover:bg-amber-500/[0.06]',
    )}>
      <div className={cn(
        'w-0.5 self-stretch rounded-full flex-shrink-0',
        isOverdue ? 'bg-red-500' : 'bg-amber-500',
      )} />

      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-zinc-800', channelColor)}>
        <ChannelIcon className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-200 font-medium truncate">{item.business_name}</span>
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
            isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400',
          )}>
            {isOverdue ? 'Overdue' : 'Due Today'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
          <span>Step {item.current_step}/{item.total_steps}</span>
          <span>·</span>
          <span>{item.step_label}</span>
          <span>·</span>
          <span>{item.sequence_name}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onPreview(item)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
        >
          <Eye className="w-3 h-3" /> Preview
        </button>
        {canSend && (
          <button
            onClick={() => onSend(item)}
            disabled={sending}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <SendIcon className="w-3 h-3" /> {getSendLabel(item.channel)}
          </button>
        )}
        <button
          onClick={onMarkSent}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
            canSend
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400',
          )}
        >
          <CheckCircle className="w-3 h-3" /> Sent
        </button>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium rounded-lg transition-colors"
        >
          <SkipForward className="w-3 h-3" /> Skip
        </button>
      </div>
    </div>
  );
}

function PreviewModal({ item, onClose, onMarkSent, onSend, emailConfigured, smsConfigured, sending }: {
  item: OutreachQueueItem;
  onClose: () => void;
  onMarkSent: () => void;
  onSend: () => void;
  emailConfigured: boolean;
  smsConfigured: boolean;
  sending: boolean;
}) {
  const canSend = canSendItem(item, emailConfigured, smsConfigured);
  const SendIcon = getSendIcon(item.channel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{item.template_name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {item.business_name} — Step {item.current_step}/{item.total_steps}
              {item.channel === 'sms' && item.lead_phone && (
                <span className="ml-2 text-emerald-500">{item.lead_phone}</span>
              )}
              {item.channel === 'email' && item.lead_email && (
                <span className="ml-2 text-violet-400">{item.lead_email}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {item.rendered_subject && (
            <div>
              <label className="text-overline text-zinc-500 mb-1 block">Subject</label>
              <p className="text-sm text-zinc-200 bg-zinc-800 rounded-lg px-3 py-2">{item.rendered_subject}</p>
            </div>
          )}
          <div>
            <label className="text-overline text-zinc-500 mb-1 block">Body</label>
            <pre className="text-sm text-zinc-300 bg-zinc-800 rounded-lg px-3 py-2 whitespace-pre-wrap font-sans leading-relaxed">
              {item.rendered_body}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            Close
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                (item.rendered_subject ? `Subject: ${item.rendered_subject}\n\n` : '') + item.rendered_body
              );
            }}
            className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Copy
          </button>
          {canSend && (
            <button
              onClick={onSend}
              disabled={sending}
              className="px-4 py-1.5 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <SendIcon className="w-4 h-4 inline mr-1" /> {item.channel === 'sms' ? 'Send SMS' : 'Send Email'}
            </button>
          )}
          <button
            onClick={onMarkSent}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm transition-colors',
              canSend
                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                : 'bg-orange-500 text-white hover:bg-orange-600',
            )}
          >
            <CheckCircle className="w-4 h-4 inline mr-1" /> Mark as Sent
          </button>
        </div>
      </div>
    </div>
  );
}
