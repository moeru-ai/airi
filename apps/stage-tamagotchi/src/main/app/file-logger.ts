/**
 * File Logger for Electron Main Process
 *
 * Sets up file-based logging by creating timestamped log files in the userData directory.
 *
 * Log file naming: airi-tamagotchi-{timestamp}.log
 * - No rotation needed due to unique timestamp per session
 * - No concurrent write issues (single Electron instance per timestamp)
 * - Easy to identify and debug specific sessions
 *
 * @example
 * ```typescript
 * const fileLogger = await setupFileLogger()
 * setGlobalFormat(Format.Pretty)
 * setGlobalLogLevel(LogLevel.Log)
 *
 * setGlobalHookPostLog((log, formatted) => {
 *   if (fileLogger.logFileFd !== null) {
 *     void fileLogger.appendLog(formatted)
 *   }
 * })
 * ```
 */

import { mkdir, open, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { app } from 'electron'

// ============================================================================
// Constants
// ============================================================================

const LOG_FILE_PREFIX = 'airi-tamagotchi'

// ============================================================================
// Public Types
// ============================================================================

/**
 * Handle for the file logger, providing access to the log file and append operations.
 */
export interface FileLoggerHandle {
  /** Path to the current session's log file, or null if initialization failed */
  logFilePath: string | null
  /** File descriptor for the current session's log file, or null if initialization failed */
  logFileFd: number | null
  /**
   * Appends a log entry to the file.
   * @param content - The formatted log content to append
   */
  appendLog: (content: string) => Promise<void>
  /**
   * Closes the log file and releases resources.
   */
  close: () => Promise<void>
}

export const nullFileLoggerHandle: FileLoggerHandle = {
  logFilePath: null,
  logFileFd: null,
  appendLog: async () => {},
  close: async () => {},
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Extracts a human-readable error message from an unknown error object.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Generates the log file path for the current session.
 * Format: {userData}/logs/airi-tamagotchi-{timestamp}.log
 */
function createLogFilePath(logsDir: string, timestamp: number): string {
  return join(logsDir, `${LOG_FILE_PREFIX}-${timestamp}.log`)
}

/**
 * Ensures the logs directory exists.
 * Returns the logs directory path if successful, null otherwise.
 */
async function ensureLogsDirectory(): Promise<string | null> {
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    await mkdir(logsDir, { recursive: true })
    return logsDir
  }
  catch (error) {
    const message = getErrorMessage(error)
    console.error(`[FileLogger] Failed to create logs directory: ${message}`)
    return null
  }
}

/**
 * Checks if the current log file exists and returns its size.
 */
async function getLogFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await stat(filePath)
    return stats.size
  }
  catch {
    return null
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Sets up the file logger by creating a timestamped log file.
 *
 * Returns a {@link FileLoggerHandle} that provides:
 * - `logFilePath`: Path to the log file (null if failed)
 * - `logFileFd`: File descriptor (null if failed)
 * - `appendLog(content)`: Async function to append logs to the file
 * - `close()`: Async function to close the file
 *
 * Note: This function only creates the file. The caller is responsible for
 * registering the `setGlobalHookPostLog` hook from @guiiai/logg.
 */
export async function setupFileLogger(): Promise<FileLoggerHandle> {
  const timestamp = Date.now()

  const logsDir = await ensureLogsDirectory()
  if (!logsDir) {
    return nullFileLoggerHandle
  }

  const logFilePath = createLogFilePath(logsDir, timestamp)

  try {
    const fileHandle = await open(logFilePath, 'a')
    const logFileFd = fileHandle.fd
    let isFileClosed = false

    // Write initialization message
    const sessionStartMessage = `[FileLogger] Initialized - logging to: ${logFilePath}\n`
    await fileHandle.appendFile(sessionStartMessage)

    console.info(`[FileLogger] Session logs: ${logFilePath}`)

    async function appendLog(content: string) {
      if (isFileClosed) {
        return
      }

      const normalizedContent = content.endsWith('\n') ? content : `${content}\n`

      try {
        await fileHandle.appendFile(normalizedContent)
      }
      catch (error) {
        const message = getErrorMessage(error)
        console.error(`[FileLogger] Failed to write log: ${message}`)
      }
    }

    async function close() {
      if (isFileClosed) {
        return
      }

      isFileClosed = true

      try {
        await fileHandle.close()
        console.info('[FileLogger] File closed successfully')
      }
      catch (error) {
        const message = getErrorMessage(error)
        console.error(`[FileLogger] Failed to close log file: ${message}`)
      }

      const size = await getLogFileSize(logFilePath)
      const sizeInfo = size !== null ? ` (${(size / 1024).toFixed(2)} KB)` : ''
      console.info(`[FileLogger] Session log file: ${logFilePath}${sizeInfo}`)
    }

    const handle: FileLoggerHandle = { logFilePath, logFileFd, appendLog, close }

    return handle
  }
  catch (error) {
    const message = getErrorMessage(error)
    console.error(`[FileLogger] Failed to create log file - logging to console only: ${message}`)
    return nullFileLoggerHandle
  }
}
