import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface ChatWindowPreferences {
  mode: 'legacy' | 'floating'
  placement: 'attached' | 'free' | 'danmaku'
  pinned: boolean
}

export interface ChatWindowState {
  preferences: ChatWindowPreferences
  side: 'left' | 'right'
  folded: boolean
  pinned: boolean
}

export interface ChatButtonState {
  mode: ChatWindowPreferences['mode']
  floatingShown: boolean
}

export const chatWindowGetState = defineInvokeEventa<ChatWindowState, Record<string, never>>('eventa:invoke:airi:chat-window:get-state')
export const electronChatWindowGetPreferences = defineInvokeEventa<ChatWindowPreferences, Record<string, never>>('eventa:invoke:electron:windows:chat:get-preferences')
export const electronChatWindowSetPreferences = defineInvokeEventa<void, ChatWindowPreferences>('eventa:invoke:electron:windows:chat:set-preferences')
export const chatWindowStateChanged = defineEventa<ChatWindowState>('eventa:event:airi:chat-window:state-changed')
export const chatWindowFold = defineEventa<Record<string, never>>('eventa:event:airi:chat-window:fold')
export const chatWindowContentHidden = defineEventa<Record<string, never>>('eventa:event:airi:chat-window:content-hidden')
export const electronGetChatButtonState = defineInvokeEventa<ChatButtonState, Record<string, never>>('eventa:invoke:electron:windows:chat:get-button-state')
export const electronChatButtonStateChanged = defineEventa<ChatButtonState>('eventa:event:electron:windows:chat:button-state-changed')
