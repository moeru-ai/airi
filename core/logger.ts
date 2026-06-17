/**
 * AIRI Core — Lightweight Structured Logging
 *
 * Minimal logging utility with level support, ISO-8601 timestamps,
 * and module/source tagging. No external dependencies.
 *
 * Design decisions:
 * - Factory pattern (createLogger) so each module gets a tagged logger.
 * - Levels: debug, info, warn, error.
 * - Timestamps are ISO-8601 for easy parsing.
 * - Output goes to console; future sinks (file, remote) can be added
 *   by replacing the log() function body.
 */

/**
 * Supported log levels. Ordered by severity.
 */
export type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * Log levels ranked by severity. Used to filter output.
 */
const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
}

/**
 * Minimum level to emit. Configured globally.
 * Everything below this level is silently dropped.
 */
let minLevel: LogLevel = "debug"

/**
 * Configure the global minimum log level.
 *
 * @param level — Messages below this level are dropped.
 */
export function setLogLevel(level: LogLevel): void {
	minLevel = level
}

/**
 * Get the current minimum log level.
 */
export function getLogLevel(): LogLevel {
	return minLevel
}

/**
 * Check whether a message at the given level would be emitted.
 */
function shouldEmit(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

/**
 * Format a log entry as a single string.
 *
 * Format: 2025-01-15T10:30:00.000Z [source] LEVEL message ...args
 */
function format(source: string, level: LogLevel, message: string, args: unknown[]): string {
	const timestamp = new Date().toISOString()
	const base = `${timestamp} [${source}] ${level.toUpperCase()} ${message}`

	if (args.length === 0) return base

	// Stringify additional args — keep it simple, no heavy serialization.
	const rest = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")

	return `${base} ${rest}`
}

/**
 * Emit a log entry to the console.
 *
 * Each level maps to its console counterpart so that DevTools filtering works.
 */
function log(source: string, level: LogLevel, message: string, ...args: unknown[]): void {
	if (!shouldEmit(level)) return

	const formatted = format(source, level, message, args)

	switch (level) {
		case "debug":
			console.debug(formatted)
			break
		case "info":
			console.info(formatted)
			break
		case "warn":
			console.warn(formatted)
			break
		case "error":
			console.error(formatted)
			break
		default:
			break
	}
}

/**
 * Logger interface returned by createLogger().
 *
 * All methods accept a message string followed by optional additional
 * arguments which are stringified to JSON.
 */
export interface Logger {
	/** Debug-level message. Only emitted when minLevel is "debug". */
	debug(message: string, ...args: unknown[]): void

	/** Info-level message. */
	info(message: string, ...args: unknown[]): void

	/** Warn-level message. */
	warn(message: string, ...args: unknown[]): void

	/** Error-level message. */
	error(message: string, ...args: unknown[]): void
}

/**
 * Create a tagged logger instance.
 *
 * @param source — A short identifier for the emitting module (e.g. "core", "code").
 *
 * @example
 * ```ts
 * const logger = createLogger("code")
 * logger.info("Module activated")
 * // 2025-01-15T10:30:00.000Z [code] INFO Module activated
 * ```
 */
export function createLogger(source: string): Logger {
	return {
		debug: (msg, ...args) => log(source, "debug", msg, ...args),
		info: (msg, ...args) => log(source, "info", msg, ...args),
		warn: (msg, ...args) => log(source, "warn", msg, ...args),
		error: (msg, ...args) => log(source, "error", msg, ...args),
	}
}
