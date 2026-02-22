import { useState, useEffect, useRef } from 'react';
import { X, Plus, Loader2, Bot, Trash2, ChevronLeft, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCopilotContext } from '../../lib/copilotContext';
import { useConversations, useCreateConversation, useDeleteConversation, useMessages, useSendMessage } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CopilotSidebar({ open, onClose }: Props) {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { context } = useCopilotContext();
  const { data: conversations } = useConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const { data: messages } = useMessages(activeConversationId);
  const { send, cancel, streaming, streamedText, toolStatus } = useSendMessage(activeConversationId);

  // Auto-scroll when streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedText, toolStatus]);

  async function handleNewConversation() {
    const conv = await createConversation.mutateAsync(context);
    setActiveConversationId(conv.id);
    setShowHistory(false);
  }

  async function handleSend(text: string) {
    if (!activeConversationId) {
      const conv = await createConversation.mutateAsync(context);
      setActiveConversationId(conv.id);
      // Small delay to ensure state settles, then send
      setTimeout(() => send(text), 50);
      return;
    }
    send(text);
  }

  function handleQuickAction(text: string) {
    handleSend(text);
  }

  const hasMessages = (messages && messages.length > 0) || streaming;

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
                          {new Date(conv.updated_at).toLocaleDateString()}
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
                  <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
                      <Bot className="w-6 h-6 text-orange-400" />
                    </div>
                    <h3 className="text-sm font-medium text-zinc-300 mb-1">FieldStack AI</h3>
                    <p className="text-xs text-zinc-500 mb-6">
                      Ask about your leads, get follow-up advice, or draft outreach messages.
                    </p>
                  </div>
                ) : (
                  /* Messages */
                  <div className="py-3">
                    {messages?.map(msg => (
                      <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
                    ))}

                    {/* Tool status */}
                    {toolStatus && (
                      <div className="flex items-center gap-2 px-4 py-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/50 text-xs text-zinc-400">
                          <Wrench className="w-3 h-3 animate-pulse" />
                          {toolStatus === 'get_lead' && 'Looking up lead...'}
                          {toolStatus === 'search_leads' && 'Searching leads...'}
                          {toolStatus === 'get_followups' && 'Checking follow-ups...'}
                          {toolStatus === 'get_stats' && 'Getting stats...'}
                          {toolStatus === 'get_templates' && 'Finding templates...'}
                          {toolStatus === 'preview_template' && 'Rendering template...'}
                          {!['get_lead', 'search_leads', 'get_followups', 'get_stats', 'get_templates', 'preview_template'].includes(toolStatus) && `Using ${toolStatus}...`}
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
                        <span className="text-xs text-zinc-500">Thinking...</span>
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
