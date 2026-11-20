import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { TerminalNotice } from '@proj-airi/stage-shared/terminal-approval'

import type { ElectronMcpCallToolPayload, ElectronMcpCallToolResult } from '../../../../shared/eventa'
import type { PendingActionManager } from '../computer-use/action-manager'
import type { InvocationAttribution } from '../computer-use/attribution'
import type { ComputerUseApprovalRequest } from '../computer-use/requests'
import type { createComputerUseRuntime } from '../computer-use/runtime'

import { useLogg } from '@guiiai/logg'
import { CallToolResultSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { errorMessageFrom } from '@moeru/std'
import { terminalDiscardMethod, terminalExecuteMethod, terminalNoticeText, terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'
import { z } from 'zod'

import * as v from 'valibot'

export interface TerminalApprovalOptions {
  actions: PendingActionManager
  present: (actionId: string) => Promise<boolean>
  executeInSlot: ReturnType<typeof createComputerUseRuntime>['executeInSlot']
  notify: (notice: TerminalNotice) => Promise<{ status: 'stored' | 'suppressed', sessionId: string, messageId: string }>
  presentComputerUse: (request: ComputerUseApprovalRequest, signal?: AbortSignal) => Promise<boolean>
}

interface TerminalConnection {
  client: Client
  serverName: string
  nonce: string
  pid: number | null
  bundledTerminal: boolean
  isCurrent: () => boolean
}

/**
 * Connects a prepared response to the existing Main action owner and private approval UI.
 * Manual approval returns preparation only. Terminal Turbo waits for the private commit and returns its result in the same tool call.
 */
export async function bindTerminalApproval(params: {
  options: TerminalApprovalOptions
  connection: TerminalConnection
  payload: ElectronMcpCallToolPayload
  attribution: InvocationAttribution
  result: ElectronMcpCallToolResult
}): Promise<ElectronMcpCallToolResult> {
  const { options, connection, payload, attribution } = params
  const snapshot = v.parse(terminalSnapshotSchema, params.result.structuredContent?.preparedTerminal)
  if (!connection.pid || connection.pid !== snapshot.executorPid || !connection.isCurrent())
    throw new Error('The prepared executor is not the captured direct stdio process.')
  if (!payload.requestId)
    throw new Error('Terminal approval requires the original Host request.')
  const action = options.actions.createTerminalAction({ requestId: payload.requestId, attribution, serverName: connection.serverName, snapshot, arguments: payload.arguments ?? {} })
  const actionId = action.id
  const turbo = connection.bundledTerminal
    ? options.actions.terminalTurboSignal(attribution.sessionId, attribution.senderWebContentsId)
    : undefined
  const log = useLogg('main/terminal-approval').useGlobalConfig()
  const trace = (event: string, detail: Record<string, unknown> = {}) => {
    log.withFields({ event, actionId, requestId: snapshot.requestId, sessionId: attribution.sessionId, turnId: attribution.turnId, toolCallId: attribution.toolCallId, senderWebContentsId: attribution.senderWebContentsId, ...detail }).log('Terminal approval')
  }
  trace('prepared', { snapshot })

  let noticeHandled: Promise<boolean> | undefined
  function resultForNotice(result: ElectronMcpCallToolResult | undefined): Record<string, unknown> | undefined {
    if (!result)
      return undefined
    return { content: result.content, structuredContent: result.structuredContent, isError: result.isError }
  }
  function createNotice(status: TerminalNotice['status'], result?: Record<string, unknown>, error?: string): TerminalNotice {
    return { actionId, requestId: snapshot.requestId, sessionId: attribution.sessionId, turnId: attribution.turnId!, toolCallId: snapshot.toolCallId, status, command: snapshot.command, effectiveCwd: snapshot.effectiveCwd, result, error }
  }
  function turboResult(status: TerminalNotice['status'], result?: ElectronMcpCallToolResult, error?: string): ElectronMcpCallToolResult {
    const notice = createNotice(status, resultForNotice(result), error)
    const notDispatched = result?.structuredContent?.executorInvoked === false || result?.structuredContent?.noNewDispatch === true
    const guidance = status === 'unknown'
      ? 'The Terminal result is unknown. Check current state before repeating any operation with the same effects.'
      : status === 'failed' && notDispatched
        ? 'The Terminal command was refused before dispatch. No command ran.'
        : status === 'failed'
          ? 'The Terminal command failed. Earlier effects can remain. Check current state before retrying.'
          : status === 'cancelled' || status === 'expired'
            ? 'The Terminal command did not run.'
            : undefined
    return {
      isError: status !== 'executed' || result?.isError,
      content: [{ type: 'text', text: [guidance, terminalNoticeText(notice, { includeOutcomeGuidance: false })].filter(Boolean).join('\n') }],
      structuredContent: { status, approval: 'turbo', hostActionId: actionId },
    }
  }
  function notify(status: TerminalNotice['status'], result?: Record<string, unknown>, error?: string) {
    // Turbo returns the settlement through the active tool call, so a second notice turn would interrupt the same task.
    if (turbo)
      return
    const notice = createNotice(status, result, error)
    trace('outcome_notice', { notice })
    noticeHandled = options.notify(notice).then((receipt) => {
      trace('notice_receipt', { receipt })
      return true
    }).catch((failure) => {
      trace('notice_unavailable', { error: errorMessageFrom(failure) })
      return false
    })
  }
  function notifyResult(status: TerminalNotice['status'], result: ElectronMcpCallToolResult | undefined, error?: string) {
    notify(status, resultForNotice(result), error)
  }

  async function discard() {
    if (connection.isCurrent())
      await connection.client.request({ method: terminalDiscardMethod, params: { nonce: connection.nonce, preparedId: snapshot.preparedId, requestId: snapshot.requestId } }, z.object({ discarded: z.boolean() }))
  }

  async function commit(lifetime: AbortSignal, retainMutationRisk: () => void): Promise<ElectronMcpCallToolResult | undefined> {
    lifetime.throwIfAborted()
    turbo?.throwIfAborted()
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
    function reportUnknown(error: string, result?: ElectronMcpCallToolResult): ElectronMcpCallToolResult {
      retainMutationRisk()
      trace('unknown', { error, result })
      notifyResult('unknown', result, error)
      if (turbo)
        return turboResult('unknown', result, error)
      if (result)
        return result
      return { isError: true, content: [{ type: 'text', text: error }], structuredContent: { executorInvoked: true, terminalLifecycle: 'unknown' } }
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
        notifyResult('failed', result)
        return turbo ? turboResult('failed', { ...result, isError: true }) : result
      }
      if (result.structuredContent?.terminalLifecycle !== 'closed') {
        const details = result.structuredContent
        const bound = details?.preparedId === committed.preparedId && details?.requestId === committed.requestId && details?.executorInvoked === true
        return reportUnknown('The executor did not confirm the end of its shell lifecycle.', bound ? result : undefined)
      }
      const backend = result.structuredContent.backendResult
      const terminal = v.safeParse(v.object({ exitCode: v.pipe(v.number(), v.integer()), timedOut: v.boolean() }), backend)
      if (!terminal.success) {
        const error = 'The shell closed without a complete command result.'
        options.actions.settle(actionId, { outcome: 'failed', executionState: 'unknown', error })
        trace('settled', { result })
        notifyResult('unknown', result, error)
        return turbo ? turboResult('unknown', result, error) : result
      }
      const { exitCode, timedOut } = terminal.output
      const succeeded = !result.isError && exitCode === 0 && !timedOut
      options.actions.settle(actionId, { outcome: succeeded ? 'success' : 'failed', executionState: 'executed', exitCode, error: succeeded ? undefined : JSON.stringify(result.content) })
      trace('settled', { result })
      notifyResult(succeeded ? 'executed' : 'failed', result)
      return turbo ? turboResult(succeeded ? 'executed' : 'failed', result) : result
    }
    catch (error) {
      // Only this bound private-connection proof retires a prepared operation without starting its executor.
      const refusal = error instanceof McpError ? v.safeParse(v.object({ ...refusalFields, executorInvoked: v.optional(v.literal(false)) }), error.data) : undefined
      if (refusal?.success) {
        options.actions.settle(actionId, { outcome: 'failed', executionState: 'not_executed', error: errorMessageFrom(error) ?? 'Executor refused before dispatch.' })
        trace('settled_without_executor_dispatch', { error: errorMessageFrom(error) })
        notify('failed', refusal.output, errorMessageFrom(error) ?? 'Executor refused before dispatch. No executor invocation was started by this request.')
        if (turbo) {
          return turboResult('failed', {
            isError: true,
            content: [{ type: 'text', text: errorMessageFrom(error) ?? 'The Terminal command was refused before dispatch.' }],
            structuredContent: { ...refusal.output, executorInvoked: false },
          }, errorMessageFrom(error))
        }
        return
      }
      return reportUnknown(errorMessageFrom(error) ?? 'The dispatched operation has no confirmed result.')
    }
  }

  async function execute(): Promise<ElectronMcpCallToolResult | undefined> {
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const approved = !!turbo || await options.present(actionId)
      const current = options.actions.get(actionId)
      if (!current)
        return turbo ? turboResult('cancelled', undefined, 'The Terminal action closed before dispatch.') : undefined
      if (current.status !== 'pending') {
        if (current.status === 'cancelled' || current.status === 'rejected' || current.status === 'expired')
          notify(current.status)
        return turbo && (current.status === 'cancelled' || current.status === 'expired')
          ? turboResult(current.status, undefined, 'The Terminal action stopped before dispatch.')
          : undefined
      }
      if (!approved) {
        options.actions.reject(actionId)
        trace('rejected')
        notify('rejected')
        return
      }
      options.actions.approve(actionId)
      trace('approved', { source: turbo ? 'turbo' : 'approval-window' })
      const requestSignal = options.actions.requestSignal(snapshot.requestId, attribution)
      const expiry = new AbortController()
      expiryTimer = setTimeout(() => expiry.abort(new Error('The Terminal approval expired while waiting for dispatch.')), Math.max(0, action.expiresAt - Date.now()))
      return await options.executeInSlot((lifetime, retainMutationRisk) => {
        // Cancellation and expiry only own admission. An invoked operation keeps its settlement.
        clearTimeout(expiryTimer)
        return commit(lifetime, retainMutationRisk)
      }, AbortSignal.any(turbo ? [requestSignal, expiry.signal, turbo] : [requestSignal, expiry.signal]))
    }
    catch (error) {
      const current = options.actions.get(actionId)
      if (current?.status === 'pending' || current?.status === 'approved')
        options.actions.cancel(actionId, errorMessageFrom(error) ?? 'Approval or dispatch stopped.')
      const stopped = options.actions.get(actionId)
      if (stopped?.status === 'cancelled' || stopped?.status === 'expired')
        notify(stopped.status, undefined, errorMessageFrom(error))
      trace('approval_or_dispatch_stopped', { error: errorMessageFrom(error) })
      if (turbo)
        return turboResult(stopped?.status === 'expired' ? 'expired' : 'cancelled', undefined, errorMessageFrom(error))
    }
    finally {
      clearTimeout(expiryTimer)
      const status = options.actions.get(actionId)?.status
      if (status === 'cancelled' || status === 'rejected' || status === 'expired')
        await discard()
    }
  }
  if (turbo) {
    return execute().catch((error) => {
      trace('turbo_result_unavailable', { error: errorMessageFrom(error) })
      return turboResult('unknown', undefined, errorMessageFrom(error))
    }).then((result) => {
      options.actions.finishTerminalAction(actionId)
      return result ?? turboResult('unknown', undefined, 'Terminal Turbo did not return a command result.')
    })
  }
  const prepared = {
    isError: params.result.isError,
    content: [{
      type: 'text',
      text: [
        'The Terminal command is awaiting approval in AIRI.',
        'This response confirms preparation only.',
        'Wait for the Host notice before repeating this operation or acting on its result.',
        'The notice arrives in a new turn of this conversation.',
        'If all remaining work depends on this result, finish the current reply.',
        'An empty MCP pending list does not prove that the command did not execute.',
      ].join(' '),
    }],
    structuredContent: { status: 'approval_required', approval: 'manual', hostActionId: actionId },
  }
  void execute().catch(error => trace('prepared_discard_failed', { error: errorMessageFrom(error) })).then(async () => {
    if (await noticeHandled)
      options.actions.finishTerminalAction(actionId)
  })
  return prepared
}
