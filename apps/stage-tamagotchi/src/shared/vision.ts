import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface VisionScreenshotPayload {
  image: string
  timestamp: number
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

export const visionSetAutoCapture = defineInvokeEventa<void, { enabled: boolean, interval?: number } | undefined>('eventa:invoke:vision:set-auto-capture')
