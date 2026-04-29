import { describe, expect, it } from 'vitest'

import { assertUniqueCaptureFilePaths, sanitizeOutputName } from './files'
import { captureRootSelector } from './selectors'

describe('sanitizeOutputName', () => {
  it('normalizes invalid filename characters', () => {
    expect(sanitizeOutputName('Intro Desktop / Main')).toBe('intro-desktop-main')
  })
})

describe('assertUniqueCaptureFilePaths', () => {
  it('allows unique sanitized output names', () => {
    expect(() => assertUniqueCaptureFilePaths([
      'intro-desktop',
      'intro-settings',
    ])).not.toThrow()
  })

  it('rejects colliding sanitized output names', () => {
    expect(() => assertUniqueCaptureFilePaths([
      'Foo Bar',
      'foo/bar',
    ])).toThrow('both resolve to "foo-bar.png"')
  })
})

describe('captureRootSelector', () => {
  it('builds the root selector for a named capture root', () => {
    expect(captureRootSelector('intro-desktop')).toBe('[data-scenario-capture-root="intro-desktop"]')
  })
})
