import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { NormalAttachment } from './attachment'

import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { CubismShader_WebGL, Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'

import { SurfaceLighting } from '../filters/surface-lighting'
import { fingerprintModel } from './attachment'

import '../utils/live2d-zip-loader'
import '../utils/live2d-opfs-registration'

/**
 * Renders raw/corrected light and pose comparisons in a separate devtool realm.
 * Does not save attachments or change the selected character. The caller owns
 * the returned PNG and must inspect it before installing reviewed data.
 */
export async function reviewNormalAttachment(source: string, modelId: string, attachment: NormalAttachment) {
  if (new URLSearchParams(location.search).get('synced-leader') === 'true')
    throw new Error('Capture and review must run in a separate devtool renderer, not the live character window.')
  extensions.add(TickerPlugin)
  Live2DModel.registerTicker(Ticker)
  CubismShader_WebGL.deleteInstance()
  const app = new Application({ width: attachment.width, height: attachment.height, resolution: 1, backgroundAlpha: 0, autoStart: false, preserveDrawingBuffer: true })
  app.stop()
  const model = new Live2DModel<Cubism4InternalModel>()
  let lighting: SurfaceLighting | undefined
  try {
    await Live2DFactory.setupLive2DModel(model, { url: source, id: modelId }, { autoUpdate: false, autoInteract: false, motionPreload: 'NONE' })
    if (await fingerprintModel(model.internalModel) !== attachment.fingerprint)
      throw new Error('The review model does not match the attachment fingerprint.')
    const core = model.internalModel.coreModel
    for (let i = 0; i < core.getParameterCount(); i++)
      core.setParameterValueByIndex(i, core.getParameterDefaultValue(i))
    core.update()
    app.stage.addChild(model)
    const bounds = model.getLocalBounds()
    const scale = Math.min((attachment.width - 32) / bounds.width, (attachment.height - 32) / bounds.height)
    model.scale.set(scale)
    model.position.set((attachment.width - bounds.width * scale) / 2 - bounds.x * scale, (attachment.height - bounds.height * scale) / 2 - bounds.y * scale)
    lighting = new SurfaceLighting(model.internalModel, app.renderer)
    lighting.setExposure(0.35, 1)
    lighting.setScreenGeometry({ bend: 3, gap: 0.04, flatRadius: 0.1, areaLights: true })
    const sheet = document.createElement('canvas')
    sheet.width = 720
    sheet.height = 1120
    const context = sheet.getContext('2d')!
    context.fillStyle = '#181d29'
    context.fillRect(0, 0, sheet.width, sheet.height)
    const face = attachment.faceSurface
    const center = face?.center ?? [0.5, 0.2]
    const radius = face?.radius ?? [0.1, 0.1]
    const yawRange = face?.yaw?.range ?? 0
    const poses = [0, 0, -yawRange, yawRange]
    const results: { light: string, angle: number, corrected: boolean, gpuError: number }[] = []
    for (let row = 0; row < 4; row++) {
      const corrected = row !== 0
      const angle = poses[row]
      await lighting.applyAttachment(corrected ? attachment : { ...attachment, normal: attachment.rawNormal ?? attachment.normal, faceSurface: undefined })
      if (face?.yaw)
        core.setParameterValueById(face.yaw.parameter, angle)
      core.update()
      for (let column = 0; column < 3; column++) {
        const map = { width: 32, height: 32, data: new Float32Array(32 * 32 * 3) }
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 32; x++) {
            if ((column === 0 && x < 7) || (column === 1 && x > 24) || (column === 2 && y < 7))
              map.data.set([1.5, 1.2, 0.9], (y * 32 + x) * 3)
          }
        }
        lighting.update({ exposure: 0.5, behindLuminance: 0, surround: map, contact: map }, true, 2, 1, 'window-gradient')
        app.render()
        const gpuError = app.renderer.gl.getError()
        if (gpuError)
          throw new Error(`GPU error during attachment review: ${gpuError}`)
        const light = ['Left', 'Right', 'Top'][column]
        context.fillStyle = '#fff'
        context.font = '14px sans-serif'
        context.fillText(`${light} · ${corrected ? 'corrected' : 'raw'} · X=${angle}`, column * 240 + 8, row * 280 + 20)
        const x = (center[0] - radius[0] * 1.65) * attachment.width
        const y = (center[1] - radius[1] * 1.7) * attachment.height
        context.drawImage(app.view as HTMLCanvasElement, x, y, radius[0] * 3.3 * attachment.width, radius[1] * 3.4 * attachment.height, column * 240 + 5, row * 280 + 30, 230, 245)
        results.push({ light, angle, corrected, gpuError })
      }
    }
    return { image: sheet.toDataURL(), results }
  }
  finally {
    lighting?.dispose()
    model.destroy({ children: true })
    CubismShader_WebGL.deleteInstance()
    app.destroy(true)
  }
}
