import type { Config } from './types'

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { defu } from 'defu'
import { config as configDotenv } from 'dotenv'

import { logger } from '../utils/logger'
import { getDefaultConfig } from './types'

/**
 * 加载环境变量文件
 * 按优先级顺序加载
 */
function loadEnvFiles(): void {
  // 加载环境变量文件
  const envFiles = [
    '.env.local',
  ]

  // 从当前目录向上查找 .env 文件
  for (const file of envFiles) {
    const filePath = path.resolve(process.cwd(), file)
    if (fs.existsSync(filePath)) {
      const result = configDotenv({
        path: filePath,
        override: true, // 允许覆盖已存在的环境变量
      })

      if (result.parsed) {
        logger.config.withFields({
          config: result.parsed,
        }).log(`已从 ${file} 加载环境变量`)
      }
    }
  }
}

/**
 * 配置管理器
 * 负责加载、验证和提供配置
 */
export class ConfigManager {
  private config: Config

  /**
   * 创建配置管理器
   * @param configPath 配置文件路径
   */
  constructor(configPath?: string) {
    // 首先加载环境变量
    loadEnvFiles()

    // 设置默认配置
    this.config = getDefaultConfig()

    // 然后从配置文件加载（如果指定）
    if (configPath) {
      this.loadFromFile(configPath)
    }

    // 验证配置
    this.validateConfig()
  }

  /**
   * 从文件加载配置
   */
  private loadFromFile(filePath: string): void {
    try {
      const configFile = fs.readFileSync(filePath, 'utf8')
      const fileConfig = JSON.parse(configFile)

      // 使用 defu 深度合并配置
      // fileConfig 中的值优先于 this.config 中的值
      this.config = defu(fileConfig, this.config)

      logger.config.log(`配置已从 ${filePath} 加载`)
    }
    catch (error) {
      logger.config.errorWithError(`加载配置文件失败: ${(error as Error).message}`, error)
    }
  }

  /**
   * 验证配置有效性
   */
  private validateConfig(): void {
    // 验证 Twitter 凭据
    if (!this.config.twitter.credentials?.username || !this.config.twitter.credentials?.password) {
      logger.config.warn('未设置 Twitter 凭据!')
    }

    logger.config.withFields({
      config: this.config,
    }).log('配置验证完成')
  }

  /**
   * 获取完整配置
   */
  getConfig(): Config {
    return this.config
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<Config>): void {
    // 使用 defu 合并新配置
    this.config = defu(newConfig, this.config)
    this.validateConfig()
  }
}

// 单例实例
let configInstance: ConfigManager | null = null

/**
 * 创建默认配置管理器 (单例)
 */
export function createDefaultConfig(): ConfigManager {
  if (configInstance) {
    return configInstance
  }

  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'twitter-config.json')
  configInstance = new ConfigManager(fs.existsSync(configPath) ? configPath : undefined)
  return configInstance
}
