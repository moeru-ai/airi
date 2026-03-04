import { describe, expect, it, vi } from 'vitest'

import { withHashRoute } from './location'

vi.mock(import('@electron-toolkit/utils'), () => {
  return {
    is: {
      dev: true,
    },
  }
})

describe('withHashRoute', () => {
  it('should use string url construct URL with hash route correctly', () => {
    const result = withHashRoute('http://localhost:5173', '/test/inner-test')
    expect(result).toEqual({ url: 'http://localhost:5173/#/test/inner-test' })
  })

  it('should use object url construct URL with hash route correctly', () => {
    const result = withHashRoute({ url: 'http://localhost:5173' }, '/test/inner-test')
    expect(result).toEqual({ url: 'http://localhost:5173/#/test/inner-test' })
  })

  it('should use file url construct URL with hash route correctly', () => {
    const result = withHashRoute({ url: 'file:////home/workspace/project/index.html' }, '/test/inner-test')
    expect(result).toEqual({ url: `file:////home/workspace/project/index.html#/test/inner-test` })
  })
})
