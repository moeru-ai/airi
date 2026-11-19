import type { InjectionKey } from 'vue'

/** `true` inside the panel of the fullscreen mode, where a surface draws its content without a window frame. */
export const fullscreenPanelKey: InjectionKey<boolean> = Symbol('fullscreen-panel')
