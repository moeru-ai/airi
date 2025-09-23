import type { Request, Response } from 'express'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { exec } from 'node:child_process'

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

memoryRouter.post('/export-embedded', async (req: Request, res: Response) => {
  try {
    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    ensureDir(exportDir)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgexp-'))
    const sqlFile = path.join(tmpDir, 'embedded_pg_backup.sql')
    const outFile = path.join(exportDir, `embedded_pg_backup_${Date.now()}.tar.gz`)
    const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
    const envVars = parsePwdEnv(dbUrl)
    exec(`pg_dump "${dbUrl}" -f "${sqlFile}"`, { env: envVars }, (error, _stdout, _stderr) => {
      if (error) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        res.status(500).send('Failed to dump database')
        return
      }
      exec(`tar -czf "${outFile}" -C "${tmpDir}" "${path.basename(sqlFile)}"`, (tErr, _so, _se) => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
        if (tErr) {
          res.status(500).send('Failed to archive dump')
          return
        }
        res.download(outFile, path.basename(outFile), (dlErr) => {
          if (dlErr) {
            console.warn('Failed to download a backup file')
          }
        })
      })
    })
  }
  catch {
    res.status(500).send('Export failed')
  }
})

memoryRouter.post('/export-chathistory', async (req: Request, res: Response) => {
  try {
    const pglite = isPgliteReq(req)
    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    ensureDir(exportDir)
    if (!pglite) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgexp-'))
      const sqlFile = path.join(tmpDir, 'chathistory_pg_backup.sql')
      const outFile = path.join(exportDir, `chathistory_pg_backup_${Date.now()}.tar.gz`)
      const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:airi_memory_password@localhost:5434/postgres'
      const envVars = parsePwdEnv(dbUrl)
      exec(`pg_dump "${dbUrl}" -f "${sqlFile}"`, { env: envVars }, (error, _stdout, _stderr) => {
        if (error) {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          res.status(500).send('Failed to dump database')
          return
        }
        exec(`tar -czf "${outFile}" -C "${tmpDir}" "${path.basename(sqlFile)}"`, (tErr, _so, _se) => {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          if (tErr) {
            res.status(500).send('Failed to archive dump')
            return
          }
          res.setHeader('Content-Type', 'application/gzip')
          res.download(outFile, path.basename(outFile), (dlErr) => {
            if (dlErr) {
              console.warn('Failed to download a backup file')
            }
          })
        })
      })
      return
    }
    const dataDir = process.env.PGLITE_DATA_DIR || path.join(homeDir, 'airi_memory', 'pglite_data')
    if (!fs.existsSync(dataDir)) {
      res.status(400).send('PGlite data directory not found')
      return
    }
    const outFile = path.join(exportDir, `pglite_backup_${Date.now()}.tar.gz`)
    exec(`tar -czf "${outFile}" -C "${dataDir}" .`, (error, _stdout, stderr) => {
      if (error) {
        res.status(500).send(`Failed to archive PGlite data: ${stderr || error.message}`)
        return
      }
      res.download(outFile, path.basename(outFile), (dlErr) => {
        if (dlErr) {
          console.warn('Failed to download a backup file')
        }
      })
    })
  }
  catch {
    res.status(500).send('Export failed')
  }
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
        exec(`psql "${dbUrl}" -f "${file.path}"`, { env: envVars }, (error, _stdout, _stderr) => {
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
      exec(`tar -xzf "${file.path}" -C "${tmpDir}"`, (tErr, _so, _se) => {
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
        exec(`psql "${dbUrl}" -f "${sqlPath}"`, { env: envVars }, (error, _stdout2, _stderr2) => {
          fs.rmSync(tmpDir, { recursive: true, force: true })
          if (error) {
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
    exec(`tar -xzf "${file.path}" -C "${dataDir}"`, (error, _stdout, _stderr) => {
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
