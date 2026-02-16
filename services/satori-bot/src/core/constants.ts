/**
 * Bot configuration constants
 * Centralized configuration values for the satori-bot
 */

// Loop and timing constants
export const LOOP_CONTINUE_DELAY_MS = 2500
export const PERIODIC_LOOP_INTERVAL_MS = 60 * 1000
export const SLEEP_DURATION_MS = 30 * 1000

// Context size limits
export const MAX_MESSAGES_IN_CONTEXT = 20
export const MAX_ACTIONS_IN_CONTEXT = 50
export const MAX_UNREAD_EVENTS = 100

// Recent interaction tracking
export const MAX_RECENT_INTERACTED_CHANNELS = 5

// Context trimming - how many items to keep when trimming
export const MESSAGES_KEEP_ON_TRIM = 5
export const ACTIONS_KEEP_ON_TRIM = 20
