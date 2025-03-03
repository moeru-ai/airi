/**
 * 从任意错误类型中安全地提取错误消息
 * 处理 Error 对象、字符串、对象和其他类型
 *
 * @param error - 任意错误对象
 * @param fallbackMessage - 当无法提取消息时的后备消息
 * @returns 格式化的错误消息
 */
export function errorToMessage(error: unknown, fallbackMessage = '未知错误'): string {
  if (error === null || error === undefined) {
    return fallbackMessage
  }

  // 处理标准 Error 对象
  if (error instanceof Error) {
    return error.message
  }

  // 处理字符串错误
  if (typeof error === 'string') {
    return error
  }

  // 处理带有 message 属性的对象
  if (typeof error === 'object') {
    // 检查是否有 message 属性
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }

    // 尝试将对象转换为字符串
    try {
      return JSON.stringify(error)
    }
    catch {
      // 如果无法序列化，返回对象的字符串表示
      return String(error)
    }
  }

  // 针对其他情况，尝试强制转换为字符串
  return String(error)
}

/**
 * 创建一个带有详细上下文信息的错误
 *
 * @param message - 错误消息
 * @param originalError - 原始错误对象（可选）
 * @param context - 额外上下文信息（可选）
 * @returns 增强的错误对象
 */
export function createError(
  message: string,
  originalError?: unknown,
  context?: Record<string, unknown>,
): Error {
  let errorMessage = message

  // 添加原始错误信息
  if (originalError) {
    errorMessage += `: ${errorToMessage(originalError)}`
  }

  // 创建新的错误对象
  const error = new Error(errorMessage)

  // 添加上下文信息
  if (context) {
    Object.assign(error, { context })
  }

  return error
}
