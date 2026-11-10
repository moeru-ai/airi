import type { ChatSessionMeta } from '../../types/chat-session'

/**
 * Whether a session stays on this device. Cloud chats carry no task status and no scene bindings, so a hidden task session or a scene session never syncs.
 * Otherwise another device adopts a scene as an owner conversation.
 */
export function staysLocal(meta: Pick<ChatSessionMeta, 'hidden' | 'recipeId' | 'bindings'>) {
  return Boolean(meta.hidden || meta.recipeId || meta.bindings?.length)
}
