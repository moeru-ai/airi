import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '@proj-airi/pipelines-audio'

export interface PlaybackSpeakingStateHandlers<TAudio> {
  onStart?: (event: PlaybackStartEvent<TAudio>) => void
  setSpeaking: (value: boolean) => void
}

export interface PlaybackSpeakingStateManager<TAudio> {
  onEnd: (listener: (event: PlaybackEndEvent<TAudio>) => void) => void
  onInterrupt: (listener: (event: PlaybackInterruptEvent<TAudio>) => void) => void
  onReject: (listener: (event: PlaybackRejectEvent<TAudio>) => void) => void
  onStart: (listener: (event: PlaybackStartEvent<TAudio>) => void) => void
}

/**
 * Binds assistant speaking state to every terminal playback outcome.
 *
 * Use when:
 * - UI state must show whether assistant audio is currently audible.
 * - Voice input should be suspended only while playback is actually active.
 *
 * Expects:
 * - Playback managers emit exactly one terminal event for each accepted item.
 *
 * Returns:
 * - Nothing; listeners are registered on the provided manager.
 */
export function bindSpeakingStateToPlaybackManager<TAudio>(
  manager: PlaybackSpeakingStateManager<TAudio>,
  handlers: PlaybackSpeakingStateHandlers<TAudio>,
) {
  manager.onStart((event) => {
    handlers.setSpeaking(true)
    handlers.onStart?.(event)
  })

  manager.onEnd(() => {
    handlers.setSpeaking(false)
  })

  manager.onInterrupt(() => {
    handlers.setSpeaking(false)
  })

  manager.onReject(() => {
    handlers.setSpeaking(false)
  })
}
