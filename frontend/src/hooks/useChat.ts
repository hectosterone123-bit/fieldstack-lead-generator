import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import {
  fetchConversations, createConversation, deleteConversation,
  fetchMessages, streamMessage,
} from '../lib/api';
import { useCopilotContext } from '../lib/copilotContext';
import { useToast } from '../lib/toast';
import type { CopilotContext } from '../types';

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (context?: CopilotContext) => createConversation(context),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: conversationId != null,
  });
}

export function useSendMessage(conversationId: number | null) {
  const qc = useQueryClient();
  const { context } = useCopilotContext();
  const { toast } = useToast();
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  const send = useCallback((content: string, overrideConversationId?: number) => {
    const targetId = overrideConversationId ?? conversationId;
    if (!targetId) return;
    lastMessageRef.current = content;
    setError(null);
    setStreaming(true);
    setStreamedText('');
    setToolStatus(null);

    controllerRef.current = streamMessage(
      targetId,
      content,
      context,
      (chunk) => {
        if (chunk.type === 'text') setStreamedText(prev => prev + (chunk.text || ''));
        if (chunk.type === 'tool_call') setToolStatus(chunk.tool || 'Looking up data');
        if (chunk.type === 'tool_done') setToolStatus(null);
      },
      () => {
        setStreaming(false);
        setToolStatus(null);
        qc.invalidateQueries({ queryKey: ['messages', targetId] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      },
      (err) => {
        setStreaming(false);
        setToolStatus(null);
        const message = err?.message || 'Something went wrong. Please try again.';
        setError(message);
        toast(message, 'error');
      },
    );
  }, [conversationId, context, qc, toast]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setStreaming(false);
    setToolStatus(null);
  }, []);

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      setError(null);
      send(lastMessageRef.current);
    }
  }, [send]);

  return { send, cancel, streaming, streamedText, toolStatus, error, retry };
}
