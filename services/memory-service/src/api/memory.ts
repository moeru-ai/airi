import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { Buffer } from 'node:buffer'
import { exec, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { pgDump } from '@electric-sql/pglite-tools/pg_dump'
import { Elysia, t } from 'elysia'

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

memoryRouter.post('/export-chathistory', async ({ set, query, headers }) => {
  try {
    const pglite = isPgliteReq(
      headers as Record<string, string | string[]>,
      query,
    )
    set.headers['Cache-Control'] = 'no-store'

    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    ensureDir(exportDir)

    if (!pglite) {
      const dbUrl = process.env.PG_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)
      const finalOut = path.join(exportDir, `chathistory_pg_backup_${Date.now()}.sql`)

      return new Promise((resolve, reject) => {
        const dump = spawn(
          'pg_dump',
          ['--no-owner', '--no-privileges', '--dbname', dbUrl, '--file', finalOut],
          { env: envVars },
        )

        let pgErr = ''

        dump.stderr.on('data', (d) => {
          pgErr += d.toString()
        })

        dump.on('error', (e: NodeJS.ErrnoException) => {
          set.status = 500
          reject(
            new Error(
              e?.code === 'ENOENT'
                ? 'pg_dump not found (install postgresql-client)'
                : 'Failed to run pg_dump',
            ),
          )
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

    const dataDir = process.env.PGLITE_DATA_DIR || path.join(exportDir, 'pglite_data')
    if (!fs.existsSync(dataDir)) {
      set.status = 400
      return 'PGlite data directory not found'
    }

    const pg = await PGlite.create({ dataDir })

    try {
      const dumpResult = await pgDump({ pg })
      const dumpContent = await dumpResult.text()

      const filename = `chathistory_pglite_backup_${Date.now()}.sql`
      const outDir = process.env.MEMORY_EXPORT_DIR || exportDir
      ensureDir(outDir)
      const outPath = path.join(outDir, filename)
      fs.writeFileSync(outPath, dumpContent)

      return 'PGlite Dump exported successfully'
    }
    catch (e) {
      console.error('PGlite dump failed: ', e)
      set.status = 500
      return 'Failed to run PGlite pg_dump'
    }
    finally {
      await pg.close()
    }
  }
  catch {
    if (!set.headersSent)
      set.status = 500
    return 'Export failed'
  }
})

memoryRouter.post('/export-embedded', ({ set, request }) => {
  const url = new URL(request.url)

  url.pathname = url.pathname.replace(/\/export-embedded$/, '/export-chathistory')
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
        return 'For Postgres/Embedded-Postgres, upload a .sql dump.'
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
      return { ok: true }
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
      return { ok: true }
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
