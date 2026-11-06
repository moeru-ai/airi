import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { terminalCommitSchema, terminalDiscardMethod, terminalDiscardSchema, terminalExecuteMethod } from '@proj-airi/stage-shared/terminal-approval'
import { z } from 'zod'

import * as v from 'valibot'

/**
 * Receives private requests on the controlling stdio connection. Prepared records freeze execution, not human authority.
 * Main owns the decision. Public tools cannot reach these methods, and no request can consume a prepared record twice.
 */
export function registerTerminalApproval(server: McpServer, runtime: ComputerUseServerRuntime, executeAction: ExecuteAction) {
  server.server.setRequestHandler(z.object({ method: z.literal(terminalExecuteMethod), params: z.unknown() }), async (request, extra) => {
    const params = v.parse(terminalCommitSchema, request.params)
    const { snapshot } = params
    const refused = (message: string, retired = false) => new McpError(ErrorCode.InvalidParams, message, {
      noNewDispatch: true,
      terminalLifecycle: retired ? 'closed' : 'unknown',
      preparedId: snapshot.preparedId,
      requestId: snapshot.requestId,
    })
    if (!runtime.terminalControlNonce || params.nonce !== runtime.terminalControlNonce)
      throw refused('This connection has no matching Host Terminal authority.')
    const pending = runtime.session.getPendingAction(snapshot.preparedId)
    if (!pending?.preparedTerminal || pending.action.kind !== 'terminal_exec')
      throw refused('The prepared Terminal operation is missing or was consumed.')
    if (JSON.stringify(pending.preparedTerminal) !== JSON.stringify(snapshot))
      throw refused('The prepared Terminal snapshot does not match.')
    if (extra.signal.aborted || Date.now() >= params.expiresAt) {
      runtime.session.removePendingAction(pending.id)
      runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
      throw refused('Host authorization expired or its control request was cancelled before executor dispatch.', true)
    }
    const startPrepared = runtime.terminalRunner.startPrepared
    if (!startPrepared)
      throw refused('The Terminal executor has no prepared execution capability.')

    let executorInvoked = false
    let closed = false
    let retired = false
    const result = await executeAction(pending.action, pending.toolName, {
      skipApprovalQueue: true,
      terminalExecution: () => {
        if (extra.signal.aborted || runtime.session.getPendingAction(pending.id) !== pending || Date.now() >= params.expiresAt)
          throw refused('The prepared operation was cancelled, consumed or expired before executor dispatch.')
        // These checks, record consumption and executor invocation share one synchronous turn.
        runtime.session.removePendingAction(pending.id)
        executorInvoked = true
        const execution = startPrepared(snapshot)
        return {
          result: execution.result,
          closed: execution.closed.then(() => { closed = true }),
        }
      },
    })
    if (runtime.session.getPendingAction(pending.id) === pending) {
      runtime.session.removePendingAction(pending.id)
      retired = true
    }
    runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
    return {
      ...result,
      structuredContent: {
        ...result.structuredContent,
        preparedId: snapshot.preparedId,
        requestId: snapshot.requestId,
        executorInvoked,
        noNewDispatch: !executorInvoked,
        terminalLifecycle: closed || retired ? 'closed' : 'unknown',
      },
    }
  })

  server.server.setRequestHandler(z.object({ method: z.literal(terminalDiscardMethod), params: z.unknown() }), (request) => {
    const params = v.parse(terminalDiscardSchema, request.params)
    if (!runtime.terminalControlNonce || params.nonce !== runtime.terminalControlNonce)
      throw new McpError(ErrorCode.InvalidParams, 'This connection has no matching Host Terminal authority.')
    const pending = runtime.session.getPendingAction(params.preparedId)
    const discarded = pending?.preparedTerminal?.requestId === params.requestId
    if (discarded)
      runtime.session.removePendingAction(pending.id)
    runtime.stateManager.setPendingApprovalCount(runtime.session.listPendingActions().length)
    return Promise.resolve({ discarded })
  })
}
