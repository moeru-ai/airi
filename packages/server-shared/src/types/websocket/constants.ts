/**
 * Shared WebSocket runtime constants used by both client & server.
 */

export const UNAUTH_TIMEOUT_MS = 5000

// Rate limiting
export const MESSAGE_RATE_LIMIT = 30
export const MESSAGE_RATE_WINDOW_MS = 5000 // 5s

// Heartbeat timing
export const HEARTBEAT_INTERVAL_MS = 10_000 // 10 seconds
export const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2
