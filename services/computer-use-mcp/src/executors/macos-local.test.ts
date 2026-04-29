import { describe, expect, it } from 'vitest'

import { moveAndClickScript } from './macos-local'

describe('moveAndClickScript', () => {
  it('saves and restores the real macOS cursor around CGEvent clicks', () => {
    const source = moveAndClickScript()

    const saveCursorIndex = source.indexOf('let originalCursorLocation = CGEvent(source: nil)?.location')
    const restoreCursorIndex = source.indexOf('CGWarpMouseCursorPosition(savedCursorLocation)')
    const moveTraceIndex = source.indexOf('for point in trace')
    const clickIndex = source.indexOf('down.post(tap: .cghidEventTap)')

    expect(saveCursorIndex).toBeGreaterThanOrEqual(0)
    expect(restoreCursorIndex).toBeGreaterThanOrEqual(0)
    expect(moveTraceIndex).toBeGreaterThanOrEqual(0)
    expect(clickIndex).toBeGreaterThanOrEqual(0)
    expect(saveCursorIndex).toBeLessThan(moveTraceIndex)
    expect(restoreCursorIndex).toBeLessThan(moveTraceIndex)
    expect(restoreCursorIndex).toBeLessThan(clickIndex)
    expect(source).toContain('defer {')
  })
})
