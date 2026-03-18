import { useState, useEffect, useRef } from 'react';
import { X, Plus, Loader2, Bot, Trash2, ChevronLeft, Wrench, AlertCircle, RotateCcw, BarChart3, Send, Repeat, CalendarClock } from 'lucide-react';
import { cn, formatRelativeTime } from '../../lib/utils';
import { useCopilotContext } from '../../lib/copilotContext';
import { useConversations, useCreateConversation, useDeleteConversation, useMessages, useSendMessage } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';

const TOOL_LABELS: Record<string, string> = {
  get_lead: 'Looking up lead',
  search_leads: 'Searching leads',
  get_followups: 'Checking follow-ups',
  get_stats: 'Getting stats',
  get_templates: 'Finding templates',
  preview_template: 'Rendering template',
  update_lead_status: 'Updating status',
  log_activity: 'Logging activity',
  set_followup: 'Scheduling follow-up',
  update_heat_score: 'Updating heat score',
  add_note: 'Adding note',
  get_sequences: 'Loading sequences',
  send_sms: 'Sending SMS',
  enroll_in_sequence: 'Enrolling in sequence',
  send_email: 'Sending email',
  bulk_send_email: 'Sending bulk emails',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CopilotSidebar({ open, onClose }: Props) {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { context } = useCopilotContext();
  const { data: conversations } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const { data: messages } = useMessages(activeConversationId);
  const { send, cancel, streaming, streamedText, toolStatus, error, retry } = useSendMessage(activeConversationId);

  // Auto-scroll when streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText, toolStatus]);

  // Elapsed time counter
  useEffect(() => {
    if (streaming) {
      setElapsedSeconds(0);
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setElapsedSeconds(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [streaming]);

  async function handleNewConversation() {
    const conv = await createConversation.mutateAsync(context);
    setActiveConversationId(conv.id);
    setShowHistory(false);
  }

  async function handleSend(text: string) {
    if (!activeConversationId) {
      const conv = await createConversation.mutateAsync(context);
      setActiveConversationId(conv.id);
      send(text, conv.id);
      return;
    }
    send(text);
  }

  function handleQuickAction(text: string) {
    handleSend(text);
  }

  const hasMessages = (messages && messages.length > 0) || streaming;
  const elapsedLabel = elapsedSeconds > 0 ? ` ${elapsedSeconds}s` : '';

  return (
    <div className={cn(
      'shrink-0 border-l border-white/[0.04] bg-zinc-950 flex flex-col overflow-hidden transition-all duration-300',
      open ? 'w-[380px]' : 'w-0'
    )}>
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
            {showHistory ? (
              <>
                <button
                  onClick={() => setShowHistory(false)}
                  className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-xs text-zinc-500">History</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <span className="text-sm font-medium text-zinc-200">FieldStack AI</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowHistory(true)}
                    className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
                    title="Chat history"
                  >
                    {conversations?.length || 0}
                  </button>
                  <button
                    onClick={handleNewConversation}
                    className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="New conversation"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-md hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {showHistory ? (
            /* Conversation History */
            <div className="flex-1 overflow-y-auto">
              {!conversations?.length ? (
                <p className="text-sm text-zinc-600 text-center py-8">No conversations yet</p>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => { setActiveConversationId(conv.id); setShowHistory(false); }}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors group',
                        activeConversationId === conv.id && 'bg-orange-500/[0.04]'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-300 truncate">{conv.title}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {formatRelativeTime(conv.updated_at)}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteConversation.mutate(conv.id); }}
                        className="w-6 h-6 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Chat View */
            <>
              <div className="flex-1 overflow-y-auto">
                {!hasMessages ? (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center mb-3">
                      <Bot className="w-5 h-5 text-orange-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-200 mb-0.5">Sam AI</h3>
                    <p className="text-xs text-zinc-500 mb-5">Your AI sales copilot</p>
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {([
                        { icon: BarChart3, label: 'Pipeline health', msg: 'Show me pipeline health and hot leads' },
                        { icon: Send, label: 'Send outreach', msg: 'Send the intro email to all new leads' },
                        { icon: Repeat, label: 'Enroll sequence', msg: 'Enroll my hottest leads in a follow-up sequence' },
                        { icon: CalendarClock, label: "Today's follow-ups", msg: 'Which leads need follow-up today?' },
                      ] as const).map(({ icon: Icon, label, msg }) => (
                        <button
                          key={label}
                          onClick={() => handleSend(msg)}
                          className="flex flex-col items-center gap-2 p-3 bg-zinc-800/40 hover:bg-zinc-800/80 border border-white/[0.06] hover:border-orange-500/20 rounded-xl transition-colors"
                        >
                          <Icon className="w-4 h-4 text-orange-400" />
                          <span className="text-xs text-zinc-300 font-medium leading-tight">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Messages */
                  <div className="py-3">
                    {messages?.map(msg => (
                      <MessageBubble key={msg.id} role={msg.role} content={msg.content} timestamp={msg.created_at} />
                    ))}

                    {/* Tool status */}
                    {toolStatus && (
                      <div className="flex items-center gap-2 px-4 py-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                          <Wrench className="w-3 h-3 animate-pulse" />
                          {TOOL_LABELS[toolStatus] || `Using ${toolStatus}`}...{elapsedLabel}
                        </div>
                      </div>
                    )}

                    {/* Streaming text */}
                    {streaming && streamedText && (
                      <MessageBubble role="assistant" content={streamedText} />
                    )}

                    {/* Loading indicator */}
                    {streaming && !streamedText && !toolStatus && (
                      <div className="flex items-center gap-2 px-4 py-2">
                        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                        <span className="text-xs text-zinc-500">Thinking...{elapsedLabel}</span>
                      </div>
                    )}

                    {/* Error state */}
                    {error && !streaming && (
                      <div className="px-4 py-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="flex-1 min-w-0">{error}</span>
                          <button
                            onClick={retry}
                            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Quick actions (shown when no messages or not streaming) */}
              {!streaming && <QuickActions onSelect={handleQuickAction} />}

              {/* Input */}
              <ChatInput onSend={handleSend} onCancel={cancel} streaming={streaming} />
            </>
          )}
        </>
      )}
    </div>
  );
}
