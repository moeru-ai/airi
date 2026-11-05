import type { CLEAR_MODES } from '@pixi/constants'
import type { FilterSystem, RenderTexture } from '@pixi/core'
import type { AmbientLightEnvironment, AmbientLightMaterialOptions, AmbientLightScreenGeometry, NormalizedRectangle, ScreenAmbientLightMode } from '@proj-airi/stage-shared/screen-ambient-light'

import { Filter, Texture } from '@pixi/core'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, surfaceLightFrame, writeScreenEdges, writeScreenGeometry, writeScreenLights } from './surface-irradiance'
import { SurfaceLightField } from './surface-light-field'

/** Known analytic normals used to inspect the production surface response. */
export type SurfaceLightPreviewShape = 'cylinder' | 'sphere'

/** Inputs shared with the stage; diagnostic shape and normal view stay local. */
export interface SurfaceLightPreviewOptions {
  environment: AmbientLightEnvironment
  material: AmbientLightMaterialOptions
  geometry: AmbientLightScreenGeometry
  mode: ScreenAmbientLightMode
  strength: number
  chroma: number
  /** Matches the character's dim-light color emphasis; zero disables enhancement. */
  responseCurve: number
  aspect: number
  shape: SurfaceLightPreviewShape
  normals: boolean
  characterBounds?: Readonly<NormalizedRectangle>
}

/**
 * Runs the production irradiance shader on analytic normals and fixed gray.
 * Positions stay on the character's surface plane, matching the Live2D material;
 * this isolates normals and emitter geometry without adding reconstructed depth.
 * The owner must destroy the filter when its preview unmounts.
 */
export class SurfaceLightPreviewFilter extends Filter {
  private field?: SurfaceLightField
  private options?: SurfaceLightPreviewOptions
  constructor() {
    super(undefined, `
      precision highp float;
      varying vec2 vTextureCoord;
      uniform vec4 inputSize;
      uniform vec4 outputFrame;
      uniform float u_airiStrength;
      uniform float u_airiChroma;
      uniform float u_airiDirectional;
      uniform float uSphere;
      uniform float uNormals;
      uniform vec4 uProxyBounds;
      ${surfaceIrradianceShader}
      void main() {
        vec2 p = vTextureCoord * inputSize.xy / outputFrame.zw;
        // Circle radius is relative to the shorter window dimension, so the
        // sphere stays round in both portrait and landscape stage windows.
        vec2 center = uProxyBounds.xy+uProxyBounds.zw*.5;
        float radius = .5*min(uProxyBounds.z*u_airiStageAspect,uProxyBounds.w);
        vec2 q = vec2((p.x-center.x)*u_airiStageAspect, center.y-p.y)/radius;
        float radial = uSphere > 0.5 ? dot(q,q) : q.x*q.x;
        if (radial > 1. || (uSphere < 0.5 && abs(p.y-center.y) > uProxyBounds.w*.5)) discard;
        vec3 n = vec3(q.x, uSphere > 0.5 ? q.y : 0., sqrt(max(0.,1.-radial)));
        vec3 color = uNormals > 0.5 ? n*0.5+0.5 : airiSurfaceColor(n,p,vec3(0.35),1.);
        gl_FragColor = vec4(clamp(color,0.,1.),1.);
      }
    `, {
      u_airiArea: 0,
      u_airiField: Texture.EMPTY,
      u_airiFieldEnabled: 0,
      u_airiEdges: new Float32Array((screenLightGridSize + 1) * 4),
      u_airiLights: new Float32Array(screenLightCount * 3),
      u_airiEmitters: new Float32Array(screenLightGridSize * 4),
      u_airiStageAspect: 1,
      u_airiBounds: [0, 0, 1, 1],
      u_airiScreen: [-0.5, -0.5, 2, 2],
      u_airiFieldBounds: [0, 0, 1, 1],
      u_airiStrength: 1,
      u_airiFaceShadowStrength: 0,
      u_airiFaceHeight: 0,
      u_airiFaceShadow: Texture.EMPTY,
      u_airiRoughness: 0.7,
      u_airiSkinRelief: 0.45,
      u_airiSheen: 0,
      u_airiAmbient: 1,
      u_airiContrast: 1,
      u_airiSoftHighlights: 0,
      u_airiResponseCurve: 0,
      u_airiIllustrated: 0,
      u_airiFace: 0,
      u_airiHair: 1,
      u_airiChroma: 1,
      u_airiDirectional: 1,
      uSphere: 0,
      uNormals: 0,
      uProxyBounds: [0.18, 0.14, 0.64, 0.72],
    })
  }

  /** Updates the diagnostic from the same display emission as the stage. */
  update(options: SurfaceLightPreviewOptions) {
    this.options = options
    const proxy = options.characterBounds
    this.uniforms.uProxyBounds = proxy ? [proxy.x, proxy.y, proxy.width, proxy.height] : [0.18, 0.14, 0.64, 0.72]
    const frame = surfaceLightFrame(options.environment, options.characterBounds)
    const { character, screen } = frame
    this.uniforms.u_airiBounds = [character.x, character.y, character.width, character.height]
    this.uniforms.u_airiScreen = [screen.x, screen.y, screen.width, screen.height]
    writeScreenLights(options.environment.screen?.radiance ?? options.environment.contact, this.uniforms.u_airiLights)
    writeScreenGeometry(options.geometry, options.aspect, this.uniforms.u_airiEmitters, frame)
    writeScreenEdges(options.geometry, options.aspect, this.uniforms.u_airiEdges, frame)
    this.uniforms.u_airiArea = options.geometry.areaLights ? 1 : 0
    this.uniforms.u_airiStageAspect = options.aspect
    this.uniforms.u_airiRoughness = options.material.roughness
    this.uniforms.u_airiSkinRelief = options.material.skinRelief
    this.uniforms.u_airiSheen = options.material.sheen
    this.uniforms.u_airiSoftHighlights = options.material.softHighlights ? 1 : 0
    this.uniforms.u_airiIllustrated = options.material.illustrated ? 1 : 0
    this.uniforms.u_airiResponseCurve = options.responseCurve
    this.uniforms.u_airiStrength = options.strength
    this.uniforms.u_airiChroma = options.chroma
    this.uniforms.u_airiDirectional = options.mode === 'window-gradient' ? 1 : 0
    this.uniforms.uSphere = options.shape === 'sphere' ? 1 : 0
    this.uniforms.uNormals = options.normals ? 1 : 0
  }

  override apply(manager: FilterSystem, input: RenderTexture, output: RenderTexture, clear: CLEAR_MODES) {
    const options = this.options
    this.uniforms.u_airiFieldEnabled = 0
    if (options?.geometry.areaLights && options.mode === 'window-gradient' && !options.normals) {
      this.field ??= new SurfaceLightField()
      this.field.update(manager.renderer, this.uniforms.u_airiLights, options.geometry, options.aspect, options.material, performance.now(), surfaceLightFrame(options.environment, options.characterBounds))
      this.uniforms.u_airiField = this.field.texture
      this.uniforms.u_airiFieldMean = this.field.mean
      this.uniforms.u_airiFieldBounds = this.field.bounds
      this.uniforms.u_airiFieldEnabled = 1
    }
    manager.applyFilter(this, input, output, clear)
  }

  override destroy() {
    this.field?.dispose()
    super.destroy()
  }
}
