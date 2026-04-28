import { describe, expect, it } from 'vitest'

import {
  buildMacOSMoveAndClickScript,
  buildMacOSPressKeysScript,
  buildMacOSScrollScript,
  buildMacOSTypeTextScript,
} from './macos-local'

function tokenIndex(script: string, token: string): number {
  const index = script.indexOf(token)
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

function expectTokenBefore(script: string, earlier: string, later: string): void {
  expect(tokenIndex(script, earlier)).toBeLessThan(tokenIndex(script, later))
}

describe('macOS local Swift cursor restore contract', () => {
  it('registers cursor restore before desktop_click moves the real pointer', () => {
    const script = buildMacOSMoveAndClickScript()

    expect(script).toContain('let originalCursorLocation = CGEvent(source: nil)?.location')
    expect(script).toContain('defer {')
    expect(script).toContain('CGWarpMouseCursorPosition(originalCursorLocation)')
    expectTokenBefore(script, 'let originalCursorLocation = CGEvent(source: nil)?.location', 'for point in trace')
    expectTokenBefore(script, 'defer {', 'for point in trace')
  })

  it('registers cursor restore before coordinate-based desktop_scroll moves the real pointer', () => {
    const script = buildMacOSScrollScript()

    expect(script).toContain('let shouldRestoreCursor = x != nil && y != nil')
    expect(script).toContain('let originalCursorLocation = shouldRestoreCursor ? CGEvent(source: nil)?.location : nil')
    expect(script).toContain('defer {')
    expect(script).toContain('CGWarpMouseCursorPosition(originalCursorLocation)')
    expectTokenBefore(script, 'let originalCursorLocation = shouldRestoreCursor ? CGEvent(source: nil)?.location : nil', 'if let x, let y {')
    expectTokenBefore(script, 'defer {', 'if let x, let y {')
    expectTokenBefore(script, 'defer {', 'scrollEvent.post(tap: .cghidEventTap)')
  })

  it('does not warp the cursor for keyboard-only text and key-chord scripts', () => {
    expect(buildMacOSTypeTextScript()).not.toContain('CGWarpMouseCursorPosition')
    expect(buildMacOSPressKeysScript(36, '[]')).not.toContain('CGWarpMouseCursorPosition')
  })
})
