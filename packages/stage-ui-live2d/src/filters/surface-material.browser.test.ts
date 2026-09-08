import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { faceSurfaceShader } from './face-surface'
import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = new Sprite(Texture.WHITE)
app.stage.addChild(sprite)
afterAll(() => app.destroy(true, { children: true }))

function render({ responseCurve = 0, photometry = false, lightScale = 1, cameraExposure = 1, sheen = 1, ambient = 0.5, strength = 2, soft = true, albedo = 0, albedoColor = [albedo, albedo, albedo], bend = 3.5, normal = [-0.4, 0, 0.9165], light = 1, lightColor = [1, 0, 0], chroma = 1, illustrated = false, face = false, hair = false, roughness = 0.7, skinRelief = ambientLightDefaults.material.skinRelief, skinNormal = normal, surface = false, facePoint = [0, 0], faceForward = [0, 0, 1], shadow = 0, aspect = 1, shadowTexture = Texture.WHITE, visibilityOnly = false } = {}) {
  const map = { width: 24, height: 24, data: new Float32Array(24 * 24 * 3) }
  for (let y = 8; y < 16; y++) {
    for (let x = 2; x < 6; x++) map.data.set(lightColor.map(channel => channel * light), (y * 24 + x) * 3)
  }
  const lights = new Float32Array(screenLightCount * 3)
  const emitters = new Float32Array(screenLightGridSize * 4)
  writeScreenLights(map, lights)
  writeScreenGeometry({ bend, gap: 0.02, flatRadius: 0.05 }, 1, emitters)
  const filter = new Filter(undefined, `
    precision highp float;
    uniform float uVisibilityOnly;
    uniform float uFaceSurface;
    uniform vec2 uFacePoint;
    uniform vec3 uNormal;
    uniform vec3 uSkinNormal;
    uniform vec3 uFaceForward;
    uniform vec3 uAlbedo;
    uniform float u_airiStrength;
    uniform float u_airiChroma;
    uniform float u_airiDirectional;
    ${surfaceIrradianceShader}
    ${faceSurfaceShader}
    void main() { if(uVisibilityOnly>.5) { gl_FragColor=vec4(vec3(airiShadowVisibility(vec2(.5),normalize(vec3(1.,0.,1.)))),1.); return; } airiSkinNormal = uFaceSurface > .5 ? airiFaceNormalAt(uFacePoint,uFacePoint,1.) : normalize(uSkinNormal); airiFaceForward = normalize(uFaceForward); gl_FragColor = vec4(airiSurfaceColor(normalize(uNormal),vec2(0.5),uAlbedo,1.),1.); }
  `, { uFaceSurface: surface ? 1 : 0, uFacePoint: facePoint, uNormal: normal, uSkinNormal: skinNormal, uFaceForward: faceForward, u_airiSkinRelief: skinRelief, u_airiFaceShadowStrength: shadow, u_airiFaceHeight: 0.2, u_airiFaceShadow: shadowTexture, uVisibilityOnly: visibilityOnly ? 1 : 0, uAlbedo: albedoColor, u_airiStrength: strength, u_airiChroma: chroma, u_airiDirectional: 1, u_airiLights: lights, u_airiBounds: [0, 0, 1, 1], u_airiScreen: [-0.5, -0.5, 2, 2], u_airiFieldBounds: [0, 0, 1, 1], u_airiStageAspect: aspect, u_airiEmitters: emitters, u_airiSheen: sheen, u_airiSoftHighlights: soft ? 1 : 0, u_airiResponseCurve: responseCurve, u_airiPhotometry: photometry ? 1 : 0, u_airiLightScale: lightScale, u_airiCameraExposure: cameraExposure, u_airiAmbient: ambient, u_airiContrast: 1, u_airiIllustrated: illustrated ? 1 : 0, u_airiFace: face ? 1 : 0, u_airiHair: hair ? 1 : 0, u_airiRoughness: roughness })
  sprite.filters = [filter]
  app.render()
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(0)
  sprite.filters = []
  filter.destroy()
  return Array.from(pixel)
}

describe('surface material response', () => {
  // Cold compilation of the screen integrator can exceed the assertion timeout
  // on a software GPU. Compile its shared program once before pixel checks.
  beforeAll(() => {
    render({ surface: true })
  }, 30_000)

  it('lights different face regions independently at full face relief', () => {
    // ROOT CAUSE:
    // The shallow face mixed 55% of one forward-facing light value into every
    // pixel. A cheek facing away therefore retained direct light. Evaluate the
    // production height-derived normals through the actual screen integrator.
    const options = { illustrated: true, face: true, surface: true, skinRelief: 1, sheen: 0, ambient: 0, albedo: 0.3, soft: false, bend: 1 }
    const toward = render({ ...options, facePoint: [-0.8, -0.45] })
    const center = render({ ...options, facePoint: [0, -0.45] })
    const away = render({ ...options, facePoint: [0.8, -0.45] })
    expect(toward[0]).toBeGreaterThan(center[0])
    expect(center[0]).toBeGreaterThan(away[0])
    expect(away[0]).toBe(0)
  })

  it('keeps a nose reflection visible under oblique front light', () => {
    // ROOT CAUSE:
    // The illustrated face used the 60-power illustrated lobe. Its nose mask was
    // already narrow, so an oblique light extinguished the accent. The nose
    // now has a broader angular response; its spatial mask stays unchanged.
    const options = { illustrated: true, face: true, normal: [0, 0, 1], albedo: 0, ambient: 0, bend: 1, light: 4, soft: false }
    expect(render(options)[0]).toBeGreaterThan(5)
    expect(render({ ...options, sheen: 0 })).toEqual([0, 0, 0, 255])
    expect(render({ ...options, shadow: 1 })).toEqual([0, 0, 0, 255])
    expect(render({ ...options, bend: 0 })).toEqual([0, 0, 0, 255])
  })

  it('adds matte face relief without using the sharp nose normal diffusely', () => {
    const left = [-0.4, 0, 0.9165]
    const right = [0.4, 0, 0.9165]
    const options = { illustrated: true, face: true, sheen: 0, albedo: 0.3 }
    const flat = render({ ...options, skinRelief: 0 })
    const leftFace = render({ ...options, skinNormal: left })
    const rightFace = render({ ...options, skinNormal: right })
    expect(leftFace[0]).toBeGreaterThan(flat[0])
    expect(flat[0]).toBeGreaterThan(rightFace[0])
    expect(render({ ...options, skinNormal: left, normal: left }))
      .toEqual(render({ ...options, skinNormal: left, normal: right }))
    expect(render({ ...options, skinRelief: 0, skinNormal: left }))
      .toEqual(render({ ...options, skinRelief: 0, skinNormal: right }))
  })

  it('rotates the flat face response even when surface relief is zero', () => {
    // ROOT CAUSE:
    // Using direction.z for the flat component leaves most of the face light
    // camera-facing, even after its curved and nose normals turn with the rig.
    const options = { illustrated: true, face: true, sheen: 0, albedo: 0.3, skinRelief: 0 }
    const toward = render({ ...options, faceForward: [-0.342, 0, 0.9397] })
    const neutral = render(options)
    const away = render({ ...options, faceForward: [0.342, 0, 0.9397] })
    expect(toward[0]).toBeGreaterThan(neutral[0])
    expect(neutral[0]).toBeGreaterThan(away[0])
    expect(render({ ...options, face: false, faceForward: [-0.342, 0, 0.9397] }))
      .toEqual(render({ ...options, face: false, faceForward: [0.342, 0, 0.9397] }))
  })

  it('lets foreground coverage block direct face light while retaining ambient artwork', () => {
    const options = { illustrated: true, face: true, albedo: 0.3 }
    const blocked = render({ ...options, shadow: 1 })
    expect(blocked).toEqual(render({ ...options, light: 0 }))
    expect(render({ ...options, shadow: 0 })[0]).toBeGreaterThan(blocked[0])
    expect(render({ ...options, face: false, shadow: 1 }))
      .toEqual(render({ ...options, face: false, shadow: 0 }))
    expect(render({ ...options, shadow: 1, strength: 0 }))
      .toEqual(render({ ...options, shadow: 0, strength: 0 }))
  })

  it('projects the same horizontal ray in window-height units across aspect ratios', () => {
    // ROOT CAUSE:
    // Light directions use window-height units, while mask U uses window width.
    // Without the conversion, portrait and landscape windows move the shadow
    // by the same U offset even though their physical widths differ.
    const data = new Uint8Array(32 * 4)
    for (let i = 17; i < 32; i++) data.fill(255, i * 4, i * 4 + 4)
    const texture = Texture.fromBuffer(data, 32, 1)
    try {
      const options = { face: true, shadow: 1, shadowTexture: texture, visibilityOnly: true }
      expect(render({ ...options, aspect: 0.5 })).toEqual([0, 0, 0, 255])
      expect(render({ ...options, aspect: 2 })).toEqual([255, 255, 255, 255])
    }
    finally {
      texture.destroy(true)
    }
  })

  it('changes only reflected hair light when roughness changes', () => {
    const options = { illustrated: true, hair: true, light: 8 }
    expect(render({ ...options, roughness: 0.2 })).not.toEqual(render({ ...options, roughness: 0.8 }))
    expect(render({ ...options, albedo: 0.3, sheen: 0, roughness: 0.2 }))
      .toEqual(render({ ...options, albedo: 0.3, sheen: 0, roughness: 0.8 }))
    expect(render({ ...options, light: 0, roughness: 0.2 })).toEqual([0, 0, 0, 255])
    expect(render({ ...options, bend: 0, normal: [0, 0, 1] })).toEqual([0, 0, 0, 255])
  })

  it('reflects source color independently of the painted albedo', () => {
    const matte = render({ sheen: 0 })
    const shiny = render()
    expect(matte[0]).toBe(0)
    expect(shiny[0]).toBeGreaterThan(0)
    expect(shiny[1]).toBe(0)
    expect(shiny[3]).toBe(255)
  })

  it('does not dim reflected light when ambient fill is lowered', () => {
    expect(render({ ambient: 0.1 })).toEqual(render({ ambient: 1 }))
  })

  it('keeps zero-strength artwork exact and rejects reflection from behind', () => {
    expect(render({ strength: 0, albedo: 0.2 })).toEqual([51, 51, 51, 255])
    expect(render({ bend: 0, normal: [0, 0, 1] })).toEqual([0, 0, 0, 255])
  })

  it('uses linear emission and camera exposure before the highlight shoulder', () => {
    const options = { photometry: true, lightColor: [1, 1, 1], ambient: 0, albedo: 0.3, sheen: 0, light: 2 }
    const base = render(options)[0]
    expect(base).toBeGreaterThan(0)
    expect(render({ ...options, lightScale: 2 })[0]).toBeCloseTo(base * 2, -1)
    expect(render({ ...options, cameraExposure: 2 })[0]).toBeCloseTo(base * 2, -1)
    expect(render({ ...options, lightScale: 0 })).toEqual([0, 0, 0, 255])
  })

  it('preserves unlit artwork and rolls off bright neutral light in the exposure trial', () => {
    const options = { photometry: true, lightColor: [1, 1, 1], ambient: 0.5, albedo: 0.3, light: 80, cameraExposure: 2 }
    expect(render({ ...options, strength: 0 })).toEqual(render({ ...options, strength: 0, photometry: false }))
    const result = render(options)
    expect(result[0]).toBeGreaterThan(150)
    expect(result[0]).toBeLessThanOrEqual(255)
    expect(result[0]).toBe(result[1])
    expect(result[1]).toBe(result[2])
  })

  it('enhances colored light without increasing luminance or lowering the baseline', () => {
    // ROOT CAUSE:
    // An energy curve brightened white and colored light together. Only the
    // color shift may change; baseline RGB and lit luminance remain fixed.
    const options = { photometry: true, albedoColor: [0.35, 0.6, 0.85], ambient: 0.5, sheen: 0.5, light: 2, lightColor: [1, 0.25, 0.1] }
    const baseline = render({ ...options, light: 0 })
    const physical = render(options)
    const enhanced = render({ ...options, responseCurve: 100 })
    const luminance = (color: number[]) => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
    expect(enhanced[0]).toBeGreaterThan(physical[0] + 2)
    expect(Math.abs(luminance(enhanced) - luminance(physical))).toBeLessThan(1)
    for (let channel = 0; channel < 3; channel++) expect(enhanced[channel]).toBeGreaterThanOrEqual(baseline[channel])
    expect(render({ ...options, responseCurve: 100, light: 0 })).toEqual(baseline)
    expect(render({ ...options, responseCurve: 100, lightColor: [1, 1, 1] }))
      .toEqual(render({ ...options, lightColor: [1, 1, 1] }))
  })

  it('keeps enhanced luminance increasing across light intensities and the display gamut', () => {
    for (const responseCurve of [15, 100]) {
      for (const lightColor of [[1, 0.25, 0.1], [0.1, 0.25, 1]]) {
        const options = { responseCurve, lightColor, photometry: true, albedoColor: [0.35, 0.6, 0.85], ambient: 0.5, cameraExposure: 2 }
        const baseline = render({ ...options, light: 0 })
        let previous = 0
        for (const light of [0, 0.01, 0.1, 1, 4, 16, 64, 1000]) {
          const pixel = render({ ...options, light })
          const physical = render({ ...options, light, responseCurve: 0 })
          const luminance = pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722
          const physicalLuminance = physical[0] * 0.2126 + physical[1] * 0.7152 + physical[2] * 0.0722
          expect(luminance).toBeGreaterThanOrEqual(previous - 1)
          expect(Math.abs(luminance - physicalLuminance)).toBeLessThan(1)
          for (let channel = 0; channel < 3; channel++) expect(pixel[channel]).toBeGreaterThanOrEqual(baseline[channel])
          previous = luminance
        }
        expect(render({ ...options, chroma: 0 })).toEqual(render({ ...options, chroma: 0, responseCurve: 0 }))
      }
    }
  })

  it('never lets colored emission subtract from the fixed unlit baseline', () => {
    // ROOT CAUSE:
    // The received hue multiplied the ambient artwork, removing absent source
    // channels. The HDR shoulder also compressed the baseline when light grew.
    // Both effects must leave the black-screen baseline intact at fixed exposure.
    for (const photometry of [false, true]) {
      for (const responseCurve of [0, 15, 100]) {
        for (const lightColor of [[1, 0, 0], [0.02, 0, 0], [0, 0, 1]]) {
          const options = { responseCurve, photometry, albedo: 0.9, ambient: 0.8, cameraExposure: 2, sheen: 0, lightColor }
          const baseline = render({ ...options, light: 0 })
          let previous = baseline
          for (const light of [0.01, 0.1, 1, 10, 1000]) {
            const lit = render({ ...options, light })
            for (let channel = 0; channel < 3; channel++) {
              expect(lit[channel], `${photometry}/${lightColor}/${light}/${channel}`).toBeGreaterThanOrEqual(baseline[channel])
              expect(lit[channel]).toBeGreaterThanOrEqual(previous[channel])
            }
            previous = lit
          }
        }
      }
    }
  })

  it('adds received screen color without subtracting other ambient channels', () => {
    // ROOT CAUSE:
    // A blue emitter cannot remove the red light already in the room.
    // Hue comes from added energy, not multiplication of the baseline.
    const options = { illustrated: true, face: true, skinRelief: 1, albedo: 0.3, ambient: 0.65, sheen: 0, lightColor: [0, 0, 1], light: 8 }
    const unlit = render({ ...options, light: 0 })
    const blue = render(options)
    expect(blue[0]).toBe(unlit[0])
    expect(blue[2]).toBeGreaterThan(unlit[2])
    expect(render({ ...options, normal: [1, 0, 0] })).toEqual(unlit)
    expect(render({ ...options, strength: 0 })).toEqual(render({ ...options, strength: 0, light: 0 }))
  })

  it('keeps a neutral screen neutral at either end of the chroma control', () => {
    const options = { illustrated: true, hair: true, albedo: 0.3, light: 8, lightColor: [1, 1, 1] }
    expect(render({ ...options, chroma: 1 })).toEqual(render({ ...options, chroma: 0 }))
  })

  it('keeps reflected source chromaticity when compressing bright highlights', () => {
    // ROOT CAUSE:
    // Independent RGB compression pushes every nonzero channel toward white.
    // A bright orange reflection must retain the same RGB proportions.
    const options = { illustrated: true, hair: true, ambient: 0, albedo: 0, lightColor: [1, 0.2, 0.05], soft: true }
    const low = render({ ...options, light: 8 })
    const high = render({ ...options, light: 80 })
    expect(Math.abs(high[1] / high[0] - 0.2)).toBeLessThan(0.03)
    expect(Math.abs(high[2] / high[0] - 0.05)).toBeLessThan(0.02)
    expect(high[0]).toBeGreaterThan(low[0])
  })

  it('compresses added light while leaving an unlit surface unchanged', () => {
    const soft = render({ albedo: 0.7, soft: true })
    const hard = render({ albedo: 0.7, soft: false })
    expect(soft[0]).toBeLessThan(hard[0])
    expect(render({ albedo: 0.2, light: 0, ambient: 1 })).toEqual([51, 51, 51, 255])
  })
})
