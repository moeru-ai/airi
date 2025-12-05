// validation.ts

// ---- Basic field validators ----
export function assertString(value: unknown, field: string, event: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return `the field '${field}' must be a non-empty string for event '${event}'`
  }
  return null
}

export function assertNonNegInt(value: unknown, field: string, event: string): string | null {
  if (value === undefined)
    return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `the field '${field}' must be a non-negative integer for event '${event}'`
  }
  return null
}

// ---- Config validation ----
export function validateConfig(value: unknown, path = 'config'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return null

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const childErr = validateConfig(value[i], `${path}[${i}]`)
        if (childErr)
          return childErr
      }
      return null
    }

    const entries = Object.entries(value as Record<string, unknown>)
    for (const [key, child] of entries) {
      if (!key.length)
        return `config object keys must be non-empty strings at '${path}'`
      const childErr = validateConfig(child, `${path}.${key}`)
      if (childErr)
        return childErr
    }
    return null
  }

  return `config contains unsupported value at '${path}'`
}

export function assertConfig(value: unknown): string | null {
  if (value === undefined)
    return `'config' is required for event 'ui:configure'`
  if (value === null || (typeof value !== 'object' && !Array.isArray(value)))
    return `'config' must be an object or array for event 'ui:configure'`
  return validateConfig(value)
}
