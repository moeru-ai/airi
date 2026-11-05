import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'

import { setupElectronScreenCapture } from '@proj-airi/electron-screen-capture/renderer'

import { isStageTamagotchi } from '../environment'
import { errorMessageFromValue } from '../error-message'

export type ElectronEventaContext = ReturnType<typeof createContext>['context']

export interface ScreenSnapshotOptions {
  /** Eventa context for Electron IPC communications. */
  context?: ElectronEventaContext
  /** JPEG compression quality between 0.1 and 1.0. Defaults to 0.88. */
  quality?: number
  /** Width for captured thumbnail resolution. Defaults to 1920. */
  width?: number
  /** Height for captured thumbnail resolution. Defaults to 1080. */
  height?: number
  /** Name of the generated File. Defaults to `screen-${Date.now()}.jpg`. */
  fileName?: string
}

/**
 * Returns whether screen capture is supported in the current environment.
 */
export function isScreenCaptureSupported(context?: ElectronEventaContext): boolean {
  if (context && (isStageTamagotchi() || (typeof window !== 'undefined' && 'electron' in window)))
    return true
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
}

/**
 * Captures a desktop or window screenshot and returns it as a JPEG File.
 *
 * In Electron environments, captures the primary display directly using
 * `desktopCapturer` thumbnails without showing picker prompts.
 *
 * In web browser environments, falls back to `navigator.mediaDevices.getDisplayMedia`.
 */
export async function captureScreenSnapshotFile(options: ScreenSnapshotOptions = {}): Promise<File | null> {
  const quality = options.quality ?? 0.88
  const width = options.width ?? 1920
  const height = options.height ?? 1080
  const fileName = options.fileName ?? `screen-${Date.now()}.jpg`

  // 1. Electron environment with Eventa context
  if (options.context && (isStageTamagotchi() || (typeof window !== 'undefined' && 'electron' in window))) {
    try {
      const capturer = setupElectronScreenCapture(options.context)
      const sources: SerializableDesktopCapturerSource[] = await capturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      })

      const primary = sources.find(s => s.id.startsWith('screen:0'))
        ?? sources.find(s => s.id.startsWith('screen:'))
        ?? sources[0]

      if (primary?.thumbnail && primary.thumbnail.length > 0) {
        const buffer = new Uint8Array(primary.thumbnail)
        const blob = new Blob([buffer], { type: 'image/jpeg' })
        return new File([blob], fileName, { type: 'image/jpeg' })
      }
    }
    catch (error) {
      console.warn('Electron desktopCapturer failed, falling back to displayMedia:', errorMessageFromValue(error))
    }
  }

  // 2. Web browser or fallback via getDisplayMedia
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    }
    catch (error: unknown) {
      const name = (error as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'AbortError') {
        return null
      }
      console.warn('Screen capture getDisplayMedia failed:', errorMessageFromValue(error))
      return null
    }

    try {
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()

      let targetWidth = video.videoWidth
      let targetHeight = video.videoHeight
      if (targetWidth > width || targetHeight > height) {
        const ratio = Math.min(width / targetWidth, height / targetHeight)
        targetWidth = Math.max(1, Math.round(targetWidth * ratio))
        targetHeight = Math.max(1, Math.round(targetHeight * ratio))
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx)
        return null

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (!blob)
        return null

      return new File([blob], fileName, { type: 'image/jpeg' })
    }
    finally {
      stream.getTracks().forEach(track => track.stop())
    }
  }

  return null
}
