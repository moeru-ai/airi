export type BackgroundToContentMessage
  = | { type: 'background:request-vision-frame' }

export type ContentToBackgroundMessage
  = | { payload: PageContextPayload, type: 'content:page' }
    | { payload: SubtitlePayload, type: 'content:subtitle' }
    | { payload: VideoContextPayload, type: 'content:video' }
    | { payload: VisionFramePayload, type: 'content:vision:frame' }

export interface ExtensionSettings {
  enabled: boolean
  enableVision: boolean
  sendPageContext: boolean
  sendSparkNotify: boolean
  sendSubtitles: boolean
  sendVideoContext: boolean
  token: string
  wsUrl: string
}

export interface ExtensionStatus {
  connected: boolean
  lastError?: string
  lastPage?: PageContextPayload
  lastSubtitle?: SubtitlePayload
  lastVideo?: VideoContextPayload
  lastVisionFrameAt?: number
  settings: ExtensionSettings
}

export interface PageContextPayload {
  description?: string
  language?: string
  site: VideoSite
  title: string
  url: string
}

export interface SubtitlePayload {
  endMs?: number
  isAuto?: boolean
  language?: string
  site: VideoSite
  startMs?: number
  text: string
  title?: string
  url: string
  videoId?: string
}

export interface VideoContextPayload {
  channel?: string
  currentTimeSec?: number
  durationSec?: number
  isLive?: boolean
  isMuted?: boolean
  isPlaying?: boolean
  playbackRate?: number
  playerSize?: { height: number, width: number }
  site: VideoSite
  title: string
  url: string
  videoId?: string
  volume?: number
}

export type VideoSite = 'bilibili' | 'unknown' | 'youtube'

export interface VisionFramePayload {
  capturedAt: number
  dataUrl: string
  height: number
  site: VideoSite
  title?: string
  url: string
  videoId?: string
  width: number
}
