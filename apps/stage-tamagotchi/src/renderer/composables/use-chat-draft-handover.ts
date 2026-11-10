import type { MaybeRefOrGetter } from 'vue'

import type { ChatDraftHandover } from '../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { onMounted, onScopeDispose, toValue } from 'vue'

import { electronChatWindowCollectDraft, electronChatWindowDraftOffered, electronChatWindowDraftSettled, electronChatWindowTakeDraft } from '../../shared/eventa'

/** The composer of a chat window, as `InteractiveArea` exposes it. */
interface DraftComposer {
  snapshotDraft: () => Promise<ChatDraftHandover | undefined>
  restoreDraft: (draft: ChatDraftHandover) => Promise<boolean>
}

/**
 * Takes this chat window's part in a chat mode switch, which the main process
 * runs as one transaction.
 *
 * - A switch that closes this window first collects the composer's draft
 *   through {@link electronChatWindowCollectDraft}.
 * - A switch that opens this window waits until the page has mounted, taken
 *   the draft and reported the result. Only then does it close the previous
 *   window, so a draft that fails to restore stays where it was.
 * - A switch to a window that is already open offers the draft through
 *   {@link electronChatWindowDraftOffered}, and the page takes it the same way.
 *
 * Outside a switch the main process has no draft for this window and ignores
 * the report.
 */
export function useChatDraftHandover(composer: MaybeRefOrGetter<DraftComposer | null | undefined>) {
  const takeDraft = useElectronEventaInvoke(electronChatWindowTakeDraft)
  const settleDraft = useElectronEventaInvoke(electronChatWindowDraftSettled)

  // Registered during setup, so a switch that starts as soon as the page
  // shows can already collect from it.
  onScopeDispose(defineInvokeHandler(getElectronEventaContext(), electronChatWindowCollectDraft, async () => toValue(composer)?.snapshotDraft()))

  let receiving = Promise.resolve()

  /** Takes the draft and reports the result. A call waits for the one before it, so each has a take and a report of its own. */
  function receiveDraft() {
    receiving = receiving
      .then(async () => {
        const draft = await takeDraft()
        const restored = !draft || (await toValue(composer)?.restoreDraft(draft) ?? false)
        await settleDraft({ restored })
      })
      // The switch gives up on a window that reports nothing, so a failed call only needs a record.
      .catch(error => console.error('[chat-window] Failed to take the draft of a mode switch:', error))
    return receiving
  }

  let stopOffers: (() => void) | undefined
  onScopeDispose(() => stopOffers?.())

  onMounted(() => {
    void receiveDraft()
    // An offer counts only once the composer exists. An offer before that belongs to a switch that opened this page,
    // and the call above takes its draft.
    stopOffers = getElectronEventaContext().on(electronChatWindowDraftOffered, () => void receiveDraft())
  })
}
