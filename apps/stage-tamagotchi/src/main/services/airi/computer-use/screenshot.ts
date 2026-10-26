import { Buffer } from 'node:buffer'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { BrowserWindow } from 'electron'

import { electronWebpScreenshotDecode } from '../../../../shared/eventa/webp-decoder'
import { getPreloadPath } from '../../../libs/electron/location'
import { createWindowContext } from '../../../libs/electron/window-context'

// NOTICE:
// Electron's nativeImage decodes only PNG and JPEG, but AUV's Windows capture backend writes WebP.
// This function decodes the WebP in a renderer that Chromium provides and returns PNG over Eventa.
// Source: Electron nativeImage documentation and AUV xcap.windows screenshot artifacts.
// Remove when nativeImage decodes WebP or AUV can write PNG.
export async function webpToPng(data: Buffer, signal?: AbortSignal): Promise<Buffer> {
  let frame: BrowserWindow | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let rejectAbort: ((reason: Error) => void) | undefined
  let onAbort: (() => void) | undefined
  try {
    signal?.throwIfAborted()
    frame = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      skipTaskbar: true,
      webPreferences: {
        preload: getPreloadPath('webp-decoder.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    // The abort can win the race before the decode promise settles. Keep that rejection handled.
    void aborted.catch(() => undefined)
    onAbort = () => {
      if (frame && !frame.isDestroyed())
        frame.destroy()
      rejectAbort?.(new Error('WebP conversion aborted.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    signal?.throwIfAborted()
    await frame.loadURL('data:text/html,<!doctype html><html><body></body></html>')
    const decode = defineInvoke(createWindowContext(frame).context, electronWebpScreenshotDecode)
    const converted = await Promise.race([
      decode({ webp: data.toString('base64') }),
      aborted,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out decoding the WebP screenshot in the renderer.')), 15_000)
        timeout.unref?.()
      }),
    ])
    const png = Buffer.from(converted.png, 'base64')
    if (png[0] !== 137 || png[1] !== 80 || png[2] !== 78 || png[3] !== 71)
      throw new Error('The renderer did not return PNG data.')
    return png
  }
  catch (error) {
    throw new Error(`Could not decode the WebP screenshot: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
  finally {
    clearTimeout(timeout)
    if (onAbort)
      signal?.removeEventListener('abort', onAbort)
    if (frame && !frame.isDestroyed())
      frame.destroy()
  }
}
