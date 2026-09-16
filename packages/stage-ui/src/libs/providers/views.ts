import type { Component } from 'vue'

/** Loads the extra controls that a Provider shows in Hearing settings. */
export type HearingProviderViewLoader = () => Promise<{ default: Component }>

/** Vue-owned views that a Provider can expose in stage-ui. */
export interface ProviderViews {
  /** Extra controls for the Hearing settings page. */
  hearing?: HearingProviderViewLoader
}
