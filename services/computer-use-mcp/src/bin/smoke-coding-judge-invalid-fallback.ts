/**
 * Smoke: invalid judge output falls back to deterministic path.
 *
 * Verifies:
 * 1) forced-invalid target/diagnosis judge payload is rejected by schema
 * 2) runtime stores fallback_deterministic judgement instead of invalid shape
 * 3) workflow still completes execution layer without crashing
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function requireStructuredContent(result: unknown, label: string): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    throw new Error(`${label}: result is not an object`)
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object') {
    throw new Error(`${label}: missing structuredContent`)
  }

  return structuredContent as Record<string, unknown>
}

function setupGitRepo(dir: string) {
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'smoke-judge-invalid-fallback@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Judge Invalid Fallback'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'seed judge invalid fallback fixture'], { cwd: dir })
}

function createProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-coding-judge-invalid-fallback-'))

  writeFileSync(join(dir, 'a.ts'), 'export const flag = false\n', 'utf8')
  setupGitRepo(dir)
  return dir
}

async function createClient() {
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-judge-invalid-fallback',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
      COMPUTER_USE_FORCE_INVALID_TARGET_JUDGEMENT: '1',
      COMPUTER_USE_FORCE_INVALID_DIAGNOSIS_JUDGEMENT: '1',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-judge-invalid-fallback',
    version: '0.1.0',
  })

  transport.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      console.error(`[stderr] ${text}`)
    }
  })

  await client.connect(transport)
  return client
}

async function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: invalid judge output deterministic fallback            ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  const client = await createClient()

  try {
    const workflow = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: 'judge invalid fallback',
        targetFile: 'a.ts',
        searchQuery: 'export const flag = false',
        allowMultiFile: false,
        maxPlannedFiles: 1,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'sh -lc "printf "Error: deterministic fallback required\\n" 1>&2; exit 1"',
        autoApprove: true,
      },
    })

    const workflowData = requireStructuredContent(workflow, 'workflow_coding_agentic_loop')
    assert(workflowData.status === 'completed', `workflow should complete execution layer, got ${String(workflowData.status)}`)

    const stateResult = await client.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    const stateData = requireStructuredContent(stateResult, 'desktop_get_state')
    const runState = stateData.runState as Record<string, any>
    const codingState = runState.coding as Record<string, any> | undefined

    const targetJudgement = codingState?.lastTargetJudgement as Record<string, any> | undefined
    const diagnosisJudgement = codingState?.lastDiagnosisJudgement as Record<string, any> | undefined

    assert(targetJudgement != null, 'lastTargetJudgement should exist')
    assert(targetJudgement.mode === 'fallback_deterministic', `target judgement mode should be fallback_deterministic, got ${String(targetJudgement.mode)}`)

    assert(diagnosisJudgement != null, 'lastDiagnosisJudgement should exist')
    assert(diagnosisJudgement.mode === 'fallback_deterministic', `diagnosis judgement mode should be fallback_deterministic, got ${String(diagnosisJudgement.mode)}`)

    console.info('\n✅ Smoke passed: invalid judge payload is rejected and deterministic fallback stays stable.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ INVALID JUDGE FALLBACK SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
