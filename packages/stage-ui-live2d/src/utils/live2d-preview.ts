import cropImg from '@lemonneko/crop-empty-pixels'

import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'

/**
 * Render a Live2D zip/file to an offscreen canvas and return a padded preview data URL.
 */
export async function loadLive2DModelPreview(file: File) {
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  const previewWidth = 1440
  const previewHeight = 2560
  const previewResolution = 2

  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = previewWidth * previewResolution
  offscreenCanvas.height = previewHeight * previewResolution
  offscreenCanvas.style.position = 'absolute'
  offscreenCanvas.style.top = '0'
  offscreenCanvas.style.left = '0'
  offscreenCanvas.style.objectFit = 'cover'
  offscreenCanvas.style.display = 'block'
  offscreenCanvas.style.zIndex = '10000000000'
  offscreenCanvas.style.opacity = '0'
  document.body.appendChild(offscreenCanvas)

  const app = new Application({
    view: offscreenCanvas,
    width: offscreenCanvas.width,
    height: offscreenCanvas.height,
    // Ensure the drawing buffer persists so toDataURL() can read pixels
    preserveDrawingBuffer: true,
    backgroundAlpha: 0,
    autoDensity: false,
    resolution: 1,
    autoStart: false,
  })
  app.stage.scale.set(previewResolution)
  app.ticker.stop()

  const modelInstance = new Live2DModel()
  const objUrl = URL.createObjectURL(file)
  const res = await fetch(objUrl)
  const blob = await res.blob()

  const cleanup = () => {
    app.destroy()
    if (offscreenCanvas.isConnected)
      document.body.removeChild(offscreenCanvas)
    URL.revokeObjectURL(objUrl)
  }

  try {
    await Live2DFactory.setupLive2DModel(modelInstance, [new File([blob], file.name)], { autoInteract: false })
    app.stage.addChild(modelInstance)

    modelInstance.x = 275
    modelInstance.y = 450
    modelInstance.width = previewWidth
    modelInstance.height = previewHeight
    modelInstance.scale.set(0.1, 0.1)
    modelInstance.anchor.set(0.5, 0.5)

    await new Promise(resolve => setTimeout(resolve, 500))
    app.renderer.render(app.stage)

    const croppedCanvas = cropImg(offscreenCanvas)

    // padding to 12:16
    const paddingCanvas = document.createElement('canvas')
    paddingCanvas.width = croppedCanvas.width > croppedCanvas.height / 16 * 12 ? croppedCanvas.width : croppedCanvas.height / 16 * 12
    paddingCanvas.height = paddingCanvas.width / 12 * 16
    const paddingCanvasCtx = paddingCanvas.getContext('2d')!

    paddingCanvasCtx.drawImage(croppedCanvas, (paddingCanvas.width - croppedCanvas.width) / 2, (paddingCanvas.height - croppedCanvas.height) / 2, croppedCanvas.width, croppedCanvas.height)
    const paddingDataUrl = paddingCanvas.toDataURL()

    cleanup()

    return paddingDataUrl
  }
  catch (error) {
    console.error(error)
    cleanup()
  }
}
