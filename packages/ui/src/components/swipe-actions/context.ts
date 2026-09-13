import type { CSSProperties, Ref } from 'vue'

import { createContext } from 'reka-ui'

/** Logical edge of the row; start is left in LTR and right in RTL. */
export type SwipeActionsSide = 'start' | 'end'

/** A List owns its action layout and full-swipe default, independent of the other edge. */
export interface RegisteredList {
  side: Readonly<Ref<SwipeActionsSide>>
  actionWidth: Readonly<Ref<number>>
  gap: Readonly<Ref<number>>
  defaultAction: Readonly<Ref<string | undefined>>
}

/** Item selection can be canceled before the Root emits an action. */
export type SwipeActionsSelectEvent = CustomEvent<{ value: string, source: 'press' | 'swipe', side: SwipeActionsSide }>

/** A mounted item's identity and live props. Registration belongs to one Root. */
export interface RegisteredItem {
  list: RegisteredList
  element: Readonly<Ref<HTMLElement>>
  value: Readonly<Ref<string>>
  disabled: Readonly<Ref<boolean>>
  select: (event: SwipeActionsSelectEvent) => void
}

/** Internal coordination between the gesture owner and its rendered parts. */
interface SwipeActionsContext {
  open: Readonly<Ref<boolean>>
  armed: Readonly<Ref<boolean>>
  committing: Readonly<Ref<boolean>>
  disabled: Readonly<Ref<boolean>>
  reveal: Readonly<Ref<number>>
  side: Readonly<Ref<SwipeActionsSide>>
  direction: Readonly<Ref<'ltr' | 'rtl'>>
  offset: Readonly<Ref<number>>
  registerList: (list: RegisteredList) => () => void
  register: (item: RegisteredItem) => () => void
  refreshOrder: () => void
  actionStyle: (item: RegisteredItem) => CSSProperties
  itemExposed: (item: RegisteredItem) => boolean
  itemTakeover: (item: RegisteredItem) => number
  activate: (item: RegisteredItem) => void
  close: () => void
  toggle: (side?: SwipeActionsSide) => void
  closeContent: (event: MouseEvent) => void
}

export const [injectSwipeActionsContext, provideSwipeActionsContext] = createContext<SwipeActionsContext>('SwipeActionsRoot')

export const [injectSwipeActionsListContext, provideSwipeActionsListContext] = createContext<RegisteredList>('SwipeActionsList')
