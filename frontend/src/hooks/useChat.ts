import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import {
  fetchConversations, createConversation, deleteConversation,
  fetchMessages, streamMessage,
} from '../lib/api';
import { useCopilotContext } from '../lib/copilotContext';
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
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback((content: string) => {
    if (!conversationId) return;
    setStreaming(true);
    setStreamedText('');
    setToolStatus(null);

    controllerRef.current = streamMessage(
      conversationId,
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
        qc.invalidateQueries({ queryKey: ['messages', conversationId] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      },
      (err) => {
        setStreaming(false);
        setToolStatus(null);
        console.error('Stream error:', err);
      },
    );
  }, [conversationId, context, qc]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setStreaming(false);
    setToolStatus(null);
  }, []);

  return { send, cancel, streaming, streamedText, toolStatus };
}
