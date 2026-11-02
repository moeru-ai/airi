import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'

import { configureStorage } from './storage'

export interface Live2DConfiguration {
  /** The Maximum FPS setting. `0` does not limit the frame rate. */
  maxFps: number
  /** The Render Scale setting. */
  renderScale: number
}

/**
 * Live2D settings for a case that tests audio, not rendering.
 *
 * Headless Chromium renders WebGL on the CPU with SwiftShader. With the default settings, Live2D keeps the main
 * thread busy, and the voice activity detection receives about 7 of 31 windows each second. A speech input then
 * starts late or not at all. With a GPU, the default settings keep the detection in real time, also at a 10x CPU
 * slowdown.
 */
export const audioCaseLive2D: Live2DConfiguration = { maxFps: 15, renderScale: 1 }

type Live2DResolver = (context: AudioInputPreflightContext) => Live2DConfiguration | undefined | Promise<Live2DConfiguration | undefined>

/**
 * Sets the Live2D performance settings that a user can change on the Live2D settings page.
 *
 * @example
 * configureLive2D(() => ({ maxFps: 15, renderScale: 1 }))
 */
export function configureLive2D(resolve: Live2DResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureStorage(context.runtime, {
      'settings/live2d/max-fps': String(configuration.maxFps),
      'settings/live2d/render-scale': String(configuration.renderScale),
    })
  }
}
