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
      if (videoIndex >= 0) {
        // A multi-part video keeps one id and selects the part with `?p=`. Each part is a different video to notify about.
        const id = parts[videoIndex + 1]
        const part = Number(parsed.searchParams.get('p'))
        return id && part > 1 ? `${id}?p=${part}` : id
      }
      // A bangumi page is `/bangumi/play/<episode id>`. The first segment is the same for every episode.
      if (parts[0] === 'bangumi')
        return parts[2]
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
