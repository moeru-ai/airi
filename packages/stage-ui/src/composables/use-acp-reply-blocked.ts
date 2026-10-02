import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { computed, toValue } from 'vue'

import { useChatSessionStore } from '../stores/chat/session-store'

/** True when the session rejects new messages because its ACP Client link is gone. */
export function useAcpReplyBlocked(sessionId: MaybeRefOrGetter<string>): ComputedRef<boolean> {
  const chatSession = useChatSessionStore()
  return computed(() => chatSession.sessionMetas[toValue(sessionId)]?.acpClient?.status === 'disconnected')
}
