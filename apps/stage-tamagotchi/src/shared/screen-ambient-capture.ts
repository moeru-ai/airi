import { defineInvokeEventa } from '@moeru/eventa'

/** Small full-display capture with the owning stage window excluded by macOS. */
export interface AmbientCaptureOptions {
  displayId: number
  width: number
  height: number
  frameRate: number
}

/** Packed RGBA bytes. Dimensions remain fixed for the lifetime of a session. */
export interface AmbientCaptureFrame {
  width: number
  height: number
  data: Uint8Array
}

/** Null means the platform uses Electron capture instead of ScreenCaptureKit. */
export const startAmbientCapture = defineInvokeEventa<string | null, AmbientCaptureOptions>('airi:ambient-capture:start')
/** Only the latest undelivered frame is returned; null means no new screen frame. */
export const readAmbientCapture = defineInvokeEventa<AmbientCaptureFrame | null, string>('airi:ambient-capture:read')
/** The session ID prevents a stale stop from closing a replacement stream. */
export const stopAmbientCapture = defineInvokeEventa<void, string>('airi:ambient-capture:stop')
