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

function findFirstSql(root: string) {
  const stack = [root]
  while (stack.length) {
    const d = stack.pop() as string
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name)
      const s = fs.statSync(p)
      if (s.isDirectory())
        stack.push(p)
      else if (name.toLowerCase().endsWith('.sql'))
        return p
    }
  }
  return null
}

memoryRouter.post('/export-chathistory', async (req: Request, res: Response) => {
  try {
    const pglite = isPgliteReq(req)
    res.setHeader('Cache-Control', 'no-store')

    if (!pglite) {
      const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)
      const dump = spawn('pg_dump', ['--dbname', dbUrl], { env: envVars })
      const gz = createGzip()
      const filename = `chathistory_pg_backup_${Date.now()}.sql.gz`
      res.setHeader('Content-Type', 'application/gzip')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      let errMsg = ''
      dump.stderr.on('data', (d) => {
        errMsg += d.toString()
      })
      dump.on('error', (e) => {
        if (!res.headersSent)
          res.status(500).end('Failed to spawn pg_dump')
        else
          res.destroy(e)
      })
      dump.on('close', (code) => {
        if (code !== 0)
          res.destroy(new Error(errMsg || `pg_dump exited with ${code}`))
      })
      pipeline(dump.stdout, gz, res, (e) => {
        if (e && !res.headersSent)
          res.status(500).end('Failed to stream dump')
      })
      req.on('close', () => {
        dump.kill('SIGTERM')
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
      else
        res.destroy(e)
    })
    tar.on('close', (code) => {
      if (code !== 0)
        res.destroy(new Error(errMsg || `tar exited with ${code}`))
    })
    pipeline(tar.stdout, gz, tee, (e) => {
      if (e && !res.headersSent)
        res.status(500).end('Failed to stream archive')
    })

    tee.pipe(res)
    tee.pipe(file)

    res.on('close', () => {
      file.end()
    })

    req.on('close', () => {
      tar.kill('SIGTERM')
      file.destroy()
    })
  }
  catch {
    if (!res.headersSent)
      res.status(500).send('Export failed')
    else res.destroy()
  }
})

memoryRouter.post('/export-embedded', (req, res) => {
  const q = req.query as any
  q.isPglite = 'false'
  ;(memoryRouter as any).handle(req, res)
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
      const name = (file.originalname || '').toLowerCase()
      const isArchive = /\.(?:tar|tgz|gz)$/.test(name)
      if (!isArchive) {
        const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
        const envVars = parsePwdEnv(dbUrl)
        exec(`psql "${dbUrl}" -f "${file.path}"`, { env: envVars }, (error) => {
          fs.unlink(file.path, () => {})
          if (error) {
            res.status(500).send('Failed to restore database')
            return
          }
          res.json({ ok: true })
        })
        return
      }
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgimp-'))
      exec(`tar -xzf "${file.path}" -C "${tmpDir}"`, (tErr) => {
        fs.unlink(file.path, () => {})
        if (tErr) {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          res.status(500).send('Failed to extract archive')
          return
        }
        const sqlPath = findFirstSql(tmpDir)
        if (!sqlPath) {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          res.status(400).send('No .sql file in archive')
          return
        }
        const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
        const envVars = parsePwdEnv(dbUrl)
        exec(`psql "${dbUrl}" -f "${sqlPath}"`, { env: envVars }, (error2) => {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          if (error2) {
            res.status(500).send('Failed to restore database')
            return
          }
          res.json({ ok: true })
        })
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

export { memoryRouter }
export default memoryRouter
