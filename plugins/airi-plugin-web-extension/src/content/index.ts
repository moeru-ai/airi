import type { BackgroundToContentMessage, ContentToBackgroundMessage, PageContextPayload, SubtitlePayload, VideoContextPayload, VideoSite, VisionFramePayload } from '../shared/types'

import { detectSiteFromUrl, extractVideoId, normalizeText } from '../shared/sites'

const VIDEO_PROGRESS_INTERVAL = 15000
const TITLE_POLL_INTERVAL = 2000
const SUBTITLE_DEDUPE_WINDOW = 2000

const lastPayloadByType = new Map<string, string>()

export function startContentObserver() {
  const site = detectSiteFromUrl(location.href)
  safeSend({ payload: buildPageContext(site), type: 'content:page' })
  const stopVideo = observeVideo(site)

  browser.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
    if (message.type === 'background:request-vision-frame') {
      const video = document.querySelector('video') as HTMLVideoElement | null
      if (!video)
        return

      const frame = captureVisionFrame(site, video)
      if (frame)
        safeSend({ payload: frame, type: 'content:vision:frame' })
    }
  })

  return () => {
    stopVideo?.()
  }
}

function buildPageContext(site: VideoSite): PageContextPayload {
  const description = normalizeText(document.querySelector('meta[name="description"]')?.getAttribute('content'))
  const ogDescription = normalizeText(document.querySelector('meta[property="og:description"]')?.getAttribute('content'))

  return {
    description: description || ogDescription || undefined,
    language: document.documentElement.lang || undefined,
    site,
    title: normalizeText(document.title),
    url: location.href,
  }
}

function buildVideoContext(site: VideoSite, video: HTMLVideoElement, includeProgress = false): VideoContextPayload {
  const title = normalizeText(findVideoTitle(site))
  const channel = normalizeText(findChannelName(site))
  const url = location.href
  const videoId = extractVideoId(site, url)
  const durationSec = Number.isFinite(video.duration) ? Math.floor(video.duration) : undefined
  const currentTimeSec = includeProgress && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : undefined
  const rect = video.getBoundingClientRect()

  return {
    channel: channel || undefined,
    currentTimeSec,
    durationSec,
    isMuted: video.muted,
    isPlaying: !video.paused && !video.ended,
    playbackRate: Number.isFinite(video.playbackRate) ? Number(video.playbackRate.toFixed(2)) : undefined,
    playerSize: rect.width && rect.height ? { height: Math.round(rect.height), width: Math.round(rect.width) } : undefined,
    site,
    title: title || normalizeText(document.title),
    url,
    videoId,
    volume: Number.isFinite(video.volume) ? Number(video.volume.toFixed(2)) : undefined,
  }
}

function captureVisionFrame(site: VideoSite, video: HTMLVideoElement): null | VisionFramePayload {
  const canvas = document.createElement('canvas')
  const width = Math.min(480, Math.max(1, Math.floor(video.videoWidth)))
  const height = Math.min(270, Math.max(1, Math.floor(video.videoHeight)))

  if (!width || !height)
    return null

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null

  try {
    ctx.drawImage(video, 0, 0, width, height)
    return {
      capturedAt: Date.now(),
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
      height,
      site,
      title: normalizeText(findVideoTitle(site)) || undefined,
      url: location.href,
      videoId: extractVideoId(site, location.href),
      width,
    }
  }
  catch {
    return null
  }
}

function findChannelName(site: VideoSite) {
  if (site === 'youtube') {
    return (
      document.querySelector('#channel-name a')?.textContent
      || document.querySelector('ytd-channel-name a')?.textContent
      || document.querySelector('ytd-channel-name')?.textContent
    )
  }

  if (site === 'bilibili') {
    return (
      document.querySelector('.up-name')?.textContent
      || document.querySelector('.username')?.textContent
      || document.querySelector('.up-info .name')?.textContent
    )
  }

  return undefined
}

function findVideoTitle(site: VideoSite) {
  if (site === 'youtube') {
    return (
      document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent
      || document.querySelector('h1.title yt-formatted-string')?.textContent
      || document.querySelector('h1.title')?.textContent
    )
  }

  if (site === 'bilibili') {
    return (
      document.querySelector('h1.video-title')?.textContent
      || document.querySelector('.video-title')?.textContent
      || document.querySelector('h1')?.textContent
    )
  }

  return document.querySelector('h1')?.textContent
}

function observeSubtitleDom(site: VideoSite, onSubtitle: (payload: SubtitlePayload) => void) {
  let selector = ''
  if (site === 'youtube')
    selector = '.caption-window .caption-window-text, .ytp-caption-segment'
  if (site === 'bilibili')
    selector = '.bpx-player-subtitle-panel-text, .bpx-player-subtitle-text'

  if (!selector)
    return () => {}

  let lastText = ''

  const read = () => {
    const nodes = Array.from(document.querySelectorAll(selector))
    const text = normalizeText(nodes.map(node => node.textContent).join(' '))
    if (!text || text === lastText)
      return

    lastText = text
    onSubtitle({
      site,
      text,
      title: normalizeText(findVideoTitle(site)) || undefined,
      url: location.href,
      videoId: extractVideoId(site, location.href),
    })
  }

  const observer = new MutationObserver(read)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const interval = window.setInterval(read, 1200)

  return () => {
    observer.disconnect()
    window.clearInterval(interval)
  }
}

function observeTextTracks(site: VideoSite, video: HTMLVideoElement, onSubtitle: (payload: SubtitlePayload) => void) {
  const seen = new Map<string, number>()

  const handleCueChange = (track: TextTrack) => {
    const cues = Array.from(track.activeCues ?? []) as TextTrackCue[]
    for (const cue of cues) {
      const text = normalizeText((cue as VTTCue).text ?? '')
      if (!text)
        continue

      const key = `${text}:${Math.floor(cue.startTime * 1000)}`
      const now = Date.now()
      const lastSeen = seen.get(key)
      if (lastSeen && now - lastSeen < SUBTITLE_DEDUPE_WINDOW)
        continue

      seen.set(key, now)
      onSubtitle({
        endMs: Math.floor(cue.endTime * 1000),
        language: (track.language || track.label || undefined),
        site,
        startMs: Math.floor(cue.startTime * 1000),
        text,
        title: normalizeText(findVideoTitle(site)) || undefined,
        url: location.href,
        videoId: extractVideoId(site, location.href),
      })
    }
  }

  const attach = () => {
    const tracks = Array.from(video.textTracks ?? [])
    for (const track of tracks) {
      if (track.kind && !['captions', 'subtitles'].includes(track.kind))
        continue

      if (track.mode === 'disabled')
        track.mode = 'hidden'
      track.oncuechange = () => handleCueChange(track)
    }
  }

  attach()

  const observer = new MutationObserver(() => attach())
  observer.observe(video, { attributes: true, childList: true, subtree: true })

  return () => observer.disconnect()
}

function observeVideo(site: VideoSite) {
  let video: HTMLVideoElement | null = null
  let stopTracks: (() => void) | null = null
  let stopDomSubtitles: (() => void) | null = null
  let listenersAttached = false

  const sendVideo = (includeProgress: boolean) => {
    if (!video)
      return

    safeSend({ payload: buildVideoContext(site, video, includeProgress), type: 'content:video' })
  }

  const sendPage = () => {
    safeSend({ payload: buildPageContext(site), type: 'content:page' })
  }

  const onPlayback = () => sendVideo(true)

  const attach = () => {
    const found = document.querySelector('video') as HTMLVideoElement | null
    if (!found || found === video)
      return

    if (video && listenersAttached) {
      video.removeEventListener('play', onPlayback)
      video.removeEventListener('pause', onPlayback)
      video.removeEventListener('loadedmetadata', onPlayback)
      listenersAttached = false
    }

    video = found
    stopTracks?.()
    stopDomSubtitles?.()

    stopTracks = observeTextTracks(site, video, payload => safeSend({ payload, type: 'content:subtitle' }))
    stopDomSubtitles = observeSubtitleDom(site, payload => safeSend({ payload, type: 'content:subtitle' }))

    sendPage()
    sendVideo(false)
  }

  const interval = window.setInterval(attach, 1000)

  const progressInterval = window.setInterval(() => {
    if (!video)
      return
    sendVideo(true)
  }, VIDEO_PROGRESS_INTERVAL)

  const titleInterval = window.setInterval(() => {
    sendPage()
    sendVideo(false)
  }, TITLE_POLL_INTERVAL)

  const cleanup = () => {
    window.clearInterval(interval)
    window.clearInterval(progressInterval)
    window.clearInterval(titleInterval)
    if (video) {
      video.removeEventListener('play', onPlayback)
      video.removeEventListener('pause', onPlayback)
      video.removeEventListener('loadedmetadata', onPlayback)
      listenersAttached = false
    }
    stopTracks?.()
    stopDomSubtitles?.()
  }

  const attachListeners = () => {
    if (!video)
      return
    if (listenersAttached)
      return

    video.addEventListener('play', onPlayback)
    video.addEventListener('pause', onPlayback)
    video.addEventListener('loadedmetadata', onPlayback)
    listenersAttached = true
  }

  const observer = new MutationObserver(() => {
    attach()
    attachListeners()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })

  attach()
  attachListeners()

  return () => {
    cleanup()
    observer.disconnect()
  }
}

function safeSend(message: ContentToBackgroundMessage) {
  const serialized = JSON.stringify(message.payload)
  const lastSerialized = lastPayloadByType.get(message.type)
  if (serialized === lastSerialized)
    return

  lastPayloadByType.set(message.type, serialized)
  void browser.runtime.sendMessage(message).catch(() => {})
}
