import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseCommandArgs(raw: string | undefined, fallback: string[]) {
  if (!raw?.trim())
    return fallback

  return raw
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function requireStructuredContent(result: unknown, label: string) {
  if (!result || typeof result !== 'object')
    throw new Error(`${label} did not return an object result`)

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object')
    throw new Error(`${label} missing structuredContent`)

  return structuredContent as Record<string, unknown>
}

async function approveFirstPending(client: Client, expectedToolName: string) {
  const pending = await client.callTool({
    name: 'desktop_list_pending_actions',
    arguments: {},
  })
  const pendingData = requireStructuredContent(pending, 'desktop_list_pending_actions')
  const pendingActions = Array.isArray(pendingData.pendingActions) ? pendingData.pendingActions : []
  const first = pendingActions[0] as Record<string, unknown> | undefined
  if (!first)
    throw new Error(`no pending action after ${expectedToolName}`)

  const pendingId = String(first.id || '')
  if (!pendingId)
    throw new Error(`pending action missing id after ${expectedToolName}`)

  const approved = await client.callTool({
    name: 'desktop_approve_pending_action',
    arguments: { id: pendingId },
  })
  return requireStructuredContent(approved, 'desktop_approve_pending_action')
}

async function main() {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = parseCommandArgs(env.COMPUTER_USE_SMOKE_SERVER_ARGS, ['start'])
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...env,
      COMPUTER_USE_EXECUTOR: env.COMPUTER_USE_SMOKE_EXECUTOR || 'macos-local',
      COMPUTER_USE_APPROVAL_MODE: env.COMPUTER_USE_SMOKE_APPROVAL_MODE || 'actions',
      COMPUTER_USE_OPENABLE_APPS: env.COMPUTER_USE_OPENABLE_APPS || 'Terminal,Cursor,Google Chrome',
    },
    stderr: 'pipe',
  })
  const client = new Client({
    name: '@proj-airi/computer-use-mcp-smoke-macos',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text)
      console.error(`[computer-use-mcp stderr] ${text}`)
  })

  try {
    await client.connect(transport)

    const capabilities = await client.callTool({
      name: 'desktop_get_capabilities',
      arguments: {},
    })
    const capabilitiesData = requireStructuredContent(capabilities, 'desktop_get_capabilities')
    const executionTarget = capabilitiesData.executionTarget as Record<string, unknown> | undefined
    if (executionTarget?.mode !== 'local-windowed') {
      throw new Error(`desktop_get_capabilities expected local-windowed target, got ${String(executionTarget?.mode)}`)
    }

    const observation = await client.callTool({
      name: 'desktop_observe_windows',
      arguments: { limit: 8 },
    })
    const observationData = requireStructuredContent(observation, 'desktop_observe_windows')

    const openTerminal = await client.callTool({
      name: 'desktop_open_app',
      arguments: { app: 'Terminal' },
    })
    const openTerminalData = requireStructuredContent(openTerminal, 'desktop_open_app')
    if (openTerminalData.status !== 'approval_required')
      throw new Error(`desktop_open_app expected approval_required, got ${String(openTerminalData.status)}`)
    const approvedOpen = await approveFirstPending(client, 'desktop_open_app')

    const terminalExec = await client.callTool({
      name: 'terminal_exec',
      arguments: { command: 'pwd' },
    })
    const terminalExecData = requireStructuredContent(terminalExec, 'terminal_exec')
    if (terminalExecData.status !== 'approval_required')
      throw new Error(`terminal_exec expected approval_required, got ${String(terminalExecData.status)}`)
    const approvedExec = await approveFirstPending(client, 'terminal_exec')

    const terminalState = await client.callTool({
      name: 'terminal_get_state',
      arguments: {},
    })

    console.info(JSON.stringify({
      ok: true,
      verified: {
        executionTarget,
        observation: observationData.backendResult || observationData,
        approvedOpen,
        approvedExec,
        terminalState: requireStructuredContent(terminalState, 'terminal_get_state').terminalState,
      },
    }, null, 2))
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
