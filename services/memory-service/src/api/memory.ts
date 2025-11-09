import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { Buffer } from 'node:buffer'
import { exec, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { pgDump } from '@electric-sql/pglite-tools/pg_dump'
import { sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import { useDrizzle } from '../db'
import { SettingsService } from '../services/settings'

function isPgliteReq(headers: Record<string, string | string[]>, query: Record<string, any>) {
  const h = String(headers['x-db-variant'] || '').toLowerCase()
  const q = String(query?.isPglite || '').toLowerCase()
  if (h === 'pglite')
    return true
  if (h === 'pg')
    return false
  if (['true', '1', 'yes', 'y', 'on'].includes(q))
    return true
  if (['false', '0', 'no', 'n', 'off'].includes(q))
    return false
  return false
}

function ensureDir(p: string) {
  if (!fs.existsSync(p))
    fs.mkdirSync(p, { recursive: true })
}

function parsePwdEnv(dbUrl: string) {
  const envVars: NodeJS.ProcessEnv = { ...process.env }
  const u = new URL(dbUrl)
  if (u.password)
    envVars.PGPASSWORD = decodeURIComponent(u.password)
  return envVars
}

const memoryRouter = new Elysia({ prefix: '/memory' })
const settingsService = SettingsService.getInstance()

const MODEL_SCOPED_TABLES = [
  'chat_messages',
  'chat_completions_history',
  'memory_episodes',
  'memory_fragments',
  'memory_entities',
  'memory_entity_relations',
  'memory_associations',
  'memory_consolidation_events',
  'memory_tags',
  'memory_tag_relations',
  'memory_search_history',
  'memory_access_patterns',
  'memory_long_term_goals',
  'memory_short_term_ideas',
  'memory_consolidated_memories',
]

function escapeLiteral(value: string): string {
  return value.replace(/'/g, '\'\'')
}

function isMissingRelation(error: unknown): boolean {
  if (!(error instanceof Error))
    return false
  const message = error.message.toLowerCase()
  return message.includes('does not exist') || message.includes('no such table')
}

function getHeaderValue(headers: Record<string, string | string[]>, name: string): string | undefined {
  const value = headers[name]
  if (Array.isArray(value))
    return value[0]
  return value as string | undefined
}

async function resolveTargetModelName(modelName?: string): Promise<string> {
  if (modelName && modelName.trim())
    return modelName.trim()

  const settings = await settingsService.getSettings()
  return settings.mem_llm_model || 'default'
}

async function ensureModelNames(modelName: string, variant: 'pg' | 'pglite', pgInstance?: PGlite) {
  const sanitized = escapeLiteral(modelName)

  if (variant === 'pglite') {
    if (!pgInstance)
      return

    for (const table of MODEL_SCOPED_TABLES) {
      try {
        await pgInstance.exec(`ALTER TABLE IF EXISTS "${table}" ADD COLUMN IF NOT EXISTS model_name TEXT`)
        await pgInstance.exec(`UPDATE "${table}" SET model_name = '${sanitized}' WHERE model_name IS NULL OR trim(model_name) = '' OR model_name = 'default'`)
      }
      catch (error) {
        if (!isMissingRelation(error))
          console.error(`Failed to update model_name for table ${table} (pglite):`, error)
      }
    }
    return
  }

  const db = useDrizzle()
  for (const table of MODEL_SCOPED_TABLES) {
    try {
      await db.execute(sql.raw(`ALTER TABLE IF EXISTS "${table}" ADD COLUMN IF NOT EXISTS model_name text`))
      await db.execute(sql.raw(`UPDATE "${table}" SET model_name = '${sanitized}' WHERE model_name IS NULL OR btrim(model_name) = '' OR model_name = 'default'`))
    }
    catch (error) {
      if (!isMissingRelation(error))
        console.error(`Failed to update model_name for table ${table}:`, error)
    }
  }
}

memoryRouter.post('/export-chat-pglite', async ({ set, query, headers }) => {
  try {
    const pgliteShouldBeUsed = isPgliteReq(headers as Record<string, string | string[]>, query)
    set.headers['Cache-Control'] = 'no-store'

    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    ensureDir(exportDir)

    if (!pglite) {
      const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)
      const homeDir = os.homedir()
      const exportDir = path.join(homeDir, 'airi_memory')
      ensureDir(exportDir)
      const finalOut = path.join(exportDir, `chathistory_pg_backup_${Date.now()}.sql`)

      return new Promise((resolve, reject) => {
        const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', finalOut], { env: envVars })
        let pgErr = ''

        dump.stderr.on('data', (d) => {
          pgErr += d.toString()
        })

        dump.on('error', async (e: NodeJS.ErrnoException) => { // Make handler async for await
          set.status = 500
          if (e?.code === 'ENOENT') {
            console.warn('pg_dump not found. Attempting PGlite fallback...')
            // Re-evaluate if PGlite should be used as a fallback
            const fallbackPglite = isPgliteReq(headers as Record<string, string | string[]>, query)
            if (fallbackPglite) {
              try {
                // Call the PGlite export function as a fallback
                const pgliteResult = await exportPglite(set)
                resolve(pgliteResult)
              }
              catch (pgliteError) {
                set.status = 500
                reject(new Error(`PGlite fallback failed: ${pgliteError instanceof Error ? pgliteError.message : String(pgliteError)}`))
              }
            }
            else {
              reject(new Error('pg_dump not found and PGlite is not enabled.'))
            }
          }
          else {
            reject(new Error(`Failed to run pg_dump: ${pgErr || e.message}`))
          }
        })

        dump.on('close', (code) => {
          if (code !== 0) {
            set.status = 500
            reject(pgErr || `pg_dump exited with ${code}`)
          }
          else {
            set.status = 200
            const sqlContent = fs.readFileSync(finalOut, 'utf-8')
            const headers = {
              'Content-Type': 'application/sql; charset=utf-8',
              'Content-Disposition': `attachment; filename="chathistory_pg_backup_${Date.now()}.sql"`,
              'X-Content-Type-Options': 'nosniff',
            }
            resolve(new Response(sqlContent, { headers }))
          }
        })
      })
    }
  }
  catch (error) {
    if (!set.headersSent) {
      set.status = 500
    }
    console.error('Export chat history error:', error)
    return 'Export failed'
  }
})

memoryRouter.post('/export-chat', ({ set, request }) => {
  const url = new URL(request.url)

  url.pathname = url.pathname.replace(/\/export-chat$/, '/export-chat-pglite')
  url.searchParams.set('isPglite', 'false')

  set.status = 307
  set.headers.Location = url.toString()
})

memoryRouter.post('/import-chathistory', async ({ body, set, headers, query }) => {
  const { file } = body as any
  if (!file || !(file instanceof File)) {
    set.status = 400
    return 'No file uploaded'
  }

  const requestedModelName = typeof query.modelName === 'string' ? query.modelName : getHeaderValue(headers, 'x-model-name')
  const resolvedModelName = await resolveTargetModelName(requestedModelName)

  const tmpPath = path.join(os.tmpdir(), file.name)
  const ab = await file.arrayBuffer()
  await writeFile(tmpPath, Buffer.from(ab))

  try {
    const pglite = isPgliteReq(headers, query)
    const homeDir = os.homedir()

    if (!pglite) {
      const dbUrl = process.env.PG_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)

      const name = (file.name || '').toLowerCase()
      if (!name.endsWith('.sql')) {
        set.status = 400
        return 'For PostgreSQL, upload a .sql dump.'
      }

      await new Promise<void>((resolve, reject) => {
        exec(`psql "${dbUrl}" -f "${tmpPath}"`, { env: envVars }, (error, _so, stderr) => {
          if (error) {
            set.status = 500
            reject(new Error(`Failed to restore database: ${stderr || error.message}`))
          }
          else {
            resolve()
          }
        })
      })
      await ensureModelNames(resolvedModelName, 'pg')
      return { ok: true, modelName: resolvedModelName }
    }

    const dataDir = process.env.PGLITE_DATA_DIR || path.join(homeDir, 'airi_memory', 'pglite_data')
    ensureDir(dataDir)

    const name = (file.name || '').toLowerCase()
    if (!name.endsWith('.sql')) {
      set.status = 400
      return 'Unsupported file. Use .sql dump from PGlite pg_dump.'
    }

    const pg = await PGlite.create({ dataDir })

    try {
      const sql = fs.readFileSync(tmpPath, 'utf8')
      await pg.exec(sql)
      await ensureModelNames(resolvedModelName, 'pglite', pg)
      return { ok: true, modelName: resolvedModelName }
    }
    catch (e) {
      console.error('PGlite import failed: ', e)
      set.status = 500
      return 'Failed to import PGlite data'
    }
    finally {
      await pg.close()
    }
  }
  catch {
    if (!set.headersSent)
      set.status = 500
    return 'Import failed'
  }
  finally {
    fs.unlink(tmpPath, () => {})
  }
}, {
  body: t.Object({
    file: t.File(),
  }),
})

export default memoryRouter
export { memoryRouter }
