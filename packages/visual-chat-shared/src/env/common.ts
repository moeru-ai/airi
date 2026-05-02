import process from 'node:process'

export function optionOrEnv<T extends string>(
  option: T | undefined,
  envKey: string,
  fallback: T,
  opts?: { validator?: (value: string) => value is T },
): T {
  if (option !== undefined)
    return option

  const envValue = process.env[envKey]
  if (envValue !== undefined) {
    if (opts?.validator) {
      return opts.validator(envValue) ? envValue : fallback
    }
    return envValue as T
  }

  return fallback
}

export function requireEnv(key: string): string {
  const value = process.env[key]
  if (value === undefined || value === '')
    throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export function envString(key: string, fallback: string): string {
  const value = process.env[key]
  if (value === undefined || value === '')
    return fallback
  return value
}

export function envInt(key: string, fallback: number): number {
  const value = process.env[key]
  if (value === undefined)
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key]
  if (value === undefined)
    return fallback
  return value === 'true' || value === '1'
}
