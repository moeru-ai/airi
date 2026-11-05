import type { FaceShadowCaster } from './face-shadow'

import { Application } from '@pixi/app'
import { BatchRenderer } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { TickerPlugin } from '@pixi/ticker'
import { describe, expect, it } from 'vitest'

import { FaceShadow } from './face-shadow'

extensions.add(BatchRenderer, TickerPlugin)

describe('animated face shadow coverage', () => {
  it('follows current vertices and atlas alpha, then clears hidden hair', () => {
    const app = new Application({ width: 32, height: 32, autoStart: false, backgroundAlpha: 0 })
    const gl = app.renderer.gl
    const atlas = gl.createTexture()!
    const readback = gl.createFramebuffer()!
    gl.bindTexture(gl.TEXTURE_2D, atlas)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const shadow = new FaceShadow(gl, 32)
    const caster: FaceShadowCaster = {
      vertices: new Float32Array([0, 0, 0.5, 0, 0.5, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      texture: atlas,
      opacity: 1,
    }
    const transform = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    const pixels = new Uint8Array(32 * 32 * 4)
    function capture() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(2, 3, 27, 25)
      shadow.render([caster], transform)
      expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBeNull()
      expect(Array.from(gl.getParameter(gl.VIEWPORT))).toEqual([2, 3, 27, 25])
      gl.bindFramebuffer(gl.FRAMEBUFFER, readback)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadow.texture, 0)
      gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      expect(gl.getError()).toBe(0)
      return (x: number) => pixels[(16 * 32 + x) * 4]
    }
    try {
      let at = capture()
      expect(at(4)).toBe(255)
      expect(at(12)).toBe(0)
      // Move the existing buffer, as Cubism does during hair deformation.
      for (let i = 0; i < caster.vertices.length; i += 2) caster.vertices[i] += 0.5
      at = capture()
      expect(at(4)).toBe(0)
      expect(at(20)).toBe(255)
      expect(at(28)).toBe(0)
      caster.opacity = 0.5
      at = capture()
      expect(at(20)).toBeCloseTo(128, 0)
      caster.opacity = 0
      at = capture()
      expect(at(20)).toBe(0)
    }
    finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      shadow.dispose()
      gl.deleteFramebuffer(readback)
      gl.deleteTexture(atlas)
      app.destroy(true)
    }
  })
})
