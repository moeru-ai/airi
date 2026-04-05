import type { SourceDescriptor } from '@proj-airi/visual-chat-protocol'

import { generateSourceId } from '@proj-airi/visual-chat-shared'

export class SourceRegistry {
  private sources = new Map<string, SourceDescriptor>()

  register(
    participantIdentity: string,
    trackSid: string,
    sourceType: SourceDescriptor['sourceType'],
  ): SourceDescriptor {
    const existing = this.findByTrackSid(trackSid)
    if (existing)
      return existing

    const descriptor: SourceDescriptor = {
      sourceId: generateSourceId(),
      participantIdentity,
      trackSid,
      sourceType,
      isActive: false,
      lastFrameTimestamp: 0,
    }

    this.sources.set(descriptor.sourceId, descriptor)
    return descriptor
  }

  unregister(sourceId: string): boolean {
    return this.sources.delete(sourceId)
  }

  unregisterByTrackSid(trackSid: string): boolean {
    const source = this.findByTrackSid(trackSid)
    if (source)
      return this.sources.delete(source.sourceId)
    return false
  }

  get(sourceId: string): SourceDescriptor | undefined {
    return this.sources.get(sourceId)
  }

  findByTrackSid(trackSid: string): SourceDescriptor | undefined {
    for (const source of this.sources.values()) {
      if (source.trackSid === trackSid)
        return source
    }
    return undefined
  }

  findByType(sourceType: SourceDescriptor['sourceType']): SourceDescriptor[] {
    return [...this.sources.values()].filter(s => s.sourceType === sourceType)
  }

  findByParticipant(participantIdentity: string): SourceDescriptor[] {
    return [...this.sources.values()].filter(s => s.participantIdentity === participantIdentity)
  }

  getVideoSources(): SourceDescriptor[] {
    return [...this.sources.values()].filter(s =>
      s.sourceType === 'phone-camera'
      || s.sourceType === 'laptop-camera'
      || s.sourceType === 'screen-share',
    )
  }

  getAudioSources(): SourceDescriptor[] {
    return [...this.sources.values()].filter(s =>
      s.sourceType === 'phone-mic'
      || s.sourceType === 'laptop-mic',
    )
  }

  getAll(): SourceDescriptor[] {
    return [...this.sources.values()]
  }

  get size(): number {
    return this.sources.size
  }

  updateTimestamp(sourceId: string, timestamp: number): void {
    const source = this.sources.get(sourceId)
    if (source)
      source.lastFrameTimestamp = timestamp
  }

  setActive(sourceId: string, active: boolean): void {
    const source = this.sources.get(sourceId)
    if (source)
      source.isActive = active
  }

  clear(): void {
    this.sources.clear()
  }
}
