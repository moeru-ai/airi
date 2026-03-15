/**
 * Benchmark Harness v2: codex-proximity scoring for bounded agentic coding.
 *
 * Coverage goals:
 * - Reuse v1 cluster scenarios to keep continuity.
 * - Add scoring dimensions focused on coding intelligence quality.
 *
 * Scoring dimensions:
 * - autonomous success rate
 * - first-target-hit rate
 * - root-cause misjudge rate
 * - turns-to-resolution
 * - human-handoff-needed rate
 * - dirty-workspace regression rate
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

type FailureCluster = 'baseline_noise' | 'new_red' | 'wrong_target' | 'missed_dependency' | 'unsupported_fallback' | 'unknown'

interface BenchmarkRecordV2 {
  caseId: string
  scenarioKey: string
  workspaceType: 'ts' | 'python'
  cluster: FailureCluster
  pass: boolean
  baselineComparison?: string
  rootCauseType?: string
  rootCauseExpected?: string
  rootCauseMatched?: boolean
  traceId?: string | null
  firstTargetHit?: boolean
  turnsToResolution?: number
  humanHandoffNeeded?: boolean
  dirtyWorkspaceRegression?: boolean
  notes: string[]
}

interface RateMetric {
  value: number
  numerator: number
  denominator: number
}

interface MeanMetric {
  value: number
  samples: number
}

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
  execFileSync('git', ['config', 'user.email', 'benchmark-coding-agentic-v2@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'AIRI Benchmark Harness V2'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'seed benchmark fixture'], { cwd: dir })
}

function createTsFixture(prefix: string, options: { dirtyTree?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `benchmark-coding-agentic-v2-ts-${prefix}-`))
  writeFileSync(join(dir, 'index.ts'), 'import { companionValue } from "./companion"\nexport const flag = false\nexport const keep = companionValue\n', 'utf8')
  writeFileSync(join(dir, 'companion.ts'), 'export const companionValue = 1\n', 'utf8')
  writeFileSync(join(dir, 'README.md'), '# benchmark fixture\n', 'utf8')
  setupGitRepo(dir)

  if (options.dirtyTree) {
    writeFileSync(join(dir, 'README.md'), '# benchmark fixture\n\ndirty tree marker\n', 'utf8')
  }

  return dir
}

function createPythonFixture(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), `benchmark-coding-agentic-v2-py-${prefix}-`))
  writeFileSync(join(dir, 'script.py'), 'def add(a, b):\n    return a + b\n', 'utf8')
  writeFileSync(join(dir, 'README.md'), '# python benchmark fixture\n', 'utf8')
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
      COMPUTER_USE_SESSION_TAG: 'benchmark-coding-agentic-v2',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
      COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: '@proj-airi/benchmark-coding-agentic-v2',
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

async function callTool(client: Client, name: string, args: Record<string, unknown>, label: string) {
  const result = await client.callTool({ name, arguments: args })
  return requireStructuredContent(result, label)
}

async function getCodingState(client: Client, label: string) {
  const data = await callTool(client, 'desktop_get_state', {}, label)
  const runState = data.runState as Record<string, any>
  return runState.coding as Record<string, any> | undefined
}

async function runTerminalExec(client: Client, command: string, cwd: string, label: string) {
  const data = await callTool(client, 'terminal_exec', {
    command,
    cwd,
    timeoutMs: 20_000,
  }, label)

  const backend = data.backendResult as Record<string, unknown> | undefined
  assert(backend != null, `${label}: missing backendResult`)

  return {
    status: String(data.status || ''),
    exitCode: Number(backend.exitCode),
    stderr: String(backend.stderr || ''),
  }
}

function includesRisk(review: Record<string, any> | undefined, risk: string) {
  const risks = Array.isArray(review?.detectedRisks) ? review.detectedRisks as string[] : []
  return risks.includes(risk)
}

async function runWorkflowBoundaryScenario(params: {
  client: Client
  scenarioKey: string
  workspacePath: string
  expectedComparison: 'baseline_noise' | 'new_red'
  seedBaselineCommand: string
  workflowCommand: string
  caseId: string
}): Promise<BenchmarkRecordV2> {
  const seed = await runTerminalExec(
    params.client,
    params.seedBaselineCommand,
    params.workspacePath,
    `${params.scenarioKey}: seed baseline`,
  )
  assert(seed.status === 'executed', `${params.scenarioKey}: baseline seed should execute`)
  assert(seed.exitCode !== 0, `${params.scenarioKey}: baseline seed must fail`)

  const workflowData = await callTool(params.client, 'workflow_coding_agentic_loop', {
    workspacePath: params.workspacePath,
    taskGoal: `benchmark boundary ${params.scenarioKey}`,
    targetFile: 'index.ts',
    changeIntent: 'behavior_fix',
    allowMultiFile: false,
    maxPlannedFiles: 1,
    patchOld: 'export const flag = false',
    patchNew: 'export const flag = true',
    testCommand: params.workflowCommand,
    autoApprove: true,
  }, `${params.scenarioKey}: workflow`)

  assert(String(workflowData.status) === 'completed', `${params.scenarioKey}: workflow execution-layer status should be completed`)

  const codingState = await getCodingState(params.client, `${params.scenarioKey}: desktop_get_state`)
  assert(codingState != null, `${params.scenarioKey}: coding state must exist`)

  const review = codingState.lastChangeReview as Record<string, any> | undefined
  const diagnosis = codingState.lastChangeDiagnosis as Record<string, any> | undefined
  const trace = codingState.lastCausalTrace as Record<string, any> | undefined
  const targetSelection = codingState.lastTargetSelection as Record<string, any> | undefined

  const baselineComparison = String(review?.baselineComparison || 'unknown')
  const rootCauseType = String(diagnosis?.rootCauseType || 'unknown')
  const traceId = trace?.traceId ? String(trace.traceId) : null
  const firstTargetHit = targetSelection?.selectedFile ? String(targetSelection.selectedFile) === 'index.ts' : true
  const dirtyWorkspaceRegression = includesRisk(review, 'baseline_diff_escape')

  const rootCauseExpected = params.expectedComparison === 'baseline_noise'
    ? 'baseline_noise'
    : undefined

  return {
    caseId: params.caseId,
    scenarioKey: params.scenarioKey,
    workspaceType: 'ts',
    cluster: params.expectedComparison,
    pass: baselineComparison === params.expectedComparison,
    baselineComparison,
    rootCauseType,
    rootCauseExpected,
    rootCauseMatched: rootCauseExpected ? rootCauseType === rootCauseExpected : undefined,
    traceId,
    firstTargetHit,
    turnsToResolution: 1,
    humanHandoffNeeded: false,
    dirtyWorkspaceRegression,
    notes: [
      `expectedComparison=${params.expectedComparison}`,
      `workflowStatus=${String(workflowData.status)}`,
      `firstTargetHit=${String(firstTargetHit)}`,
    ],
  }
}

async function prepareSingleFilePlan(client: Client, workspacePath: string, targetFile: string, scenarioKey: string) {
  await callTool(client, 'coding_review_workspace', { workspacePath }, `${scenarioKey}: review_workspace`)
  await callTool(client, 'coding_select_target', {
    targetFile,
    changeIntent: 'behavior_fix',
  }, `${scenarioKey}: select_target`)
  await callTool(client, 'coding_plan_changes', {
    intent: `${scenarioKey} plan`,
    allowMultiFile: false,
    maxPlannedFiles: 1,
    sessionAware: true,
    changeIntent: 'behavior_fix',
  }, `${scenarioKey}: plan_changes`)
}

async function runWrongTargetScenario(params: {
  client: Client
  workspacePath: string
  caseId: string
}): Promise<BenchmarkRecordV2> {
  const scenarioKey = 'wrong-target-direct'
  await prepareSingleFilePlan(params.client, params.workspacePath, 'index.ts', scenarioKey)

  await callTool(params.client, 'coding_apply_patch', {
    filePath: 'companion.ts',
    oldString: 'export const companionValue = 1',
    newString: 'export const companionValue = 2',
  }, `${scenarioKey}: apply_patch companion`)

  await runTerminalExec(params.client, 'echo "benchmark wrong_target ok"', params.workspacePath, `${scenarioKey}: terminal_exec`)

  await callTool(params.client, 'coding_review_changes', {
    currentFilePath: 'index.ts',
  }, `${scenarioKey}: review_changes`)

  const diagnosis = await callTool(params.client, 'coding_diagnose_changes', {
    currentFilePath: 'index.ts',
  }, `${scenarioKey}: diagnose_changes`)

  const backend = diagnosis.backendResult as Record<string, any> | undefined
  const rootCauseType = String(backend?.rootCauseType || 'unknown')

  const codingState = await getCodingState(params.client, `${scenarioKey}: desktop_get_state`)
  const traceId = codingState?.lastCausalTrace?.traceId

  return {
    caseId: params.caseId,
    scenarioKey,
    workspaceType: 'ts',
    cluster: 'wrong_target',
    pass: rootCauseType === 'wrong_target',
    rootCauseType,
    rootCauseExpected: 'wrong_target',
    rootCauseMatched: rootCauseType === 'wrong_target',
    traceId: traceId ? String(traceId) : null,
    firstTargetHit: true,
    turnsToResolution: 2,
    humanHandoffNeeded: false,
    dirtyWorkspaceRegression: false,
    notes: [
      'expectedRootCause=wrong_target',
      `observedRootCause=${rootCauseType}`,
    ],
  }
}

async function runMissedDependencyScenario(params: {
  client: Client
  workspacePath: string
  caseId: string
}): Promise<BenchmarkRecordV2> {
  const scenarioKey = 'missed-dependency-direct'
  await prepareSingleFilePlan(params.client, params.workspacePath, 'index.ts', scenarioKey)

  await callTool(params.client, 'coding_analyze_impact', {
    targetFile: 'index.ts',
    searchQuery: 'companionValue',
  }, `${scenarioKey}: analyze_impact`)

  await callTool(params.client, 'coding_apply_patch', {
    filePath: 'index.ts',
    oldString: 'export const flag = false',
    newString: 'export const flag = true',
  }, `${scenarioKey}: apply_patch index`)

  await callTool(params.client, 'coding_apply_patch', {
    filePath: 'companion.ts',
    oldString: 'export const companionValue = 1',
    newString: 'export const companionValue = 2',
  }, `${scenarioKey}: apply_patch companion`)

  await runTerminalExec(params.client, 'echo "benchmark missed_dependency ok"', params.workspacePath, `${scenarioKey}: terminal_exec`)

  await callTool(params.client, 'coding_review_changes', {
    currentFilePath: 'index.ts',
  }, `${scenarioKey}: review_changes`)

  const diagnosis = await callTool(params.client, 'coding_diagnose_changes', {
    currentFilePath: 'index.ts',
  }, `${scenarioKey}: diagnose_changes`)

  const backend = diagnosis.backendResult as Record<string, any> | undefined
  const rootCauseType = String(backend?.rootCauseType || 'unknown')

  const codingState = await getCodingState(params.client, `${scenarioKey}: desktop_get_state`)
  const traceId = codingState?.lastCausalTrace?.traceId

  return {
    caseId: params.caseId,
    scenarioKey,
    workspaceType: 'ts',
    cluster: 'missed_dependency',
    pass: rootCauseType === 'missed_dependency',
    rootCauseType,
    rootCauseExpected: 'missed_dependency',
    rootCauseMatched: rootCauseType === 'missed_dependency',
    traceId: traceId ? String(traceId) : null,
    firstTargetHit: true,
    turnsToResolution: 2,
    humanHandoffNeeded: false,
    dirtyWorkspaceRegression: false,
    notes: [
      'expectedRootCause=missed_dependency',
      `observedRootCause=${rootCauseType}`,
    ],
  }
}

async function runPythonUnsupportedScenario(params: {
  client: Client
  workspacePath: string
  caseId: string
}): Promise<BenchmarkRecordV2> {
  const scenarioKey = 'python-unsupported-impact'
  await callTool(params.client, 'coding_review_workspace', { workspacePath: params.workspacePath }, `${scenarioKey}: review_workspace`)
  const analysis = await callTool(params.client, 'coding_analyze_impact', {
    targetFile: 'script.py',
    searchQuery: 'def add',
  }, `${scenarioKey}: analyze_impact`)

  const backend = analysis.backendResult as Record<string, any> | undefined
  const status = String(backend?.status || '')
  const languageSupport = String(backend?.languageSupport || '')

  return {
    caseId: params.caseId,
    scenarioKey,
    workspaceType: 'python',
    cluster: 'unsupported_fallback',
    pass: status === 'unsupported' && languageSupport === 'unsupported',
    traceId: null,
    firstTargetHit: undefined,
    turnsToResolution: 1,
    humanHandoffNeeded: false,
    dirtyWorkspaceRegression: false,
    notes: [
      `status=${status}`,
      `languageSupport=${languageSupport}`,
    ],
  }
}

function round(value: number) {
  return Number(value.toFixed(4))
}

function toRate(values: Array<boolean | undefined>, positive: boolean): RateMetric {
  const filtered = values.filter((item): item is boolean => typeof item === 'boolean')
  if (filtered.length === 0) {
    return {
      value: 0,
      numerator: 0,
      denominator: 0,
    }
  }

  const numerator = filtered.filter(item => item === positive).length
  return {
    value: round(numerator / filtered.length),
    numerator,
    denominator: filtered.length,
  }
}

function toMean(values: Array<number | undefined>): MeanMetric {
  const filtered = values.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  if (filtered.length === 0) {
    return {
      value: 0,
      samples: 0,
    }
  }

  const sum = filtered.reduce((acc, item) => acc + item, 0)
  return {
    value: round(sum / filtered.length),
    samples: filtered.length,
  }
}

function summarize(records: BenchmarkRecordV2[]) {
  const byCluster: Record<string, { total: number, passed: number, failed: number }> = {}

  for (const record of records) {
    const row = byCluster[record.cluster] || { total: 0, passed: 0, failed: 0 }
    row.total += 1
    if (record.pass) {
      row.passed += 1
    }
    else {
      row.failed += 1
    }
    byCluster[record.cluster] = row
  }

  const total = records.length
  const passed = records.filter(record => record.pass).length
  const failed = total - passed

  const autonomousSuccessRate = toRate(records.map(record => record.pass), true)
  const firstTargetHitRate = toRate(records.map(record => record.firstTargetHit), true)
  const rootCauseMisjudgeRate = toRate(records.map((record) => {
    if (typeof record.rootCauseMatched !== 'boolean') {
      return undefined
    }
    return !record.rootCauseMatched
  }), true)
  const humanHandoffRate = toRate(records.map(record => record.humanHandoffNeeded), true)
  const dirtyWorkspaceRegressionRate = toRate(records.map(record => record.dirtyWorkspaceRegression), true)
  const turnsToResolution = toMean(records.map(record => record.turnsToResolution))

  const turnsScore = Math.max(0, Math.min(1, 1 - Math.max(0, turnsToResolution.value - 1) / 4))
  const compositeScore = round((
    autonomousSuccessRate.value * 0.35
    + firstTargetHitRate.value * 0.2
    + (1 - rootCauseMisjudgeRate.value) * 0.2
    + turnsScore * 0.1
    + (1 - humanHandoffRate.value) * 0.1
    + (1 - dirtyWorkspaceRegressionRate.value) * 0.05
  ) * 100)

  return {
    total,
    passed,
    failed,
    byCluster,
    scoreProtocol: {
      version: 2,
      dimensions: {
        autonomousSuccessRate,
        firstTargetHitRate,
        rootCauseMisjudgeRate,
        turnsToResolution,
        humanHandoffRate,
        dirtyWorkspaceRegressionRate,
      },
      compositeScore,
      notes: [
        'weights: success=35%, firstTargetHit=20%, rootCause=20%, turns=10%, handoff=10%, dirtyRegression=5%',
        'rootCauseMisjudgeRate only counts cases with explicit expected root-cause labels',
      ],
    },
  }
}

async function main() {
  console.info('╔═══════════════════════════════════════════════════════════════════════╗')
  console.info('║  Benchmark Harness v2: coding agentic codex-proximity score         ║')
  console.info('╚═══════════════════════════════════════════════════════════════════════╝')

  const stableFailureCommand = 'sh -lc \'printf "FAIL src/index.test.ts > should stay red\\nError: baseline stack at src/index.ts:1:1\\n" 1>&2; exit 1\''
  const driftFailureCommand = 'sh -lc \'printf "\\nexport const driftMutation = true\\n" >> companion.ts; printf "FAIL src/index.test.ts > should stay red\\nError: drift stack at src/companion.ts:9:9\\n" 1>&2; exit 1\''

  const client = await createClient()
  const cleanupPaths: string[] = []
  const records: BenchmarkRecordV2[] = []

  try {
    const tsBaselineWorkspace = createTsFixture('baseline-noise')
    cleanupPaths.push(tsBaselineWorkspace)
    records.push(await runWorkflowBoundaryScenario({
      client,
      scenarioKey: 'ts-baseline-noise',
      workspacePath: tsBaselineWorkspace,
      expectedComparison: 'baseline_noise',
      seedBaselineCommand: stableFailureCommand,
      workflowCommand: stableFailureCommand,
      caseId: 'case_ts_baseline_noise',
    }))

    const tsNewRedWorkspace = createTsFixture('new-red')
    cleanupPaths.push(tsNewRedWorkspace)
    records.push(await runWorkflowBoundaryScenario({
      client,
      scenarioKey: 'ts-new-red-diff-escape',
      workspacePath: tsNewRedWorkspace,
      expectedComparison: 'new_red',
      seedBaselineCommand: stableFailureCommand,
      workflowCommand: driftFailureCommand,
      caseId: 'case_ts_new_red_diff_escape',
    }))

    const tsWrongTargetWorkspace = createTsFixture('wrong-target')
    cleanupPaths.push(tsWrongTargetWorkspace)
    records.push(await runWrongTargetScenario({
      client,
      workspacePath: tsWrongTargetWorkspace,
      caseId: 'case_ts_wrong_target',
    }))

    const tsMissedDependencyWorkspace = createTsFixture('missed-dependency')
    cleanupPaths.push(tsMissedDependencyWorkspace)
    records.push(await runMissedDependencyScenario({
      client,
      workspacePath: tsMissedDependencyWorkspace,
      caseId: 'case_ts_missed_dependency',
    }))

    const pyUnsupportedWorkspace = createPythonFixture('unsupported')
    cleanupPaths.push(pyUnsupportedWorkspace)
    records.push(await runPythonUnsupportedScenario({
      client,
      workspacePath: pyUnsupportedWorkspace,
      caseId: 'case_py_unsupported_fallback',
    }))

    const tsDirtyTreeWorkspace = createTsFixture('dirty-tree', { dirtyTree: true })
    cleanupPaths.push(tsDirtyTreeWorkspace)
    records.push(await runWorkflowBoundaryScenario({
      client,
      scenarioKey: 'ts-dirty-tree-baseline-noise',
      workspacePath: tsDirtyTreeWorkspace,
      expectedComparison: 'baseline_noise',
      seedBaselineCommand: stableFailureCommand,
      workflowCommand: stableFailureCommand,
      caseId: 'case_ts_dirty_tree_baseline_noise',
    }))

    const summary = summarize(records)
    const outputPath = env.COMPUTER_USE_BENCHMARK_OUTPUT?.trim()
      || join(packageDir, 'artifacts', 'coding-agentic-benchmark-v2.json')

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      harness: 'benchmark-coding-agentic-v2',
      summary,
      records,
    }, null, 2), 'utf8')

    for (const record of records) {
      console.info(`  ${record.pass ? '✓' : '✗'} ${record.caseId} :: cluster=${record.cluster} :: firstTargetHit=${String(record.firstTargetHit ?? 'n/a')} :: turns=${String(record.turnsToResolution ?? 'n/a')} :: rootCause=${record.rootCauseType || 'n/a'}`)
    }

    console.info(`\nComposite score(v2): ${summary.scoreProtocol.compositeScore}`)
    console.info(`JSON report: ${outputPath}`)

    if (summary.failed > 0) {
      throw new Error(`benchmark has ${summary.failed} failing case(s)`)
    }

    console.info('\n✅ Benchmark v2 passed: all scenarios succeeded.')
  }
  finally {
    await client.close().catch(() => {})
    for (const path of cleanupPaths) {
      rmSync(path, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error('\n❌ BENCHMARK HARNESS V2 FAILED')
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  exit(1)
})
