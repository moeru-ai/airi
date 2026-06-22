/** Default heartbeat read timeout. */
export const serverWsDefaultHeartbeatTtlMs = 60_000

/** Number of liveness checks scheduled within one heartbeat TTL. */
export const serverWsHealthCheckIntervalDivisor = 5

/** Minimum interval to avoid busy liveness loops. */
export const serverWsMinimumHealthCheckIntervalMs = 5_000

/** Resolves the AIRI heartbeat health-check interval in milliseconds. */
export function resolveHealthCheckIntervalMs(heartbeatTtlMs: number) {
  return Math.max(serverWsMinimumHealthCheckIntervalMs, Math.floor(heartbeatTtlMs / serverWsHealthCheckIntervalDivisor))
}
