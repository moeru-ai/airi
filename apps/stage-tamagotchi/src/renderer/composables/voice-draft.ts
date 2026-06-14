import { useLocalStorage } from '@vueuse/core'

// NOTICE:
// Cross-window hand-off of a voice transcription to the chat input as an editable draft.
// Used when desktop VAD capture has auto-send OFF: instead of sending, the main stage stages the
// utterance here and the chat window consumes it into its input for manual review/send.
//
// Backed by localStorage because it is shared + retained across the app's same-origin Electron
// windows, and `useLocalStorage` syncs it via the `storage` event. So the chat window picks up the
// draft whether it is already open (live, via the watcher) or opens fresh (initial, on mount) —
// no cross-window race that a one-shot BroadcastChannel post would have.
const VOICE_INPUT_DRAFT_KEY = 'airi/voice-input-draft'

/**
 * Reactive, cross-window voice-input draft backed by localStorage.
 *
 * Use when:
 * - The desktop stage captures speech in VAD mode with auto-send disabled and must hand the
 *   transcription to the chat window's input instead of sending it.
 *
 * Returns:
 * - A `Ref<string>` shared across same-origin windows. Writers append; the chat window reads it
 *   into its input and clears it back to `''`.
 */
export function useVoiceInputDraft() {
  return useLocalStorage<string>(VOICE_INPUT_DRAFT_KEY, '')
}
