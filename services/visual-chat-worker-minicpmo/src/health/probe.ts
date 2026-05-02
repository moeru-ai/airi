import type { InferenceWorkerLoop } from '../worker-loop'

import { defineEventHandler, setResponseHeaders } from 'h3'

export function createHealthProbeHandler(getWorker: () => InferenceWorkerLoop | null) {
  return defineEventHandler((event) => {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': event.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })

    const worker = getWorker()
    if (!worker) {
      return { status: 'model_not_ready', ok: false }
    }

    const state = worker.getState()
    return {
      status: state.status,
      ok: state.status === 'running',
      currentCnt: state.currentCnt,
      metrics: state.metrics,
    }
  })
}
