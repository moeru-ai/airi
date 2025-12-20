import { fromEnv } from './env'

export function optionOrEnv<T extends string>(option: T | undefined, envKey: string, envDefault: T, options?: { validator: (value: string) => value is T }): T
export function optionOrEnv<T extends string>(option: T | undefined, envKey: string, envDefault?: undefined, options?: { validator: (value: string) => value is T }): undefined | T
export function optionOrEnv<T extends string>(option: T | undefined, envKey: string, envDefault?: T, options?: { validator: (value: string) => value is T }): T | undefined {
  if (option !== undefined) {
    return option
  }

  return fromEnv<T>(envKey, envDefault, options)
}
