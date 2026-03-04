import type { BaseIssue, BaseSchema, InferIssue, InferOutput } from 'valibot'

import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { safeDestr } from 'destr'
import { app } from 'electron'
import { throttle } from 'es-toolkit'
import { safeParse } from 'valibot'

type ConfigStatus = 'ok' | 'missing' | 'invalid' | 'read-error'

export interface ConfigDiagnostics<T> {
  status: ConfigStatus
  path: string
  issues?: BaseIssue<unknown>[]
  error?: unknown
  raw?: string
  healed?: boolean
  value?: T
}

export interface CreateConfigOptions<T> {
  default?: T
  autoHeal?: boolean
  onValidationFailure?: (diagnostics: ConfigDiagnostics<T>) => void
  onReadError?: (diagnostics: ConfigDiagnostics<T>) => void
}

const persistenceMap = new Map<string, unknown>()
const diagnosticsMap = new Map<string, ConfigDiagnostics<unknown>>()

function createConfigPath(namespace: string, filename: string) {
  return join(app.getPath('userData'), `${namespace}-${filename}`)
}

type PersistedSchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>

function parseWithSchema<TSchema extends PersistedSchema>(
  raw: string,
  schema: TSchema,
): { value?: InferOutput<TSchema>, issues?: InferIssue<TSchema>[] } {
  const parsed = safeDestr<unknown>(raw)
  const result = safeParse(schema, parsed)
  if (result.success) {
    return { value: result.output }
  }
  return { issues: result.issues }
}

export function createConfig<TSchema extends PersistedSchema>(
  namespace: string,
  filename: string,
  schema: TSchema,
  options?: CreateConfigOptions<InferOutput<TSchema>>,
) {
  const key = `${namespace}:${filename}`
  const autoHeal = options?.autoHeal ?? Boolean(options?.default)

  const configPath = () => createConfigPath(namespace, filename)

  const recordDiagnostics = (diagnostics: ConfigDiagnostics<InferOutput<TSchema>>) => {
    diagnosticsMap.set(key, diagnostics)
    return diagnostics
  }

  const save = throttle(async () => {
    try {
      await writeFile(configPath(), JSON.stringify(persistenceMap.get(key)))
    }
    catch (error) {
      console.error('Failed to save config', error)
    }
  }, 250)

  const writeHealingConfig = async (value: InferOutput<TSchema>) => {
    try {
      await writeFile(configPath(), JSON.stringify(value))
      return true
    }
    catch (error) {
      console.error('Failed to heal config', error)
      return false
    }
  }

  const setup = () => {
    const path = configPath()
    if (!existsSync(path)) {
      const diagnostics = recordDiagnostics({
        status: 'missing',
        path,
        value: options?.default,
      })
      persistenceMap.set(key, options?.default)
      return diagnostics
    }

    try {
      const raw = readFileSync(path, { encoding: 'utf-8' })
      const parsed = parseWithSchema(raw, schema)
      if (parsed.value !== undefined) {
        const diagnostics = recordDiagnostics({
          status: 'ok',
          path,
          value: parsed.value,
        })
        persistenceMap.set(key, parsed.value)
        return diagnostics
      }

      const fallback = options?.default
      const diagnostics = recordDiagnostics({
        status: 'invalid',
        path,
        issues: parsed.issues,
        raw,
        value: fallback,
      })
      options?.onValidationFailure?.(diagnostics)
      persistenceMap.set(key, fallback)

      if (autoHeal && fallback !== undefined) {
        void writeHealingConfig(fallback).then((healed) => {
          if (healed) {
            diagnosticsMap.set(key, { ...diagnostics, healed })
          }
        })
      }
      return diagnostics
    }
    catch (error) {
      const fallback = options?.default
      const diagnostics = recordDiagnostics({
        status: 'read-error',
        path,
        error,
        value: fallback,
      })
      options?.onReadError?.(diagnostics)
      persistenceMap.set(key, fallback)
      return diagnostics
    }
  }

  const update = (newData: InferOutput<TSchema>) => {
    persistenceMap.set(key, newData)
    save()
  }

  const get = () => persistenceMap.get(key) as InferOutput<TSchema> | undefined

  const getDiagnostics = () => diagnosticsMap.get(key) as ConfigDiagnostics<InferOutput<TSchema>> | undefined

  return {
    setup,
    get,
    update,
    getDiagnostics,
  }
}
