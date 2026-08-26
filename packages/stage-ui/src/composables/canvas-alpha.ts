import type { MaybeRefOrGetter, Ref } from 'vue'

import { toRef, unrefElement, useElementBounding } from '@vueuse/core'
import { clamp } from 'es-toolkit/math'
import { computed } from 'vue'

interface CircleHitTestInput {
  clientX: number
  clientY: number
  gl: WebGL2RenderingContext | WebGLRenderingContext
  height: number
  left: number
  radius: number
  threshold: number
  top: number
  width: number
}

export function isCanvasRegionTransparent({
  clientX,
  clientY,
  gl,
  height,
  left,
  radius,
  threshold,
  top,
  width,
}: CircleHitTestInput) {
  if (!width || !height)
    return true

  if (gl.drawingBufferWidth <= 0 || gl.drawingBufferHeight <= 0)
    return true

  const xIn = clientX - left
  const yIn = clientY - top
  const inCanvas = xIn >= 0 && yIn >= 0 && xIn < width && yIn < height
  if (!inCanvas)
    return true

  const scaleX = gl.drawingBufferWidth / width
  const scaleY = gl.drawingBufferHeight / height
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY))
    return true

  // Translate client-space coords into WebGL buffer space (respecting DPI scaling and flipped Y),
  // then read a bounding box that fully contains the desired radius circle. Later we re-check
  // the circle constraint in CPU land to avoid missing hits at the edges.
  const centerX = Math.floor(xIn * scaleX)
  const centerY = Math.floor(gl.drawingBufferHeight - 1 - yIn * scaleY)

  const radiusX = Math.ceil(radius * scaleX)
  const radiusY = Math.ceil(radius * scaleY)

  const startX = clamp(centerX - radiusX, 0, gl.drawingBufferWidth - 1)
  const endX = clamp(centerX + radiusX, 0, gl.drawingBufferWidth - 1)
  const startY = clamp(centerY - radiusY, 0, gl.drawingBufferHeight - 1)
  const endY = clamp(centerY + radiusY, 0, gl.drawingBufferHeight - 1)

  const readWidth = endX - startX + 1
  const readHeight = endY - startY + 1
  const data = new Uint8Array(readWidth * readHeight * 4)

  try {
    gl.readPixels(startX, startY, readWidth, readHeight, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }
  catch {
    return true
  }

  const radiusSq = radius * radius

  for (let y = 0; y < readHeight; y += 1) {
    const gy = startY + y
    const dy = (gy - centerY) / scaleY
    const dySq = dy * dy

    for (let x = 0; x < readWidth; x += 1) {
      const gx = startX + x
      const dx = (gx - centerX) / scaleX
      if (dx * dx + dySq > radiusSq)
        continue

      const index = (y * readWidth + x) * 4
      const alpha = data[index + 3]
      if (alpha >= threshold)
        return false
    }
  }

  return true
}

export function useCanvasPixelAtPoint(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  pointX: MaybeRefOrGetter<number>,
  pointY: MaybeRefOrGetter<number>,
): {
  inCanvas: Ref<boolean>
  pixel: Ref<number[] | Uint8Array>
} {
  const canvasRef = toRef(canvas)

  const { height, left, top, width } = useElementBounding(canvasRef)
  const xRef = toRef(pointX)
  const yRef = toRef(pointY)

  const inCanvas = computed(() => {
    if (canvasRef.value == null) {
      return false
    }

    const xIn = xRef.value - left.value
    const yIn = yRef.value - top.value
    return xIn >= 0 && yIn >= 0 && xIn < width.value && yIn < height.value
  })

  const pixel = computed(() => {
    const el = unrefElement(canvasRef)
    if (!el || !inCanvas.value)
      return new Uint8Array([0, 0, 0, 0])

    const gl = (el.getContext('webgl2') || el.getContext('webgl')) as null | WebGL2RenderingContext | WebGLRenderingContext
    if (!gl)
      return new Uint8Array([0, 0, 0, 0])

    const xIn = xRef.value - left.value
    const yIn = yRef.value - top.value

    const scaleX = gl.drawingBufferWidth / width.value
    const scaleY = gl.drawingBufferHeight / height.value
    const pixelX = Math.floor(xIn * scaleX)
    // Flip Y; subtract 1 to avoid top-edge off-by-one
    const pixelY = Math.floor(gl.drawingBufferHeight - 1 - yIn * scaleY)

    const data = new Uint8Array(4)
    try {
      gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data)
    }
    catch {
      return new Uint8Array([0, 0, 0, 0])
    }

    return data
  })

  return {
    inCanvas,
    pixel,
  }
}

export function useCanvasPixelIsTransparent(
  pixel: Ref<number[] | Uint8Array>,
  threshold = 10,
): Ref<boolean> {
  return computed(() => pixel.value[3] < threshold)
}

export function useCanvasPixelIsTransparentAtPoint(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  pointX: MaybeRefOrGetter<number>,
  pointY: MaybeRefOrGetter<number>,
  optionsOrThreshold: number | { regionRadius?: number, threshold?: number } = 10,
): Ref<boolean> {
  const options = typeof optionsOrThreshold === 'number'
    ? { regionRadius: 0, threshold: optionsOrThreshold }
    : optionsOrThreshold

  const threshold = options?.threshold ?? 10
  const radius = Math.max(0, options?.regionRadius ?? 0)

  if (radius === 0) {
    const { pixel } = useCanvasPixelAtPoint(canvas, pointX, pointY)
    return useCanvasPixelIsTransparent(pixel, threshold)
  }

  const canvasRef = toRef(canvas)
  const xRef = toRef(pointX)
  const yRef = toRef(pointY)
  const { height, left, top, width } = useElementBounding(canvasRef)

  return computed(() => {
    const el = unrefElement(canvasRef)
    if (!el)
      return true

    const gl = (el.getContext('webgl2') || el.getContext('webgl')) as null | WebGL2RenderingContext | WebGLRenderingContext
    if (!gl)
      return true

    return isCanvasRegionTransparent({
      clientX: xRef.value,
      clientY: yRef.value,
      gl,
      height: height.value,
      left: left.value,
      radius,
      threshold,
      top: top.value,
      width: width.value,
    })
  })
}
