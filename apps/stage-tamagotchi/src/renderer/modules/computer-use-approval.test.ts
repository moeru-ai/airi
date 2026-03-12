import { describe, expect, it } from 'vitest'

import {
  canAutoApproveComputerUseAction,
  getSessionScopedApprovalGrantScope,
  patchComputerUseTerminalStateWithGrant,
} from './computer-use-approval'

describe('computer-use approval helpers', () => {
  describe('getSessionScopedApprovalGrantScope', () => {
    it('maps terminal/app actions to terminal_and_apps', () => {
      expect(getSessionScopedApprovalGrantScope('terminal_exec')).toBe('terminal_and_apps')
      expect(getSessionScopedApprovalGrantScope('open_app')).toBe('terminal_and_apps')
      expect(getSessionScopedApprovalGrantScope('focus_app')).toBe('terminal_and_apps')
    })

    it('maps pty_create to pty_session', () => {
      expect(getSessionScopedApprovalGrantScope('pty_create')).toBe('pty_session')
    })

    it('does not assign a session-scoped grant to other actions', () => {
      expect(getSessionScopedApprovalGrantScope('pty_send_input')).toBeUndefined()
      expect(getSessionScopedApprovalGrantScope('click')).toBeUndefined()
      expect(getSessionScopedApprovalGrantScope(undefined)).toBeUndefined()
    })
  })

  describe('canAutoApproveComputerUseAction', () => {
    it('keeps terminal_and_apps auto-approval behavior', () => {
      expect(canAutoApproveComputerUseAction('terminal_exec', { scope: 'terminal_and_apps' })).toBe(true)
      expect(canAutoApproveComputerUseAction('focus_app', { scope: 'terminal_and_apps' })).toBe(true)
    })

    it('does not auto-approve new PTY creation from an existing pty_session grant', () => {
      expect(canAutoApproveComputerUseAction('pty_create', { scope: 'pty_session' })).toBe(false)
    })

    it('does not cross scopes', () => {
      expect(canAutoApproveComputerUseAction('terminal_exec', { scope: 'pty_session' })).toBe(false)
      expect(canAutoApproveComputerUseAction('pty_create', { scope: 'terminal_and_apps' })).toBe(false)
    })
  })

  describe('patchComputerUseTerminalStateWithGrant', () => {
    it('patches approval state using the actual grant scope', () => {
      const result = patchComputerUseTerminalStateWithGrant({
        structuredContent: {
          terminalState: {
            effectiveCwd: '/tmp',
            approvalSessionActive: false,
          },
        },
      }, { scope: 'pty_session' })

      expect(result.structuredContent.terminalState.approvalSessionActive).toBe(true)
      expect(result.structuredContent.terminalState.approvalGrantedScope).toBe('pty_session')
    })

    it('leaves non-terminal payloads unchanged', () => {
      const result = { structuredContent: { status: 'ok' } }
      expect(patchComputerUseTerminalStateWithGrant(result, { scope: 'terminal_and_apps' })).toEqual(result)
    })
  })
})
