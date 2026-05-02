import type { SourceDescriptor } from '@proj-airi/visual-chat-protocol'

import type { SourceRegistry } from '../source-registry'

export interface SourceSelectionResult {
  activeVideo: SourceDescriptor | null
  activeAudio: SourceDescriptor | null
  standbyVideo: SourceDescriptor[]
  standbyAudio: SourceDescriptor[]
}

export interface SourceSelectionPolicy {
  name: string
  select: (registry: SourceRegistry, manualOverride?: string) => SourceSelectionResult
}

const VIDEO_SOURCE_TYPES = new Set<SourceDescriptor['sourceType']>(['phone-camera', 'laptop-camera', 'screen-share'])

const VIDEO_PRIORITY: SourceDescriptor['sourceType'][] = ['phone-camera', 'laptop-camera', 'screen-share']

const DEVICE_AUDIO_MAP: Record<string, SourceDescriptor['sourceType']> = {
  'phone-camera': 'phone-mic',
  'laptop-camera': 'laptop-mic',
  'screen-share': 'laptop-mic',
}

/**
 * Manual source selection: accepts either a sourceId (e.g. "src_abc123")
 * or a sourceType string (e.g. "screen-share") as override.
 */
export class ManualSwitchPolicy implements SourceSelectionPolicy {
  name = 'manual-switch'

  select(registry: SourceRegistry, manualOverride?: string): SourceSelectionResult {
    const videoSources = registry.getVideoSources()
    const audioSources = registry.getAudioSources()

    let activeVideo: SourceDescriptor | null = null

    if (manualOverride) {
      // Try as sourceId first
      const byId = registry.get(manualOverride)
      if (byId && VIDEO_SOURCE_TYPES.has(byId.sourceType)) {
        activeVideo = byId
      }
      else {
        // Try as sourceType string
        const isSourceType = VIDEO_SOURCE_TYPES.has(manualOverride as SourceDescriptor['sourceType'])
        if (isSourceType) {
          activeVideo = videoSources.find(s => s.sourceType === manualOverride) ?? null
        }
      }
    }

    // Fallback to priority-based selection
    if (!activeVideo) {
      for (const preferred of VIDEO_PRIORITY) {
        const found = videoSources.find(s => s.sourceType === preferred)
        if (found) {
          activeVideo = found
          break
        }
      }
    }

    // Select matching audio source
    let activeAudio: SourceDescriptor | null = null
    if (activeVideo) {
      const preferredAudioType = DEVICE_AUDIO_MAP[activeVideo.sourceType]
      if (preferredAudioType)
        activeAudio = audioSources.find(s => s.sourceType === preferredAudioType) ?? null
    }
    if (!activeAudio && audioSources.length > 0)
      activeAudio = audioSources[0]

    const standbyVideo = videoSources.filter(s => s !== activeVideo)
    const standbyAudio = audioSources.filter(s => s !== activeAudio)

    return { activeVideo, activeAudio, standbyVideo, standbyAudio }
  }
}
