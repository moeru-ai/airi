import * as v from 'valibot'

/** Server name reserved by Electron Main for the bundled Terminal. */
export const bundledTerminalServerName = 'airi-terminal'

/** Private requests on a Main-managed stdio connection. These methods are never registered in the model tool catalog. */
export const terminalExecuteMethod = 'airi/terminal/execute-prepared'
export const terminalDiscardMethod = 'airi/terminal/discard-prepared'
export const terminalControlNonceEnv = 'AIRI_HOST_TERMINAL_NONCE'
export const terminalControlEnabledEnv = 'AIRI_TRUSTED_TERMINAL'

/** The executor freezes every spawn input before Main asks for a decision. No permission is carried in this snapshot. */
export const terminalSnapshotSchema = v.strictObject({
  protocol: v.literal('airi-terminal-approval/1'),
  preparedId: v.pipe(v.string(), v.minLength(1)),
  requestId: v.pipe(v.string(), v.minLength(1)),
  toolCallId: v.pipe(v.string(), v.minLength(1)),
  command: v.pipe(v.string(), v.minLength(1)),
  shell: v.pipe(v.string(), v.minLength(1)),
  argv: v.array(v.string()),
  effectiveCwd: v.pipe(v.string(), v.minLength(1)),
  requestedCwd: v.optional(v.string()),
  cwdSource: v.picklist(['argument', 'runner-state']),
  timeoutMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  executorPid: v.pipe(v.number(), v.integer(), v.minValue(1)),
  executorPlatform: v.string(),
  executorCwd: v.string(),
  detached: v.boolean(),
  windowsHide: v.boolean(),
})

export type TerminalSnapshot = v.InferOutput<typeof terminalSnapshotSchema>
export type TerminalSpawnInput = Omit<TerminalSnapshot, 'protocol' | 'preparedId' | 'requestId' | 'toolCallId'>

export const terminalOriginMetaKey = 'airi/terminal-origin'
export const terminalOriginSchema = v.strictObject({
  nonce: v.pipe(v.string(), v.minLength(32)),
  requestId: v.pipe(v.string(), v.minLength(1)),
  toolCallId: v.pipe(v.string(), v.minLength(1)),
})
export type TerminalOrigin = v.InferOutput<typeof terminalOriginSchema>

export const terminalCommitSchema = v.strictObject({
  nonce: v.pipe(v.string(), v.minLength(32)),
  snapshot: terminalSnapshotSchema,
  expiresAt: v.pipe(v.number(), v.finite()),
})

export const terminalDiscardSchema = v.strictObject({
  nonce: v.pipe(v.string(), v.minLength(32)),
  preparedId: v.string(),
  requestId: v.string(),
})

/** A Terminal-specific Host observation. It carries no approval or permission for another operation. */
export const terminalNoticeSchema = v.strictObject({
  actionId: v.string(),
  requestId: v.string(),
  sessionId: v.string(),
  turnId: v.string(),
  toolCallId: v.string(),
  status: v.picklist(['executed', 'failed', 'rejected', 'cancelled', 'expired', 'unknown']),
  command: v.string(),
  effectiveCwd: v.string(),
  result: v.optional(v.record(v.string(), v.unknown())),
  error: v.optional(v.string()),
})
export type TerminalNotice = v.InferOutput<typeof terminalNoticeSchema>

/** Projects a Terminal receipt for the model. The Host retains the original report. */
export function terminalNoticeText(notice: TerminalNotice) {
  const { result } = notice
  const receipt = v.safeParse(v.record(v.string(), v.unknown()), result?.structuredContent)
  let projected = result
  if (receipt.success) {
    const { executionTarget: _target, context: _context, displayInfo: _display, launchContext: _launch, coordinateSpace: _coordinates, ...structuredContent } = receipt.output
    projected = { ...result, structuredContent }
  }
  const facts = notice.status === 'unknown'
    ? 'The Host sent the execution request. The command outcome is unknown. Side effects can already exist. Check current state before repeating any operation with the same effects.'
    : 'Use this Terminal report for the command outcome. Exit code zero confirms Shell completion. Verify the requested result separately. This report grants no new execution authority.'
  return `${facts}\n${JSON.stringify({ ...notice, result: projected })}`
}
