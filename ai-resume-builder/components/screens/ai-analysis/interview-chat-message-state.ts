import type { Dispatch, SetStateAction } from 'react';
import type { MutableRefObject } from 'react';
import type { ChatMessage } from './types';

export const upsertStreamingModelMessage = ({
  setChatMessages,
  chatMessagesRef,
  streamId,
  text,
}: {
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  chatMessagesRef: MutableRefObject<ChatMessage[]>;
  streamId: string;
  text: string;
}) => {
  setChatMessages(prev => {
    const has = prev.some(msg => msg.id === streamId);
    if (!has) {
      const next = [...prev, { id: streamId, role: 'model' as const, text }];
      chatMessagesRef.current = next as ChatMessage[];
      return next;
    }
    const next = prev.map(msg => (
      msg.id === streamId ? { ...msg, text } : msg
    ));
    chatMessagesRef.current = next as ChatMessage[];
    return next;
  });
};

