import { createError, createRouter, defineEventHandler, readBody } from 'h3'

import { hasGatewayAccess, isTrustedLocalRequest } from '../auth'

export interface WorkerHeartbeatRecord {
  receivedAt: number
  body: unknown
}

let lastHeartbeat: WorkerHeartbeatRecord | null = null

export function getLastWorkerHeartbeat(): WorkerHeartbeatRecord | null {
  return lastHeartbeat
}

export function createWorkerRoutes() {
  const router = createRouter()

  router.post('/api/workers/heartbeat', defineEventHandler(async (event) => {
    if (!isTrustedLocalRequest(event) && !hasGatewayAccess(event)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Worker heartbeat access denied.',
      })
    }
    const body = await readBody(event).catch(() => null)
    lastHeartbeat = { receivedAt: Date.now(), body }
    return { ok: true }
  }))

  return router
}
