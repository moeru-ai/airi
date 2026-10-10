import type { DesktopCapabilities, DesktopCompanionSnapshot, DesktopCursorSample, DesktopNotificationInput, DesktopPreferences, DesktopReactionIntent } from '../desktop-companion'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const desktopCompanionGet = defineInvokeEventa<DesktopCompanionSnapshot>('eventa:invoke:electron:desktop-companion:get')
export const desktopCompanionSetPreferences = defineInvokeEventa<DesktopCompanionSnapshot, Partial<DesktopPreferences>>('eventa:invoke:electron:desktop-companion:set-preferences')
export const desktopNotificationPublish = defineInvokeEventa<DesktopCompanionSnapshot, DesktopNotificationInput>('eventa:invoke:electron:desktop-companion:publish')
export const desktopNotificationRead = defineInvokeEventa<DesktopCompanionSnapshot, { id?: string }>('eventa:invoke:electron:desktop-companion:read')
export const desktopNotificationClear = defineInvokeEventa<DesktopCompanionSnapshot>('eventa:invoke:electron:desktop-companion:clear')
export const desktopCompanionChanged = defineEventa<DesktopCompanionSnapshot>('eventa:event:electron:desktop-companion:changed')
export const desktopReactionRequested = defineEventa<DesktopReactionIntent>('eventa:event:electron:desktop-companion:reaction')
export const desktopCapabilitiesGet = defineInvokeEventa<DesktopCapabilities>('eventa:invoke:electron:desktop-companion:capabilities')
export const desktopCapabilitiesChanged = defineEventa<DesktopCapabilities>('eventa:event:electron:desktop-companion:capabilities')
export const desktopCursorSample = defineEventa<DesktopCursorSample | null>('eventa:event:electron:desktop-companion:cursor')
