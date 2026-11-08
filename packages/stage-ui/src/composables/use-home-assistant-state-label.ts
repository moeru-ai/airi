import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { isTranslatableState, parseStateMoment, stateLabelKeys } from '../libs/home-assistant/presentation'

/**
 * Words a Home Assistant state in the user's language.
 *
 * Use when:
 * - A surface shows the state of a Home Assistant device, for example the module settings page or a tool call in the chat
 *
 * Returns:
 * - `stateLabel`, which gives the state that a device row prints
 */
export function useHomeAssistantStateLabel() {
  const { locale, t, te } = useI18n()

  /** Formats a date without its time. */
  const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
  /** Formats a date with its time. */
  const dateTimeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))

  /**
   * Names one state.
   *
   * Home Assistant names states per domain, so the table is asked for the domain
   * first. A state the table lacks stays as the instance reports it, which is the
   * honest answer for a reading such as a temperature.
   */
  function translateState(domain: string, state: string): string | undefined {
    if (!isTranslatableState(state))
      return undefined

    for (const key of stateLabelKeys(domain, state)) {
      if (te(key) || te(key, 'en'))
        return t(key)
    }

    return undefined
  }

  /** The state a device row prints. */
  function stateLabel(domain: string, state: string) {
    const named = translateState(domain, state)
    if (named)
      return named

    // Home Assistant reports a date or a timestamp as ISO 8601 text. A card reads
    // better with the date the page language writes.
    const moment = parseStateMoment(state)
    if (moment)
      return (moment.kind === 'date' ? dateFormat.value : dateTimeFormat.value).format(moment.at)

    return state
  }

  return { stateLabel }
}
