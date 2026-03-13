import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function assert(condition: boolean, message: string): asserts condition {
  if (!condition)
    throw new Error(`Assertion failed: ${message}`)
}

function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!result || typeof result !== 'object')
    throw new Error(`${label}: result is not an object`)

  const sc = (result as { structuredContent?: unknown }).structuredContent
  if (!sc || typeof sc !== 'object')
    throw new Error(`${label}: missing structuredContent`)

  return sc as Record<string, unknown>
}

async function createClient(): Promise<Client> {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = (env.COMPUTER_USE_SMOKE_SERVER_ARGS || 'start').split(/\s+/).filter(Boolean)
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...env,
      COMPUTER_USE_EXECUTOR: 'dry-run',
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'smoke-workflow',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Terminal',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-workflow',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text)
      console.error(`[stderr] ${text}`)
  })

  await client.connect(transport)
  return client
}

async function main() {
  const client = await createClient()
  const projectPath = mkdtempSync(join(tmpdir(), 'computer-use-smoke-workflow-'))

  try {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))

    for (const toolName of ['workflow_run_tests', 'workflow_resume', 'desktop_get_state']) {
      assert(names.has(toolName), `missing required tool: ${toolName}`)
    }

    const result = await client.callTool({
      name: 'workflow_run_tests',
      arguments: {
        projectPath,
        testCommand: 'echo "smoke workflow ok"',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(result, 'workflow_run_tests')
    assert(workflowData.status === 'completed', `expected completed, got ${String(workflowData.status)}`)

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })

    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    assert(stateData.status === 'ok', `desktop_get_state expected ok, got ${String(stateData.status)}`)

    console.info(JSON.stringify({
      ok: true,
      workflowStatus: workflowData.status,
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
