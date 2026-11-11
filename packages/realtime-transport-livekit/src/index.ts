import { Room, RoomEvent, Track } from 'livekit-client'

/**
 * - `connected`: Media flows, or can flow.
 * - `reconnecting`: The connection dropped and the client tries to restore it. The call continues if it succeeds.
 * - `closed`: The session left the room, or the client gave up. The session cannot be used again.
 */
export type CallMediaState = 'connected' | 'reconnecting' | 'closed'

export interface CallMediaHandlers {
  /**
   * The audio of the other participant. `undefined` means that the participant stopped publishing.
   * A call has two participants, so at most one remote audio track exists.
   */
  onRemoteAudio: (stream: MediaStream | undefined) => void
  onState: (state: CallMediaState) => void
  /** The other participant left the room. The caller ends the call. */
  onPeerLeft: () => void
}

/** One participant in the media room of a call. */
export interface CallMedia {
  /** Publishes the audio that the other participant hears. The caller keeps ownership of the track. */
  publishAudio: (track: MediaStreamTrack) => Promise<void>
  /** Leaves the room. A second call does nothing. */
  leave: () => Promise<void>
}

/**
 * Joins the media room of a call.
 *
 * The session only moves audio tracks. Call control, for example the invite, uses the message plane.
 * Handlers can run before this function returns, for example when the other participant already publishes.
 */
export async function joinCall(access: { url: string, token: string }, handlers: CallMediaHandlers): Promise<CallMedia> {
  const room = new Room()
  let closed = false
  let keepAlive: HTMLAudioElement | undefined

  // NOTICE:
  // Chromium delivers silence from a remote WebRTC track to a Web Audio `MediaStreamAudioSourceNode`, unless a media
  // element also plays the stream. The consumers of this package read the track through Web Audio only.
  // Observed on 2026-11-11 with Chromium for Playwright 1.62 and livekit-client 2.23: the level was 0 without
  // this element and normal with it.
  // Remove it when a remote track reaches Web Audio in Chromium and WebKit with no media element.
  function hold(stream: MediaStream | undefined) {
    if (keepAlive)
      keepAlive.srcObject = null
    keepAlive = undefined
    if (!stream)
      return

    keepAlive = new Audio()
    keepAlive.muted = true
    keepAlive.srcObject = stream
    void keepAlive.play().catch(() => {})
  }

  room
    .on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio)
        return
      const stream = new MediaStream([track.mediaStreamTrack])
      hold(stream)
      handlers.onRemoteAudio(stream)
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio)
        return
      hold(undefined)
      handlers.onRemoteAudio(undefined)
    })
    .on(RoomEvent.ParticipantDisconnected, () => handlers.onPeerLeft())
    .on(RoomEvent.Reconnecting, () => handlers.onState('reconnecting'))
    .on(RoomEvent.Reconnected, () => handlers.onState('connected'))
    .on(RoomEvent.Disconnected, () => {
      closed = true
      hold(undefined)
      handlers.onState('closed')
    })

  await room.connect(access.url, access.token)
  handlers.onState('connected')

  return {
    async publishAudio(track) {
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
    },
    async leave() {
      if (closed)
        return

      closed = true
      await room.disconnect()
    },
  }
}
