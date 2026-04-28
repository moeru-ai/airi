import { describe, expect, it } from 'vitest'

import {
  buildMacOSMoveAndClickScript,
  buildMacOSPressKeysScript,
  buildMacOSScrollScript,
  buildMacOSTypeTextScript,
} from './macos-local'

describe('macOS local Swift cursor restore contract', () => {
  it('leaves desktop_click cursor at the action target for pointer-relative follow-up actions', () => {
    const script = buildMacOSMoveAndClickScript()

    expect(script).not.toContain('let originalCursorLocation = CGEvent(source: nil)?.location')
    expect(script).not.toContain('CGWarpMouseCursorPosition')
    expect(script).toContain('for point in trace')
  })

  it('leaves coordinate-based desktop_scroll cursor at the target for pointer-relative follow-up actions', () => {
    const script = buildMacOSScrollScript()

    expect(script).not.toContain('let shouldRestoreCursor = x != nil && y != nil')
    expect(script).not.toContain('CGWarpMouseCursorPosition')
    expect(script).toContain('if let x, let y {')
    expect(script).toContain('scrollEvent.post(tap: .cghidEventTap)')
  })

  it('does not warp the cursor for keyboard-only text and key-chord scripts', () => {
    expect(buildMacOSTypeTextScript()).not.toContain('CGWarpMouseCursorPosition')
    expect(buildMacOSPressKeysScript(36, '[]')).not.toContain('CGWarpMouseCursorPosition')
  })
})
