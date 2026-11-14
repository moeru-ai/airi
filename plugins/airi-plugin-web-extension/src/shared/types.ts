export type VideoSite = 'youtube' | 'bilibili' | 'unknown'

export interface PageContextPayload {
  site: VideoSite
  url: string
  title: string
  description?: string
  language?: string
}

/**
 * Where a video page is in a navigation between two videos.
 *
 * - `changing`: the URL shows the new video, but the title or channel can still belong to the previous video.
 * - `ready`: the title and channel belong to the video in the URL.
 */
export interface VideoNavigation {
  /** The video that the navigation leads to. */
  id: string
  phase: 'changing' | 'ready'
}

export interface VideoContextPayload {
  site: VideoSite
  url: string
  title: string
  channel?: string
  videoId?: string
  durationSec?: number
  currentTimeSec?: number
  isPlaying?: boolean
  isMuted?: boolean
  volume?: number
  playbackRate?: number
  isLive?: boolean
  playerSize?: { width: number, height: number }
  /** Set only on sites that tell when a navigation is done. Others leave it out. */
  navigation?: VideoNavigation
}

export interface SubtitlePayload {
  site: VideoSite
  url: string
  videoId?: string
  title?: string
  text: string
  language?: string
  startMs?: number
  endMs?: number
  isAuto?: boolean
}

export interface VisionFramePayload {
  site: VideoSite
  url: string
  videoId?: string
  title?: string
  capturedAt: number
  width: number
  height: number
  dataUrl: string
}

export type ContentToBackgroundMessage
  = | { type: 'content:page', payload: PageContextPayload }
    | { type: 'content:video', payload: VideoContextPayload }
    | { type: 'content:subtitle', payload: SubtitlePayload }
    | { type: 'content:vision:frame', payload: VisionFramePayload }

export interface ExtensionSettings {
  wsUrl: string
  token: string
  enabled: boolean
  sendPageContext: boolean
  sendVideoContext: boolean
  sendSubtitles: boolean
  sendSparkNotify: boolean
  enableVision: boolean
}

export interface ExtensionStatus {
  connected: boolean
  lastError?: string
  settings: ExtensionSettings
  lastPage?: PageContextPayload
  lastVideo?: VideoContextPayload
  lastSubtitle?: SubtitlePayload
  lastVisionFrameAt?: number
}

export type BackgroundToContentMessage
  = | { type: 'background:request-vision-frame' }
