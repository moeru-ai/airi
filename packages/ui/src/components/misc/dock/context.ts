import type { TooltipContentProps } from 'reka-ui'
import type { Ref } from 'vue'

import { createContext } from 'reka-ui'

/** The size of the buttons of a dock. `sm` buttons are 28px, and `md` buttons are 36px. */
export type DockSize = 'sm' | 'md'

/** The surface of a dock. `blurry` lets the background show through, as the controls over the stage. */
export type DockVariant = 'default' | 'blurry'

/** The direction of a dock. */
export type DockOrientation = 'horizontal' | 'vertical'

/** The end of a dock that an item shows at. `start` is the top of a vertical dock, or the left of a horizontal dock. */
export type DockItemEdge = 'start' | 'end'

/** What a dock gives its buttons and separators. A button outside a dock uses the defaults of the `Dock` props. */
export interface DockContext {
  orientation: Readonly<Ref<DockOrientation>>
  size: Readonly<Ref<DockSize>>
  variant: Readonly<Ref<DockVariant>>
  opacity: Readonly<Ref<number>>
  blur: Readonly<Ref<number>>
  tooltipSide: Readonly<Ref<NonNullable<TooltipContentProps['side']>>>
  /** Declares the open tooltips of the buttons as translucent surfaces. */
  registerSurface: Readonly<Ref<((element: HTMLElement) => () => void) | undefined>>
}

export const [injectDockContext, provideDockContext] = createContext<DockContext>('Dock')
