export type VisionErrorCode = 'cooldown_active' | 'no_sources'

export interface VisionScreenshotPayload {
  image?: string
  timestamp: number
  error?: VisionErrorCode
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

export interface VisionConfigPayload {
  cooldown?: number
  autoCapture?: {
    enabled?: boolean
    interval?: number
  }
}

export interface Screenshot {
  image: string
  timestamp: number
}

export type AnalysisResult = VisionAnalysisResult
