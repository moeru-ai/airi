/**
 * 隐私保护服务
 * 检测和脱敏敏感信息，保护用户隐私
 */

import { consola } from 'consola'

const logger = consola.create({ level: 4 })

/**
 * 敏感信息类型
 */
export type SensitiveType
  = | 'email'
    | 'phone'
    | 'creditCard'
    | 'ssn'
    | 'password'
    | 'apiKey'
    | 'token'
    | 'ipAddress'
    | 'url'
    | 'name'
    | 'address'

/**
 * 检测到的敏感信息
 */
export interface DetectedSensitiveInfo {
  type: SensitiveType
  value: string
  position: { start: number, end: number }
  confidence: number
}

/**
 * 隐私配置
 */
export interface PrivacyConfig {
  /** 启用隐私保护 */
  enabled: boolean
  /** 需要保护的敏感信息类型 */
  protectedTypes: SensitiveType[]
  /** 自定义敏感词列表 */
  customSensitiveWords: string[]
  /** 脱敏方式: mask(掩码) | remove(移除) | hash(哈希) */
  maskMode: 'mask' | 'remove' | 'hash'
  /** 保留前缀字符数（用于掩码模式） */
  maskKeepPrefix: number
  /** 保留后缀字符数（用于掩码模式） */
  maskKeepSuffix: number
  /** 掩码字符 */
  maskChar: string
}

/**
 * 默认隐私配置
 */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  enabled: true,
  protectedTypes: [
    'email',
    'phone',
    'creditCard',
    'password',
    'apiKey',
    'token',
    'ssn',
  ],
  customSensitiveWords: [],
  maskMode: 'mask',
  maskKeepPrefix: 2,
  maskKeepSuffix: 2,
  maskChar: '*',
}

// 正则表达式模式
const PATTERNS: Record<SensitiveType, RegExp> = {
  // 邮箱
  email: /\b[\w.%+-]+@[A-Z0-9.-]+\.[A-Z|]{2,}\b/gi,
  // 手机号（中国大陆）
  phone: /(?:(?:\+?86\s?)?1[3-9]\d{9}|\b\d{3,4}-\d{7,8}\b)/g,
  // 信用卡号
  creditCard: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|3(?:0[0-5]|[68]\d)\d{11}|6(?:011|5\d{2})\d{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
  // 身份证号（中国大陆）
  ssn: /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]\b/gi,
  // 密码
  password: /(?:password|pwd|passwd|密钥|密码)\s*[:=]\s*\S{4,}/gi,
  // API Key
  apiKey: /(?:api[_-]?key|apikey|app[_-]?key|secret[_-]?key)\s*[:=]\s*['"]?[\w-]{16,}['"]?/gi,
  // Token
  token: /(?:token|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[\w-]{16,}['"]?/gi,
  // IP 地址
  ipAddress: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\b/g,
  // URL
  url: /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,
  // 姓名（简单匹配）
  name: /(?:姓名|名字|Name)\s*[:：]\s*\S{2,8}/g,
  // 地址
  address: /(?:地址|Address)\s*[:：]\s*[^\n]{5,50}/g,
}

/**
 * 检测文本中的敏感信息
 * @param text 要检测的文本
 * @param config 隐私配置
 * @returns 检测到的敏感信息列表
 */
export function detectSensitiveInfo(
  text: string,
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): DetectedSensitiveInfo[] {
  if (!config.enabled) {
    return []
  }

  const detected: DetectedSensitiveInfo[] = []

  for (const type of config.protectedTypes) {
    const pattern = PATTERNS[type]
    if (!pattern)
      continue

    // 重置正则表达式
    pattern.lastIndex = 0

    let match
    while ((match = pattern.exec(text)) !== null) {
      detected.push({
        type,
        value: match[0],
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
        confidence: calculateConfidence(type, match[0]),
      })
    }
  }

  // 检测自定义敏感词
  for (const word of config.customSensitiveWords) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi')
    let match
    while ((match = regex.exec(text)) !== null) {
      detected.push({
        type: 'name', // 使用 name 作为通用类型
        value: match[0],
        position: {
          start: match.index,
          end: match.index + match[0].length,
        },
        confidence: 0.9,
      })
    }
  }

  // 按位置排序，去重（重叠的取置信度高的）
  return mergeOverlapping(detected.sort((a, b) => a.position.start - b.position.start))
}

/**
 * 计算置信度
 */
function calculateConfidence(type: SensitiveType, value: string): number {
  switch (type) {
    case 'email':
      return value.includes('@') ? 0.95 : 0.5
    case 'phone':
      return value.length >= 11 ? 0.9 : 0.7
    case 'creditCard':
      return luhnCheck(value.replace(/\s/g, '')) ? 0.95 : 0.6
    case 'ssn':
      return value.length === 18 ? 0.9 : 0.7
    case 'password':
    case 'apiKey':
    case 'token':
      return value.length > 20 ? 0.9 : 0.8
    default:
      return 0.7
  }
}

/**
 * Luhn 算法验证信用卡号
 */
function luhnCheck(cardNumber: string): boolean {
  let sum = 0
  let isEven = false

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = Number.parseInt(cardNumber.charAt(i), 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 合并重叠的检测结果
 */
function mergeOverlapping(detected: DetectedSensitiveInfo[]): DetectedSensitiveInfo[] {
  const merged: DetectedSensitiveInfo[] = []

  for (const item of detected) {
    const last = merged[merged.length - 1]

    if (last && item.position.start < last.position.end) {
      // 有重叠，保留置信度高的
      if (item.confidence > last.confidence) {
        merged[merged.length - 1] = item
      }
    }
    else {
      merged.push(item)
    }
  }

  return merged
}

/**
 * 脱敏处理
 * @param text 原始文本
 * @param detected 检测到的敏感信息
 * @param config 隐私配置
 * @returns 脱敏后的文本
 */
export function maskSensitiveInfo(
  text: string,
  detected: DetectedSensitiveInfo[],
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): string {
  if (!config.enabled || detected.length === 0) {
    return text
  }

  let result = text

  // 从后向前替换，避免位置变化
  for (let i = detected.length - 1; i >= 0; i--) {
    const item = detected[i]
    const masked = maskValue(item.value, config)
    result = result.slice(0, item.position.start) + masked + result.slice(item.position.end)
  }

  return result
}

/**
 * 对单个值进行脱敏
 */
function maskValue(value: string, config: PrivacyConfig): string {
  switch (config.maskMode) {
    case 'remove':
      return '[REMOVED]'
    case 'hash':
      return `[HASH:${simpleHash(value)}]`
    case 'mask':
    default:
      return maskString(value, config.maskKeepPrefix, config.maskKeepSuffix, config.maskChar)
  }
}

/**
 * 掩码字符串
 */
function maskString(
  str: string,
  keepPrefix: number,
  keepSuffix: number,
  maskChar: string,
): string {
  if (str.length <= keepPrefix + keepSuffix) {
    return maskChar.repeat(str.length)
  }

  const prefix = str.slice(0, keepPrefix)
  const suffix = str.slice(-keepSuffix)
  const maskedLength = str.length - keepPrefix - keepSuffix

  return prefix + maskChar.repeat(maskedLength) + suffix
}

/**
 * 简单哈希函数
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 8)
}

/**
 * 完整的隐私保护处理
 * @param text 原始文本
 * @param config 隐私配置
 * @returns 脱敏后的文本和检测信息
 */
export function protectPrivacy(
  text: string,
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): {
  sanitized: string
  detected: DetectedSensitiveInfo[]
  stats: Record<SensitiveType, number>
} {
  const detected = detectSensitiveInfo(text, config)
  const sanitized = maskSensitiveInfo(text, detected, config)

  // 统计
  const stats = {} as Record<SensitiveType, number>
  for (const item of detected) {
    stats[item.type] = (stats[item.type] || 0) + 1
  }

  if (detected.length > 0) {
    logger.info(`Privacy protection: detected and masked ${detected.length} sensitive items`, stats)
  }

  return { sanitized, detected, stats }
}

/**
 * 检查是否包含敏感信息
 * @param text 要检查的文本
 * @param config 隐私配置
 * @returns 是否包含敏感信息
 */
export function containsSensitiveInfo(
  text: string,
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): boolean {
  return detectSensitiveInfo(text, config).length > 0
}

/**
 * 安全日志记录
 * 自动脱敏敏感信息后记录
 */
export function safeLog(
  message: string,
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): void {
  const { sanitized } = protectPrivacy(message, config)
  logger.info(sanitized)
}

/**
 * 安全错误记录
 */
export function safeError(
  message: string,
  error: unknown,
  config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): void {
  const errorStr = error instanceof Error ? error.message : String(error)
  const { sanitized } = protectPrivacy(`${message}: ${errorStr}`, config)
  logger.error(sanitized)
}

// 当前配置
let currentPrivacyConfig: PrivacyConfig = { ...DEFAULT_PRIVACY_CONFIG }

/**
 * 更新隐私配置
 */
export function updatePrivacyConfig(config: Partial<PrivacyConfig>): void {
  currentPrivacyConfig = { ...currentPrivacyConfig, ...config }
  logger.info('Privacy config updated')
}

/**
 * 获取当前隐私配置
 */
export function getPrivacyConfig(): PrivacyConfig {
  return { ...currentPrivacyConfig }
}

/**
 * 初始化隐私服务
 */
export function initPrivacyService(config?: Partial<PrivacyConfig>): void {
  if (config) {
    updatePrivacyConfig(config)
  }
  logger.info('Privacy service initialized')
}
