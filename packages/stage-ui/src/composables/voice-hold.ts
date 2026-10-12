import type { MaybeRefOrGetter } from 'vue'

import { useEventListener } from '@vueuse/core'
import { computed, onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue'

/** A speech input that one hold started. `SpeechInputAttempt` from `@proj-airi/core-agent` satisfies it. */
export interface VoiceHoldInput {
  /** Stops capture and lets the host transcribe and deliver the speech. */
  end: () => unknown
  /** Stops capture and drops the speech. */
  cancel: (reason: string) => void
}

export interface VoiceHoldOptions {
  /** A disabled hold ignores presses. Disabling it during a hold cancels that hold. */
  enabled: MaybeRefOrGetter<boolean>
  /** Reads the session at press time. An empty value ignores the press. */
  sessionId: () => string | undefined
  /**
   * Starts one speech input for the session that the press captured.
   * Return `undefined` to ignore the press, for example when Hearing is not set up.
   */
  begin: (sessionId: string) => VoiceHoldInput | undefined
  /**
   * A release before this time cancels the input. This drops accidental taps, which carry no useful speech.
   * @default 300
   */
  minHoldMs?: number
}

/**
 * Connects a held key or button to one speech input.
 *
 * State model:
 * - Idle: `press` captures the session ID and begins an input. Then the hold is active.
 * - Active: `release` ends the input, or cancels it when the hold was shorter than `minHoldMs`.
 *   `cancel`, disabling, and scope disposal cancel it. Another `press`, such as a key repeat, does nothing.
 *
 * The hold keeps its own input. So a release ends only the input that its press began, even when another control began a later input.
 */
export function useVoiceHold(options: VoiceHoldOptions) {
  const minHoldMs = options.minHoldMs ?? 300
  const enabled = computed(() => toValue(options.enabled))
  const held = shallowRef(false)
  let active: { input: VoiceHoldInput, startedAt: number } | undefined

  function press() {
    if (active || !enabled.value)
      return

    const sessionId = options.sessionId()
    if (!sessionId)
      return

    const input = options.begin(sessionId)
    if (!input)
      return

    active = { input, startedAt: Date.now() }
    held.value = true
  }

  function release() {
    const current = active
    if (!current)
      return

    active = undefined
    held.value = false
    if (Date.now() - current.startedAt < minHoldMs)
      current.input.cancel('Push to Talk hold was too short')
    else
      void current.input.end()
  }

  function cancel(reason: string) {
    const current = active
    if (!current)
      return

    active = undefined
    held.value = false
    current.input.cancel(reason)
  }

  watch(enabled, (value) => {
    if (!value)
      cancel('Push to Talk was turned off')
  })
  onScopeDispose(() => cancel('Push to Talk owner was disposed'))

  return { enabled, held: readonly(held), press, release, cancel }
}

export type VoiceHold = ReturnType<typeof useVoiceHold>

/**
 * Elements where a key press has its own meaning, such as typing or activating a control.
 * The hold key ignores presses that these elements receive.
 */
const KEY_OWNER_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="textbox"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="tab"]',
].join(', ')

function ownsKey(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(KEY_OWNER_SELECTOR)
}

export interface VoiceHoldKeyOptions {
  /**
   * The `KeyboardEvent.code` of the hold key.
   * @default 'Space'
   */
  code?: string
}

/**
 * Drives a hold with a key in this page.
 *
 * The key works only while the page has focus and the hold is enabled. A press with a modifier is ignored, so browser
 * shortcuts keep working. A press that a text field or a control receives is ignored too, so typing and button
 * activation keep working. Losing focus or hiding the page cancels the hold, because the page cannot see the key release then.
 */
export function useVoiceHoldKey(hold: VoiceHold, options: VoiceHoldKeyOptions = {}) {
  const code = options.code ?? 'Space'

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.code !== code || !hold.enabled.value)
      return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || ownsKey(event.target))
      return

    // The page owns this key while the hold is enabled. Without this, Space scrolls the page.
    event.preventDefault()
    if (!event.repeat)
      hold.press()
  })
  useEventListener(window, 'keyup', (event: KeyboardEvent) => {
    if (event.code === code && hold.held.value) {
      event.preventDefault()
      hold.release()
    }
  })
  useEventListener(window, 'blur', () => hold.cancel('Page lost focus during the hold'))
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden')
      hold.cancel('Page was hidden during the hold')
  })
}
