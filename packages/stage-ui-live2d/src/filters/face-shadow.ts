/** Current geometry of one reviewed, unmasked foreground hair drawable. */
export interface FaceShadowCaster {
  vertices: Float32Array
  uvs: Float32Array
  indices: Uint16Array
  texture: WebGLTexture | null
  /** Combined drawable visibility and opacity. Zero excludes this caster. */
  opacity: number
}

const vertexSource = `
attribute vec2 aPosition;
attribute vec2 aUv;
uniform mat3 uModelToStage;
varying vec2 vUv;
void main() {
  vec2 stage = (uModelToStage*vec3(aPosition,1.)).xy;
  // Stage Y points down. Store it as texture Y directly; readers use the same
  // convention, so no framebuffer/image flip enters shadow projection.
  gl_Position = vec4(stage*2.-1.,0.,1.);
  vUv = vec2(aUv.x,1.-aUv.y);
}`
const fragmentSource = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uAtlas;
uniform float uOpacity;
void main() {
  float alpha = texture2D(uAtlas,vUv).a*uOpacity;
  gl_FragColor = vec4(alpha);
}`

/**
 * Captures animated foreground-hair coverage in stage coordinates.
 *
 * The owner calls render after Pixi resets its geometry and before Cubism
 * starts its draw loop. The pass restores the framebuffer and viewport;
 * Cubism then binds its own program, attributes, buffers, and blend state.
 * Atlas textures belong to Cubism and are never destroyed here. Recreate
 * this object after context loss; dispose it before destroying the model.
 */
export class FaceShadow {
  readonly texture: WebGLTexture
  private readonly framebuffer: WebGLFramebuffer
  private readonly program: WebGLProgram
  private readonly vertices: WebGLBuffer
  private readonly uvs: WebGLBuffer
  private readonly indices: WebGLBuffer
  private readonly transform: WebGLUniformLocation | null
  private readonly opacity: WebGLUniformLocation | null

  constructor(private readonly gl: WebGLRenderingContext, private readonly size = 512) {
    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    const program = gl.createProgram()
    const vertices = gl.createBuffer()
    const uvs = gl.createBuffer()
    const indices = gl.createBuffer()
    if (!texture || !framebuffer || !program || !vertices || !uvs || !indices) {
      gl.deleteTexture(texture)
      gl.deleteFramebuffer(framebuffer)
      gl.deleteProgram(program)
      gl.deleteBuffer(vertices)
      gl.deleteBuffer(uvs)
      gl.deleteBuffer(indices)
      throw new Error('Could not allocate the face shadow pass.')
    }
    this.texture = texture
    this.framebuffer = framebuffer
    this.program = program
    this.vertices = vertices
    this.uvs = uvs
    this.indices = indices
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
        const shader = gl.createShader(type)
        if (!shader)
          throw new Error('Could not allocate a face shadow shader.')
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const error = gl.getShaderInfoLog(shader)
          gl.deleteShader(shader)
          throw new Error(`Could not compile face shadow shader: ${error}`)
        }
        gl.attachShader(program, shader)
        gl.deleteShader(shader)
      }
      gl.bindAttribLocation(program, 0, 'aPosition')
      gl.bindAttribLocation(program, 1, 'aUv')
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`Could not link face shadow shader: ${gl.getProgramInfoLog(program)}`)
      this.transform = gl.getUniformLocation(program, 'uModelToStage')
      this.opacity = gl.getUniformLocation(program, 'uOpacity')
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    catch (error) {
      this.dispose()
      throw error
    }
    finally {
      gl.activeTexture(gl.TEXTURE0)
    }
  }

  /** Refreshes coverage from the current pose; an empty caster list clears it. */
  render(casters: readonly FaceShadowCaster[], modelToStage: Float32Array) {
    const gl = this.gl
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
    const viewport = gl.getParameter(gl.VIEWPORT)
    const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE)
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Face shadow framebuffer is incomplete.')
      gl.viewport(0, 0, this.size, this.size)
      gl.disable(gl.SCISSOR_TEST)
      gl.disable(gl.STENCIL_TEST)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.colorMask(true, true, true, true)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(this.program)
      gl.uniformMatrix3fv(this.transform, false, modelToStage)
      gl.uniform1i(gl.getUniformLocation(this.program, 'uAtlas'), 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.enableVertexAttribArray(0)
      gl.enableVertexAttribArray(1)
      for (const caster of casters) {
        if (caster.opacity <= 0 || !caster.texture)
          continue
        gl.bindTexture(gl.TEXTURE_2D, caster.texture)
        gl.uniform1f(this.opacity, caster.opacity)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices)
        gl.bufferData(gl.ARRAY_BUFFER, caster.vertices, gl.DYNAMIC_DRAW)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvs)
        gl.bufferData(gl.ARRAY_BUFFER, caster.uvs, gl.STREAM_DRAW)
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, caster.indices, gl.STREAM_DRAW)
        gl.drawElements(gl.TRIANGLES, caster.indices.length, gl.UNSIGNED_SHORT, 0)
      }
    }
    finally {
      gl.disableVertexAttribArray(0)
      gl.disableVertexAttribArray(1)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3])
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3])
    }
  }

  /** Releases this pass's GPU objects; atlas textures remain owned by Cubism. */
  dispose() {
    this.gl.deleteTexture(this.texture)
    this.gl.deleteFramebuffer(this.framebuffer)
    this.gl.deleteProgram(this.program)
    this.gl.deleteBuffer(this.vertices)
    this.gl.deleteBuffer(this.uvs)
    this.gl.deleteBuffer(this.indices)
  }
}
