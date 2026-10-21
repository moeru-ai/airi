import { beforeEach, describe, expect, it, vi } from 'vitest'

import { shouldOpenDevTools } from './devtools'

const mockedIs = vi.hoisted(() => ({ dev: false }))

vi.mock(import('@electron-toolkit/utils'), () => ({ is: mockedIs }))

describe('shouldOpenDevTools', () => {
  beforeEach(() => {
    mockedIs.dev = false
    delete process.env.APP_DEBUG
    delete process.env.MAIN_APP_DEBUG
  })

  it('opens DevTools in development mode', () => {
    mockedIs.dev = true
    expect(shouldOpenDevTools()).toBe(true)
  })

  it('opens DevTools when a debug flag is 1', () => {
    process.env.APP_DEBUG = '1'
    expect(shouldOpenDevTools()).toBe(true)
  })

  it('disables DevTools when a debug flag is 0', () => {
    mockedIs.dev = true
    process.env.APP_DEBUG = '0'
    expect(shouldOpenDevTools()).toBe(false)

    mockedIs.dev = true
    process.env.MAIN_APP_DEBUG = '0'
    expect(shouldOpenDevTools()).toBe(false)
  })

  it('lets an explicit 0 win over the other enabled flag', () => {
    process.env.APP_DEBUG = '1'
    process.env.MAIN_APP_DEBUG = '0'
    expect(shouldOpenDevTools()).toBe(false)

    process.env.APP_DEBUG = '0'
    process.env.MAIN_APP_DEBUG = '1'
    expect(shouldOpenDevTools()).toBe(false)
  })
})
