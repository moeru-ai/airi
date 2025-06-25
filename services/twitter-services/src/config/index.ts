import type { Config } from './types'

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { merge } from '@moeru/std'
import { config as configDotenv } from 'dotenv'

import { logger } from '../utils/logger'
import { getDefaultConfig } from './types'

/**
 * Load environment variable files
 * Load in order of priority
 */
function loadEnvFiles(): void {
  // Load environment variable files
  const envFiles = [
    '.env.local',
  ]

  // Look for .env files from current directory upward
  for (const file of envFiles) {
    const filePath = path.resolve(process.cwd(), file)
    if (fs.existsSync(filePath)) {
      const result = configDotenv({
        path: filePath,
        override: true, // Allow overriding existing environment variables
      })

      if (result.parsed) {
        logger.config.withFields({
          config: result.parsed,
        }).log(`Loaded environment variables from ${file}`)
      }
    }
  }
}

/**
 * Configuration manager
 * Responsible for loading, validating and providing configuration
 */
export class ConfigManager {
  private config: Config

  /**
   * Create configuration manager
   * @param configPath Path to configuration file
   */
  constructor(configPath?: string) {
    // First load environment variables
    loadEnvFiles()

    // Set default configuration
    this.config = getDefaultConfig()

    // Then load from configuration file (if specified)
    if (configPath) {
      this.loadFromFile(configPath)
    }
  }

  /**
   * Load configuration from file
   */
  private loadFromFile(filePath: string): void {
    try {
      const configFile = fs.readFileSync(filePath, 'utf8')
      const fileConfig = JSON.parse(configFile)

      // Use defu to deeply merge configurations
      // Values in fileConfig take precedence over this.config
      this.config = merge(this.config, fileConfig)

      logger.config.log(`Configuration loaded from ${filePath}`)
    }
    catch (error) {
      logger.config.errorWithError(`Failed to load configuration file: ${(error as Error).message}`, error)
    }
  }

  /**
   * Get complete configuration
   */
  getConfig(): Config {
    return this.config
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<Config>): void {
    // Use defu to merge new configuration
    this.config = merge(this.config, newConfig)
  }
}

// Singleton instance
let configInstance: ConfigManager | null = null

/**
 * Create default configuration manager (singleton)
 */
export function useConfigManager(): ConfigManager {
  if (configInstance) {
    return configInstance
  }

  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'twitter-config.json')
  configInstance = new ConfigManager(fs.existsSync(configPath) ? configPath : undefined)
  return configInstance
}
