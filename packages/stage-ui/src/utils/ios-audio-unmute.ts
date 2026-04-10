/**
 * iOS Silent Mode workaround for Web Audio API.
 *
 * On iOS, the mute/silent switch causes Web Audio API output to be silent
 * because AudioContext is treated as "ambient" audio. Playing a silent HTML5
 * <audio> element alongside Web Audio forces iOS to assign the "playback"
 * audio session category, which is not affected by the mute switch.
 *
 * References:
 * - https://stackoverflow.com/questions/21122418/ios-webaudio-only-works-on-headphones
 * - https://github.com/nickvdp/unmute
 * - https://bugs.webkit.org/show_bug.cgi?id=237322
 */

let silentAudio: HTMLAudioElement | undefined
let disposed = false

// Tiny silent WAV (44 bytes header + 1 sample of silence), base64-encoded
const SILENT_WAV_DATA_URI
  = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

function isIOS(): boolean {
  if (typeof navigator === 'undefined')
    return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Enables audio playback on iOS even when the mute/silent switch is on.
 * Must be called from a user gesture handler (touchend, click, etc.).
 * Safe to call on non-iOS platforms — it will no-op.
 */
export function enableIOSPlayback(): void {
  if (disposed || silentAudio || !isIOS())
    return

  silentAudio = new Audio(SILENT_WAV_DATA_URI)
  silentAudio.loop = true
  silentAudio.volume = 0
  silentAudio.setAttribute('playsinline', 'true')
  silentAudio.play().catch(() => {
    // Playback may fail outside of user gesture; that's OK.
    // The next user interaction will trigger it.
  })
}

/**
 * Dispose the silent audio element.
 */
export function disposeIOSPlayback(): void {
  disposed = true
  if (silentAudio) {
    silentAudio.pause()
    silentAudio.src = ''
    silentAudio = undefined
  }
}
