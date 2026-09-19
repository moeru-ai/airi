import type { DesktopRuntimeMetricName } from '../../shared/eventa'

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { arch, env, platform } from 'node:process'

export type DesktopMainRuntimeMetricName = 'appWhenReadyMs' | 'browserWindowCreationMs'
export type DesktopRuntimeMetric = DesktopMainRuntimeMetricName | DesktopRuntimeMetricName

export interface DesktopRuntimeMetricsSnapshot {
  schemaVersion: 1
  runId: string
  platform: `${NodeJS.Platform}-${string}`
  startedAt: string
  measurements: Partial<Record<DesktopRuntimeMetric, number>>
}

interface DesktopRuntimeMetricsOptions {
  outputPath?: string
  runId?: string
}

/**
 * Records startup lifecycle marks for an opt-in packaged desktop benchmark.
 *
 * The recorder is inactive unless `DESKTOP_RUNTIME_METRICS_FILE` is set. This
 * keeps normal application startup free from filesystem writes while allowing
 * the packaged runtime harness to collect main and renderer marks in one file.
 */
export function createDesktopRuntimeMetrics(options: DesktopRuntimeMetricsOptions = {}) {
  const outputPath = options.outputPath ?? env.DESKTOP_RUNTIME_METRICS_FILE
  const runId = options.runId ?? env.DESKTOP_RUNTIME_RUN_ID ?? `desktop-runtime-${Date.now()}`
  const startedAtMonotonicMs = performance.now()
  let writeQueue = Promise.resolve()

  const snapshot: DesktopRuntimeMetricsSnapshot = {
    schemaVersion: 1,
    runId,
    platform: `${platform}-${arch}`,
    startedAt: new Date().toISOString(),
    measurements: {},
  }

  function persist() {
    if (!outputPath)
      return

    const nextWrite = async () => {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    }

    writeQueue = writeQueue.then(nextWrite).catch((error) => {
      console.warn('[desktop-runtime-metrics] failed to write metrics:', error)
    })
  }

  function record(name: DesktopRuntimeMetric, valueMs = performance.now() - startedAtMonotonicMs) {
    if (!outputPath)
      return

    snapshot.measurements[name] ??= valueMs
    persist()
  }

  return {
    record,
    snapshot,
  }
}
