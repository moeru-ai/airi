import type { LaneHandoffContract } from './lane-handoff-contract'

import { requireOperationContract } from './operation-contracts'
import { requireVerificationContract } from './verification-contracts'

const terminalExecToPtyHandoffContract: LaneHandoffContract = Object.freeze({
  id: 'terminal_exec_to_pty',
  lane: 'terminal',
  sourceSurface: 'exec',
  targetSurface: 'pty',
  approvalScope: 'pty_session',
  verificationMethod: 'pty_binding',
  readiness: {
    ptyPath: 'bound_or_acquire' as const,
    allowLegacyReroute: true,
  },
  description: 'Handoff from one-shot exec surface to PTY surface for interactive terminal sessions.',
})

const terminalPtyToExecHandoffContract: LaneHandoffContract = Object.freeze({
  id: 'terminal_pty_to_exec',
  lane: 'terminal',
  sourceSurface: 'pty',
  targetSurface: 'exec',
  approvalScope: 'none',
  verificationMethod: 'none',
  readiness: {
    ptyPath: 'none' as const,
    allowLegacyReroute: true,
  },
  description: 'Handoff from PTY surface back to one-shot exec surface.',
})

const handoffContracts = new Map<string, LaneHandoffContract>([
  [buildTerminalKey(terminalExecToPtyHandoffContract.sourceSurface, terminalExecToPtyHandoffContract.targetSurface), terminalExecToPtyHandoffContract],
  [buildTerminalKey(terminalPtyToExecHandoffContract.sourceSurface, terminalPtyToExecHandoffContract.targetSurface), terminalPtyToExecHandoffContract],
])

function buildTerminalKey(sourceSurface: LaneHandoffContract['sourceSurface'], targetSurface: LaneHandoffContract['targetSurface']) {
  return `terminal:${sourceSurface ?? 'none'}->${targetSurface ?? 'none'}`
}

function assertLaneHandoffInvariants() {
  for (const contract of handoffContracts.values()) {
    if (contract.lane !== 'terminal') {
      continue
    }

    if (contract.sourceSurface === contract.targetSurface) {
      throw new Error(`Invalid lane handoff contract "${contract.id}": source and target surfaces must differ.`)
    }

    if (contract.targetSurface === 'pty') {
      const ptyCreateContract = requireOperationContract('pty_create')
      const ptyCreateVerificationContract = requireVerificationContract('pty_create')

      if (contract.approvalScope !== ptyCreateContract.approvalScope) {
        throw new Error(
          `Invalid lane handoff contract "${contract.id}": approval scope must match pty_create (${ptyCreateContract.approvalScope}).`,
        )
      }

      if (contract.verificationMethod !== ptyCreateVerificationContract.method) {
        throw new Error(
          `Invalid lane handoff contract "${contract.id}": verification method must match pty_create (${ptyCreateVerificationContract.method}).`,
        )
      }
    }
  }
}

assertLaneHandoffInvariants()

export function getLaneHandoffContract(params: {
  lane: LaneHandoffContract['lane']
  sourceSurface: LaneHandoffContract['sourceSurface']
  targetSurface: LaneHandoffContract['targetSurface']
}) {
  if (params.lane !== 'terminal') {
    return undefined
  }

  return handoffContracts.get(buildTerminalKey(params.sourceSurface, params.targetSurface))
}

export function requireLaneHandoffContract(params: {
  lane: LaneHandoffContract['lane']
  sourceSurface: LaneHandoffContract['sourceSurface']
  targetSurface: LaneHandoffContract['targetSurface']
}) {
  const contract = getLaneHandoffContract(params)
  if (!contract) {
    throw new Error(
      `Unknown lane handoff contract for ${params.lane}:${params.sourceSurface ?? 'none'}->${params.targetSurface ?? 'none'}.`,
    )
  }

  return contract
}

export function getAllLaneHandoffContracts() {
  return Array.from(handoffContracts.values())
}
