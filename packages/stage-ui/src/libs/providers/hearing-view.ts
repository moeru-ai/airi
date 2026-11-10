import type { ComputedRef, InjectionKey } from 'vue'

import { inject } from 'vue'

/** APIs that the Hearing module exposes to the active Provider view. */
export interface HearingProviderViewContext {
  /** Configuration for the active transcription Provider. */
  providerConfig: ComputedRef<Readonly<Record<string, unknown>> | undefined>
  /** Saves a partial configuration as configured and refreshes the monitoring session. */
  updateProviderConfig: (patch: Record<string, unknown>) => Promise<void>
}

export const hearingProviderViewContextKey: InjectionKey<HearingProviderViewContext>
  = Symbol('hearing-provider-view-context')

/** Returns the Hearing module APIs available to a registered Provider view. */
export function useHearingProviderViewContext() {
  const context = inject(hearingProviderViewContextKey)
  if (!context)
    throw new Error('The Provider view must be rendered inside the Hearing module.')

  return context
}
