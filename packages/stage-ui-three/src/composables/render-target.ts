import type { Camera, Scene, WebGLRenderer } from 'three'

import { clamp } from 'es-toolkit/math'
import { Vector2, WebGLRenderTarget } from 'three'
import { shallowRef } from 'vue'

export interface RenderTargetRegionRead {
  data: Uint8Array
  readWidth: number
  readHeight: number
  startX: number
  startY: number
  centerX: number
  centerY: number
  scaleX: number
  scaleY: number
}

export function useRenderTargetRegionAtClientPoint(context: {
  getRenderer: () => WebGLRenderer | undefined
  getScene: () => Scene | undefined
  getCamera: () => Camera | undefined
  getCanvas: () => HTMLCanvasElement | undefined
}) {
  const renderTargetRef = shallowRef<WebGLRenderTarget>()
  const renderTargetSize = new Vector2()

  function ensureRenderTarget(renderer: WebGLRenderer) {
    // Match the offscreen target to the current drawing buffer size (DPI + canvas resize).
    // Recreate the target when size changes to avoid reading stale or cropped pixels.
    renderer.getDrawingBufferSize(renderTargetSize)
    const width = Math.max(1, Math.floor(renderTargetSize.x))
    const height = Math.max(1, Math.floor(renderTargetSize.y))

    if (!renderTargetRef.value || renderTargetRef.value.width !== width || renderTargetRef.value.height !== height) {
      // Dispose old target to keep GPU memory in check.
      renderTargetRef.value?.dispose()
      renderTargetRef.value = new WebGLRenderTarget(width, height, { depthBuffer: false })
    }

    return renderTargetRef.value
  }

  function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number): RenderTargetRegionRead | null {
    const renderer = context.getRenderer()
    const scene = context.getScene()
    const camera = context.getCamera()
    const canvas = context.getCanvas()
    if (!renderer || !scene || !camera || !canvas)
      return null

    const rect = canvas.getBoundingClientRect()
    const xIn = clientX - rect.left
    const yIn = clientY - rect.top
    const inCanvas = xIn >= 0 && yIn >= 0 && xIn < rect.width && yIn < rect.height
    if (!inCanvas)
      return null

    const renderTarget = ensureRenderTarget(renderer)
    const scaleX = renderTarget.width / rect.width
    const scaleY = renderTarget.height / rect.height
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY))
      return null

    const centerX = Math.floor(xIn * scaleX)
    const centerY = Math.floor(renderTarget.height - 1 - yIn * scaleY)

    const radiusX = Math.ceil(radius * scaleX)
    const radiusY = Math.ceil(radius * scaleY)

    const startX = clamp(centerX - radiusX, 0, renderTarget.width - 1)
    const endX = clamp(centerX + radiusX, 0, renderTarget.width - 1)
    const startY = clamp(centerY - radiusY, 0, renderTarget.height - 1)
    const endY = clamp(centerY + radiusY, 0, renderTarget.height - 1)

    const readWidth = endX - startX + 1
    const readHeight = endY - startY + 1
    const data = new Uint8Array(readWidth * readHeight * 4)

    const prevTarget = renderer.getRenderTarget()
    // Render into our offscreen target so we can read pixels from it.
    // Preserve the previous target to avoid breaking the main render pipeline.
    renderer.setRenderTarget(renderTarget)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(renderTarget, startX, startY, readWidth, readHeight, data)
    // Restore the original target so downstream renders keep working.
    renderer.setRenderTarget(prevTarget)

    return {
      data,
      readWidth,
      readHeight,
      startX,
      startY,
      centerX,
      centerY,
      scaleX,
      scaleY,
    }
  }

  function disposeRenderTarget() {
    renderTargetRef.value?.dispose()
    renderTargetRef.value = undefined
  }

  return {
    readRenderTargetRegionAtClientPoint,
    disposeRenderTarget,
  }
}
