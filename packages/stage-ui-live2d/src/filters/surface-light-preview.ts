import type { AmbientLightEnvironment, AmbientLightMaterialOptions, AmbientLightScreenGeometry, ScreenAmbientLightMode } from '@proj-airi/stage-shared/screen-ambient-light'

import { Filter } from '@pixi/core'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

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
  aspect: number
  shape: SurfaceLightPreviewShape
  normals: boolean
}

/**
 * Runs the production irradiance shader on analytic normals and fixed gray.
 * Positions stay on the character's surface plane, matching the Live2D material;
 * this isolates normals and emitter geometry without adding reconstructed depth.
 * The owner must destroy the filter when its preview unmounts.
 */
export class SurfaceLightPreviewFilter extends Filter {
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
      ${surfaceIrradianceShader}
      void main() {
        vec2 p = vTextureCoord * inputSize.xy / outputFrame.zw;
        // Circle radius is relative to the shorter window dimension, so the
        // sphere stays round in both portrait and landscape stage windows.
        float radius = 0.32 * min(u_airiStageAspect, 1.);
        vec2 q = vec2((p.x-0.5)*u_airiStageAspect, 0.5-p.y)/radius;
        float radial = uSphere > 0.5 ? dot(q,q) : q.x*q.x;
        if (radial > 1. || (uSphere < 0.5 && abs(p.y-0.5) > 0.36)) discard;
        vec3 n = vec3(q.x, uSphere > 0.5 ? q.y : 0., sqrt(max(0.,1.-radial)));
        vec3 color = uNormals > 0.5 ? n*0.5+0.5 : airiSurfaceColor(n,p,vec3(0.35),1.);
        gl_FragColor = vec4(clamp(color,0.,1.),1.);
      }
    `, {
      u_airiLights: new Float32Array(screenLightCount * 3),
      u_airiEmitters: new Float32Array(screenLightGridSize * 4),
      u_airiStageAspect: 1,
      u_airiStrength: 1,
      u_airiSheen: 0,
      u_airiAmbient: 1,
      u_airiContrast: 1,
      u_airiSoftHighlights: 0,
      u_airiChroma: 1,
      u_airiDirectional: 1,
      uSphere: 0,
      uNormals: 0,
    })
  }

  /** Updates the diagnostic from the same applied contact map as the stage. */
  update(options: SurfaceLightPreviewOptions) {
    writeScreenLights(options.environment.contact, this.uniforms.u_airiLights)
    writeScreenGeometry(options.geometry, options.aspect, this.uniforms.u_airiEmitters)
    this.uniforms.u_airiStageAspect = options.aspect
    this.uniforms.u_airiSheen = options.material.sheen
    this.uniforms.u_airiSoftHighlights = options.material.softHighlights ? 1 : 0
    this.uniforms.u_airiStrength = options.strength
    this.uniforms.u_airiChroma = options.chroma
    this.uniforms.u_airiDirectional = options.mode === 'window-gradient' ? 1 : 0
    this.uniforms.uSphere = options.shape === 'sphere' ? 1 : 0
    this.uniforms.uNormals = options.normals ? 1 : 0
  }
}
