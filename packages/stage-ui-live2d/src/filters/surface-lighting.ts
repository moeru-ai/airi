import type { Renderer as PixiRenderer } from '@pixi/core'
import type { AmbientLightEnvironment, ScreenAmbientLightMode } from '@proj-airi/stage-shared/screen-ambient-light'
import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { ScreenGeometry } from './surface-irradiance'

import { Matrix } from '@pixi/math'
import { CubismShader_WebGL, fragmentShaderSrcsetupMask } from 'pixi-live2d-display/cubism4'

import iruNormalUrl from '../assets/lighting/iru-normal.png?url'
import iruOwnershipUrl from '../assets/lighting/iru-ownership.png?url'
import iruProfile from '../assets/lighting/iru.json'

import { flatScreenGeometry, screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

type Renderer = Cubism4InternalModel['renderer']
type Profile = typeof iruProfile

const bindings = new WeakMap<Renderer, SurfaceLighting>()
let installed = false

const declarations = `
varying vec2 v_airiReference;
varying vec2 v_airiStage;
uniform float u_airiEnabled;
uniform float u_airiProfile;
uniform float u_airiFace;
uniform float u_airiOwner;
uniform float u_airiStrength;
uniform float u_airiChroma;
uniform float u_airiDirectional;
uniform sampler2D u_airiNormal;
uniform sampler2D u_airiOwnership;
${surfaceIrradianceShader}
vec3 airiLinear(vec3 c) {
  return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 airiSrgb(vec3 c) {
  return mix(c*12.92, 1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-0.055, step(vec3(0.0031308), c));
}
float airiOwns(vec2 p) {
  vec2 owner = texture2D(u_airiOwnership,p).rg;
  float id = floor(owner.r*255.+0.5)+floor(owner.g*255.+0.5)*256.;
  return abs(id-u_airiOwner)<0.5 ? 1. : 0.;
}
float airiCoverage(vec2 p) {
  // The authored maps are 512 x 640. Interpolate coverage, never encoded IDs,
  // so magnifying the model does not expose a staircase at ownership edges.
  vec2 size = vec2(512.,640.);
  vec2 texel = p*size-0.5;
  vec2 base = (floor(texel)+0.5)/size;
  vec2 weight = fract(texel);
  return mix(mix(airiOwns(base),airiOwns(base+vec2(1.,0.)/size),weight.x),
             mix(airiOwns(base+vec2(0.,1.)/size),airiOwns(base+vec2(1.,1.)/size),weight.x),weight.y);
}
vec3 airiProxy(vec2 p) {
  vec2 face = (p-vec2(0.5,0.255))/vec2(0.20,0.19);
  vec2 body = (p-vec2(0.5,0.67))/vec2(0.32,0.42);
  vec2 q = mix(face,body,smoothstep(0.40,0.49,p.y));
  return normalize(vec3(q.x*0.52,-q.y*0.52,1.));
}
`

const shading = `
if (u_airiEnabled > 0.5 && gl_FragColor.a > 0.0001) {
  vec3 n = airiProxy(v_airiReference);
  if (u_airiProfile > 0.5) {
    // The authored ownership map records contributors above 5% alpha. The
    // smooth confidence avoids a hard proxy contour in near-opaque bangs.
    float confidence = airiCoverage(v_airiReference)*smoothstep(0.05,0.95,gl_FragColor.a);
    vec3 estimate = normalize(texture2D(u_airiNormal,v_airiReference).rgb*2.-1.);
    n = normalize(mix(n,estimate,confidence));
    if (u_airiFace > 0.5) {
      vec2 face = (v_airiReference-vec2(0.5,0.190625))/vec2(0.0703125,0.06875);
      n = normalize(vec3(face.x*0.4,-face.y*0.4,1.));
    }
  }
  vec3 response = airiSurfaceResponse(n, v_airiStage);
  vec3 color = airiLinear(gl_FragColor.rgb/gl_FragColor.a);
  gl_FragColor.rgb = airiSrgb(clamp(color*response,0.,1.))*gl_FragColor.a;
}
`

function installShaderDispatch() {
  if (installed)
    return
  installed = true
  const prototype = CubismShader_WebGL.prototype
  const load = prototype.loadShaderProgram
  prototype.loadShaderProgram = function (vertex, fragment) {
    if (fragment !== fragmentShaderSrcsetupMask) {
      vertex = `attribute vec2 a_airiReference; varying vec2 v_airiReference; varying vec2 v_airiStage; uniform mat3 u_airiClipToStage; ${vertex}`.replace('void main(){', 'void main(){ v_airiReference=a_airiReference;')
      vertex = `${vertex.slice(0, vertex.lastIndexOf('}'))} v_airiStage=(u_airiClipToStage*vec3(gl_Position.xy/gl_Position.w,1.)).xy; }`
      fragment = fragment.replace('precision mediump float;', 'precision highp float;')
      fragment = fragment.replace('void main()', `${declarations} void main()`)
      fragment = `${fragment.slice(0, fragment.lastIndexOf('}'))}${shading}}`
    }
    return load.call(this, vertex, fragment)
  }
  const setup = prototype.setupShaderProgram
  prototype.setupShaderProgram = function (...args) {
    setup.apply(this, args)
    const [renderer, , , vertices, , , , , blend] = args
    if (renderer.getClippingContextBufferForMask())
      return
    const gl = renderer.gl
    const program: WebGLProgram | null = gl.getParameter(gl.CURRENT_PROGRAM)
    if (!program)
      return
    const binding = bindings.get(renderer)
    if (!binding || blend !== 0) {
      // Multiply shadows and additive effects retain their authored color
      // operation. Relighting those overlays exposes their full mask footprint.
      gl.uniform1f(gl.getUniformLocation(program, 'u_airiEnabled'), 0)
      const attribute = gl.getAttribLocation(program, 'a_airiReference')
      if (attribute >= 0) {
        gl.disableVertexAttribArray(attribute)
        gl.vertexAttrib2f(attribute, 0.5, 0.5)
      }
      return
    }
    binding.bind(gl, program, vertices)
  }
}

interface Locations {
  attribute: number
  enabled: WebGLUniformLocation | null
  profile: WebGLUniformLocation | null
  face: WebGLUniformLocation | null
  owner: WebGLUniformLocation | null
  strength: WebGLUniformLocation | null
  chroma: WebGLUniformLocation | null
  directional: WebGLUniformLocation | null
  normal: WebGLUniformLocation | null
  ownership: WebGLUniformLocation | null
  lights: WebGLUniformLocation | null
  clipToStage: WebGLUniformLocation | null
  aspect: WebGLUniformLocation | null
  emitters: WebGLUniformLocation | null
}

/**
 * Owns model-space normal bindings and GPU resources for one Cubism model.
 *
 * One app-lifetime shader dispatcher routes by the SDK renderer instance. A
 * binding never replaces the model's color/mask draw loop or advances its pose.
 * Reference positions move with the mesh; vectors remain in the neutral basis.
 * Dispose before the model is destroyed. Context restoration rebuilds GL data.
 */
export class SurfaceLighting {
  private readonly references = new Map<number, { coordinates: Float32Array, index: number, face: boolean }>()
  private readonly buffers = new Map<number, WebGLBuffer>()
  private programs = new WeakMap<WebGLProgram, Locations>()
  private readonly clipToStage = new Matrix()
  private geometry: Readonly<ScreenGeometry> = flatScreenGeometry
  private geometryAspect = 0
  private readonly emitters = new Float32Array(screenLightGridSize * 4)
  private readonly lights = new Float32Array(screenLightCount * 3)
  private gl?: WebGLRenderingContext
  private normal?: WebGLTexture
  private ownership?: WebGLTexture
  private images?: [HTMLImageElement, HTMLImageElement]
  private environment?: AmbientLightEnvironment
  private disposed = false
  private active = false
  private strength = 0
  private chroma = 0
  private directional = true
  readonly profile: 'iru' | 'proxy'

  constructor(private readonly model: Cubism4InternalModel, private readonly stage: PixiRenderer) {
    installShaderDispatch()
    const core = model.coreModel
    const ids = core.getDrawableIds()
    const profile: Profile | undefined = ids.length === iruProfile.drawables.length && ids.every((id, i) => {
      const candidate = iruProfile.drawables[i]
      // Compare at the Core buffer precision; JSON bundling can shorten decimals.
      const uvs = core.getDrawableVertexUvs(i)
      return id === candidate.id && uvs.length === candidate.atlasUvs.length && uvs.every((v, k) => v === Math.fround(candidate.atlasUvs[k]))
    })
      ? iruProfile
      : undefined
    this.profile = profile ? 'iru' : 'proxy'
    // Capture generic references before motion begins. Iru uses the reviewed
    // authoring capture, not the current viewport or an animated pose.
    for (let i = 0; i < ids.length; i++) {
      const vertices = core.getDrawableVertices(i)
      const authored = profile?.drawables[i]
      const coordinates = authored ? new Float32Array(authored.reference) : new Float32Array(vertices.length)
      if (!authored) {
        for (let j = 0; j < vertices.length; j += 2) {
          coordinates[j] = (vertices[j] * model.pixelsPerUnit + model.originalWidth / 2) / model.originalWidth
          coordinates[j + 1] = (-vertices[j + 1] * model.pixelsPerUnit + model.originalHeight / 2) / model.originalHeight
        }
      }
      this.references.set(vertices.byteOffset, { coordinates, index: i, face: authored?.face ?? false })
    }
    bindings.set(model.renderer, this)
  }

  /** Changes only this binding's virtual screen; the default remains flat. */
  setScreenGeometry(geometry: Readonly<ScreenGeometry>) {
    this.geometry = { ...geometry }
    this.geometryAspect = 0
  }

  /** Loads the matching authored maps once; other models use their smooth proxy. */
  async load() {
    if (this.profile !== 'iru')
      return
    const normal = new Image()
    const ownership = new Image()
    normal.src = iruNormalUrl
    ownership.src = iruOwnershipUrl
    await Promise.all([normal.decode(), ownership.decode()])
    if (!this.disposed)
      this.images = [normal, ownership]
  }

  /** Applies the capture state; the light grid changes only with a new sample. */
  update(environment: AmbientLightEnvironment, active: boolean, strength: number, chroma: number, mode: ScreenAmbientLightMode) {
    this.active = active
    this.strength = Math.max(0, Math.min(3, strength))
    this.chroma = Math.max(0, Math.min(1, chroma))
    this.directional = mode !== 'global'
    if (this.environment === environment)
      return
    this.environment = environment
    // The narrow reconstruction approximates screen emission. The old wide
    // surround blur has already mixed distant colors and must not be lit again.
    writeScreenLights(environment.contact, this.lights)
  }

  /** Called by the shared dispatcher after the SDK has bound its color shader. */
  bind(gl: WebGLRenderingContext, program: WebGLProgram, vertices: Float32Array) {
    if (this.gl !== gl) {
      this.releaseGpu()
      this.gl = gl
      gl.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    }
    const reference = this.references.get(vertices.byteOffset)
    if (!reference)
      throw new Error('Live2D drawable topology changed after normal binding.')
    let locations = this.programs.get(program)
    if (!locations) {
      const uniform = (name: string) => gl.getUniformLocation(program, `u_airi${name}`)
      locations = { attribute: gl.getAttribLocation(program, 'a_airiReference'), enabled: uniform('Enabled'), profile: uniform('Profile'), face: uniform('Face'), owner: uniform('Owner'), strength: uniform('Strength'), chroma: uniform('Chroma'), directional: uniform('Directional'), normal: uniform('Normal'), ownership: uniform('Ownership'), lights: uniform('Lights[0]'), clipToStage: uniform('ClipToStage'), aspect: uniform('StageAspect'), emitters: uniform('Emitters[0]') }
      this.programs.set(program, locations)
    }
    let buffer = this.buffers.get(vertices.byteOffset)
    if (!buffer) {
      buffer = gl.createBuffer() ?? undefined
      if (!buffer)
        throw new Error('Could not allocate Live2D normal coordinates.')
      this.buffers.set(vertices.byteOffset, buffer)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, reference.coordinates, gl.STATIC_DRAW)
    }
    if (locations.attribute >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(locations.attribute)
      gl.vertexAttribPointer(locations.attribute, 2, gl.FLOAT, false, 0, 0)
    }
    if (this.images && !this.normal) {
      this.normal = this.upload(gl, this.images[0], gl.LINEAR)
      this.ownership = this.upload(gl, this.images[1], gl.NEAREST)
    }
    gl.uniform1f(locations.enabled, this.active && this.strength > 0 ? 1 : 0)
    gl.uniform1f(locations.profile, this.normal && this.ownership ? 1 : 0)
    gl.uniform1f(locations.face, reference.face ? 1 : 0)
    gl.uniform1f(locations.owner, reference.index + 1)
    gl.uniform1f(locations.strength, this.strength)
    gl.uniform1f(locations.chroma, this.chroma)
    gl.uniform1f(locations.directional, this.directional ? 1 : 0)
    gl.uniform3fv(locations.lights, this.lights)
    // Undo exactly the projection Cubism used, including Pixi filter frames.
    // Current mesh positions then locate light sources in the stage window;
    // neutral reference UVs are only for normal/material lookup.
    const { width, height } = this.stage.screen
    this.clipToStage.copyFrom(this.stage.projection.projectionMatrix).invert().scale(1 / width, 1 / height)
    gl.uniformMatrix3fv(locations.clipToStage, false, this.clipToStage.toArray(true))
    const aspect = width / height
    if (this.geometryAspect !== aspect) {
      writeScreenGeometry(this.geometry, aspect, this.emitters)
      this.geometryAspect = aspect
    }
    gl.uniform1f(locations.aspect, aspect)
    gl.uniform4fv(locations.emitters, this.emitters)
    gl.uniform1i(locations.normal, 2)
    gl.uniform1i(locations.ownership, 3)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.normal ?? null)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.ownership ?? null)
    gl.activeTexture(gl.TEXTURE0)
  }

  private upload(gl: WebGLRenderingContext, image: HTMLImageElement, filter: number) {
    const texture = gl.createTexture()
    if (!texture)
      throw new Error('Could not allocate a Live2D normal texture.')
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }

  private readonly onContextRestored = () => {
    this.buffers.clear()
    this.programs = new WeakMap()
    this.normal = undefined
    this.ownership = undefined
  }

  private releaseGpu() {
    if (!this.gl)
      return
    this.gl.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    for (const buffer of this.buffers.values()) this.gl.deleteBuffer(buffer)
    if (this.normal)
      this.gl.deleteTexture(this.normal)
    if (this.ownership)
      this.gl.deleteTexture(this.ownership)
    this.onContextRestored()
  }

  /** Releases this model's resources without changing another model's binding. */
  dispose() {
    this.disposed = true
    bindings.delete(this.model.renderer)
    this.releaseGpu()
    this.images = undefined
  }
}
