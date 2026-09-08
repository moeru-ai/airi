import type { Renderer as PixiRenderer } from '@pixi/core'
import type { AmbientLightEnvironment, AmbientLightMaterialOptions, AmbientLightScreenGeometry, ScreenAmbientLightMode } from '@proj-airi/stage-shared/screen-ambient-light'
import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { FaceShadowCaster } from './face-shadow'

import { Matrix } from '@pixi/math'
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { CubismShader_WebGL, fragmentShaderSrcsetupMask } from 'pixi-live2d-display/cubism4'

import iruNormalUrl from '../assets/lighting/iru-normal.png?url'
import iruOwnershipUrl from '../assets/lighting/iru-ownership.png?url'
import iruProfile from '../assets/lighting/iru.json'

import { FaceShadow } from './face-shadow'
import { faceSurfaceShader } from './face-surface'
import { NoseAttachment } from './nose-attachment'
import { flatScreenGeometry, screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

type Renderer = Cubism4InternalModel['renderer']
type Profile = typeof iruProfile

const bindings = new WeakMap<Renderer, SurfaceLighting>()
let installed = false

const declarations = `
varying vec2 v_airiReference;
varying vec2 v_airiStage;
varying vec2 v_airiNoseReference;
uniform float u_airiEnabled;
uniform float u_airiProfile;
uniform float u_airiOwner;
uniform float u_airiNose;
uniform vec2 u_airiFaceRotation;
vec3 airiRotateFace(vec3 n) {
  return vec3(u_airiFaceRotation.y*n.x+u_airiFaceRotation.x*n.z,
              n.y,-u_airiFaceRotation.x*n.x+u_airiFaceRotation.y*n.z);
}
uniform float u_airiStrength;
uniform float u_airiChroma;
uniform float u_airiDirectional;
uniform sampler2D u_airiNormal;
uniform sampler2D u_airiOwnership;
${surfaceIrradianceShader}
${faceSurfaceShader}
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
  float materialSheen = 0.25;
  float noseTip = 0.;
  if (u_airiProfile > 0.5) {
    // The authored ownership map records contributors above 5% alpha. The
    // smooth confidence avoids a hard proxy contour in near-opaque bangs.
    float confidence = airiCoverage(v_airiReference)*smoothstep(0.05,0.95,gl_FragColor.a);
    vec3 estimate = normalize(texture2D(u_airiNormal,v_airiReference).rgb*2.-1.);
    n = normalize(mix(n,estimate,confidence));
    // The upper head gets a broader sheen than the coat and body. This is a
    // deliberately coarse material estimate for the reviewed Iru reference.
    materialSheen = mix(1.,0.25,smoothstep(0.30,0.42,v_airiReference.y));
    if (u_airiIllustrated > .5) materialSheen = u_airiHair;
    if (u_airiFace > 0.5) {
      vec2 face = (v_airiReference-vec2(0.5,0.190625))/vec2(0.0703125,0.06875);
      // The painted nose mesh supplies a separate coordinate frame; it moves
      // farther than Face during turns. Ownership and alpha still bound the
      // correction, and the height gradient supplies relief without paint.
      airiSkinNormal = airiRotateFace(normalize(vec3(face.x*.4,-face.y*.4,1.)));
      airiFaceForward = vec3(u_airiFaceRotation.x,0.,u_airiFaceRotation.y);
      vec2 nose = (v_airiNoseReference-vec2(0.5,0.2234375))/vec2(0.0045,0.0065);
      noseTip = exp(-0.5*dot(nose,nose));
      airiFaceDepth = clamp(sqrt(max(0.,1.-dot(face,face)))+.12*noseTip,0.,1.);
      vec2 slope = vec2(face.x,-face.y)*0.4 + vec2(nose.x,-nose.y)*noseTip*u_airiNose;
      n = airiRotateFace(normalize(vec3(slope,1.)));
      materialSheen = 0.12 + 0.8*noseTip*min(u_airiNose,1.);
      if (u_airiIllustrated > .5) {
        vec2 q=airiFaceCoordinates(v_airiReference);
        vec2 noseQ=airiFaceCoordinates(v_airiNoseReference);
        // Keep diffuse geometry stable when the nose-highlight control changes.
        // At its default strength, reflection and diffuse use the same surface.
        airiSkinNormal=airiRotateFace(airiFaceNormalAt(q,noseQ,1.));
        n=airiRotateFace(airiFaceNormalAt(q,noseQ,u_airiNose));
        vec2 accent = (v_airiNoseReference-vec2(.5,.2234375))/vec2(.0025,.004);
        materialSheen = 2.*exp(-2.*dot(accent,accent))*min(u_airiNose,1.);
      }
    }
  }
  vec3 color = airiLinear(gl_FragColor.rgb/gl_FragColor.a);
  gl_FragColor.rgb = airiSrgb(airiSurfaceColor(n,v_airiStage,color,materialSheen))*gl_FragColor.a;
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
      vertex = `attribute vec2 a_airiReference; varying vec2 v_airiReference; varying vec2 v_airiStage; varying vec2 v_airiNoseReference; uniform mat3 u_airiModelToNose; uniform mat3 u_airiClipToStage; ${vertex}`.replace('void main(){', 'void main(){ v_airiReference=a_airiReference; v_airiNoseReference=(u_airiModelToNose*vec3(a_position.xy,1.)).xy;')
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
  faceRotation: WebGLUniformLocation | null
  modelToNose: WebGLUniformLocation | null
  hair: WebGLUniformLocation | null
  illustrated: WebGLUniformLocation | null
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
  faceShadow: WebGLUniformLocation | null
  faceShadowStrength: WebGLUniformLocation | null
  faceHeight: WebGLUniformLocation | null
  roughness: WebGLUniformLocation | null
  skinRelief: WebGLUniformLocation | null
  sheen: WebGLUniformLocation | null
  nose: WebGLUniformLocation | null
  softHighlights: WebGLUniformLocation | null
  ambient: WebGLUniformLocation | null
  contrast: WebGLUniformLocation | null
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
  private readonly references = new Map<number, { coordinates: Float32Array, index: number, face: boolean, hair: boolean }>()
  private readonly buffers = new Map<number, WebGLBuffer>()
  private programs = new WeakMap<WebGLProgram, Locations>()
  private readonly clipToStage = new Matrix()
  private readonly modelToStage = new Matrix()
  private readonly drawModel: Renderer['doDrawModel']
  private readonly faceIndex: number
  private readonly faceYawIndex: number
  private readonly faceRotation = new Float32Array([0, 1])
  private readonly noseIndex: number
  private readonly noseAttachment?: NoseAttachment
  private readonly shadowCasters: (FaceShadowCaster & { index: number })[] = []
  private shadow?: FaceShadow
  private faceHeight = 0
  private geometry: Readonly<AmbientLightScreenGeometry> = flatScreenGeometry
  private material: Readonly<AmbientLightMaterialOptions> = ambientLightDefaults.material
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
  private ambient = 1
  private contrast = 1
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
    // Face flags also cover eyes and mouth details. Only the Face mesh defines
    // the receiver scale and the foreground/back hair ordering boundary.
    this.faceIndex = profile ? ids.indexOf('Face') : -1
    this.faceYawIndex = profile ? core.getParameterIndex('ParamAngleX') : -1
    // ArtMesh260 is Iru's painted nose highlight. Its deformer moves the nose
    // farther across the face during turns than the underlying Face mesh.
    this.noseIndex = profile ? ids.indexOf('ArtMesh260') : -1
    if (profile)
      this.noseAttachment = new NoseAttachment(profile.drawables[this.noseIndex].reference, core.getDrawableVertexIndices(this.noseIndex))
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
      if (authored?.shadowCaster) {
        if (core.getDrawableMaskCounts()[i] !== 0)
          throw new Error('Reviewed face shadow casters must have no clipping masks.')
        this.shadowCasters.push({ index: i, vertices, uvs: core.getDrawableVertexUvs(i), indices: core.getDrawableVertexIndices(i), texture: null, opacity: 0 })
      }
      this.references.set(vertices.byteOffset, { coordinates, index: i, face: authored?.face ?? false, hair: authored?.hair ?? false })
    }
    bindings.set(model.renderer, this)
    this.drawModel = model.renderer.doDrawModel
    model.renderer.doDrawModel = () => {
      this.prepareDraw()
      this.drawModel.call(model.renderer)
    }
  }

  /** Changes only this binding's virtual screen; the default remains flat. */
  setScreenGeometry(geometry: Readonly<AmbientLightScreenGeometry>) {
    this.geometry = { ...geometry }
    this.geometryAspect = 0
  }

  /** Sets ambient fill before direct light, preserving bright reflected highlights. */
  setExposure(brightness: number, contrast: number) {
    this.ambient = Math.max(0, Math.min(1, brightness))
    this.contrast = contrast
  }

  /** Updates material response without rebinding or regenerating normal textures. */
  setMaterial(material: Readonly<AmbientLightMaterialOptions>) {
    this.material = { ...material }
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
      locations = { attribute: gl.getAttribLocation(program, 'a_airiReference'), enabled: uniform('Enabled'), profile: uniform('Profile'), face: uniform('Face'), faceRotation: uniform('FaceRotation'), modelToNose: uniform('ModelToNose'), hair: uniform('Hair'), illustrated: uniform('Illustrated'), owner: uniform('Owner'), strength: uniform('Strength'), chroma: uniform('Chroma'), directional: uniform('Directional'), normal: uniform('Normal'), ownership: uniform('Ownership'), lights: uniform('Lights[0]'), clipToStage: uniform('ClipToStage'), aspect: uniform('StageAspect'), emitters: uniform('Emitters[0]'), faceShadow: uniform('FaceShadow'), faceShadowStrength: uniform('FaceShadowStrength'), faceHeight: uniform('FaceHeight'), roughness: uniform('Roughness'), skinRelief: uniform('SkinRelief'), sheen: uniform('Sheen'), nose: uniform('Nose'), softHighlights: uniform('SoftHighlights'), ambient: uniform('Ambient'), contrast: uniform('Contrast') }
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
    gl.uniform2fv(locations.faceRotation, this.faceRotation)
    if (this.noseAttachment)
      gl.uniformMatrix3fv(locations.modelToNose, false, this.noseAttachment.matrix.toArray(true))
    gl.uniform1f(locations.hair, reference.hair ? 1 : 0)
    // Only a matched, reviewed profile has reliable material ownership. Other
    // models keep the generic response until they have their own annotations.
    gl.uniform1f(locations.illustrated, this.material.illustrated && this.profile === 'iru' ? 1 : 0)
    gl.uniform1f(locations.owner, reference.index + 1)
    gl.uniform1f(locations.ambient, this.ambient)
    gl.uniform1f(locations.contrast, this.contrast)
    gl.uniform1f(locations.faceShadowStrength, this.shadowEnabled() ? this.material.faceShadow : 0)
    gl.uniform1f(locations.faceHeight, this.faceHeight)
    gl.uniform1i(locations.faceShadow, 4)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, this.shadow?.texture ?? null)
    gl.uniform1f(locations.roughness, this.material.roughness)
    gl.uniform1f(locations.skinRelief, this.material.skinRelief)
    gl.uniform1f(locations.sheen, this.material.sheen)
    gl.uniform1f(locations.nose, this.material.nose)
    gl.uniform1f(locations.softHighlights, this.material.softHighlights ? 1 : 0)
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

  private shadowEnabled() {
    return this.active && this.directional && this.strength > 0 && this.material.illustrated
      && this.material.faceShadow > 0 && this.profile === 'iru'
  }

  private prepareDraw() {
    // Iru's head X spans -30..30 rig units. Read Core on every draw, since
    // model animation can update more often than the sampled screen lighting.
    const headX = this.faceYawIndex >= 0 ? this.model.coreModel.getParameterValueByIndex(this.faceYawIndex) : 0
    const yaw = Math.max(-1, Math.min(1, headX / 30)) * this.material.faceYaw * Math.PI / 180
    this.faceRotation[0] = Math.sin(yaw)
    this.faceRotation[1] = Math.cos(yaw)
    this.noseAttachment?.update(this.model.coreModel.getDrawableVertices(this.noseIndex))
    if (!this.shadowEnabled())
      return
    const gl = this.stage.gl
    if (this.gl !== gl) {
      this.releaseGpu()
      this.gl = gl
      gl.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    }
    this.shadow ??= new FaceShadow(gl)
    const { width, height } = this.stage.screen
    this.clipToStage.copyFrom(this.stage.projection.projectionMatrix).invert().scale(1 / width, 1 / height)
    const mvp = this.model.renderer.getMvpMatrix().getArray()
    this.modelToStage.set(mvp[0], mvp[1], mvp[4], mvp[5], mvp[12], mvp[13]).prepend(this.clipToStage)
    const core = this.model.coreModel
    const face = core.getDrawableVertices(this.faceIndex)
    let top = Infinity
    let bottom = -Infinity
    for (let i = 0; i < face.length; i += 2) {
      const y = this.modelToStage.b * face[i] + this.modelToStage.d * face[i + 1] + this.modelToStage.ty
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
    this.faceHeight = bottom - top
    const order = core.getDrawableRenderOrders()
    const textures = this.model.renderer.getBindedTextures()
    for (const caster of this.shadowCasters) {
      caster.texture = textures[core.getDrawableTextureIndices(caster.index)]
      caster.opacity = order[caster.index] > order[this.faceIndex] && core.getDrawableDynamicFlagIsVisible(caster.index)
        ? core.getDrawableOpacity(caster.index)
        : 0
    }
    this.shadow.render(this.shadowCasters, this.modelToStage.toArray(true))
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
    this.shadow = undefined
    this.ownership = undefined
  }

  private releaseGpu() {
    if (!this.gl)
      return
    this.shadow?.dispose()
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
    this.model.renderer.doDrawModel = this.drawModel
    bindings.delete(this.model.renderer)
    this.releaseGpu()
    this.images = undefined
  }
}
