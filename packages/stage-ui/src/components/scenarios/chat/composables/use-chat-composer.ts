import type { Ref, ShallowRef } from 'vue'

import type { ChatHistoryItem } from '../../../../types/chat'
import type { ChatHistoryReplyPayload } from '../reply'

import { errorMessageFrom } from '@moeru/std'
import { shallowReadonly, shallowRef, watch } from 'vue'

import { isChatReplyTargetMessage } from '../reply'

/** One immutable snapshot passed from a composer to the chat domain. */
export interface ChatComposerSubmission<TAttachment> {
  /** Attachments captured when the send starts. */
  attachments: TAttachment[]
  /** Session captured when the send starts. */
  sessionId: string
  /** Message that the new user turn replies to. */
  replyToMessageId?: string
  /** User text without reply presentation text. */
  text: string
}

/** The observable result of one composer submission attempt. */
export type ChatComposerSubmitResult = 'discarded' | 'ignored' | 'restored' | 'sent'

/** Dependencies and runtime ownership for one local composer. */
export interface UseChatComposerOptions<TAttachment> {
  /** The session selection for this window or view. */
  activeSessionId: Readonly<Ref<string>>
  /** Sends one composer snapshot through the chat domain. */
  send: (submission: ChatComposerSubmission<TAttachment>) => Promise<unknown>
}

/** Controls the transient state and submission lifecycle of one chat input. */
export interface ChatComposerController<TAttachment> {
  /** Attachments currently shown in the composer. */
  attachments: ShallowRef<TAttachment[]>
  /** User text currently shown in the composer. */
  draft: ShallowRef<string>
  /** Whether an input method editor is composing text. */
  isComposing: ShallowRef<boolean>
  /** Message currently selected as the reply target. */
  replyTarget: Readonly<Ref<ChatHistoryReplyPayload | undefined>>
  /** Adds attachments to the current draft. */
  addAttachments: (...attachments: TAttachment[]) => void
  /** Clears the current reply target. */
  clearReply: () => void
  /** Clears the reply target when the deleted message owns it. */
  clearReplyForMessage: (message: ChatHistoryItem) => void
  /** Removes one attachment. */
  removeAttachment: (index: number) => void
  /** Selects a message as the reply target. */
  selectReply: (target: ChatHistoryReplyPayload) => void
  /** Submits one snapshot and restores it after a recoverable failure. */
  submit: () => Promise<ChatComposerSubmitResult>
}

function isCancelledSessionSend(error: unknown): boolean {
  const message = errorMessageFrom(error) ?? String(error)
  return message.includes('Chat session was reset before send could start')
    || message.includes('Chat session was removed before send completed')
}

/**
 * Owns transient chat input state and one optimistic send transaction.
 *
 * Each chat surface creates one controller. The controller does not synchronize
 * drafts or attachments across Electron renderers.
 */
export function useChatComposer<TAttachment = never>(options: UseChatComposerOptions<TAttachment>): ChatComposerController<TAttachment> {
  const attachments = shallowRef<TAttachment[]>([])
  const draft = shallowRef('')
  const isComposing = shallowRef(false)
  const replyTarget = shallowRef<ChatHistoryReplyPayload>()

  function addAttachments(...nextAttachments: TAttachment[]) {
    attachments.value = [...attachments.value, ...nextAttachments]
  }

  function clearReply() {
    replyTarget.value = undefined
  }

  function clearReplyForMessage(message: ChatHistoryItem) {
    if (isChatReplyTargetMessage(replyTarget.value, message))
      clearReply()
  }

  function removeAttachment(index: number) {
    const attachment = attachments.value[index]
    if (!attachment)
      return

    attachments.value = attachments.value.filter((_, attachmentIndex) => attachmentIndex !== index)
  }

  function selectReply(target: ChatHistoryReplyPayload) {
    replyTarget.value = target
  }

  async function submit(): Promise<ChatComposerSubmitResult> {
    if (isComposing.value || (!draft.value.trim() && attachments.value.length === 0))
      return 'ignored'

    const submission: ChatComposerSubmission<TAttachment> = {
      attachments: [...attachments.value],
      sessionId: options.activeSessionId.value,
      replyToMessageId: replyTarget.value?.message.id,
      text: draft.value,
    }
    const submittedDraft = draft.value
    const submittedReply = replyTarget.value

    attachments.value = []
    draft.value = ''
    replyTarget.value = undefined

    try {
      await options.send(submission)
      return 'sent'
    }
    catch (error) {
      const canRestore = !isCancelledSessionSend(error)
        && options.activeSessionId.value === submission.sessionId

      if (!canRestore) {
        return 'discarded'
      }

      attachments.value = [...submission.attachments, ...attachments.value]
      draft.value = draft.value ? `${submittedDraft}\n${draft.value}` : submittedDraft
      if (!replyTarget.value)
        replyTarget.value = submittedReply
      return 'restored'
    }
  }

  watch(options.activeSessionId, clearReply)

  return {
    attachments,
    draft,
    isComposing,
    replyTarget: shallowReadonly(replyTarget),
    addAttachments,
    clearReply,
    clearReplyForMessage,
    removeAttachment,
    selectReply,
    submit,
  }
}
