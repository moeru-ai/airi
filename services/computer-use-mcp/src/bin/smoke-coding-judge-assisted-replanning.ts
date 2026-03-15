/**
 * Smoke: judge-assisted replanning on bounded DAG workflow.
 *
 * Verifies:
 * 1) diagnosis case + diagnosis judgement are emitted after validation failure
 * 2) bounded plan draft is generated (<= 3 nodes)
 * 3) planner decision remains available for next recovery step
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
  execFileSync('git', ['config', 'user.email', 'smoke-judge-assisted-replanning@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI Smoke Judge Assisted Replanning'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'seed judge-assisted replanning fixture'], { cwd: dir })
}

function createProjectDir() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-coding-judge-assisted-replanning-'))

  writeFileSync(join(dir, 'a.ts'), 'export const flag = false\n', 'utf8')
  writeFileSync(join(dir, 'b.ts'), 'export const flag = false\n', 'utf8')
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
      COMPUTER_USE_SESSION_TAG: 'smoke-coding-judge-assisted-replanning',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/smoke-coding-judge-assisted-replanning',
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
  console.info('║  Smoke Gate: judge-assisted replanning                              ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const projectPath = createProjectDir()
  const client = await createClient()

  try {
    const pass1 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: projectPath,
        taskGoal: 'judge-assisted replanning pass 1',
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

    const pass2 = await client.callTool({
      name: 'workflow_coding_agentic_loop',
      arguments: {
        workspacePath: activeWorkspacePath,
        taskGoal: 'judge-assisted replanning pass 2',
        searchQuery: 'export const flag = false',
        allowMultiFile: true,
        maxPlannedFiles: 2,
        changeIntent: 'behavior_fix',
        patchOld: 'export const flag = false',
        patchNew: 'export const flag = true',
        testCommand: 'sh -lc "printf "Error: companion.ts unresolved dependency\\n" 1>&2; exit 1"',
        autoApprove: true,
      },
    })

    const pass2Data = requireStructuredContent(pass2, 'workflow_coding_agentic_loop pass2')
    assert(pass2Data.status === 'completed', `pass2 should complete at execution layer, got ${String(pass2Data.status)}`)

    const codingState = await getCodingState(client, 'desktop_get_state pass2')
    const diagnosisCase = codingState?.lastDiagnosisCase as Record<string, any> | undefined
    const diagnosisJudgement = codingState?.lastDiagnosisJudgement as Record<string, any> | undefined
    const causalTrace = codingState?.lastCausalTrace as Record<string, any> | undefined
    const planDraft = codingState?.lastPlanDraft as Record<string, any> | undefined
    const plannerDecision = codingState?.lastPlannerDecision as Record<string, any> | undefined

    assert(diagnosisCase != null, 'lastDiagnosisCase should exist')
    assert(diagnosisJudgement != null, 'lastDiagnosisJudgement should exist')
    assert((String(diagnosisJudgement.winner || '')).length > 0, 'diagnosisJudgement winner should be non-empty')
    assert((String(diagnosisJudgement.winnerReason || '')).length > 0, 'diagnosisJudgement winnerReason should be non-empty')
    assert(Array.isArray(diagnosisJudgement.counterfactualChecks), 'diagnosisJudgement.counterfactualChecks should be array')
    assert((diagnosisJudgement.counterfactualChecks || []).length > 0, 'diagnosisJudgement.counterfactualChecks should be non-empty')
    assert(planDraft != null, 'lastPlanDraft should exist')
    assert(Array.isArray(planDraft.nodes), 'lastPlanDraft.nodes should be array')
    assert(planDraft.nodes.length > 0 && planDraft.nodes.length <= 3, `plan draft nodes should be within 1..3, got ${String(planDraft.nodes.length)}`)
    assert(causalTrace != null, 'lastCausalTrace should exist')
    assert(Array.isArray(causalTrace.nodes), 'lastCausalTrace.nodes should be array')
    assert(Array.isArray(causalTrace.edges), 'lastCausalTrace.edges should be array')
    assert(Array.isArray(causalTrace.counterfactualChecks), 'lastCausalTrace.counterfactualChecks should be array')

    if (plannerDecision) {
      assert((String(plannerDecision.selectedFile || '')).length > 0, 'plannerDecision.selectedFile should be non-empty when present')
      assert((String(plannerDecision.whyNotRunnerUp?.explanation || '')).length > 0, 'plannerDecision.whyNotRunnerUp.explanation should be non-empty when planner decision exists')
    }

    console.info('\n✅ Smoke passed: judge-assisted replanning emits case/judgement/plan-draft under bounded graph constraints.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error('\n❌ JUDGE-ASSISTED REPLANNING SMOKE FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
