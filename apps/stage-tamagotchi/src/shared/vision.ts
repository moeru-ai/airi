import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type VisionErrorCode = 'cooldown_active' | 'no_sources'

export interface VisionScreenshotPayload {
  image?: string
  timestamp: number
  error?: VisionErrorCode
}

export const visionCaptureScreen = defineInvokeEventa<VisionScreenshotPayload>('eventa:invoke:vision:capture-screen')
export const visionScreenshotEvent = defineEventa<VisionScreenshotPayload>('eventa:event:vision:screenshot')

export interface VisionAnalyzePayload {
  image: string
  prompt?: string
}

export interface VisionAnalysisResult {
  description: string
  elements: Array<{
    type: string
    description: string
    position: { x: number, y: number, width: number, height: number }
  }>
  suggestions?: string[]
}

export const visionAnalyzeScreen = defineInvokeEventa<VisionAnalysisResult, VisionAnalyzePayload>('eventa:invoke:vision:analyze-screen')

export interface VisionExecuteActionPayload {
  action: string
  target?: string
  coordinates?: { x: number, y: number }
}

export const visionExecuteAction = defineInvokeEventa<void, VisionExecuteActionPayload>('eventa:invoke:vision:execute-action')

export const visionScreenChangeEvent = defineEventa('eventa:event:vision:screen-change')

export const visionSetAutoCapture = defineInvokeEventa<void, { enabled: boolean, interval?: number }>('eventa:invoke:vision:set-auto-capture')

export interface VisionConfigPayload {
  cooldown?: number
  autoCapture?: {
    enabled?: boolean
    interval?: number
  }
}

export const visionGetConfig = defineInvokeEventa<{ cooldown: number, autoCapture: { enabled: boolean, interval: number } }, void>('eventa:invoke:vision:get-config')
export const visionUpdateConfig = defineInvokeEventa<void, VisionConfigPayload>('eventa:invoke:vision:update-config')
