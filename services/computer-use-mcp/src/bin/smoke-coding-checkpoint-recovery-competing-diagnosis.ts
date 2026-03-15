/**
 * Lightweight smoke: checkpoint recovery with competing diagnosis.
 *
 * Verifies:
 * 1) second-file checkpoint failure emits structured winner/runner-up competition
 * 2) competing signals include missed_dependency and incomplete_change
 * 3) planner picks recovery_retry instead of jumping to an unrelated file
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
  execFileSync('git', ['config', 'user.email', 'smoke-competing-diagnosis@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Competing Diagnosis'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'seed competing diagnosis fixture'], { cwd: dir })
}

function createProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-coding-checkpoint-recovery-competing-diagnosis-'))

  writeFileSync(
    join(dir, 'a.ts'),
    'import { companionValue } from "./companion"\nexport const flag = false\nexport const keepA = companionValue\n',
    'utf8',
  )
  writeFileSync(
    join(dir, 'b.ts'),
    'import { companionValue } from "./companion"\nexport const flag = false\nexport const keepB = companionValue\n',
    'utf8',
  )
  writeFileSync(join(dir, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')

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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-checkpoint-recovery-competing-diagnosis',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-checkpoint-recovery-competing-diagnosis',
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

async function getCodingState(client: Client, label: string) {
  const stateResult = await client.callTool({
    name: 'desktop_get_state',
    arguments: {},
  })

  const stateData = requireStructuredContent(stateResult, label)
  const runState = stateData.runState as Record<string, any>
  return runState.coding as Record<string, any> | undefined
}

async function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Smoke Gate: checkpoint recovery with competing diagnosis            ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  const client = await createClient()

  try {
    console.info('\n── Pass 1: validate first file and advance session ──')
    const pass1 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: 'competing diagnosis pass 1',
        targetFile: 'a.ts',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 2,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'grep -q "export const flag = true" a.ts && echo "pass1 ok"',
        autoApprove: true,
      },
    })

    const pass1Data = requireStructuredContent(pass1, 'workflow_coding_agentic_loop pass1')
    assert(pass1Data.status === 'completed', `pass1 should complete, got ${String(pass1Data.status)}`)

    const pass1Coding = await getCodingState(client, 'desktop_get_state pass1')
    const activeWorkspacePath = String(pass1Coding?.workspacePath || projectPath)
    assert(readFileSync(join(activeWorkspacePath, 'a.ts'), 'utf8').includes('export const flag = true'), 'pass1 should patch a.ts')

    console.info('\n── Pass 2: trigger competing diagnosis on second file ──')
    const pass2 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: activeWorkspacePath,
        taskGoal: 'competing diagnosis pass 2',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 2,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'sh -lc "printf \\\"Error: companion.ts unresolved dependency\\\\n\\\" 1>&2; exit 1"',
        autoApprove: true,
      },
    })

    const pass2Data = requireStructuredContent(pass2, 'workflow_coding_agentic_loop pass2')
    assert(pass2Data.status === 'completed', `pass2 should complete at execution layer, got ${String(pass2Data.status)}`)

    const pass2Coding = await getCodingState(client, 'desktop_get_state pass2')
    const diagnosis = pass2Coding?.lastChangeDiagnosis as Record<string, any> | undefined
    const competition = diagnosis?.confidenceBreakdown?.competition as Record<string, any> | undefined
    const plannerDecision = pass2Coding?.lastPlannerDecision as Record<string, any> | undefined

    assert(diagnosis != null, 'diagnosis should exist after pass2')
    assert(competition != null, 'diagnosis competition should exist after pass2')
    assert(competition.winner != null && competition.runnerUp != null, 'winner and runnerUp must both exist')

    const competitorTypes = new Set([
      String(competition.winner.rootCauseType || ''),
      String(competition.runnerUp.rootCauseType || ''),
    ])

    assert(competitorTypes.has('incomplete_change'), 'competition should include incomplete_change')
    assert(
      competitorTypes.has('missed_dependency') || competitorTypes.has('validation_command_mismatch'),
      'competition should include missed_dependency or validation_command_mismatch as runner-up alternative',
    )
    assert(Array.isArray(competition.disambiguationSignals), 'disambiguationSignals must be an array')
    assert((String(competition.winnerReason || '')).length > 0, 'winnerReason must be non-empty')
    assert((String(competition.runnerUpReason || '')).length > 0, 'runnerUpReason must be non-empty')

    assert(plannerDecision != null, 'planner decision should exist after diagnosis')
    assert(
      plannerDecision.selectionMode === 'recovery_retry' || plannerDecision.selectionMode === 'resume_current',
      `expected planner selectionMode to keep current recovery focus, got ${String(plannerDecision.selectionMode)}`,
    )
    assert(plannerDecision.selectedFile === 'b.ts', `expected planner to retry b.ts, got ${String(plannerDecision.selectedFile)}`)

    console.info('\n✅ Smoke passed: competing diagnosis is structured and planner stays on recovery retry.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ COMPETING DIAGNOSIS SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
