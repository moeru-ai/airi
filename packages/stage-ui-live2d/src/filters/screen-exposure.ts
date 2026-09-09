import type { AmbientLightEnvironment, AmbientLightExposureOptions } from '@proj-airi/stage-shared/screen-ambient-light'

import { ambientLightDefaults, averageAmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'

/**
 * One renderer's exposure and recent-screen meter. The final filter owns this
 * object and shares it with the Cubism surface binding. It has no timer: draw
 * calls advance adaptation even when a forced color produces no new samples.
 * Disable resets history. A render gap over two seconds seeds the current
 * measurement, so a suspended window does not replay a stale lighting change.
 */
export class ScreenExposure {
  private options: Readonly<AmbientLightExposureOptions> = ambientLightDefaults.exposure
  private environment?: AmbientLightEnvironment
  private targetLog = 0
  private adaptedLog = 0
  private targetMean = 0
  private adaptedMean = 0
  private lastTime?: number
  enabled = false
  responseCurve = ambientLightDefaults.exposure.responseCurve
  lightScale = 1
  cameraExposure = 1
  bloomGain = 1
  glareGain = 1

  /**
   * Positive brightness change relative to bloom's adapted meter, from 0 to 1.
   * Eye motion consumes this before artistic bloom gain or camera exposure.
   * A steady scene, darkness, or disabled adaptation produces no reaction.
   */
  get brightnessRise(): number {
    if (!this.enabled || !this.options.adaptiveBloom)
      return 0
    return Math.max(0, 1 - 2 ** (this.adaptedLog - this.targetLog))
  }

  /** Current ambient fill; undefined preserves the manually configured baseline. */
  get baseBrightness(): number | undefined {
    if (!this.enabled || !this.options.adaptiveBase)
      return undefined
    const dark = Math.max(0, Math.min(1, this.options.darkBase))
    const bright = Math.max(dark, Math.min(1, this.options.brightBase))
    const curve = Math.max(0.1, Math.min(3, this.options.baseCurve))
    return dark + (bright - dark) * this.adaptedMean ** curve
  }

  /** Publishes settings and a current linear-light meter reading; timestamps use milliseconds. */
  configure(environment: AmbientLightEnvironment, options: Readonly<AmbientLightExposureOptions>, active: boolean, now = performance.now()) {
    const resumed = this.lastTime !== undefined && now - this.lastTime > 2000
    this.advance(now)
    this.options = options
    this.responseCurve = Math.max(0, Math.min(100, options.responseCurve))
    const enabled = active && options.enabled
    if (this.environment !== environment) {
      const [r, g, b] = averageAmbientLightMap(environment.surround)
      this.targetLog = Math.log2(Math.max(0.001, r * 0.2126 + g * 0.7152 + b * 0.0722))
      // Full-display radiance makes the baseline independent of the character's
      // window and position. Synthetic color studies only provide a local map.
      const [screenR, screenG, screenB] = averageAmbientLightMap(environment.screen?.radiance ?? environment.surround)
      this.targetMean = Math.max(0, Math.min(1, screenR * 0.2126 + screenG * 0.7152 + screenB * 0.0722))
      this.environment = environment
    }
    if (!enabled || !this.enabled || resumed) {
      this.adaptedLog = this.targetLog
      this.adaptedMean = this.targetMean
      this.lastTime = enabled ? now : undefined
    }
    this.enabled = enabled
    this.lightScale = enabled ? Math.max(0, Math.min(2000, options.screenNits)) / 200 : 1
    this.cameraExposure = enabled ? 2 ** Math.max(-4, Math.min(4, options.compensation)) : 1
    this.updateBloom()
  }

  /** Advances the log bloom meter and linear baseline mean, independent of render cadence. */
  advance(now = performance.now()) {
    if (!this.enabled)
      return
    const elapsed = this.lastTime === undefined ? 0 : Math.max(0, now - this.lastTime)
    this.lastTime = now
    if (elapsed > 2000) {
      this.adaptedLog = this.targetLog
      this.adaptedMean = this.targetMean
    }
    else {
      const seconds = this.targetLog > this.adaptedLog ? this.options.brightSeconds : this.options.darkSeconds
      const weight = 1 - Math.exp(-elapsed / (1000 * Math.max(0.1, seconds)))
      this.adaptedLog += (this.targetLog - this.adaptedLog) * weight
      const baseSeconds = this.targetMean > this.adaptedMean ? this.options.brightSeconds : this.options.darkSeconds
      const baseWeight = 1 - Math.exp(-elapsed / (1000 * Math.max(0.1, baseSeconds)))
      this.adaptedMean += (this.targetMean - this.adaptedMean) * baseWeight
    }
    this.updateBloom()
  }

  private updateBloom() {
    // Bright backgrounds suppress the halo; dark adaptation increases its
    // sensitivity, not its source energy. The shader still requires light.
    const luminance = 2 ** this.adaptedLog * this.lightScale
    const adaptive = this.enabled && this.options.adaptiveBloom
    // Sustained bright pages need less inward glare as well as less exterior
    // halo. Leave video-range luminance below 0.25 unchanged. Smoothly reach
    // 15% glare above 0.75; the existing adaptation history controls timing.
    const page = Math.max(0, Math.min(1, (luminance - 0.25) / 0.5))
    this.glareGain = adaptive ? 1 - 0.85 * page * page * (3 - 2 * page) : 1
    this.bloomGain = adaptive
      ? (0.15 + 1.85 / (1 + luminance / 0.08)) * this.glareGain
      : 1
  }
}
