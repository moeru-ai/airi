import type { Request, Response } from 'express'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { exec, spawn } from 'node:child_process'
import { PassThrough, pipeline } from 'node:stream'
import { createGzip } from 'node:zlib'

import multer from 'multer'

import { Router } from 'express'

const memoryRouter = Router()
const upload = multer({ dest: os.tmpdir() })

function isPgliteReq(req: Request) {
  const h = String(req.headers['x-db-variant'] || '').toLowerCase()
  const q = String((req.query as any)?.isPglite || '').toLowerCase()
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

memoryRouter.post('/export-chathistory', async (req: Request, res: Response) => {
  try {
    const pglite = isPgliteReq(req)
    res.setHeader('Cache-Control', 'no-store')

    if (!pglite) {
      const homeDir = os.homedir()
      const exportDir = path.join(homeDir, 'airi_memory')
      ensureDir(exportDir)

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgexp-'))
      const finalOut = path.join(exportDir, `chathistory_pg_backup_${Date.now()}.sql`)

      const dbUrl = process.env.PG_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)

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
        fs.rmSync(tmpDir, { recursive: true, force: true })
        if (!res.headersSent)
          res.status(500).end(e?.code === 'ENOENT' ? 'pg_dump not found (install postgresql-client)' : 'Failed to run pg_dump')
      })

      dump.on('close', (code) => {
        if (code !== 0) {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          if (!res.headersSent)
            res.status(500).end(pgErr || `pg_dump exited with ${code}`)
        }
        else {
          res.status(200).send('PG Dump exported successfully')
        }
      })
      return
    }

    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    ensureDir(exportDir)
    const dataDir = process.env.PGLITE_DATA_DIR || path.join(exportDir, 'pglite_data')
    if (!fs.existsSync(dataDir)) {
      res.status(400).send('PGlite data directory not found')
      return
    }
    const tar = spawn('tar', ['-C', dataDir, '-c', '.'])
    const gz = createGzip()

    const filename = `pglite_backup_${Date.now()}.tar.gz`
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    const outDir = process.env.MEMORY_EXPORT_DIR || exportDir
    ensureDir(outDir)
    const outPath = path.join(outDir, filename)

    const tee = new PassThrough()
    const file = fs.createWriteStream(outPath)

    let errMsg = ''
    tar.stderr.on('data', (d) => {
      errMsg += d.toString()
    })

    tar.on('error', (e) => {
      if (!res.headersSent)
        res.status(500).end('Failed to spawn tar')
      console.warn('Failed to spawn tar: ', e)
      file.destroy()
    })

    pipeline(tar.stdout, gz, tee, (e) => {
      if (e && !res.headersSent)
        res.status(500).end('Failed to stream archive')
    })

    tee.pipe(res)
    tee.pipe(file)

    res.on('error', () => {})
    res.on('close', () => {})
    req.on('close', () => {})

    file.on('finish', () => {})
    file.on('error', () => {})

    tar.on('close', (code) => {
      if (code !== 0) {
        if (!res.headersSent)
          res.status(500).end(errMsg || `tar exited with ${code}`)
      }
    })
  }
  catch {
    if (!res.headersSent)
      res.status(500).send('Export failed')
    else res.destroy()
  }
})

memoryRouter.post('/export-embedded', (req, res) => {
  const host = req.headers.host || 'localhost'
  const base = `http://${host}`
  const url = new URL(req.originalUrl, base)

  url.pathname = url.pathname.replace(/\/export-embedded$/, '/export-chathistory')
  url.searchParams.set('isPglite', 'false')

  res.redirect(307, url.toString())
})

memoryRouter.post('/import-chathistory', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as { path: string, originalname?: string } | undefined
    if (!file || !file.path) {
      res.status(400).send('No file uploaded')
      return
    }
    const pglite = isPgliteReq(req)
    const homeDir = os.homedir()

    if (!pglite) {
      const dbUrl = process.env.PG_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)

      const name = (file.originalname || '').toLowerCase()
      if (!name.endsWith('.sql')) {
        fs.unlink(file.path, () => {})
        res.status(400).send('For Postgres/Embedded-Postgres, upload a .sql dump. Archives (.tar/.gz/.tgz) are only for PGlite.')
        return
      }

      exec(`psql "${dbUrl}" -f "${file.path}"`, { env: envVars }, (error, _so, stderr) => {
        fs.unlink(file.path, () => {})
        if (error) {
          res.status(500).send(`Failed to restore database: ${stderr || error.message}`)
          return
        }
        res.json({ ok: true })
      })
      return
    }

    const dataDir = process.env.PGLITE_DATA_DIR || path.join(homeDir, 'airi_memory', 'pglite_data')
    ensureDir(dataDir)
    const name = (file.originalname || '').toLowerCase()
    const isArchive = /\.(?:tar|tgz|gz)$/.test(name)
    if (!isArchive) {
      fs.unlink(file.path, () => {})
      res.status(400).send('Unsupported file. Use .tar/.gz/.tgz for PGlite')
      return
    }
    exec(`tar -xzf "${file.path}" -C "${dataDir}"`, (error) => {
      fs.unlink(file.path, () => {})
      if (error) {
        res.status(500).send('Failed to import PGlite data')
        return
      }
      res.json({ ok: true })
    })
  }
  catch {
    res.status(500).send('Import failed')
  }
})

export default memoryRouter
export { memoryRouter }
