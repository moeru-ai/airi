import type { VideoSite } from './types'

export function detectSiteFromUrl(url: string): VideoSite {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    if (host.includes('youtube.com') || host.includes('youtu.be'))
      return 'youtube'
    if (host.includes('bilibili.com') || host.includes('b23.tv'))
      return 'bilibili'
    return 'unknown'
  }
  catch {
    return 'unknown'
  }
}

export function extractVideoId(site: VideoSite, url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (site === 'youtube') {
      if (parsed.hostname.includes('youtu.be'))
        return parsed.pathname.replace('/', '') || undefined
      return parsed.searchParams.get('v') || undefined
    }
    if (site === 'bilibili') {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const videoIndex = parts.findIndex(part => part === 'video')
      if (videoIndex >= 0)
        return parts[videoIndex + 1]
      return parts[0]
    }
  }
  catch {
    return undefined
  }

  return undefined
}

export function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || ''
}
