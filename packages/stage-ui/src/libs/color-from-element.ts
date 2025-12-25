import type { Color } from 'culori'

import html2canvas from 'html2canvas'

import { average } from 'culori'
import { Vibrant } from 'node-vibrant/browser'

export type ColorFromElementMode = 'vibrant' | 'html2canvas' | 'both'

export function patchThemeSamplingHtml2CanvasClone(doc: Document) {
  if (!('document' in globalThis) || globalThis.document == null)
    return
  if (!('getComputedStyle' in globalThis))
    return

  doc.querySelectorAll('.theme-overlay').forEach((overlay) => {
    (overlay as HTMLElement).style.display = 'none'
  })

  doc.querySelectorAll('.colored-area').forEach((wave) => {
    const waveEl = wave as HTMLElement
    const isDark = document.documentElement.classList.contains('dark')
    const hue = getComputedStyle(document.documentElement).getPropertyValue('--chromatic-hue') || '200'
    waveEl.style.background = isDark ? `hsl(${hue} 60% 32%)` : `hsl(${hue} 75% 78%)`
  })
}

export interface ColorFromElementOptions {
  /**
   * Which extraction pipeline to run. Use `'both'` to mirror the devtools view.
   * Defaults to `'both'`.
   */
  mode?: ColorFromElementMode
  /**
   * Options for the Vibrant-based palette extraction.
   */
  vibrant?: {
    /**
     * Optional override for the image source; falls back to the `img` element's `currentSrc/src`.
     */
    imageSource?: string
    /**
     * Ratio (0-1) of the image height to sample from the top edge. Defaults to 0.2.
     */
    sampleTopRatio?: number
  }
  /**
   * Options for html2canvas-based sampling of the rendered element.
   */
  html2canvas?: {
    /**
     * Region forwarded to html2canvas. Provide only what you need; defaults to the live element box.
     */
    region?: {
      x?: number
      y?: number
      width?: number
      height?: number
    }
    /**
     * How many pixels (height) to read from the captured canvas. Defaults to 20.
     */
    sampleHeight?: number
    /**
     * Pixel stride when sampling the captured row. Defaults to 10 (i.e., every 10th pixel).
     */
    sampleStride?: number
    /**
     * Canvas scale used by html2canvas. Defaults to 0.5.
     */
    scale?: number
    allowTaint?: boolean
    useCORS?: boolean
    backgroundColor?: string | null
    logging?: boolean
    onclone?: (doc: Document) => void
  }
}

export interface ColorFromElementResult {
  vibrant?: {
    palette: string[]
    dominant?: string
  }
  html2canvas?: {
    average?: string
    canvas?: HTMLCanvasElement
  }
}

export async function colorFromElement(element: HTMLElement, options: ColorFromElementOptions = {}): Promise<ColorFromElementResult> {
  const mode = options.mode ?? 'both'
  const result: ColorFromElementResult = {}

  const shouldRunVibrant = mode === 'vibrant' || mode === 'both'
  const shouldRunHtml2Canvas = mode === 'html2canvas' || mode === 'both'

  if (shouldRunVibrant) {
    const vibrantResult = await extractWithVibrant(element, options.vibrant)
    result.vibrant = vibrantResult
  }

  if (shouldRunHtml2Canvas) {
    const html2CanvasResult = await extractWithHtml2Canvas(element, options.html2canvas)
    result.html2canvas = html2CanvasResult
  }

  return result
}

async function extractWithVibrant(element: HTMLElement, options: ColorFromElementOptions['vibrant']): Promise<ColorFromElementResult['vibrant']> {
  const sampleTopRatio = options?.sampleTopRatio ?? 0.2
  const imageSource = options?.imageSource ?? (element instanceof HTMLImageElement ? (element.currentSrc || element.src) : undefined)

  if (!imageSource) {
    return { palette: [], dominant: undefined }
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = imageSource

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image for Vibrant extraction'))
  })

  const cropHeight = Math.max(1, Math.floor(img.naturalHeight * sampleTopRatio))
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = cropHeight
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(img, 0, 0, img.naturalWidth, cropHeight, 0, 0, img.naturalWidth, cropHeight)
  }

  const dataUrl = canvas.toDataURL()
  const vibrant = new Vibrant(dataUrl)
  const palette = await vibrant.getPalette()

  const colors = Object.values(palette)
    .map(color => color?.hex)
    .filter((color): color is string => typeof color === 'string')

  return {
    palette: colors,
    dominant: palette.Vibrant?.hex || palette.DarkVibrant?.hex || colors[0],
  }
}

async function extractWithHtml2Canvas(element: HTMLElement, options: ColorFromElementOptions['html2canvas']): Promise<ColorFromElementResult['html2canvas']> {
  const region = options?.region ?? {}
  // NOTICE: Region defaults to the live element box; override when the rendered size differs (e.g., scaled canvases).
  const captureWidth = region.width ?? element.offsetWidth
  const captureHeight = region.height ?? element.offsetHeight

  const canvas = await html2canvas(element, {
    allowTaint: options?.allowTaint ?? true,
    useCORS: options?.useCORS ?? true,
    backgroundColor: options?.backgroundColor ?? null,
    scale: options?.scale ?? 0.5,
    logging: options?.logging ?? false,
    width: captureWidth,
    height: captureHeight,
    x: region.x,
    y: region.y,
    onclone: options?.onclone,
  })

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { canvas, average: undefined }
  }

  const sampleHeight = Math.max(1, Math.min(options?.sampleHeight ?? 20, canvas.height))
  const sampleStride = Math.max(1, options?.sampleStride ?? 10)
  const imageData = ctx.getImageData(0, 0, canvas.width, sampleHeight)
  const colors: Color[] = []

  for (let i = 0; i < imageData.data.length; i += 4 * sampleStride) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    const a = imageData.data[i + 3]

    if (a > 0) {
      colors.push({ mode: 'rgb', r, g, b })
    }
  }

  if (colors.length === 0) {
    return { canvas, average: undefined }
  }

  const averaged = average(colors as [Color, ...Color[]])
  const averageColor = averaged ? `rgb(${averaged.r}, ${averaged.g}, ${averaged.b})` : undefined

  return {
    canvas,
    average: averageColor,
  }
}
