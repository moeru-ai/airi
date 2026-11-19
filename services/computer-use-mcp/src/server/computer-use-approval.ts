import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ExecuteAction } from './action-executor'
import type { ComputerUseServerRuntime } from './runtime'

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { computerUseApprovalExecuteMethod, computerUseApprovalRejectMethod, computerUseApprovalRequestSchema } from '@proj-airi/stage-shared/terminal-approval'
import { z } from 'zod'

import * as v from 'valibot'

import { resolvePendingAction } from './register-tools'

/**
 * Lets the Electron Host commit one pending Computer Use action after its own approval.
 * Public MCP tools never receive this private request.
 */
export function registerComputerUseApproval(server: McpServer, runtime: ComputerUseServerRuntime, executeAction: ExecuteAction) {
  const handle = async (request: { params: unknown }, extra: { signal: AbortSignal }, approve: boolean) => {
    const params = v.parse(computerUseApprovalRequestSchema, request.params)
    if (!runtime.computerUseControlNonce || params.nonce !== runtime.computerUseControlNonce)
      throw new McpError(ErrorCode.InvalidParams, 'Computer Use Host approval does not match this connection.')

    const pending = runtime.session.getPendingAction(params.pendingActionId)
    if (!pending)
      throw new McpError(ErrorCode.InvalidParams, 'The Computer Use approval is missing or was already consumed.')
    if (pending.action.kind === 'terminal_exec')
      throw new McpError(ErrorCode.InvalidParams, 'Terminal actions use the Terminal approval protocol.')
    if (pending.toolName !== params.toolName || pending.action.kind !== params.actionKind)
      throw new McpError(ErrorCode.InvalidParams, 'The Computer Use approval does not match the prepared action.')
    const result = await resolvePendingAction({
      runtime,
      executeAction,
      id: pending.id,
      decision: approve
        ? { type: 'approve', source: 'host-approval-window', signal: extra.signal }
        : { type: 'reject', source: 'host-approval-window', reason: 'Rejected in the Host approval window' },
    })
    return {
      ...result,
      structuredContent: {
        ...result.structuredContent,
        pendingActionId: pending.id,
        ...(approve ? { approval: 'host' } : {}),
      },
    }
  }

  server.server.setRequestHandler(z.object({ method: z.literal(computerUseApprovalExecuteMethod), params: z.unknown() }), (request, extra) => handle(request, extra, true))
  server.server.setRequestHandler(z.object({ method: z.literal(computerUseApprovalRejectMethod), params: z.unknown() }), (request, extra) => handle(request, extra, false))
}
