/**
 * Secondary smoke: read-only coding surface on a large repository root.
 *
 * This smoke intentionally avoids any file mutations. It verifies that
 * review/search/report stay deterministic and bounded on real workspace scale.
 */

import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function requireStructuredContent(result: unknown, label: string) {
  if (!result || typeof result !== 'object') {
    throw new Error(`${label} did not return an object`)
  }

  const structured = (result as { structuredContent?: unknown }).structuredContent
  if (!structured || typeof structured !== 'object') {
    throw new Error(`${label} missing structuredContent`)
  }

  return structured as Record<string, unknown>
}

async function main() {
  const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
  const args = (env.COMPUTER_USE_SMOKE_SERVER_ARGS || 'start').split(/\s+/).filter(Boolean)
  const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir
  const workspacePath = env.AIRI_CODING_SMOKE_PATH?.trim() || resolve(packageDir, '../..')

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    env: {
      ...env,
      COMPUTER_USE_EXECUTOR: 'dry-run',
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-readonly',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/computer-use-mcp-smoke-coding-readonly',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      console.error(`[stderr] ${text}`)
    }
  })

  try {
    await client.connect(transport)

    const review = await client.callTool({
      name: 'coding_review_workspace',
      arguments: { workspacePath },
    })
    const reviewData = requireStructuredContent(review, 'coding_review_workspace')
    if (reviewData.status !== 'ok') {
      throw new Error(`coding_review_workspace expected status=ok, got ${String(reviewData.status)}`)
    }

    const search = await client.callTool({
      name: 'coding_search_text',
      arguments: {
        query: 'workflow_coding_loop',
        targetPath: 'services/computer-use-mcp/src',
        limit: 20,
      },
    })
    const searchData = requireStructuredContent(search, 'coding_search_text')
    const searchBackend = (searchData.backendResult && typeof searchData.backendResult === 'object')
      ? searchData.backendResult as Record<string, unknown>
      : undefined
    if (!searchBackend || !Array.isArray(searchBackend.matches)) {
      throw new Error('coding_search_text missing matches array in backendResult')
    }

    const report = await client.callTool({
      name: 'coding_report_status',
      arguments: {
        status: 'auto',
        summary: 'auto',
        filesTouched: ['auto'],
        commandsRun: ['auto'],
        checks: ['auto'],
        nextStep: 'auto',
      },
    })
    const reportData = requireStructuredContent(report, 'coding_report_status')
    if (reportData.status !== 'ok') {
      throw new Error(`coding_report_status expected status=ok, got ${String(reportData.status)}`)
    }

    console.info(JSON.stringify({
      ok: true,
      workspacePath,
      searchMatchCount: searchBackend.matches.length,
      reportStatus: (reportData.backendResult as Record<string, unknown> | undefined)?.status,
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
