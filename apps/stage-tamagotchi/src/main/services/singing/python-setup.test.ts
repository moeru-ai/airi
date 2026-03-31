import { describe, expect, it } from 'vitest'

import {
  buildDesktopSingingVerifyScriptLines,
  resolveDesktopSingingVenvSetupMode,
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
