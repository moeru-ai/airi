import * as v from 'valibot'

/** Server name reserved by Electron Main for the bundled Terminal. */
export const bundledTerminalServerName = 'airi-terminal'

/** Private requests on a Main-managed stdio connection. These methods are never registered in the model tool catalog. */
export const terminalExecuteMethod = 'airi/terminal/execute-prepared'
export const terminalDiscardMethod = 'airi/terminal/discard-prepared'
/** Private Main-owned Computer Use approval methods. Public MCP callers cannot reach them. */
export const computerUseApprovalExecuteMethod = 'airi/computer-use/execute-prepared'
export const computerUseApprovalRejectMethod = 'airi/computer-use/reject-prepared'
export const terminalControlNonceEnv = 'AIRI_HOST_TERMINAL_NONCE'
export const terminalControlEnabledEnv = 'AIRI_TRUSTED_TERMINAL'
export const computerUseControlNonceEnv = 'AIRI_HOST_COMPUTER_USE_NONCE'
export const computerUseControlEnabledEnv = 'AIRI_TRUSTED_COMPUTER_USE'

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

export const computerUseApprovalRequestSchema = v.strictObject({
  nonce: v.pipe(v.string(), v.minLength(32)),
  pendingActionId: v.pipe(v.string(), v.minLength(1)),
  toolName: v.pipe(v.string(), v.minLength(1)),
  actionKind: v.pipe(v.string(), v.minLength(1)),
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

/**
 * Projects a Terminal receipt for the model. The Host retains the original report.
 *
 * @param options.includeOutcomeGuidance Defaults to `true`. Set to `false` when the report returns inside an active tool call.
 */
export function terminalNoticeText(notice: TerminalNotice, options: { includeOutcomeGuidance?: boolean } = {}) {
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
  const report = JSON.stringify({ ...notice, result: projected })
  return options.includeOutcomeGuidance === false ? report : `${facts}\n${report}`
}
