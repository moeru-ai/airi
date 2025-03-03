import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { logger } from './logger'

/**
 * Session cookie data structure
 */
export interface SessionData {
  cookies: Record<string, string>
  timestamp: string
  userAgent?: string
  username?: string
}

/**
 * Session manager utility
 * Responsible for loading and saving session data to/from files
 */
export class SessionManager {
  private sessionFilePath: string

  /**
   * Create a new session manager instance
   * @param sessionFilePath Optional custom path for the session file
   */
  constructor(sessionFilePath?: string) {
    this.sessionFilePath = sessionFilePath
      || path.join(process.cwd(), '.twitter.session.json')
  }

  /**
   * Save session data to file
   * @param data The session data to save
   */
  async saveSession(data: SessionData): Promise<boolean> {
    try {
      // Create session directory if it doesn't exist
      const dir = path.dirname(this.sessionFilePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Write session data to file
      fs.writeFileSync(
        this.sessionFilePath,
        JSON.stringify(data, null, 2),
        'utf8',
      )

      logger.auth.log(`Session saved to ${this.sessionFilePath}`)
      return true
    }
    catch (error: unknown) {
      logger.auth.withError(error as Error).error(`Failed to save session to ${this.sessionFilePath}`)
      return false
    }
  }

  /**
   * Load session data from file
   * @returns The loaded session data or null if file doesn't exist or is invalid
   */
  async loadSession(): Promise<SessionData | null> {
    try {
      // Check if session file exists
      if (!fs.existsSync(this.sessionFilePath)) {
        logger.auth.debug(`No session file found at ${this.sessionFilePath}`)
        return null
      }

      // Read and parse session data
      const data = JSON.parse(fs.readFileSync(this.sessionFilePath, 'utf8'))

      // Validate session data
      if (!data.cookies || typeof data.cookies !== 'object' || !data.timestamp) {
        logger.auth.warn(`Invalid session data in ${this.sessionFilePath}`)
        return null
      }

      // Check if session is too old (30 days)
      const sessionDate = new Date(data.timestamp)
      const ageInDays = (Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)
      if (ageInDays > 30) {
        logger.auth.warn(`Session is ${Math.floor(ageInDays)} days old and may be expired`)
      }

      logger.auth.log(`Loaded session from ${this.sessionFilePath} with ${Object.keys(data.cookies).length} cookies`)
      return data
    }
    catch (error: unknown) {
      logger.auth.withError(error as Error).error(`Failed to load session from ${this.sessionFilePath}`)
      return null
    }
  }

  /**
   * Delete the session file
   * @returns true if deletion was successful, false otherwise
   */
  deleteSession(): boolean {
    try {
      if (fs.existsSync(this.sessionFilePath)) {
        fs.unlinkSync(this.sessionFilePath)
        logger.auth.log(`Session file deleted: ${this.sessionFilePath}`)
        return true
      }
      return false
    }
    catch (error: unknown) {
      logger.auth.withError(error as Error).error(`Failed to delete session file: ${this.sessionFilePath}`)
      return false
    }
  }
}

// Create singleton instance
let sessionManagerInstance: SessionManager | null = null

/**
 * Get the session manager instance
 */
export function getSessionManager(sessionFilePath?: string): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(sessionFilePath)
  }
  return sessionManagerInstance
}
