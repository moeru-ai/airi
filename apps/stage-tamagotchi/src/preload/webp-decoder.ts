import { electronAPI } from '@electron-toolkit/preload'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'

import { electronWebpScreenshotDecode } from '../shared/eventa/webp-decoder'

const { context } = createContext(electronAPI.ipcRenderer)

defineInvokeHandler(context, electronWebpScreenshotDecode, async ({ webp }) => {
  try {
    const binary = atob(webp)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index)

    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }))
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const drawing = canvas.getContext('2d')
      if (!drawing)
        throw new Error('Cannot create a 2D canvas context.')
      drawing.drawImage(bitmap, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const png = new Uint8Array(await blob.arrayBuffer())
      let encoded = ''
      const chunk = 8192
      for (let index = 0; index < png.length; index += chunk)
        encoded += String.fromCharCode(...png.subarray(index, index + chunk))
      return { png: btoa(encoded) }
    }
    finally {
      bitmap.close()
    }
  }
  catch (error) {
    throw new Error(`Could not decode the WebP screenshot: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
})
