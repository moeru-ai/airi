import { describe, expect, it } from 'vitest'

import {
  getAllLaneHandoffContracts,
  getLaneHandoffContract,
  requireLaneHandoffContract,
} from './lane-handoff-registry'

describe('lane handoff registry', () => {
  it('resolves terminal exec->pty contract', () => {
    const contract = requireLaneHandoffContract({
      lane: 'terminal',
      sourceSurface: 'exec',
      targetSurface: 'pty',
    })

    expect(contract).toMatchObject({
      id: 'terminal_exec_to_pty',
      lane: 'terminal',
      approvalScope: 'pty_session',
      verificationMethod: 'pty_binding',
      readiness: {
        ptyPath: 'bound_or_acquire',
        allowLegacyReroute: true,
      },
    })
  })

  it('returns undefined for non-terminal lane lookup', () => {
    const contract = getLaneHandoffContract({
      lane: 'browser',
      sourceSurface: 'exec',
      targetSurface: 'pty',
    })

    expect(contract).toBeUndefined()
  })

  it('fails closed on missing contract', () => {
    expect(() => requireLaneHandoffContract({
      lane: 'terminal',
      sourceSurface: 'exec',
      targetSurface: 'vscode',
    })).toThrow(/Unknown lane handoff contract/)
  })

  it('exposes all currently registered contracts', () => {
    const ids = getAllLaneHandoffContracts().map(contract => contract.id)

    expect(ids).toContain('terminal_exec_to_pty')
    expect(ids).toContain('terminal_pty_to_exec')
  })
})
