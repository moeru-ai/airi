import type { SourceSelectionPolicy, SourceSelectionResult } from '@proj-airi/visual-chat-media-core'
import type { SessionContext } from '@proj-airi/visual-chat-protocol'
import type { AudioChunk, VideoFrame } from '@proj-airi/visual-chat-shared'

import { createSessionContext, ManualSwitchPolicy, RingBuffer, SourceRegistry, updateSessionState } from '@proj-airi/visual-chat-media-core'
import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import { RING_BUFFER_AUDIO_CAPACITY, RING_BUFFER_VIDEO_CAPACITY } from '@proj-airi/visual-chat-protocol'

const log = createGatewayLogger()

export type SessionEventHandler = (event: string, data: unknown) => void

export class SessionOrchestrator {
  private context: SessionContext
  private sourceRegistry: SourceRegistry
  private selectionPolicy: SourceSelectionPolicy
  private audioBuffer: RingBuffer<AudioChunk>
  private videoBuffer: RingBuffer<VideoFrame>
  private eventHandler: SessionEventHandler | null = null

  constructor(roomName: string, sessionId?: string) {
    this.context = createSessionContext(roomName, sessionId)
    this.sourceRegistry = new SourceRegistry()
    this.selectionPolicy = new ManualSwitchPolicy()
    this.audioBuffer = new RingBuffer<AudioChunk>(RING_BUFFER_AUDIO_CAPACITY)
    this.videoBuffer = new RingBuffer<VideoFrame>(RING_BUFFER_VIDEO_CAPACITY)
  }

  get sessionId(): string { return this.context.sessionId }
  get roomName(): string { return this.context.roomName }
  get state(): SessionContext['state'] { return this.context.state }
  get mode(): SessionContext['mode'] { return this.context.mode }

  onEvent(handler: SessionEventHandler): void {
    this.eventHandler = handler
  }

  getContext(): SessionContext { return { ...this.context } }
  getRegistry(): SourceRegistry { return this.sourceRegistry }

  registerSource(
    participantIdentity: string,
    trackSid: string,
    sourceType: Parameters<SourceRegistry['register']>[2],
  ) {
    const source = this.sourceRegistry.register(participantIdentity, trackSid, sourceType)
    this.reselect()
    this.emit('source:registered', { sourceId: source.sourceId, sourceType: source.sourceType })
    log.withTag('orchestrator').log(`Source registered: ${source.sourceType} (${source.sourceId})`)
    return source
  }

  unregisterSource(sourceId: string) {
    this.sourceRegistry.unregister(sourceId)
    this.reselect()
    this.emit('source:unregistered', { sourceId })
  }

  switchSource(sourceIdOrType: string) {
    const result = this.selectionPolicy.select(this.sourceRegistry, sourceIdOrType)
    this.applySelection(result)
    this.emit('source:active:changed', {
      activeVideo: result.activeVideo?.sourceId ?? null,
      activeAudio: result.activeAudio?.sourceId ?? null,
    })
  }

  pushAudio(chunk: AudioChunk) {
    this.audioBuffer.write(chunk)
    this.sourceRegistry.updateTimestamp(chunk.sourceId, chunk.timestamp)
  }

  pushVideo(frame: VideoFrame) {
    this.videoBuffer.write(frame)
    this.sourceRegistry.updateTimestamp(frame.sourceId, frame.timestamp)
  }

  getLatestAudio(n: number = 1): AudioChunk[] {
    return this.audioBuffer.readLatest(n)
  }

  getLatestVideo(n: number = 1): VideoFrame[] {
    return this.videoBuffer.readLatest(n)
  }

  /**
   * Transition state with event emission.
   */
  transitionState(state: SessionContext['state']) {
    const prevState = this.context.state
    this.context = updateSessionState(this.context, state)
    this.emit('session:state:changed', { from: prevState, to: state, context: this.getContext() })
  }

  dispose() {
    this.audioBuffer.clear()
    this.videoBuffer.clear()
    this.sourceRegistry.clear()
    this.emit('session:ended', { sessionId: this.sessionId })
  }

  private reselect() {
    const result = this.selectionPolicy.select(this.sourceRegistry)
    this.applySelection(result)
  }

  private applySelection(result: SourceSelectionResult) {
    for (const s of this.sourceRegistry.getAll())
      this.sourceRegistry.setActive(s.sourceId, false)

    if (result.activeVideo)
      this.sourceRegistry.setActive(result.activeVideo.sourceId, true)
    if (result.activeAudio)
      this.sourceRegistry.setActive(result.activeAudio.sourceId, true)

    this.context = {
      ...this.context,
      activeVideoSource: result.activeVideo,
      activeAudioSource: result.activeAudio,
      standbyVideoSources: result.standbyVideo,
      standbyAudioSources: result.standbyAudio,
      lastActivityAt: Date.now(),
    }
  }

  private emit(event: string, data: unknown) {
    this.eventHandler?.(event, data)
  }
}
