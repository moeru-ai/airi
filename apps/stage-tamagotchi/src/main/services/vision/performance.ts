/**
 * 性能优化服务
 * 提供截图缓存、节流控制、图像压缩等性能优化功能
 */

import { consola } from 'consola'

const logger = consola.create({ level: 4 })

/**
 * 性能配置
 */
export interface PerformanceConfig {
  /** 启用截图缓存 */
  enableCache: boolean
  /** 缓存最大数量 */
  maxCacheSize: number
  /** 缓存过期时间（毫秒） */
  cacheTTL: number
  /** 节流间隔（毫秒） */
  throttleInterval: number
  /** 图像压缩质量 (0-1) */
  imageQuality: number
  /** 最大图像尺寸 */
  maxImageDimension: number
  /** 启用图像压缩 */
  enableCompression: boolean
  /** 启用变化检测 */
  enableChangeDetection: boolean
  /** 变化检测阈值 (0-1) */
  changeThreshold: number
}

/**
 * 默认性能配置
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableCache: true,
  maxCacheSize: 5,
  cacheTTL: 60000, // 1分钟
  throttleInterval: 1000, // 1秒
  imageQuality: 0.8,
  maxImageDimension: 1920,
  enableCompression: true,
  enableChangeDetection: true,
  changeThreshold: 0.1, // 10% 变化阈值
}

// 当前配置
let currentConfig: PerformanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG }

/**
 * 缓存项
 */
interface CacheItem {
  key: string
  data: Buffer
  timestamp: number
  size: number
}

// 缓存存储
const cache = new Map<string, CacheItem>()

// 节流记录
const throttleMap = new Map<string, number>()

/**
 * 初始化性能服务
 */
export function initPerformanceService(config?: Partial<PerformanceConfig>): void {
  if (config) {
    currentConfig = { ...currentConfig, ...config }
  }
  logger.info('Performance service initialized')
}

/**
 * 获取配置
 */
export function getPerformanceConfig(): PerformanceConfig {
  return { ...currentConfig }
}

/**
 * 更新配置
 */
export function updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
  currentConfig = { ...currentConfig, ...config }
  logger.info('Performance config updated')
}

/**
 * 生成缓存键
 */
export function generateCacheKey(prefix: string, ...params: (string | number)[]): string {
  return `${prefix}:${params.join(':')}`
}

/**
 * 获取缓存
 */
export function getCachedData(key: string): Buffer | null {
  if (!currentConfig.enableCache) {
    return null
  }

  const item = cache.get(key)
  if (!item) {
    return null
  }

  // 检查是否过期
  const now = Date.now()
  if (now - item.timestamp > currentConfig.cacheTTL) {
    cache.delete(key)
    return null
  }

  logger.debug(`Cache hit: ${key}`)
  return item.data
}

/**
 * 设置缓存
 */
export function setCachedData(key: string, data: Buffer): void {
  if (!currentConfig.enableCache) {
    return
  }

  // 清理过期缓存
  cleanupExpiredCache()

  // 如果缓存已满，删除最旧的
  if (cache.size >= currentConfig.maxCacheSize) {
    const oldestKey = getOldestCacheKey()
    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }

  cache.set(key, {
    key,
    data,
    timestamp: Date.now(),
    size: data.length,
  })

  logger.debug(`Cache set: ${key}, size: ${data.length} bytes`)
}

/**
 * 清除缓存
 */
export function clearCache(): void {
  cache.clear()
  logger.info('Cache cleared')
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): {
  size: number
  count: number
  oldestItem: number | null
  newestItem: number | null
} {
  const items = Array.from(cache.values())

  return {
    size: items.reduce((sum, item) => sum + item.size, 0),
    count: items.length,
    oldestItem: items.length > 0 ? Math.min(...items.map(i => i.timestamp)) : null,
    newestItem: items.length > 0 ? Math.max(...items.map(i => i.timestamp)) : null,
  }
}

/**
 * 清理过期缓存
 */
function cleanupExpiredCache(): void {
  const now = Date.now()
  for (const [key, item] of cache.entries()) {
    if (now - item.timestamp > currentConfig.cacheTTL) {
      cache.delete(key)
    }
  }
}

/**
 * 获取最旧的缓存键
 */
function getOldestCacheKey(): string | null {
  let oldestKey: string | null = null
  let oldestTime = Infinity

  for (const [key, item] of cache.entries()) {
    if (item.timestamp < oldestTime) {
      oldestTime = item.timestamp
      oldestKey = key
    }
  }

  return oldestKey
}

/**
 * 节流函数
 * @param key 节流标识
 * @param fn 要执行的函数
 * @returns 是否执行了函数
 */
export function throttle<T>(key: string, fn: () => T): T | null {
  const now = Date.now()
  const lastTime = throttleMap.get(key) || 0

  if (now - lastTime < currentConfig.throttleInterval) {
    logger.debug(`Throttled: ${key}`)
    return null
  }

  throttleMap.set(key, now)
  return fn()
}

/**
 * 检查是否可以执行（不执行）
 */
export function canExecute(key: string): boolean {
  const now = Date.now()
  const lastTime = throttleMap.get(key) || 0
  return now - lastTime >= currentConfig.throttleInterval
}

/**
 * 重置节流
 */
export function resetThrottle(key: string): void {
  throttleMap.delete(key)
}

/**
 * 压缩图像
 * @param buffer 原始图像数据
 * @param quality 压缩质量 (0-1)
 * @returns 压缩后的数据
 */
export async function compressImage(
  buffer: Buffer,
  _quality?: number,
): Promise<Buffer> {
  if (!currentConfig.enableCompression) {
    return buffer
  }

  // 这里应该使用 sharp 或其他图像处理库
  // 暂时返回原图
  logger.debug(`Compressing image: ${buffer.length} bytes`)
  return buffer
}

/**
 * 调整图像尺寸
 * @param buffer 原始图像数据
 * @param maxDimension 最大尺寸
 * @returns 调整后的数据
 */
export async function resizeImage(
  buffer: Buffer,
  maxDimension?: number,
): Promise<Buffer> {
  const dimension = maxDimension || currentConfig.maxImageDimension

  // 这里应该使用 sharp 或其他图像处理库
  // 暂时返回原图
  logger.debug(`Resizing image, max dimension: ${dimension}`)
  return buffer
}

/**
 * 计算图像哈希（用于变化检测）
 */
export function calculateImageHash(buffer: Buffer): string {
  // 简单的哈希算法
  let hash = 0
  const step = Math.max(1, Math.floor(buffer.length / 1000))

  for (let i = 0; i < buffer.length; i += step) {
    hash = ((hash << 5) - hash) + buffer[i]
    hash = hash & hash
  }

  return Math.abs(hash).toString(16)
}

/**
 * 计算两个图像的相似度
 * @returns 相似度 (0-1)
 */
export function calculateSimilarity(hash1: string, hash2: string): number {
  if (hash1 === hash2) {
    return 1
  }

  // 简单的汉明距离计算
  let distance = 0
  const maxLength = Math.max(hash1.length, hash2.length)

  for (let i = 0; i < maxLength; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++
    }
  }

  return 1 - (distance / maxLength)
}

/**
 * 检查图像是否发生显著变化
 */
export function hasSignificantChange(
  currentHash: string,
  previousHash: string,
): boolean {
  if (!currentConfig.enableChangeDetection) {
    return true
  }

  const similarity = calculateSimilarity(currentHash, previousHash)
  const change = 1 - similarity

  logger.debug(`Image change detected: ${(change * 100).toFixed(2)}%`)

  return change >= currentConfig.changeThreshold
}

/**
 * 图像处理管道
 * @param buffer 原始图像数据
 * @returns 处理后的数据
 */
export async function processImage(buffer: Buffer): Promise<Buffer> {
  let processed = buffer

  // 调整尺寸
  processed = await resizeImage(processed)

  // 压缩
  processed = await compressImage(processed)

  return processed
}

/**
 * 内存使用统计
 */
export function getMemoryStats(): {
  used: number
  total: number
  percentage: number
} {
  const used = process.memoryUsage().heapUsed
  const total = process.memoryUsage().heapTotal

  return {
    used,
    total,
    percentage: total > 0 ? (used / total) * 100 : 0,
  }
}

/**
 * 性能监控
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T,
): T {
  const start = performance.now()
  const result = fn()
  const duration = performance.now() - start

  logger.debug(`Performance [${name}]: ${duration.toFixed(2)}ms`)

  return result
}

/**
 * 异步性能监控
 */
export async function measurePerformanceAsync<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start

  logger.info(`Performance [${name}]: ${duration.toFixed(2)}ms`)

  return result
}

/**
 * 批量处理优化
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(processor))
    results.push(...batchResults)

    // 批次间添加小延迟，避免阻塞
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  return results
}

/**
 * 智能重试机制
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (i < maxRetries - 1) {
        const delay = baseDelay * 2 ** i
        logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * 清理所有性能相关资源
 */
export function cleanup(): void {
  clearCache()
  throttleMap.clear()
  logger.info('Performance service cleaned up')
}
