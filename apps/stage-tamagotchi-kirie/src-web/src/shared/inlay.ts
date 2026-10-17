import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const openInlay = defineInvokeEventa<void, Record<string, never>>('eventa:invoke:electron:windows:inlay:open')
export const inlayReturnHome = defineInvokeEventa<void, Record<string, never>>('eventa:invoke:electron:windows:inlay:return-home')
export const inlayReady = defineEventa<Record<string, never>>('eventa:event:airi:inlay:ready')

/** True means the native observer owns Escape. Other platforms use their non-consuming Platform driver. */
export const inlayWatchEscape = defineInvokeEventa<boolean, { enabled: boolean }>('eventa:invoke:airi:inlay:watch-escape')
export const inlayEscape = defineEventa<Record<string, never>>('eventa:event:airi:inlay:escape')
