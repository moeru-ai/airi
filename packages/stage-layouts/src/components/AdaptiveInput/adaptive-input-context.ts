import type { ComputedRef, Ref } from 'vue'

import { createContext } from 'reka-ui'

interface AdaptiveInputRootContext {
  area: Ref<HTMLElement | null>
  enabled: ComputedRef<boolean>
  keyboardVisible: Readonly<Ref<boolean>>
  setArea: (element: HTMLElement | null) => void
  setViewport: (element: HTMLElement | null) => void
  viewport: Ref<HTMLElement | null>
  viewportBottom: Readonly<Ref<number>>
}

export const [injectAdaptiveInputRootContext, provideAdaptiveInputRootContext]
  = createContext<AdaptiveInputRootContext>('AdaptiveInputRoot')
