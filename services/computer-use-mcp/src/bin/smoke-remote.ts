import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WHITESPACE_SPLIT_RE = /\s+/

async function approveFirstPending(client: Client, label: string) {
  const pending = await client.callTool({
    arguments: {},
    name: 'desktop_list_pending_actions',
  })
  const pendingData = requireStructuredContent(pending, label)
  const pendingActions = Array.isArray(pendingData.pendingActions) ? pendingData.pendingActions : []
  if (pendingActions.length === 0) {
    throw new Error(`${label} returned no pending actions`)
  }

  const id = String((pendingActions[0] as Record<string, unknown>).id || '')
  if (!id) {
    throw new Error(`${label} missing pending action id`)
  }

  const approved = await client.callTool({
    arguments: { id },
    name: 'desktop_approve_pending_action',
  })

  return {
    approved: requireStructuredContent(approved, 'desktop_approve_pending_action'),
    id,
  }
}

async function main() {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = parseCommandArgs(env.COMPUTER_USE_SMOKE_SERVER_ARGS, ['start'])
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir

  const transport = new StdioClientTransport({
    args,
    command,
    cwd,
    env: {
      ...env,
      COMPUTER_USE_ALLOWED_BOUNDS: env.COMPUTER_USE_SMOKE_ALLOWED_BOUNDS || '0,0,1280,720',
      COMPUTER_USE_APPROVAL_MODE: env.COMPUTER_USE_SMOKE_APPROVAL_MODE || 'actions',
      COMPUTER_USE_ENABLE_TEST_TOOLS: 'true',
      COMPUTER_USE_EXECUTOR: 'linux-x11',
      COMPUTER_USE_SESSION_TAG: env.COMPUTER_USE_SMOKE_SESSION_TAG || 'azure-remote-smoke',
    },
    stderr: 'pipe',
  })
  const client = new Client({
    name: '@proj-airi/computer-use-mcp-remote-smoke',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      console.error(`[computer-use-mcp stderr] ${text}`)
    }
  })

  try {
    await client.connect(transport)

    const tools = await client.listTools()
    const toolNames = new Set(tools.tools.map(tool => tool.name))
    for (const required of [
      'desktop_get_capabilities',
      'desktop_open_test_target',
      'desktop_screenshot',
      'desktop_click',
      'desktop_type_text',
      'desktop_wait',
      'desktop_list_pending_actions',
      'desktop_approve_pending_action',
    ]) {
      if (!toolNames.has(required)) {
        throw new Error(`missing required tool: ${required}`)
      }
    }

    const capabilities = await client.callTool({
      arguments: {},
      name: 'desktop_get_capabilities',
    })
    const capabilitiesData = requireStructuredContent(capabilities, 'desktop_get_capabilities')
    const executionTarget = capabilitiesData.executionTarget as Record<string, unknown> | undefined
    if (!executionTarget || executionTarget.mode !== 'remote') {
      throw new Error('desktop_get_capabilities did not report a remote execution target')
    }

    const opened = await client.callTool({
      arguments: {},
      name: 'desktop_open_test_target',
    })
    const openedData = requireStructuredContent(opened, 'desktop_open_test_target')
    const point = openedData.recommendedClickPoint as Record<string, unknown> | undefined
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      throw new Error('desktop_open_test_target did not return a recommendedClickPoint')
    }

    const screenshotBefore = await client.callTool({
      arguments: {
        label: 'remote-smoke-before',
      },
      name: 'desktop_screenshot',
    })
    const screenshotBeforeData = requireStructuredContent(screenshotBefore, 'desktop_screenshot before')

    const click = await client.callTool({
      arguments: {
        captureAfter: false,
        x: point.x,
        y: point.y,
      },
      name: 'desktop_click',
    })
    const clickData = requireStructuredContent(click, 'desktop_click')
    if (clickData.status !== 'approval_required') {
      throw new Error(`desktop_click expected approval_required, got ${String(clickData.status)}`)
    }

    const approvedClick = await approveFirstPending(client, 'desktop_list_pending_actions after click')
    if (approvedClick.approved.status !== 'executed') {
      throw new Error(`desktop_approve_pending_action for click expected executed, got ${String(approvedClick.approved.status)}`)
    }

    const typeText = await client.callTool({
      arguments: {
        captureAfter: true,
        pressEnter: false,
        text: 'AIRI remote linux-x11 smoke',
      },
      name: 'desktop_type_text',
    })
    const typeTextData = requireStructuredContent(typeText, 'desktop_type_text')
    if (typeTextData.status !== 'approval_required') {
      throw new Error(`desktop_type_text expected approval_required, got ${String(typeTextData.status)}`)
    }

    const approvedTypeText = await approveFirstPending(client, 'desktop_list_pending_actions after type_text')
    if (approvedTypeText.approved.status !== 'executed') {
      throw new Error(`desktop_approve_pending_action for type_text expected executed, got ${String(approvedTypeText.approved.status)}`)
    }

    const waited = await client.callTool({
      arguments: {
        durationMs: 500,
      },
      name: 'desktop_wait',
    })
    const waitedData = requireStructuredContent(waited, 'desktop_wait')
    if (waitedData.status !== 'executed') {
      throw new Error(`desktop_wait expected executed, got ${String(waitedData.status)}`)
    }

    const screenshotAfter = await client.callTool({
      arguments: {
        label: 'remote-smoke-after',
      },
      name: 'desktop_screenshot',
    })
    const screenshotAfterData = requireStructuredContent(screenshotAfter, 'desktop_screenshot after')

    console.info(JSON.stringify({
      ok: true,
      verified: {
        approvedClick: {
          id: approvedClick.id,
          status: approvedClick.approved.status,
        },
        approvedTypeText: {
          id: approvedTypeText.id,
          status: approvedTypeText.approved.status,
        },
        executionTarget,
        openedTarget: {
          appName: openedData.appName,
          recommendedClickPoint: openedData.recommendedClickPoint,
          windowTitle: openedData.windowTitle,
        },
        screenshotAfter: screenshotAfterData.screenshot,
        screenshotBefore: screenshotBeforeData.screenshot,
        toolCount: tools.tools.length,
        waited: waitedData.status,
      },
    }, null, 2))
  }
  finally {
    await client.close().catch(() => {})
  }
}

function parseCommandArgs(raw: string | undefined, fallback: string[]) {
  if (!raw?.trim()) {
    return fallback
  }

  return raw
    .split(WHITESPACE_SPLIT_RE)
    .map(item => item.trim())
    .filter(Boolean)
}

function requireStructuredContent(result: unknown, label: string) {
  if (!result || typeof result !== 'object') {
    throw new Error(`${label} did not return an object result`)
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object') {
    throw new Error(`${label} missing structuredContent`)
  }

  return structuredContent as Record<string, unknown>
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
