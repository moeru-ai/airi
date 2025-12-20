import { env } from 'node:process'

export function fromEnv<T extends string>(envKey: string, envDefault?: T, options?: { validator?: (value: string) => value is T }): T | undefined {
  const value = env[envKey] ?? envDefault
  if (value === undefined) {
    return undefined
  }

  if (options?.validator) {
    if (options.validator(value)) {
      return value
    }
    else {
      return undefined
    }
  }

  return value as T
}
