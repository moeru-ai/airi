import { envInt } from '@proj-airi/visual-chat-shared'

import { WORKER_DEFAULT_PORT } from '../env/defaults'

const DEFAULT_INTERVAL_MS = 10_000

export function startHeartbeat(config: { gatewayUrl: string, intervalMs?: number }): { stop: () => void } {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS
  const base = config.gatewayUrl.replace(/\/$/, '')
  const url = `${base}/api/workers/heartbeat`
  const port = envInt('WORKER_PORT', WORKER_DEFAULT_PORT)
  const healthUrl = `http://127.0.0.1:${port}/health`

  const tick = async () => {
    let payload: Record<string, unknown> = { status: 'unknown', workerPort: port }
    try {
      const res = await fetch(healthUrl)
      if (res.ok)
        payload = { ...(await res.json() as Record<string, unknown>), workerPort: port }
    }
    catch {
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    catch {
    }
  }

  void tick()
  const id = setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop: () => clearInterval(id),
  }
}
