import type { BaseIssue, BaseSchema, InferIssue, InferOutput } from 'valibot'

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { safeDestr } from 'destr'
import { app } from 'electron'
import { throttle } from 'es-toolkit'
import { safeParse } from 'valibot'

export interface ConfigDiagnostics<T> {
  error?: unknown
  healed?: boolean
  issues?: BaseIssue<unknown>[]
  path: string
  raw?: string
  status: ConfigStatus
  value?: T
}

export interface CreateConfigOptions<T> {
  autoHeal?: boolean
  default?: T
  onReadError?: (diagnostics: ConfigDiagnostics<T>) => void
  onValidationFailure?: (diagnostics: ConfigDiagnostics<T>) => void
}

type ConfigStatus = 'invalid' | 'missing' | 'ok' | 'read-error'

const persistenceMap = new Map<string, unknown>()
const diagnosticsMap = new Map<string, ConfigDiagnostics<unknown>>()

export interface Config<TSchema extends PersistedSchema> {
  get: () => InferOutput<TSchema> | undefined
  getDiagnostics: () => ConfigDiagnostics<InferOutput<TSchema>> | undefined
  setup: () => ConfigDiagnostics<InferOutput<TSchema>>
  update: (newData: InferOutput<TSchema>) => void
}

type PersistedSchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>

export function createConfig<TSchema extends PersistedSchema>(
  namespace: string,
  filename: string,
  schema: TSchema,
  options?: CreateConfigOptions<InferOutput<TSchema>>,
): Config<TSchema> {
  const key = `${namespace}:${filename}`
  const autoHeal = options?.autoHeal ?? Boolean(options?.default)

  const configPath = () => createConfigPath(namespace, filename)

  const recordDiagnostics = (diagnostics: ConfigDiagnostics<InferOutput<TSchema>>) => {
    diagnosticsMap.set(key, diagnostics)
    return diagnostics
  }

  const save = throttle(async () => {
    try {
      const path = configPath()
      await ensureConfigDirectory(path)
      const tmpPath = `${path}.${randomUUID()}.tmp`
      await writeFile(tmpPath, JSON.stringify(persistenceMap.get(key)))
      await rename(tmpPath, path)
    }
    catch (error) {
      console.error('Failed to save config', error)
    }
  }, 250)

  const writeHealingConfig = async (value: InferOutput<TSchema>) => {
    try {
      const path = configPath()
      await ensureConfigDirectory(path)
      if (existsSync(path)) {
        await copyFile(path, `${path}.bak`).catch(err => console.warn('Failed to create backup for config:', path, err))
      }
      await writeFile(path, JSON.stringify(value))
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
        path,
        status: 'missing',
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
          path,
          status: 'ok',
          value: parsed.value,
        })
        persistenceMap.set(key, parsed.value)
        return diagnostics
      }

      const fallback = options?.default
      const diagnostics = recordDiagnostics({
        issues: parsed.issues,
        path,
        raw,
        status: 'invalid',
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
        error,
        path,
        status: 'read-error',
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
    get,
    getDiagnostics,
    setup,
    update,
  }
}

function createConfigPath(namespace: string, filename: string) {
  return join(app.getPath('userData'), `${namespace}-${filename}`)
}

async function ensureConfigDirectory(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

function parseWithSchema<TSchema extends PersistedSchema>(
  raw: string,
  schema: TSchema,
): { issues?: InferIssue<TSchema>[], value?: InferOutput<TSchema> } {
  const parsed = safeDestr<unknown>(raw)
  const result = safeParse(schema, parsed)
  if (result.success) {
    return { value: result.output }
  }
  return { issues: result.issues }
}
