import { describe, expect, it } from 'vitest'

import {
  buildDesktopSingingVerifyScriptLines,
  isDesktopSingingSupportedPythonVersion,
  resolveDesktopSingingVenvSetupMode,
  resolvePreferredDesktopSingingPythonMinor,
} from './python-setup'

describe('resolveDesktopSingingVenvSetupMode', () => {
  it('creates a new venv when none exists', () => {
    expect(resolveDesktopSingingVenvSetupMode(false, false)).toBe('create')
  })

  it('rebuilds a partial venv when the interpreter binary is missing', () => {
    expect(resolveDesktopSingingVenvSetupMode(true, false)).toBe('recreate')
  })

  it('reuses a healthy venv when the interpreter is present', () => {
    expect(resolveDesktopSingingVenvSetupMode(true, true)).toBe('reuse')
  })

  it('rebuilds an existing venv when its interpreter version is unsupported', () => {
    expect(resolveDesktopSingingVenvSetupMode(true, true, false)).toBe('recreate')
  })
})

describe('desktop singing python version support', () => {
  it('accepts Python 3.10-3.12 and rejects 3.13+', () => {
    expect(isDesktopSingingSupportedPythonVersion('3.10.20')).toBe(true)
    expect(isDesktopSingingSupportedPythonVersion('3.11.15')).toBe(true)
    expect(isDesktopSingingSupportedPythonVersion('3.12.3')).toBe(true)
    expect(isDesktopSingingSupportedPythonVersion('3.13.0')).toBe(false)
    expect(isDesktopSingingSupportedPythonVersion('3.14.2')).toBe(false)
  })

  it('prefers the oldest compatible interpreter minor for the legacy ML stack', () => {
    expect(resolvePreferredDesktopSingingPythonMinor(['3.13.3', '3.11.15', '3.10.20'])).toBe('3.10')
    expect(resolvePreferredDesktopSingingPythonMinor(['3.11.15'])).toBe('3.11')
    expect(resolvePreferredDesktopSingingPythonMinor(['3.13.3'])).toBeNull()
  })
})

describe('buildDesktopSingingVerifyScriptLines', () => {
  it('treats every non-import dependency exception as a verification failure', () => {
    const lines = buildDesktopSingingVerifyScriptLines([
      { id: 'torch', stmt: 'import torch' },
    ]).join('\n')

    expect(lines).toContain('except Exception as e:')
    expect(lines).toContain('FAILED ({type(e).__name__}: {e})')
    expect(lines).toContain('ok = False')
    expect(lines).not.toContain('ok (non-import warning ignored)')
  })
})
