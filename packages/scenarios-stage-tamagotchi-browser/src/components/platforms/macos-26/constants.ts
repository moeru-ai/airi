import type { InjectionKey, Ref } from 'vue'

export interface PlatformLayoutContext {
  dock: Ref<HTMLElement | null>
  root: Readonly<Ref<HTMLElement | null>>
}

export const injectPlatformLayout: InjectionKey<PlatformLayoutContext> = Symbol('vishot:platforms:macos-26:layout')
