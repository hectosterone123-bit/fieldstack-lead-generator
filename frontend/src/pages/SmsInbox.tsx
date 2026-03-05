import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Send, ArrowLeft, PhoneOff, PhoneMissed,
  User, Clock, AlertCircle, CheckCircle2, Star,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatRelativeTime } from '../lib/utils';
import { useSmsThreads, useSmsConversation, useSendSms, useSmsStatus, useMissedCallSettings, useReviewSettings } from '../hooks/useSms';
import { STATUS_COLORS } from '../types';
import type { SmsThread, SmsMessage, LeadStatus } from '../types';

export function SmsInbox() {
  const { data: threads, isLoading: threadsLoading } = useSmsThreads();
  const { data: smsStatus } = useSmsStatus();
  const { data: missedCallSettings } = useMissedCallSettings();
  const { data: reviewSettings } = useReviewSettings();
  const sendSms = useSendSms();

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: messagesLoading } = useSmsConversation(selectedLeadId);

  const selectedThread = threads?.find(t => t.lead_id === selectedLeadId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    if (!draft.trim() || !selectedLeadId) return;
    sendSms.mutate({ lead_id: selectedLeadId, body: draft.trim() }, {
      onSuccess: () => setDraft(''),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const configured = smsStatus?.configured ?? false;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-orange-400" />
          <h1 className="text-sm font-semibold text-zinc-100">SMS Inbox</h1>
          {!configured && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-900/50 text-yellow-300 ml-2">Twilio not configured</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {missedCallSettings && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg',
              missedCallSettings.enabled && missedCallSettings.twilio_configured
                ? 'bg-emerald-900/30 text-emerald-400'
                : 'bg-zinc-800 text-zinc-500'
            )}>
              {missedCallSettings.enabled && missedCallSettings.twilio_configured ? (
                <><PhoneMissed className="w-3 h-3" /> Missed call text-back</>
              ) : (
                <><PhoneOff className="w-3 h-3" /> Missed call off</>
              )}
            </div>
          )}
          {reviewSettings && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg',
              reviewSettings.enabled && reviewSettings.twilio_configured
                ? 'bg-amber-900/30 text-amber-400'
                : 'bg-zinc-800 text-zinc-500'
            )}>
              <Star className="w-3 h-3" />
              {reviewSettings.enabled && reviewSettings.twilio_configured
                ? 'Review requests active'
                : 'Review requests off'}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread list */}
        <div className={cn(
          'border-r border-white/[0.04] overflow-y-auto',
          selectedLeadId ? 'w-[340px]' : 'flex-1'
        )}>
          {threadsLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">Loading...</div>
          ) : !threads?.length ? (
            <EmptyInbox configured={configured} />
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {threads.map(thread => (
                <ThreadRow
                  key={thread.lead_id}
                  thread={thread}
                  selected={thread.lead_id === selectedLeadId}
                  onClick={() => setSelectedLeadId(thread.lead_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Conversation panel */}
        {selectedLeadId && (
          <div className="flex-1 flex flex-col">
            {/* Conversation header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] bg-zinc-900/50">
              <button
                onClick={() => setSelectedLeadId(null)}
                className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 lg:hidden"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {selectedThread?.business_name || selectedThread?.first_name || 'Unknown'}
                </p>
                <p className="text-xs text-zinc-500">{selectedThread?.phone || 'No phone'}</p>
              </div>
              {selectedThread?.lead_status && (
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-medium',
                  STATUS_COLORS[selectedThread.lead_status as LeadStatus] || 'bg-zinc-700 text-zinc-300'
                )}>
                  {selectedThread.lead_status}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messagesLoading ? (
                <div className="text-center text-zinc-500 text-sm py-8">Loading messages...</div>
              ) : !messages?.length ? (
                <div className="text-center text-zinc-500 text-sm py-8">No messages yet</div>
              ) : (
                messages.map((msg: SmsMessage) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-white/[0.04] p-3">
              {!configured ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-900/20 text-yellow-300/80 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Configure Twilio in .env to send SMS
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 bg-zinc-800 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-orange-500/30"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sendSms.isPending}
                    className="w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({ thread, selected, onClick }: { thread: SmsThread; selected: boolean; onClick: () => void }) {
  const hasUnread = thread.last_direction === 'inbound';

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors',
        selected && 'bg-orange-500/[0.04] border-l-2 border-orange-500',
      )}
    >
      <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
        {hasUnread ? (
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
        ) : (
          <User className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm truncate', hasUnread ? 'font-semibold text-zinc-100' : 'font-medium text-zinc-300')}>
            {thread.business_name || thread.first_name || thread.phone || 'Unknown'}
          </p>
          <span className="text-[10px] text-zinc-600 whitespace-nowrap flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {formatRelativeTime(thread.last_message_at)}
          </span>
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">
          {thread.last_direction === 'outbound' && <span className="text-zinc-600">You: </span>}
          {thread.last_message}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-zinc-600">{thread.message_count} messages</span>
          {thread.inbound_count > 0 && (
            <span className="text-[10px] text-orange-500/70">{thread.inbound_count} inbound</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: SmsMessage }) {
  const isOutbound = message.direction === 'outbound';
  const time = new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2',
        isOutbound
          ? 'bg-orange-500 text-white rounded-br-md'
          : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
      )}>
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
        <div className={cn('flex items-center gap-1 mt-1', isOutbound ? 'justify-end' : 'justify-start')}>
          <span className={cn('text-[10px]', isOutbound ? 'text-orange-200/60' : 'text-zinc-500')}>{time}</span>
          {isOutbound && message.status === 'delivered' && (
            <CheckCircle2 className="w-2.5 h-2.5 text-orange-200/60" />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyInbox({ configured }: { configured: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <MessageSquare className="w-10 h-10 text-zinc-700 mb-3" />
      <p className="text-sm text-zinc-400 mb-1">No conversations yet</p>
      <p className="text-xs text-zinc-600">
        {configured
          ? 'Send an SMS from the Pipeline or Sequences page to start a conversation.'
          : 'Configure Twilio in your .env file to enable SMS sending.'}
      </p>
    </div>
  );
}
