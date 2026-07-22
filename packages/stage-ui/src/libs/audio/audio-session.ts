/**
 * Experimental Audio Session API (W3C draft, implemented by WebKit).
 * Not part of the TypeScript DOM lib yet, so the shape is declared here.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/AudioSession
 */
interface AudioSessionLike {
  type: 'ambient' | 'auto' | 'play-and-record' | 'playback' | 'transient' | 'transient-solo'
}

/**
 * Structural navigator dependency: only the experimental `audioSession`
 * member matters here, and browsers without it satisfy the type with the
 * member simply absent.
 */
interface NavigatorWithAudioSession {
  audioSession?: AudioSessionLike
}

/** Session kinds this app requests; see {@link requestAudioSessionType}. */
export type RequestableAudioSessionType = 'play-and-record' | 'playback'

/**
 * Requests the page's audio session category on platforms that expose the
 * Audio Session API (WebKit on iOS).
 *
 * On iOS, Web Audio output runs in the 'ambient'-like default category and
 * the hardware silent switch mutes it, while `<audio>` elements keep playing.
 * Promoting the session to 'playback' (TTS output) or 'play-and-record'
 * (microphone capture) makes character speech audible with the switch on.
 *
 * A 'playback' request never downgrades an active 'play-and-record' session:
 * capture may still be running, and 'play-and-record' already ignores the
 * ringer switch, so downgrading could only break recording.
 *
 * @returns whether the platform exposes the Audio Session API; false means
 * the request was a no-op (non-WebKit browsers, older iOS).
 */
export function requestAudioSessionType(
  type: RequestableAudioSessionType,
  targetNavigator: Navigator | NavigatorWithAudioSession | undefined = globalThis.navigator,
): boolean {
  // The `in` check both feature-detects the experimental API and narrows the
  // union: TypeScript's DOM Navigator type has no audioSession member.
  if (!targetNavigator || !('audioSession' in targetNavigator))
    return false

  const session = targetNavigator.audioSession
  if (!session)
    return false

  if (type === 'playback' && session.type === 'play-and-record')
    return true

  session.type = type
  return true
}
