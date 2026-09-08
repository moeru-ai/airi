import type { NormalCapture } from './attachment'

import { Application } from '@pixi/app'
import { RenderTexture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Cubism4InternalModel, CubismShader_WebGL, Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'

import { SurfaceLighting } from '../filters/surface-lighting'
import { fingerprintModel } from './attachment'

import '../utils/live2d-zip-loader'
import '../utils/live2d-opfs-registration'

/**
 * Captures a neutral rig in the devtool renderer, never in the live character's
 * renderer. Cubism owns a realm-wide shader singleton; release it between jobs
 * so regeneration cannot reuse programs from the previous capture's GL context.
 */
export async function captureNormalReference(source: string, modelId: string, expectedFingerprint: string): Promise<NormalCapture> {
  if (new URLSearchParams(location.search).get('synced-leader') === 'true')
    throw new Error('Capture and review must run in a separate devtool renderer, not the live character window.')
  extensions.add(TickerPlugin)
  Live2DModel.registerTicker(Ticker)
  CubismShader_WebGL.deleteInstance()
  const width = 512
  const height = 640
  const app = new Application({ width, height, backgroundAlpha: 0, autoStart: false, resolution: 1, antialias: false })
  app.stop()
  const model = new Live2DModel<Cubism4InternalModel>()
  const target = RenderTexture.create({ width, height, resolution: 1 })
  let lighting: SurfaceLighting | undefined
  try {
    await Live2DFactory.setupLive2DModel(model, { url: source, id: modelId }, { autoUpdate: false, autoInteract: false, motionPreload: 'NONE' })
    if (!(model.internalModel instanceof Cubism4InternalModel))
      throw new Error('Normal generation currently supports Cubism 4 models only.')
    const fingerprint = await fingerprintModel(model.internalModel)
    if (fingerprint !== expectedFingerprint)
      throw new Error('The model assets changed during capture. Reload the model and try again.')
    const core = model.internalModel.coreModel
    for (let i = 0; i < core.getParameterCount(); i++)
      core.setParameterValueByIndex(i, core.getParameterDefaultValue(i))
    core.update()
    app.stage.addChild(model)
    const bounds = model.getLocalBounds()
    const scale = Math.min((width - 32) / bounds.width, (height - 32) / bounds.height)
    model.scale.set(scale)
    model.position.set((width - bounds.width * scale) / 2 - bounds.x * scale, (height - bounds.height * scale) / 2 - bounds.y * scale)
    lighting = new SurfaceLighting(model.internalModel, app.renderer)
    app.renderer.render(app.stage, { renderTexture: target, clear: true })
    const gl = app.renderer.gl
    const read = () => {
      app.renderer.renderTexture.bind(target)
      const data = new Uint8ClampedArray(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
      return data
    }
    // Pixi render targets place the displayed top in the low GL row. The same
    // convention supplies the reference coordinates and PNG rows below.
    const neutralPixels = read()
    const matrix = model.internalModel.renderer.getMvpMatrix().getArray()
    const drawables = core.getDrawableIds().map((id, index) => {
      const vertices = core.getDrawableVertices(index)
      const reference = Array.from(vertices, (v, k) => {
        const offset = k - k % 2
        return k % 2 === 0
          ? (matrix[0] * vertices[offset] + matrix[4] * vertices[offset + 1] + matrix[12] + 1) / 2
          : (matrix[1] * vertices[offset] + matrix[5] * vertices[offset + 1] + matrix[13] + 1) / 2
      })
      return { id, reference, atlasUvs: Array.from(core.getDrawableVertexUvs(index)), indices: Array.from(core.getDrawableVertexIndices(index)), texture: core.getDrawableTextureIndices(index) }
    })
    lighting.captureMode = true
    app.renderer.render(app.stage, { renderTexture: target, clear: true })
    const ownerPixels = read()
    let coveredPixels = 0
    const coveragePixels = new Uint8ClampedArray(ownerPixels.length)
    for (let i = 0; i < ownerPixels.length; i += 4) {
      const owned = ownerPixels[i] + ownerPixels[i + 1] * 256 > 0 && ownerPixels[i + 3] > 0
      if (owned)
        coveredPixels++
      coveragePixels.set(owned ? [40, 210, 120, 255] : [210, 90, 50, neutralPixels[i + 3]], i)
    }
    if (coveredPixels < 100)
      throw new Error('The neutral capture contains no usable drawable coverage.')
    if (gl.getError() !== gl.NO_ERROR)
      throw new Error('The GPU rejected the normal reference capture.')
    return { fingerprint, width, height, drawables, coveredPixels, neutral: await pixelsToBlob(neutralPixels, width, height), ownership: await pixelsToBlob(ownerPixels, width, height), coverage: await pixelsToBlob(coveragePixels, width, height) }
  }
  finally {
    lighting?.dispose()
    target.destroy(true)
    model.destroy({ children: true })
    CubismShader_WebGL.deleteInstance()
    app.destroy(true)
  }
}

function pixelsToBlob(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the normal capture.')), 'image/png'))
}
