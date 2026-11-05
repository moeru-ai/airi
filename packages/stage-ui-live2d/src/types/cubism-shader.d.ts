import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

// The installed 0.4.0 bundle exports these SDK symbols from cubism4.es.js, but
// its bundled declarations omit them. Complete that export boundary here.
// All existing renderer/model contracts remain owned by the package's types.
declare module 'pixi-live2d-display/cubism4' {
  export const fragmentShaderSrcsetupMask: string
  export class CubismShader_WebGL {
    static getInstance(): CubismShader_WebGL
    loadShaderProgram(vertex: string, fragment: string): WebGLProgram
    setupShaderProgram(
      renderer: Cubism4InternalModel['renderer'],
      texture: WebGLTexture | null,
      vertexCount: number,
      vertices: Float32Array,
      indices: Uint16Array,
      uvs: Float32Array,
      buffers: Cubism4InternalModel['renderer']['_bufferData'],
      opacity: number,
      blend: number,
      color: ReturnType<Cubism4InternalModel['renderer']['getModelColor']>,
      premultiplied: boolean,
      matrix: ReturnType<Cubism4InternalModel['renderer']['getMvpMatrix']>,
      inverted: boolean,
    ): void
  }
}
