import type {
  VisionConfigPayload,
  VisionScreenshotPayload,
} from '@proj-airi/stage-ui/types'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type { VisionErrorCode } from '@proj-airi/stage-ui/types'

export const visionCaptureScreen = defineInvokeEventa<VisionScreenshotPayload>('eventa:invoke:vision:capture-screen')
export const visionScreenshotEvent = defineEventa<VisionScreenshotPayload>('eventa:event:vision:screenshot')

export const visionScreenChangeEvent = defineEventa('eventa:event:vision:screen-change')

export const visionSetAutoCapture = defineInvokeEventa<void, { enabled: boolean, interval?: number }>('eventa:invoke:vision:set-auto-capture')

export const visionGetConfig = defineInvokeEventa<{ cooldown: number, autoCapture: { enabled: boolean, interval: number } }, void>('eventa:invoke:vision:get-config')
export const visionUpdateConfig = defineInvokeEventa<void, VisionConfigPayload>('eventa:invoke:vision:update-config')
