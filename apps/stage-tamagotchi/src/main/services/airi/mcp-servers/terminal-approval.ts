import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { TerminalNotice } from '@proj-airi/stage-shared/terminal-approval'

import type { ElectronMcpCallToolPayload, ElectronMcpCallToolResult } from '../../../../shared/eventa'
import type { PendingActionManager } from '../computer-use/action-manager'
import type { InvocationAttribution } from '../computer-use/attribution'

import { useLogg } from '@guiiai/logg'
import { CallToolResultSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { errorMessageFrom } from '@moeru/std'
import { terminalDiscardMethod, terminalExecuteMethod, terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'
import { z } from 'zod'

import * as v from 'valibot'

export interface TerminalApprovalOptions {
  actions: PendingActionManager
  present: (actionId: string) => Promise<boolean>
  executeInSlot: <T>(operation: (lifetime: AbortSignal) => Promise<T>) => Promise<T>
  notify: (notice: TerminalNotice) => Promise<{ status: 'stored' | 'suppressed', sessionId: string, messageId: string }>
}

interface TerminalConnection {
  client: Client
  serverName: string
  nonce: string
  pid: number | null
  isCurrent: () => boolean
}

/**
 * Connects a prepared response to the existing Main action owner and private approval UI.
 * The original tool call returns preparation only. Main consumes once before one private commit on the captured connection.
 */
export function bindTerminalApproval(params: {
  options: TerminalApprovalOptions
  connection: TerminalConnection
  payload: ElectronMcpCallToolPayload
  attribution: InvocationAttribution
  result: ElectronMcpCallToolResult
}): ElectronMcpCallToolResult {
  const { options, connection, payload, attribution } = params
  const snapshot = v.parse(terminalSnapshotSchema, params.result.structuredContent?.preparedTerminal)
  if (!connection.pid || connection.pid !== snapshot.executorPid || !connection.isCurrent())
    throw new Error('The prepared executor is not the captured direct stdio process.')
  if (!payload.requestId)
    throw new Error('Terminal approval requires the original Host request.')
  const action = options.actions.createTerminalAction({ requestId: payload.requestId, attribution, serverName: connection.serverName, snapshot, arguments: payload.arguments ?? {} })
  const actionId = action.id
  const log = useLogg('main/terminal-approval').useGlobalConfig()
  const trace = (event: string, detail: Record<string, unknown> = {}) => {
    log.withFields({ event, actionId, requestId: snapshot.requestId, sessionId: attribution.sessionId, turnId: attribution.turnId, toolCallId: attribution.toolCallId, senderWebContentsId: attribution.senderWebContentsId, ...detail }).log('Terminal approval')
  }
  trace('prepared', { snapshot })

  function notify(status: TerminalNotice['status'], result?: Record<string, unknown>, error?: string) {
    const notice: TerminalNotice = { actionId, requestId: snapshot.requestId, sessionId: attribution.sessionId, turnId: attribution.turnId!, toolCallId: snapshot.toolCallId, status, command: snapshot.command, effectiveCwd: snapshot.effectiveCwd, result, error }
    trace('outcome_notice', { notice })
    void options.notify(notice).then(receipt => trace('notice_receipt', { receipt })).catch(failure => trace('notice_unavailable', { error: errorMessageFrom(failure) }))
  }

  async function discard() {
    if (connection.isCurrent())
      await connection.client.request({ method: terminalDiscardMethod, params: { nonce: connection.nonce, preparedId: snapshot.preparedId, requestId: snapshot.requestId } }, z.object({ discarded: z.boolean() }))
  }

  async function execute() {
    const approved = await options.present(actionId)
    const current = options.actions.get(actionId)
    if (!current)
      return
    if (current.status !== 'pending') {
      if (current.status === 'cancelled' || current.status === 'rejected' || current.status === 'expired') {
        notify(current.status)
        await discard()
      }
      return
    }
    if (!approved) {
      options.actions.reject(actionId)
      trace('rejected')
      notify('rejected')
      await discard()
      return
    }
    options.actions.approve(actionId)
    trace('approved')
    await options.executeInSlot(async (lifetime) => {
      lifetime.throwIfAborted()
      if (!connection.isCurrent())
        throw new Error('The approved Terminal connection was replaced before dispatch.')
      const approved = options.actions.get(actionId)
      if (!approved?.terminal)
        throw new Error('The Terminal approval no longer exists.')
      const consumed = options.actions.consume(actionId, { argv: approved.argv, attribution, kind: 'terminal' })
      const committed = consumed.terminal?.snapshot
      if (!committed)
        throw new Error('The consumed operation has no Terminal snapshot.')
      const refusalFields = {
        noNewDispatch: v.literal(true),
        terminalLifecycle: v.literal('closed'),
        preparedId: v.literal(committed.preparedId),
        requestId: v.literal(committed.requestId),
      }
      trace('consumed', { expiresAt: consumed.expiresAt })
      try {
        const result = await connection.client.request({ method: terminalExecuteMethod, params: { nonce: connection.nonce, snapshot: committed, expiresAt: consumed.expiresAt } }, CallToolResultSchema, { signal: lifetime, timeout: committed.timeoutMs + 30_000, maxTotalTimeout: committed.timeoutMs + 30_000 })
        if (result.structuredContent?.noNewDispatch === true) {
          const refusal = v.safeParse(v.object({ ...refusalFields, executorInvoked: v.literal(false) }), result.structuredContent)
          if (!refusal.success)
            throw new Error('The executor refusal does not prove that this prepared operation closed without dispatch.')
          options.actions.settle(actionId, { outcome: 'failed', executionState: 'not_executed', error: JSON.stringify(result.content) })
          trace('settled_without_executor_dispatch', { result })
          notify('failed', result)
          return
        }
        if (result.structuredContent?.terminalLifecycle !== 'closed')
          throw new Error('The executor did not confirm the end of its direct shell lifecycle.')
        const backend = result.structuredContent.backendResult
        const terminal = v.safeParse(v.object({ exitCode: v.number(), timedOut: v.boolean() }), backend)
        const succeeded = !result.isError && terminal.success && terminal.output.exitCode === 0 && !terminal.output.timedOut
        options.actions.settle(actionId, { outcome: succeeded ? 'success' : 'failed', executionState: terminal.success ? 'executed' : 'unknown', exitCode: terminal.success ? terminal.output.exitCode : undefined, error: succeeded ? undefined : JSON.stringify(result.content) })
        trace('settled', { result })
        notify(succeeded ? 'executed' : 'failed', result)
      }
      catch (error) {
        // Only this bound private-connection proof retires a prepared operation without starting its executor.
        const refusal = error instanceof McpError ? v.safeParse(v.object({ ...refusalFields, executorInvoked: v.optional(v.literal(false)) }), error.data) : undefined
        if (refusal?.success) {
          options.actions.settle(actionId, { outcome: 'failed', executionState: 'not_executed', error: errorMessageFrom(error) ?? 'Executor refused before dispatch.' })
          trace('settled_without_executor_dispatch', { error: errorMessageFrom(error) })
          notify('failed', refusal.output, errorMessageFrom(error) ?? 'Executor refused before dispatch. No executor invocation was started by this request.')
          return
        }
        // A failed reply cannot free a live desktop slot. Shutdown stops future admission before it releases this wait.
        trace('unknown', { error: errorMessageFrom(error) })
        notify('unknown', undefined, errorMessageFrom(error) ?? 'The dispatched operation has no confirmed result.')
        lifetime.throwIfAborted()
        await new Promise<never>((_resolve, reject) => {
          lifetime.addEventListener('abort', () => reject(lifetime.reason ?? new Error('Host stopped with an unsettled Terminal operation.')), { once: true })
        })
      }
    })
  }
  void execute().catch((error) => {
    const current = options.actions.get(actionId)
    if (current?.status === 'pending' || current?.status === 'approved')
      options.actions.cancel(actionId, errorMessageFrom(error) ?? 'Approval or dispatch stopped.')
    const stopped = options.actions.get(actionId)
    if (stopped?.status === 'cancelled' || stopped?.status === 'expired')
      notify(stopped.status, undefined, errorMessageFrom(error))
    trace('approval_or_dispatch_stopped', { error: errorMessageFrom(error) })
  })
  return {
    ...params.result,
    content: [...(params.result.content ?? []), {
      type: 'text',
      text: 'This response confirms preparation only. AIRI manages approval. It does not confirm execution or business success. Execution outcomes arrive through a Host notice in a new turn of this conversation. If approval is pending, finish this turn and wait for that notice. An empty MCP pending list does not prove that the command did not execute.',
    }],
    structuredContent: { ...params.result.structuredContent, hostActionId: actionId },
  }
}
