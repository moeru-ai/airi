import type { InjectionKey, MaybeRefOrGetter } from 'vue'

import { computed, inject, toValue } from 'vue'

import { useHearingStore } from '../stores/modules/hearing'

/**
 * Tells the shared Hearing UI whether this host app can start a Push to Talk hold.
 *
 * Push to Talk stops continuous listening, so on a host without a trigger the microphone never captures.
 * The Hearing input mode selector and the voice button menu read this value through {@link usePushToTalkTrigger}.
 *
 * The host provides it once at the app level, so every window and page of the app reads one answer. This includes
 * settings and chat windows that do not own the trigger. Without a provider the answer is `false`. So a host must
 * declare a trigger before users can choose Push to Talk.
 *
 * This module does not import the voice host, so windows that only show settings or chat can read it.
 */
export const pushToTalkTriggerKey: InjectionKey<MaybeRefOrGetter<boolean>> = Symbol('@proj-airi/stage-ui/push-to-talk-trigger')

/**
 * Reads whether this host has a Push to Talk trigger.
 *
 * - `available`: the host has a trigger. Users can select the Push to Talk mode.
 * - `stranded`: the saved input mode is Push to Talk, but the host has no trigger. Listening stays off and the
 *   microphone stays closed, so the UI must warn the user. The mode does not fall back to Always on, because that
 *   opens the microphone all the time, which the user did not choose.
 *
 * Call it in a component setup that the host app renders, so the injection resolves.
 */
export function usePushToTalkTrigger() {
  const hearing = useHearingStore()
  const provided = inject(pushToTalkTriggerKey, false)
  const available = computed(() => toValue(provided))
  const stranded = computed(() => hearing.inputMode === 'push-to-talk' && !available.value)

  return { available, stranded }
}
