import * as v from 'valibot'

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
