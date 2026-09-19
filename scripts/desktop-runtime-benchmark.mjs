import process from 'node:process'

import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Runs cold and warm packaged AIRI startup measurements.
 *
 * Call stack:
 *
 * runRuntimeBenchmark
 *   -> runMeasurement
 *     -> waitForMetrics
 *   -> summarizeMeasurements
 *
 * The packaged application records main-process and renderer lifecycle marks
 * only when `DESKTOP_RUNTIME_METRICS_FILE` is set.
 */

const root = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'))
const benchmarkRoot = join(root, 'docs/ai/benchmarks/desktop-bundle-size')
const experimentId = readArgument('--experiment', 'optimized-payload')
const runCount = Number.parseInt(readArgument('--runs', '3'), 10)
const timeoutMs = Number.parseInt(readArgument('--timeout-ms', '60000'), 10)
const offlineMode = process.argv.includes('--offline')
const packagedExecutablePath = process.env.DESKTOP_RUNTIME_APP_PATH

function readArgument(name, fallback) {
  const prefix = `${name}=`
  const argument = process.argv.slice(2).find(value => value.startsWith(prefix))
  return argument ? argument.slice(prefix.length) : fallback
}

function packagedExecutable() {
  if (packagedExecutablePath)
    return resolve(packagedExecutablePath)
  if (process.platform === 'darwin')
    return join(root, `apps/stage-tamagotchi/dist/mac-${process.arch}/airi.app/Contents/MacOS/airi`)
  if (process.platform === 'win32')
    return join(root, `apps/stage-tamagotchi/dist/win-${process.arch}/AIRI.exe`)
  return join(root, `apps/stage-tamagotchi/dist/linux-${process.arch}/airi`)
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function waitForMetrics(path, child) {
  const deadline = Date.now() + timeoutMs
  let usableUiObservedAt
  while (Date.now() < deadline) {
    if (await pathExists(path)) {
      try {
        const metrics = JSON.parse(await readFile(path, 'utf8'))
        if (metrics.measurements?.firstUsableUiMs !== undefined && usableUiObservedAt === undefined)
          usableUiObservedAt = Date.now()
        const rendererStartupMetricsComplete = metrics.measurements?.firstPaintMs !== undefined
          && metrics.measurements?.firstUsableUiMs !== undefined
          && metrics.measurements?.defaultModelLoadMs !== undefined
        if (rendererStartupMetricsComplete || (usableUiObservedAt !== undefined && Date.now() - usableUiObservedAt >= 5000))
          return metrics
      }
      catch {
        // The main process may still be writing the JSON file.
      }
    }

    if (child.exitCode !== null)
      break
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200))
  }

  throw new Error(`Timed out waiting for packaged runtime metrics at ${path}`)
}

function signalApplication(child, signal) {
  if (child.exitCode !== null)
    return

  if (process.platform === 'win32') {
    child.kill()
    return
  }

  process.kill(-child.pid, signal)
}

async function stopApplication(child) {
  if (child.exitCode !== null)
    return

  signalApplication(child, 'SIGTERM')
  await new Promise(resolvePromise => setTimeout(resolvePromise, 2000))
  if (child.exitCode === null)
    signalApplication(child, 'SIGKILL')
  if (child.exitCode === null) {
    await new Promise((resolvePromise) => {
      child.once('exit', resolvePromise)
      setTimeout(resolvePromise, 1000)
    })
  }
}

async function runMeasurement(kind, index, userDataPath) {
  const networkMode = offlineMode ? 'offline' : 'online'
  const runId = `${experimentId}-${networkMode}-${kind}-${index + 1}`
  const outputPath = join(benchmarkRoot, 'runtime-runs', `${runId}.json`)
  await rm(outputPath, { force: true })

  const child = spawn(packagedExecutable(), [], {
    cwd: root,
    env: {
      ...process.env,
      APP_USER_DATA_PATH: userDataPath,
      DESKTOP_RUNTIME_METRICS_FILE: outputPath,
      DESKTOP_RUNTIME_RUN_ID: runId,
      DESKTOP_RUNTIME_OFFLINE: offlineMode ? '1' : '0',
    },
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  })

  try {
    const metrics = await waitForMetrics(outputPath, child)
    await writeFile(outputPath, `${JSON.stringify(metrics, null, 2)}\n`)
    return { kind, index: index + 1, ...metrics }
  }
  finally {
    await stopApplication(child)
  }
}

function percentile(values, ratio) {
  if (values.length === 0)
    return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index]
}

function summarizeMeasurements(runs) {
  const names = ['appWhenReadyMs', 'browserWindowCreationMs', 'firstPaintMs', 'firstUsableUiMs', 'defaultModelLoadMs', 'onnxInitializationMs']
  const measurements = {}

  for (const name of names) {
    const values = Object.fromEntries(['cold', 'warm'].map((kind) => {
      const kindValues = runs
        .filter(run => run.kind === kind)
        .map(run => run.measurements?.[name])
        .filter(value => typeof value === 'number')
      return [kind, {
        status: kindValues.length === runCount ? 'measured' : 'partially-measured',
        values: kindValues,
        medianMs: percentile(kindValues, 0.5),
        p95Ms: percentile(kindValues, 0.95),
      }]
    }))

    measurements[name] = values
  }

  return measurements
}

async function runRuntimeBenchmark() {
  if (!await pathExists(packagedExecutable()))
    throw new Error(`Packaged executable not found: ${packagedExecutable()}`)
  if (!Number.isInteger(runCount) || runCount < 1)
    throw new Error('--runs must be a positive integer')

  const runRoot = await mkdtemp(join(tmpdir(), 'airi-desktop-runtime-'))
  const warmUserDataPath = join(runRoot, 'warm-user-data')
  const runs = []

  try {
    for (let index = 0; index < runCount; index++) {
      const coldUserDataPath = join(runRoot, `cold-${index + 1}`)
      runs.push(await runMeasurement('cold', index, coldUserDataPath))
    }
    for (let index = 0; index < runCount; index++)
      runs.push(await runMeasurement('warm', index, warmUserDataPath))
  }
  finally {
    await rm(runRoot, { recursive: true, force: true })
  }

  const result = {
    schemaVersion: 1,
    experimentId,
    platform: `${process.platform}-${process.arch}`,
    repetitions: runCount,
    measurements: summarizeMeasurements(runs),
    offlineFirstRun: offlineMode
      ? { status: 'measured', runs: runs.filter(run => run.kind === 'cold').length }
      : { status: 'not-measured', reason: 'Run this harness with --offline to enable network isolation.' },
    nativeLoading: { status: 'not-measured', reason: 'Runtime native loading requires a platform-specific smoke target.' },
    runs,
  }
  const outputSuffix = offlineMode ? '-offline' : ''
  const outputPath = join(benchmarkRoot, `experiments/runtime-${experimentId}${outputSuffix}.json`)
  await mkdir(join(benchmarkRoot, 'experiments'), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  console.info(JSON.stringify({ outputPath, result }, null, 2))
}

await runRuntimeBenchmark()
