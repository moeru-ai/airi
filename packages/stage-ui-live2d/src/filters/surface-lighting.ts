import type { Renderer as PixiRenderer } from '@pixi/core'
import type { AmbientLightEnvironment, AmbientLightMaterialOptions, AmbientLightScreenGeometry, NormalizedRectangle, ScreenAmbientLightMode } from '@proj-airi/stage-shared/screen-ambient-light'
import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { NormalAttachment } from '../lighting/attachment'
import type { FaceShadowCaster } from './face-shadow'
import type { SurfaceLightFrame } from './surface-irradiance'

import { RenderTexture } from '@pixi/core'
import { Matrix } from '@pixi/math'
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { CubismShader_WebGL, fragmentShaderSrcsetupMask } from 'pixi-live2d-display/cubism4'

import { validateNormalBinding } from '../lighting/attachment'
import { FaceShadow } from './face-shadow'
import { faceSurfaceShader } from './face-surface'
import { NoseAttachment } from './nose-attachment'
import { ScreenExposure } from './screen-exposure'
import { flatScreenGeometry, referenceLightFrame, screenLightCount, screenLightGridSize, surfaceIrradianceShader, surfaceLightFrame, writeScreenEdges, writeScreenGeometry, writeScreenLights } from './surface-irradiance'
import { SurfaceLightField } from './surface-light-field'

type Renderer = Cubism4InternalModel['renderer']

const bindings = new WeakMap<Renderer, SurfaceLighting>()
let installed = false

const declarations = `
varying vec2 v_airiReference;
varying vec2 v_airiStage;
varying vec2 v_airiNoseReference;
uniform float u_airiEnabled;
uniform float u_airiProfile;
uniform float u_airiCapture;
uniform float u_airiBloomCapture;
uniform vec4 u_airiGeneratedFace;
uniform vec4 u_airiGeneratedNose;
uniform float u_airiGeneratedNoseStrength;
uniform vec2 u_airiMapSize;
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
  // Interpolate coverage, never encoded IDs,
  // so magnifying the model does not expose a staircase at ownership edges.
  vec2 size = u_airiMapSize;
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
    // coarse material estimate; reviewed profiles supply explicit hair ownership.
    materialSheen = mix(1.,0.25,smoothstep(0.30,0.42,v_airiReference.y));
    if (u_airiIllustrated > .5) materialSheen = u_airiHair;
    if (u_airiFace > 0.5) {
      vec2 face = (v_airiReference-u_airiGeneratedFace.xy)/u_airiGeneratedFace.zw;
      // The painted nose mesh supplies a separate coordinate frame; it moves
      // farther than Face during turns. Ownership and alpha still bound the
      // correction, and the height gradient supplies relief without paint.
      airiSkinNormal = airiRotateFace(normalize(vec3(face.x*.4,-face.y*.4,1.)));
      airiFaceForward = vec3(u_airiFaceRotation.x,0.,u_airiFaceRotation.y);
      vec2 nose = vec2(0.);
      if (u_airiGeneratedNose.z > 0.) {
        nose = (v_airiNoseReference-u_airiGeneratedNose.xy)/u_airiGeneratedNose.zw;
        noseTip = exp(-0.5*dot(nose,nose));
      }
      airiFaceDepth = clamp(sqrt(max(0.,1.-dot(face,face)))+.12*noseTip,0.,1.);
      vec2 slope = vec2(face.x,-face.y)*0.4 + vec2(nose.x,-nose.y)*noseTip*u_airiGeneratedNoseStrength;
      n = airiRotateFace(normalize(vec3(slope,1.)));
      materialSheen = 0.12 + 0.8*noseTip*min(u_airiGeneratedNoseStrength,1.);
      if (u_airiIllustrated > .5) {
        vec2 q=airiFaceCoordinates(v_airiReference);
        vec2 noseQ=airiFaceCoordinates(v_airiNoseReference);
        // Keep diffuse geometry stable when the nose-highlight control changes.
        // At its default strength, reflection and diffuse use the same surface.
        airiSkinNormal=airiRotateFace(airiFaceNormalAt(q,noseQ,u_airiGeneratedNose.z > 0. ? 1. : 0.));
        n=airiRotateFace(airiFaceNormalAt(q,noseQ,u_airiGeneratedNoseStrength));
        materialSheen = 0.;
        if (u_airiGeneratedNose.z > 0.) {
          vec2 accent = (v_airiNoseReference-u_airiGeneratedNose.xy)/(u_airiGeneratedNose.zw*vec2(5./9.,8./13.));
          materialSheen = 2.*exp(-2.*dot(accent,accent))*min(u_airiGeneratedNoseStrength,1.);
        }
      }
    }
  }
  if (u_airiGeneratedFace.z > 0. && u_airiFace < .5) {
    // Paint layers belong to one curved face, independent of their opacity or
    // neutral visibility. The SDK alpha/masks still define every visible edge.
    vec2 q = (v_airiReference-u_airiGeneratedFace.xy)/u_airiGeneratedFace.zw;
    vec2 slope = vec2(q.x,-q.y)*.55;
    float bump = 0.;
    if (u_airiGeneratedNose.z > 0.) {
      vec2 nose = (v_airiNoseReference-u_airiGeneratedNose.xy)/u_airiGeneratedNose.zw;
      bump = exp(-.5*dot(nose,nose))*u_airiGeneratedNoseStrength;
      slope += vec2(nose.x,-nose.y)*bump;
    }
    n = airiRotateFace(normalize(vec3(slope,1.)));
    materialSheen = .12 + bump*1.5;
  }
  vec3 color = airiLinear(gl_FragColor.rgb/gl_FragColor.a);
  gl_FragColor.rgb = airiSrgb(airiSurfaceColor(n,v_airiStage,color,materialSheen))*gl_FragColor.a;
  if (u_airiBloomCapture > .5) {
    // Linear halo opacity keeps faint light faint. A shared RGB divisor keeps
    // bright emitters in range without changing their hue.
    float peak = max(airiBloomEnergy.r,max(airiBloomEnergy.g,airiBloomEnergy.b));
    gl_FragColor.rgb = airiBloomEnergy/(1.+peak)*gl_FragColor.a;
  }
}
if (u_airiCapture > .5) {
  if (gl_FragColor.a <= .05) discard;
  gl_FragColor = vec4(mod(u_airiOwner,256.)/255.,floor(u_airiOwner/256.)/255.,0.,1.);
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
    if ((binding?.captureMode || binding?.bloomCapture) && blend !== 0) {
      // Painted multiply shadows and additive accents do not own a surface.
      gl.uniform1f(gl.getUniformLocation(program, 'u_airiEnabled'), 0)
      gl.uniform1f(gl.getUniformLocation(program, 'u_airiCapture'), 0)
      gl.uniform4f(gl.getUniformLocation(program, 'u_baseColor'), 0, 0, 0, 0)
      const attribute = gl.getAttribLocation(program, 'a_airiReference')
      if (attribute >= 0) {
        gl.disableVertexAttribArray(attribute)
        gl.vertexAttrib2f(attribute, 0.5, 0.5)
      }
      return
    }
    if (!binding || blend !== 0) {
      gl.uniform1f(gl.getUniformLocation(program, 'u_airiCapture'), 0)
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
  // Restore the SDK methods before hot replacement. Otherwise the next capture
  // wraps the previous shader injection and compiles duplicate declarations.
  import.meta.hot?.dispose(() => {
    prototype.loadShaderProgram = load
    prototype.setupShaderProgram = setup
  })
}

interface Locations {
  attribute: number
  enabled: WebGLUniformLocation | null
  profile: WebGLUniformLocation | null
  generatedNose: WebGLUniformLocation | null
  generatedNoseStrength: WebGLUniformLocation | null
  generatedFace: WebGLUniformLocation | null
  capture: WebGLUniformLocation | null
  bloomCapture: WebGLUniformLocation | null
  mapSize: WebGLUniformLocation | null
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
  edges: WebGLUniformLocation | null
  area: WebGLUniformLocation | null
  field: WebGLUniformLocation | null
  fieldEnabled: WebGLUniformLocation | null
  fieldMean: WebGLUniformLocation | null
  bounds: WebGLUniformLocation | null
  screen: WebGLUniformLocation | null
  fieldBounds: WebGLUniformLocation | null
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
  responseCurve: WebGLUniformLocation | null
  photometry: WebGLUniformLocation | null
  lightScale: WebGLUniformLocation | null
  cameraExposure: WebGLUniformLocation | null
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
  private readonly references = new Map<number, { coordinates: Float32Array, index: number, face: boolean, hair: boolean, generatedFace?: boolean }>()
  private readonly buffers = new Map<number, WebGLBuffer>()
  private programs = new WeakMap<WebGLProgram, Locations>()
  private readonly clipToStage = new Matrix()
  private readonly modelToStage = new Matrix()
  private readonly drawModel: Renderer['doDrawModel']
  private faceIndex = -1
  private illustrated = false
  private readonly generatedNose = new Float32Array(4)
  private generatedNoseStrength = 0
  private generatedYawIndex = -1
  private generatedYawRange = 30
  private readonly generatedFace = new Float32Array(4)
  private readonly faceRotation = new Float32Array([0, 1])
  private noseIndex = -1
  private noseAttachment?: NoseAttachment
  private readonly shadowCasters: (FaceShadowCaster & { index: number })[] = []
  private shadow?: FaceShadow
  private field?: SurfaceLightField
  private faceHeight = 0
  private geometry: Readonly<AmbientLightScreenGeometry> = flatScreenGeometry
  private material: Readonly<AmbientLightMaterialOptions> = ambientLightDefaults.material
  /** Drawn mesh bounds in stage UVs, before viewport clipping, filters, and window controls. */
  readonly characterBounds: NormalizedRectangle = { x: 0, y: 0, width: 1, height: 1 }
  private frame: SurfaceLightFrame = referenceLightFrame
  private readonly boundsUniform = new Float32Array([0, 0, 1, 1])
  private readonly screenUniform = new Float32Array([-0.5, -0.5, 2, 2])
  private readonly edges = new Float32Array((screenLightGridSize + 1) * 4)
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
  private exposure = new ScreenExposure()
  private ambient = 1
  private contrast = 1
  private directional = true
  profile: 'proxy' | 'generated' = 'proxy'
  /** Only the isolated authoring renderer sets this mode. */
  captureMode = false
  /** Shader-dispatch phase, scoped to renderBloom and reset before it returns. */
  bloomCapture = false
  private bloomTexture?: RenderTexture
  private readonly drawViewport = new Int32Array(4)

  /**
   * Draws only received light in the enclosing filter's coordinates. The filter
   * consumes this texture immediately; the next draw replaces it. The current
   * pose and prepared lighting are reused without advancing animation.
   */
  renderBloom(input: RenderTexture): RenderTexture {
    const renderer = this.stage
    const gl = renderer.gl
    const target = renderer.renderTexture.current
    const source = renderer.renderTexture.sourceFrame.clone()
    const destination = renderer.renderTexture.destinationFrame.clone()
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
    const viewport = gl.getParameter(gl.VIEWPORT)
    // Bloom is blurred at half resolution. Capture at that same resolution to
    // avoid shading four times as many pixels for a low-frequency result.
    const resolution = input.resolution * 0.5
    this.bloomTexture ??= RenderTexture.create({ width: input.width, height: input.height, resolution })
    if (this.bloomTexture.resolution !== resolution || this.bloomTexture.width !== input.width || this.bloomTexture.height !== input.height) {
      this.bloomTexture.setResolution(resolution)
      this.bloomTexture.resize(input.width, input.height)
    }
    this.bloomTexture.filterFrame = input.filterFrame
    try {
      renderer.renderTexture.bind(this.bloomTexture)
      renderer.renderTexture.clear([0, 0, 0, 0])
      // Cubism restores its target after mask draws. Its saved target and GL
      // viewport must match the original draw, including the filter padding.
      const captureViewport = Array.from(this.drawViewport, value => Math.round(value * 0.5))
      gl.viewport(captureViewport[0], captureViewport[1], captureViewport[2], captureViewport[3])
      this.model.renderer.setRenderState(gl.getParameter(gl.FRAMEBUFFER_BINDING), captureViewport)
      this.bloomCapture = true
      renderer.geometry.reset()
      this.drawModel.call(this.model.renderer)
    }
    finally {
      this.bloomCapture = false
      // Reset only the caches Cubism changes. A full renderer reset would
      // discard the enclosing FilterSystem stack while its apply is running.
      renderer.state.reset()
      renderer.shader.reset()
      renderer.geometry.reset()
      renderer.texture.reset()
      renderer.renderTexture.bind(target ?? undefined, source, destination)
      this.model.renderer.setRenderState(framebuffer, viewport)
      gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3])
    }
    return this.bloomTexture
  }

  constructor(private readonly model: Cubism4InternalModel, private readonly stage: PixiRenderer) {
    installShaderDispatch()
    const core = model.coreModel
    const ids = core.getDrawableIds()
    // Unsaved models use neutral proxy coordinates. Imported attachments replace
    // these references only after their asset fingerprint and topology match.
    for (let i = 0; i < ids.length; i++) {
      const vertices = core.getDrawableVertices(i)
      const coordinates = new Float32Array(vertices.length)
      for (let j = 0; j < vertices.length; j += 2) {
        coordinates[j] = (vertices[j] * model.pixelsPerUnit + model.originalWidth / 2) / model.originalWidth
        coordinates[j + 1] = (-vertices[j + 1] * model.pixelsPerUnit + model.originalHeight / 2) / model.originalHeight
      }
      this.references.set(vertices.byteOffset, { coordinates, index: i, face: false, hair: false })
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
  }

  /** Shares the final filter's adaptation state; neither binding owns a timer. */
  setPhotometry(exposure: ScreenExposure) {
    this.exposure = exposure
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

  /** Decodes and validates a replacement before changing the active GPU binding. */
  async applyAttachment(attachment: NormalAttachment) {
    validateNormalBinding(this.model, attachment)
    const urls = [URL.createObjectURL(attachment.normal), URL.createObjectURL(attachment.ownership)]
    try {
      const images = urls.map((url) => {
        const image = new Image()
        image.src = url
        return image
      })
      await Promise.all(images.map(image => image.decode()))
      if (images.some(image => image.width !== attachment.width || image.height !== attachment.height))
        throw new Error('The normal images do not match their binding dimensions.')
      if (this.disposed)
        throw new Error('The model was unloaded before its normal map was ready.')
      this.releaseGpu()
      this.gl = undefined
      this.profile = 'generated'
      this.illustrated = !!attachment.faceSurface?.illustrated
      this.faceIndex = attachment.faceSurface?.illustrated?.face ?? -1
      this.shadowCasters.length = 0
      for (const index of attachment.faceSurface?.illustrated?.shadowCasters ?? []) {
        const core = this.model.coreModel
        this.shadowCasters.push({ index, vertices: core.getDrawableVertices(index), uvs: core.getDrawableVertexUvs(index), indices: core.getDrawableVertexIndices(index), texture: null, opacity: 0 })
      }
      this.generatedFace.fill(0)
      this.generatedNose.fill(0)
      this.generatedNoseStrength = 0
      this.generatedYawIndex = -1
      this.noseIndex = -1
      this.noseAttachment = undefined
      if (attachment.faceSurface) {
        const face = attachment.faceSurface
        this.generatedFace.set([...face.center, ...face.radius])
        if (face.yaw) {
          this.generatedYawIndex = this.model.coreModel.getParameterIndex(face.yaw.parameter)
          this.generatedYawRange = face.yaw.range
        }
        if (face.nose) {
          this.generatedNose.set([...face.nose.center, ...face.nose.radius])
          this.generatedNoseStrength = face.nose.strength
          this.noseIndex = face.nose.drawable
          this.noseAttachment = new NoseAttachment(attachment.drawables[this.noseIndex].reference, this.model.coreModel.getDrawableVertexIndices(this.noseIndex), face.nose.center)
        }
      }
      attachment.drawables.forEach((entry, index) => {
        const vertices = this.model.coreModel.getDrawableVertices(index)
        this.references.set(vertices.byteOffset, { coordinates: new Float32Array(entry.reference), index, face: this.illustrated && !!attachment.faceSurface?.drawables.includes(index), hair: attachment.faceSurface?.illustrated?.hair.includes(index) ?? false, generatedFace: attachment.faceSurface?.drawables.includes(index) })
      })
      this.images = [images[0], images[1]]
    }
    finally {
      urls.forEach(url => URL.revokeObjectURL(url))
    }
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
    writeScreenLights(environment.screen?.radiance ?? environment.contact, this.lights)
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
      locations = { attribute: gl.getAttribLocation(program, 'a_airiReference'), enabled: uniform('Enabled'), profile: uniform('Profile'), capture: uniform('Capture'), bloomCapture: uniform('BloomCapture'), generatedFace: uniform('GeneratedFace'), generatedNose: uniform('GeneratedNose'), generatedNoseStrength: uniform('GeneratedNoseStrength'), mapSize: uniform('MapSize'), face: uniform('Face'), faceRotation: uniform('FaceRotation'), modelToNose: uniform('ModelToNose'), hair: uniform('Hair'), illustrated: uniform('Illustrated'), owner: uniform('Owner'), strength: uniform('Strength'), chroma: uniform('Chroma'), directional: uniform('Directional'), normal: uniform('Normal'), ownership: uniform('Ownership'), lights: uniform('Lights[0]'), edges: uniform('Edges[0]'), area: uniform('Area'), field: uniform('Field'), fieldEnabled: uniform('FieldEnabled'), fieldMean: uniform('FieldMean'), bounds: uniform('Bounds'), screen: uniform('Screen'), fieldBounds: uniform('FieldBounds'), clipToStage: uniform('ClipToStage'), aspect: uniform('StageAspect'), emitters: uniform('Emitters[0]'), faceShadow: uniform('FaceShadow'), faceShadowStrength: uniform('FaceShadowStrength'), faceHeight: uniform('FaceHeight'), roughness: uniform('Roughness'), skinRelief: uniform('SkinRelief'), sheen: uniform('Sheen'), nose: uniform('Nose'), softHighlights: uniform('SoftHighlights'), responseCurve: uniform('ResponseCurve'), photometry: uniform('Photometry'), lightScale: uniform('LightScale'), cameraExposure: uniform('CameraExposure'), ambient: uniform('Ambient'), contrast: uniform('Contrast') }
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
    gl.uniform1f(locations.capture, this.captureMode ? 1 : 0)
    gl.uniform1f(locations.bloomCapture, this.bloomCapture ? 1 : 0)
    gl.uniform2f(locations.mapSize, this.images?.[0].width ?? 512, this.images?.[0].height ?? 640)
    gl.uniform1f(locations.face, reference.face ? 1 : 0)
    gl.uniform2fv(locations.faceRotation, this.faceRotation)
    gl.uniform4fv(locations.generatedNose, this.generatedNose)
    gl.uniform1f(locations.generatedNoseStrength, this.generatedNoseStrength * this.material.nose)
    if (reference.generatedFace)
      gl.uniform4fv(locations.generatedFace, this.generatedFace)
    else
      gl.uniform4f(locations.generatedFace, 0, 0, 0, 0)
    if (this.noseAttachment)
      gl.uniformMatrix3fv(locations.modelToNose, false, this.noseAttachment.matrix.toArray(true))
    gl.uniform1f(locations.hair, reference.hair ? 1 : 0)
    // Only a matched, reviewed profile has reliable material ownership. Other
    // models keep the generic response until they have their own annotations.
    gl.uniform1f(locations.illustrated, this.material.illustrated && this.illustrated ? 1 : 0)
    gl.uniform1f(locations.owner, reference.index + 1)
    gl.uniform1f(locations.responseCurve, this.exposure.responseCurve)
    gl.uniform1f(locations.photometry, this.exposure.enabled ? 1 : 0)
    gl.uniform1f(locations.lightScale, this.exposure.lightScale)
    gl.uniform1f(locations.cameraExposure, this.exposure.cameraExposure)
    gl.uniform1f(locations.ambient, this.exposure.baseBrightness ?? this.ambient)
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
    gl.uniformMatrix3fv(locations.clipToStage, false, this.clipToStage.toArray(true))
    const aspect = this.environment?.screen?.aspect ?? width / height
    gl.uniform4fv(locations.bounds, this.boundsUniform)
    gl.uniform4fv(locations.screen, this.screenUniform)
    gl.uniform1f(locations.aspect, aspect)
    gl.uniform4fv(locations.emitters, this.emitters)
    gl.uniform4fv(locations.edges, this.edges)
    gl.uniform1f(locations.area, this.geometry.areaLights ? 1 : 0)
    gl.uniform1f(locations.fieldEnabled, this.geometry.areaLights && this.field ? 1 : 0)
    gl.uniform1i(locations.field, 5)
    if (this.field) {
      this.stage.texture.bind(this.field.texture, 5)
      gl.uniform3fv(locations.fieldMean, this.field.mean)
      gl.uniform4fv(locations.fieldBounds, this.field.bounds)
    }
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
      && this.material.faceShadow > 0 && this.illustrated
  }

  private prepareDraw() {
    this.drawViewport.set(this.stage.gl.getParameter(this.stage.gl.VIEWPORT))
    this.exposure.advance()
    const { width, height } = this.stage.screen
    this.clipToStage.copyFrom(this.stage.projection.projectionMatrix).invert().scale(1 / width, 1 / height)
    const mvp = this.model.renderer.getMvpMatrix().getArray()
    this.modelToStage.set(mvp[0], mvp[1], mvp[4], mvp[5], mvp[12], mvp[13]).prepend(this.clipToStage)
    const core = this.model.coreModel
    let left = Infinity
    let right = -Infinity
    let upper = Infinity
    let lower = -Infinity
    // Core vertices already follow animation, layout, and zoom. Hidden meshes
    // do not count, but off-viewport vertices do: cropping the same model must
    // not change its physical height, center, or the screen bend around it.
    for (const { index } of this.references.values()) {
      if (!core.getDrawableDynamicFlagIsVisible(index) || core.getDrawableOpacity(index) <= 0.01)
        continue
      const vertices = core.getDrawableVertices(index)
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < vertices.length; i += 2) {
        const x = this.modelToStage.a * vertices[i] + this.modelToStage.c * vertices[i + 1] + this.modelToStage.tx
        const y = this.modelToStage.b * vertices[i] + this.modelToStage.d * vertices[i + 1] + this.modelToStage.ty
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      left = Math.min(left, minX)
      right = Math.max(right, maxX)
      upper = Math.min(upper, minY)
      lower = Math.max(lower, maxY)
    }
    // A hidden model retains its last valid frame until it becomes visible.
    if (right > left && lower > upper) {
      Object.assign(this.characterBounds, { x: left, y: upper, width: right - left, height: lower - upper })
    }
    this.frame = surfaceLightFrame(this.environment, this.characterBounds)
    const { character, screen } = this.frame
    this.boundsUniform.set([character.x, character.y, character.width, character.height])
    this.screenUniform.set([screen.x, screen.y, screen.width, screen.height])
    const aspect = this.environment?.screen?.aspect ?? width / height
    writeScreenGeometry(this.geometry, aspect, this.emitters, this.frame)
    writeScreenEdges(this.geometry, aspect, this.edges, this.frame)
    if (this.active && this.directional && this.strength > 0 && this.geometry.areaLights) {
      this.field ??= new SurfaceLightField()
      this.field.update(this.stage, this.lights, this.geometry, aspect, this.material, performance.now(), this.frame)
      // Cubism uses raw GL after Pixi. Reset the cached geometry binding before
      // its draw loop so the atlas VAO cannot retain Cubism's vertex pointers.
      this.stage.geometry.reset()
    }
    // The attachment owns the rig parameter and endpoint. Read each draw because
    // animation can advance between screen-light samples.
    const yawIndex = this.generatedYawIndex
    const yawRange = this.generatedYawRange
    const headX = yawIndex >= 0 ? this.model.coreModel.getParameterValueByIndex(yawIndex) : 0
    const yaw = Math.max(-1, Math.min(1, headX / yawRange)) * this.material.faceYaw * Math.PI / 180
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
    this.field?.dispose()
    this.field = undefined
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
    this.bloomTexture?.destroy(true)
    this.disposed = true
    this.model.renderer.doDrawModel = this.drawModel
    bindings.delete(this.model.renderer)
    this.releaseGpu()
    this.images = undefined
  }
}
