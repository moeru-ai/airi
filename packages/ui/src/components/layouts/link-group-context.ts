import type { InjectionKey } from 'vue'

/** What a `LinkGroupItem` tells the `LinkGroup` that holds it. */
export interface LinkGroupItemHandle {
  /** The element of the item. The group puts the dots of the item on its own dot grid. */
  element: () => HTMLElement | undefined
  /** The narrowest width at which the item does not cut its text. The item measures its own parts. */
  naturalWidth: () => number
}

export interface LinkGroupContext {
  /** Adds an item to the group. Call the returned function when the item goes away. */
  register: (item: LinkGroupItemHandle) => () => void
}

export const linkGroupContextKey: InjectionKey<LinkGroupContext> = Symbol('link-group')
