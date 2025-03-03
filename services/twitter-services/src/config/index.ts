import type { Config } from './types'

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { logger } from '../utils/logger'
import { DEFAULT_CONFIG } from './types'

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
    this.config = { ...DEFAULT_CONFIG }

    if (configPath) {
      this.loadFromFile(configPath)
    }

    this.validateConfig()
  }

  /**
   * 从文件加载配置
   */
  private loadFromFile(filePath: string): void {
    try {
      const configFile = fs.readFileSync(filePath, 'utf8')
      const fileConfig = JSON.parse(configFile)

      // 深度合并配置
      this.config = this.mergeConfigs(this.config, fileConfig)

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
    // 验证必要的 API 密钥
    if (!this.config.browserbase.apiKey) {
      console.warn('未设置 BrowserBase API 密钥!')
    }

    // 验证 Twitter 凭据
    if (!this.config.twitter.credentials?.username || !this.config.twitter.credentials?.password) {
      console.warn('未设置 Twitter 凭据!')
    }
  }

  /**
   * 递归合并配置对象
   */
  private mergeConfigs(target: any, source: any): any {
    const result = { ...target }

    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        result[key] = this.mergeConfigs(target[key], source[key])
      }
      else {
        result[key] = source[key]
      }
    }

    return result
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
    this.config = this.mergeConfigs(this.config, newConfig)
    this.validateConfig()
  }
}

/**
 * 创建默认配置管理器
 */
export function createDefaultConfig(): ConfigManager {
  const configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'twitter-config.json')

  return new ConfigManager(fs.existsSync(configPath) ? configPath : undefined)
}
