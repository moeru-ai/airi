export function sanitizeCloneable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null)
    return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return value
  if (typeof value === 'symbol' || typeof value === 'function')
    return undefined

  const rawValue = value

  if (Array.isArray(rawValue)) {
    return rawValue
      .map(item => sanitizeCloneable(item, seen))
      .filter(item => item !== undefined)
  }

  if (rawValue instanceof Date)
    return rawValue.toISOString()

  if (rawValue instanceof RegExp)
    return rawValue.toString()

  if (typeof rawValue !== 'object')
    return rawValue

  if (seen.has(rawValue))
    return undefined
  seen.add(rawValue)

  const proto = Object.getPrototypeOf(rawValue)
  if (proto !== Object.prototype && proto !== null)
    return undefined

  return Object.fromEntries(
    Object.entries(rawValue)
      .map(([key, nestedValue]) => [key, sanitizeCloneable(nestedValue, seen)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined),
  )
}
