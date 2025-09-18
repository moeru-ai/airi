import type { Request, Response } from 'express'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { exec } from 'node:child_process'

import { Router } from 'express'

const memoryRouter = Router()

memoryRouter.post('/export-embedded', async (req: Request, res: Response) => {
  try {
    const homeDir = os.homedir()
    const exportDir = path.join(homeDir, 'airi_memory')
    const dumpFile = path.join(exportDir, 'embedded_pg_backup.sql')

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const dbUrl
      = process.env.DATABASE_URL
        || 'postgres://postgres:postgres@localhost:5433/postgres'

    exec(`pg_dump ${dbUrl} > "${dumpFile}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('pg_dump error:', stderr)
        return res.status(500).send('Failed to dump database')
      }

      res.download(dumpFile, 'embedded_pg_backup.sql', (err) => {
        if (err)
          console.error('Download failed:', err)
      })
    })
  }
  catch (err) {
    console.error(err)
    res.status(500).send('Export failed')
  }
})

export default memoryRouter
