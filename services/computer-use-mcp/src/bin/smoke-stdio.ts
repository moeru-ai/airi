import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseCommandArgs(raw: string | undefined, fallback: string[]) {
  if (!raw?.trim()) {
    return fallback
  }

  return raw
    .split(/\s+/)
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

function hasImageContent(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }

  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return false
  }

  return content.some((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }

    const record = item as Record<string, unknown>
    return record.type === 'image'
      && typeof record.data === 'string'
      && typeof record.mimeType === 'string'
  })
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
      COMPUTER_USE_EXECUTOR: env.COMPUTER_USE_SMOKE_EXECUTOR || 'dry-run',
      COMPUTER_USE_APPROVAL_MODE: env.COMPUTER_USE_SMOKE_APPROVAL_MODE || 'actions',
      COMPUTER_USE_SESSION_TAG: env.COMPUTER_USE_SMOKE_SESSION_TAG || 'smoke-standalone',
      COMPUTER_USE_ALLOWED_BOUNDS: env.COMPUTER_USE_SMOKE_ALLOWED_BOUNDS || '0,0,1280,800',
    },
    stderr: 'pipe',
  })
  const client = new Client({
    name: '@proj-airi/computer-use-mcp-smoke',
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
      'desktop_screenshot',
      'desktop_click',
      'desktop_list_pending_actions',
      'desktop_approve_pending_action',
    ]) {
      if (!toolNames.has(required)) {
        throw new Error(`missing required tool: ${required}`)
      }
    }

    const capabilities = await client.callTool({
      name: 'desktop_get_capabilities',
      arguments: {},
    })
    const capabilitiesData = requireStructuredContent(capabilities, 'desktop_get_capabilities')
    if (typeof capabilitiesData.launchContext !== 'object' || capabilitiesData.launchContext == null) {
      throw new Error('desktop_get_capabilities missing launchContext')
    }
    if (typeof capabilitiesData.displayInfo !== 'object' || capabilitiesData.displayInfo == null) {
      throw new Error('desktop_get_capabilities missing displayInfo')
    }

    const screenshot = await client.callTool({
      name: 'desktop_screenshot',
      arguments: {
        label: 'smoke-stdio',
      },
    })
    const screenshotData = requireStructuredContent(screenshot, 'desktop_screenshot')
    if (!hasImageContent(screenshot)) {
      throw new Error('desktop_screenshot did not return an MCP image content item')
    }
    if (typeof screenshotData.screenshot !== 'object' || screenshotData.screenshot == null) {
      throw new Error('desktop_screenshot missing screenshot metadata')
    }

    const postScreenshotCapabilities = await client.callTool({
      name: 'desktop_get_capabilities',
      arguments: {},
    })
    const postScreenshotCapabilitiesData = requireStructuredContent(postScreenshotCapabilities, 'desktop_get_capabilities after screenshot')
    const sessionSnapshot = (postScreenshotCapabilitiesData.session && typeof postScreenshotCapabilitiesData.session === 'object')
      ? postScreenshotCapabilitiesData.session as Record<string, unknown>
      : undefined
    if (!sessionSnapshot?.lastScreenshot || typeof sessionSnapshot.lastScreenshot !== 'object') {
      throw new Error('desktop_get_capabilities after screenshot is missing session.lastScreenshot')
    }

    const click = await client.callTool({
      name: 'desktop_click',
      arguments: {
        x: 100,
        y: 100,
        captureAfter: true,
      },
    })
    const clickData = requireStructuredContent(click, 'desktop_click')
    if (clickData.status !== 'approval_required') {
      throw new Error(`desktop_click expected approval_required, got ${String(clickData.status)}`)
    }

    const pending = await client.callTool({
      name: 'desktop_list_pending_actions',
      arguments: {},
    })
    const pendingData = requireStructuredContent(pending, 'desktop_list_pending_actions')
    const pendingActions = Array.isArray(pendingData.pendingActions) ? pendingData.pendingActions : []
    if (pendingActions.length === 0) {
      throw new Error('desktop_list_pending_actions returned no pending action after approval_required')
    }

    const pendingId = String((pendingActions[0] as Record<string, unknown>).id || '')
    if (!pendingId) {
      throw new Error('first pending action missing id')
    }

    const approved = await client.callTool({
      name: 'desktop_approve_pending_action',
      arguments: {
        id: pendingId,
      },
    })
    const approvedData = requireStructuredContent(approved, 'desktop_approve_pending_action')
    if (approvedData.status !== 'executed') {
      throw new Error(`desktop_approve_pending_action expected executed, got ${String(approvedData.status)}`)
    }

    console.info(JSON.stringify({
      ok: true,
      verified: {
        toolCount: tools.tools.length,
        capabilities: {
          hostName: (capabilitiesData.launchContext as Record<string, unknown>).hostName,
          sessionTag: (capabilitiesData.launchContext as Record<string, unknown>).sessionTag,
          coordinateSpaceBeforeScreenshot: capabilitiesData.coordinateSpace,
          coordinateSpaceAfterScreenshot: postScreenshotCapabilitiesData.coordinateSpace,
        },
        screenshot: screenshotData.screenshot,
        approvedAction: {
          id: pendingId,
          status: approvedData.status,
        },
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
