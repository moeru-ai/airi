import type { TooltipContentProps } from 'reka-ui'
import type { Ref } from 'vue'

import { createContext } from 'reka-ui'

/** The size of the buttons of a dock. `sm` buttons are 28px, and `md` buttons are 36px. */
export type DockSize = 'sm' | 'md'

/** The surface of a dock. `blurry` lets the background show through, as the controls over the stage. */
export type DockVariant = 'default' | 'blurry'

/** What a dock gives its buttons and separators. A button outside a dock uses the defaults of the `Dock` props. */
export interface DockContext {
  orientation: Readonly<Ref<'horizontal' | 'vertical'>>
  size: Readonly<Ref<DockSize>>
  variant: Readonly<Ref<DockVariant>>
  opacity: Readonly<Ref<number>>
  blur: Readonly<Ref<number>>
  tooltipSide: Readonly<Ref<NonNullable<TooltipContentProps['side']>>>
}

export const [injectDockContext, provideDockContext] = createContext<DockContext>('Dock')
