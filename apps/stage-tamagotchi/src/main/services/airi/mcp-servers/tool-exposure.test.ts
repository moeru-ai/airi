import { describe, expect, it } from 'vitest'

import { defaultBundledToolExposure } from './tool-exposure'

describe('defaultBundledToolExposure', () => {
  it('keeps stable Agent entrypoints direct', () => {
    expect(['computer_observe', 'computer_act', 'computer_verify', 'terminal_exec'].map(defaultBundledToolExposure)).toEqual(['direct', 'direct', 'direct', 'direct'])
  })
  it('keeps low-level bundled tools out of the model catalog', () => {
    for (const name of ['desktop_click', 'desktop_observe', 'desktop_get_capabilities', 'pty_create', 'workflow_run_tests']) {
      expect(defaultBundledToolExposure(name)).toBe('disabled')
    }
  })
})
