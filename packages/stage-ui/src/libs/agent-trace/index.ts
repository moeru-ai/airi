import type { AgentTraceExporterOptions } from './exporter'

import { subscribeIOSpan } from '../../composables/use-io-tracer'
import { createAgentTraceExporter } from './exporter'

const FLUSH_INTERVAL_MS = 5_000

let exporter: ReturnType<typeof createAgentTraceExporter> | undefined

/**
 * Starts the upload of IO tracer spans to the API. Later calls do nothing.
 *
 * Spans upload every few seconds, and when the page is hidden.
 */
export function startAgentTraceUpload(options: AgentTraceExporterOptions) {
  if (exporter)
    return
  const started = createAgentTraceExporter(options)
  exporter = started
  subscribeIOSpan(started.handleSpan)
  setInterval(() => void started.flush(), FLUSH_INTERVAL_MS)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden')
        void started.flush({ keepalive: true })
    })
  }
}

/**
 * Records the provider of one step of the turn in `traceId`.
 *
 * Only a trace whose steps all used the official provider is uploaded. Does nothing before the upload starts.
 */
export function markAgentTraceStep(traceId: string, official: boolean) {
  exporter?.markStep(traceId, official)
}
