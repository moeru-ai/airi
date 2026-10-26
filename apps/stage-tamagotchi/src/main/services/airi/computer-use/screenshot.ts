import { Buffer } from 'node:buffer'

import { BrowserWindow } from 'electron'

interface RendererResult {
  png?: string
  error?: string
}

/**
 * Converts a WebP screenshot to PNG.
 *
 * Electron's `nativeImage` only decodes PNG and JPEG, while Chromium decodes WebP. The bytes are
 * therefore decoded in a throwaway sandboxed renderer, which keeps the conversion independent of
 * the platform-specific screenshot backend.
 */
export async function webpToPng(data: Buffer): Promise<Buffer> {
  let frame: BrowserWindow | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    frame = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      skipTaskbar: true,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    await frame.loadURL('data:text/html,<!doctype html><html><body></body></html>')
    const converted = await Promise.race([
      frame.webContents.executeJavaScript(createDecodeScript(data), true) as Promise<RendererResult>,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out decoding the WebP screenshot in the renderer.')), 15_000)
      }),
    ])
    if (converted.error)
      throw new Error(`Could not decode the WebP screenshot: ${converted.error}`)
    if (!converted.png)
      throw new Error('The renderer returned no PNG data.')
    const png = Buffer.from(converted.png, 'base64')
    if (png[0] !== 137 || png[1] !== 80 || png[2] !== 78 || png[3] !== 71)
      throw new Error('The renderer did not return PNG data.')
    return png
  }
  finally {
    clearTimeout(timeout)
    if (frame && !frame.isDestroyed())
      frame.destroy()
  }
}

/** Builds the renderer snippet that decodes one WebP image and re-encodes it as PNG. */
function createDecodeScript(data: Buffer) {
  const source = data.toString('base64')
  return `(async (source) => {
    try {
      const binary = atob(source)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index)
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context)
        throw new Error('Cannot create a 2D canvas context.')
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      return { png: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length) }
    }
    catch (error) {
      return { error: String((error && error.message) || error) }
    }
  })(${JSON.stringify(source)})`
}
