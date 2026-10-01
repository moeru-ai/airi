import type { BaseIssue, BaseSchema, InferIssue, InferOutput } from 'valibot'

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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

// Runtime snapshots belong to one physical config file, including its user-data directory.
const persistenceMap = new Map<string, unknown>()
const diagnosticsMap = new Map<string, ConfigDiagnostics<unknown>>()

function createConfigPath(namespace: string, filename: string) {
  return join(app.getPath('userData'), `${namespace}-${filename}`)
}

async function ensureConfigDirectory(path: string) {
  await mkdir(dirname(path), { recursive: true })
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

export interface Config<TSchema extends PersistedSchema> {
  setup: () => ConfigDiagnostics<InferOutput<TSchema>>
  get: () => InferOutput<TSchema> | undefined
  update: (newData: InferOutput<TSchema>) => void
  getDiagnostics: () => ConfigDiagnostics<InferOutput<TSchema>> | undefined
}

/** Binds cached state and asynchronous writes to the user-data directory at first use. Stores for one file share its snapshot. */
export function createConfig<TSchema extends PersistedSchema>(
  namespace: string,
  filename: string,
  schema: TSchema,
  options?: CreateConfigOptions<InferOutput<TSchema>>,
): Config<TSchema> {
  let boundPath: string | undefined
  const autoHeal = options?.autoHeal ?? Boolean(options?.default)

  // Main-process imports can create stores before startup applies the user-data directory override.
  const configPath = () => boundPath ??= createConfigPath(namespace, filename)

  const recordDiagnostics = (diagnostics: ConfigDiagnostics<InferOutput<TSchema>>) => {
    diagnosticsMap.set(diagnostics.path, diagnostics)
    return diagnostics
  }

  const save = throttle(async () => {
    try {
      const path = configPath()
      await ensureConfigDirectory(path)
      const tmpPath = `${path}.${randomUUID()}.tmp`
      await writeFile(tmpPath, JSON.stringify(persistenceMap.get(path)))
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
        status: 'missing',
        path,
        value: options?.default,
      })
      persistenceMap.set(path, options?.default)
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
        persistenceMap.set(path, parsed.value)
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
      persistenceMap.set(path, fallback)

      if (autoHeal && fallback !== undefined) {
        void writeHealingConfig(fallback).then((healed) => {
          if (healed) {
            diagnosticsMap.set(path, { ...diagnostics, healed })
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
      persistenceMap.set(path, fallback)
      return diagnostics
    }
  }

  const update = (newData: InferOutput<TSchema>) => {
    persistenceMap.set(configPath(), newData)
    save()
  }

  const get = () => persistenceMap.get(configPath()) as InferOutput<TSchema> | undefined

  const getDiagnostics = () => diagnosticsMap.get(configPath()) as ConfigDiagnostics<InferOutput<TSchema>> | undefined

  return {
    setup,
    get,
    update,
    getDiagnostics,
  }
}
