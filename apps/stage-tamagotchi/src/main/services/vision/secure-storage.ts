/**
 * 安全存储服务
 * 使用 Electron 的 safeStorage 模块安全存储敏感信息
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { consola } from 'consola'
import { app, safeStorage } from 'electron'

const logger = consola.create({ level: 4 })

/**
 * 安全存储配置
 */
export interface SecureStorageConfig {
  /** 存储目录 */
  storagePath: string
  /** 是否启用加密 */
  encryptionEnabled: boolean
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SecureStorageConfig = {
  storagePath: join(app.getPath('userData'), 'secure-storage'),
  encryptionEnabled: true,
}

// 当前配置
let currentConfig: SecureStorageConfig = { ...DEFAULT_CONFIG }

/**
 * 初始化安全存储
 */
export function initSecureStorage(config?: Partial<SecureStorageConfig>): void {
  if (config) {
    currentConfig = { ...currentConfig, ...config }
  }

  // 确保存储目录存在
  if (!existsSync(currentConfig.storagePath)) {
    mkdirSync(currentConfig.storagePath, { recursive: true })
  }

  // 检查 safeStorage 是否可用
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('Safe storage encryption is not available, falling back to plaintext')
    currentConfig.encryptionEnabled = false
  }

  logger.info('Secure storage initialized at:', currentConfig.storagePath)
}

/**
 * 加密字符串
 * @param plainText 明文
 * @returns 密文（Base64）
 */
export function encrypt(plainText: string): string {
  if (!currentConfig.encryptionEnabled) {
    return Buffer.from(plainText).toString('base64')
  }

  try {
    const encrypted = safeStorage.encryptString(plainText)
    return encrypted.toString('base64')
  }
  catch (error) {
    logger.error('Encryption failed:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * 解密字符串
 * @param cipherText 密文（Base64）
 * @returns 明文
 */
export function decrypt(cipherText: string): string {
  if (!currentConfig.encryptionEnabled) {
    return Buffer.from(cipherText, 'base64').toString('utf-8')
  }

  try {
    const buffer = Buffer.from(cipherText, 'base64')
    return safeStorage.decryptString(buffer)
  }
  catch (error) {
    logger.error('Decryption failed:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * 安全存储项
 */
interface StorageItem {
  value: string
  encrypted: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 存储数据
 * @param key 键名
 * @param value 值
 */
export function setItem(key: string, value: string): void {
  const filePath = join(currentConfig.storagePath, `${key}.json`)

  const item: StorageItem = {
    value: encrypt(value),
    encrypted: currentConfig.encryptionEnabled,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  // 如果文件已存在，保留创建时间
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf-8')) as StorageItem
      item.createdAt = existing.createdAt
    }
    catch {
      // 忽略解析错误
    }
  }

  writeFileSync(filePath, JSON.stringify(item, null, 2))
  logger.debug(`Secure storage: set item "${key}"`)
}

/**
 * 获取数据
 * @param key 键名
 * @returns 值，如果不存在返回 null
 */
export function getItem(key: string): string | null {
  const filePath = join(currentConfig.storagePath, `${key}.json`)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const item = JSON.parse(readFileSync(filePath, 'utf-8')) as StorageItem
    return decrypt(item.value)
  }
  catch (error) {
    logger.error(`Failed to get item "${key}":`, error)
    return null
  }
}

/**
 * 删除数据
 * @param key 键名
 */
export function removeItem(key: string): void {
  const filePath = join(currentConfig.storagePath, `${key}.json`)

  if (existsSync(filePath)) {
    try {
      const { unlinkSync } = require('node:fs')
      unlinkSync(filePath)
      logger.debug(`Secure storage: removed item "${key}"`)
    }
    catch (error) {
      logger.error(`Failed to remove item "${key}":`, error)
    }
  }
}

/**
 * 检查键是否存在
 * @param key 键名
 */
export function hasItem(key: string): boolean {
  const filePath = join(currentConfig.storagePath, `${key}.json`)
  return existsSync(filePath)
}

/**
 * 获取所有键名
 */
export function getAllKeys(): string[] {
  try {
    const { readdirSync } = require('node:fs')
    const files = readdirSync(currentConfig.storagePath)
    return files
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''))
  }
  catch {
    return []
  }
}

/**
 * 清除所有数据
 */
export function clearAll(): void {
  try {
    const keys = getAllKeys()
    for (const key of keys) {
      removeItem(key)
    }
    logger.info('Secure storage: cleared all items')
  }
  catch (error) {
    logger.error('Failed to clear secure storage:', error)
  }
}

/**
 * 安全存储 API 密钥
 * @param service 服务名称（如 'openai', 'gemini'）
 * @param apiKey API 密钥
 */
export function storeApiKey(service: string, apiKey: string): void {
  setItem(`apikey:${service}`, apiKey)
  logger.info(`API key stored for service: ${service}`)
}

/**
 * 获取 API 密钥
 * @param service 服务名称
 * @returns API 密钥，如果不存在返回 null
 */
export function getApiKey(service: string): string | null {
  return getItem(`apikey:${service}`)
}

/**
 * 删除 API 密钥
 * @param service 服务名称
 */
export function removeApiKey(service: string): void {
  removeItem(`apikey:${service}`)
  logger.info(`API key removed for service: ${service}`)
}

/**
 * 获取所有存储的服务名称
 */
export function getStoredServices(): string[] {
  const keys = getAllKeys()
  return keys
    .filter(k => k.startsWith('apikey:'))
    .map(k => k.replace('apikey:', ''))
}

/**
 * 存储视觉配置（敏感部分）
 * @param config 配置对象
 */
export function storeVisionConfig(config: Record<string, unknown>): void {
  // 只存储敏感字段
  const sensitiveFields = ['apiKey', 'apiSecret', 'accessToken', 'refreshToken']
  const toStore: Record<string, string> = {}

  for (const field of sensitiveFields) {
    if (config[field] && typeof config[field] === 'string') {
      toStore[field] = config[field] as string
    }
  }

  if (Object.keys(toStore).length > 0) {
    setItem('vision:config', JSON.stringify(toStore))
    logger.info('Vision config stored securely')
  }
}

/**
 * 获取视觉配置（敏感部分）
 * @returns 配置对象
 */
export function getVisionConfig(): Record<string, string> | null {
  const data = getItem('vision:config')
  if (!data)
    return null

  try {
    return JSON.parse(data) as Record<string, string>
  }
  catch {
    return null
  }
}

/**
 * 获取存储统计信息
 */
export function getStorageStats(): {
  totalItems: number
  totalSize: number
  services: string[]
} {
  const keys = getAllKeys()
  let totalSize = 0

  for (const key of keys) {
    const filePath = join(currentConfig.storagePath, `${key}.json`)
    try {
      const stats = require('node:fs').statSync(filePath)
      totalSize += stats.size
    }
    catch {
      // 忽略错误
    }
  }

  return {
    totalItems: keys.length,
    totalSize,
    services: getStoredServices(),
  }
}

/**
 * 导出所有数据（用于备份）
 * @returns 备份数据
 */
export function exportData(): Record<string, string> {
  const keys = getAllKeys()
  const data: Record<string, string> = {}

  for (const key of keys) {
    const value = getItem(key)
    if (value !== null) {
      data[key] = value
    }
  }

  return data
}

/**
 * 导入数据（用于恢复）
 * @param data 备份数据
 */
export function importData(data: Record<string, string>): void {
  for (const [key, value] of Object.entries(data)) {
    setItem(key, value)
  }
  logger.info(`Imported ${Object.keys(data).length} items to secure storage`)
}

/**
 * 获取配置
 */
export function getConfig(): SecureStorageConfig {
  return { ...currentConfig }
}

/**
 * 更新配置
 */
export function updateConfig(config: Partial<SecureStorageConfig>): void {
  currentConfig = { ...currentConfig, ...config }
  logger.info('Secure storage config updated')
}
