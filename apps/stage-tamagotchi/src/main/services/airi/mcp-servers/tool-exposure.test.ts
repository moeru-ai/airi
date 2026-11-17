import { describe, expect, it } from 'vitest'

import { defaultBundledToolExposure } from './tool-exposure'

describe('defaultBundledToolExposure', () => {
  it('keeps stable Agent entrypoints direct', () => {
    expect(['computer_observe', 'computer_act', 'computer_verify', 'terminal_exec'].map(defaultBundledToolExposure)).toEqual(['direct', 'direct', 'direct', 'direct'])
  })
  it('keeps Host state and trace tools out of the model catalog', () => {
    expect(['desktop_list_pending_actions', 'desktop_get_session_trace', 'desktop_get_state', 'terminal_get_state', 'pty_get_status'].map(defaultBundledToolExposure)).toEqual(['disabled', 'disabled', 'disabled', 'disabled', 'disabled'])
  })
  it('routes unclassified bundled tools through the Router', () => {
    expect(defaultBundledToolExposure('desktop_click')).toBe('router-only')
    expect(defaultBundledToolExposure('pty_create')).toBe('router-only')
  })
})
