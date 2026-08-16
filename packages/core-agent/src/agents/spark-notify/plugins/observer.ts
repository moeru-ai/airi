import type { SparkNotifyPlugin, SparkNotifyRuntimeEvent } from '../types'

/** Receives ordered lifecycle events from one Spark Notify run. */
export type SparkNotifyRuntimeObserver = (event: SparkNotifyRuntimeEvent) => void | Promise<void>

/** Adds an observer for diagnostics, telemetry adapters, or test recorders. */
export function createSparkNotifyObserverPlugin(observer: SparkNotifyRuntimeObserver): SparkNotifyPlugin {
  return {
    name: 'spark-notify-observer',
    prepare: () => ({ onEvent: observer }),
  }
}
