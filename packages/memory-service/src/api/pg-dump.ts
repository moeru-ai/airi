import { once } from 'node:events'

import * as fs from 'node:fs'
import * as readline from 'node:readline'

import { Pool } from 'pg'

interface RestoreOpts {
  dbUrl: string
  filePath: string
}

/**
 * Restore a plain SQL dump (pg_dump -Fp) to Postgres using Node APIs
 * - Executes regular SQL sequentially
 * - Streams COPY ... FROM STDIN blocks via pg-copy-streams
 * - Ignores psql meta commands (e.g., \connect)
 * Assumes UTF-8 dump
 */
export async function restoreFromPsqlDump({ dbUrl, filePath }: RestoreOpts) {
  const pool = new Pool({ connectionString: dbUrl })
  const client = await pool.connect()

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let buf = ''
  let inSingle = false
  let inDollarTag: string | null = null
  let inCopy = false
  let copyStream: NodeJS.WritableStream | null = null

  const endCopy = async () => {
    if (!copyStream) {
      return
    }
    copyStream.end()
    await Promise.race([once(copyStream, 'finish'), once(copyStream, 'end')])
    copyStream = null
    inCopy = false
  }

  const statementTerminated = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]

      if (!inSingle && ch === '$') {
        const m = /^\$\w*\$/u.exec(s.slice(i))
        if (m) {
          const tag = m[0]
          if (inDollarTag === null) {
            inDollarTag = tag
          }
          else if (tag === inDollarTag) {
            inDollarTag = null
          }
          i += tag.length - 1
          continue
        }
      }

      if (!inDollarTag && ch === '\'' && s[i - 1] !== '\\')
        inSingle = !inSingle

      if (ch === ';' && !inSingle && !inDollarTag)
        return true
    }
    return false
  }

  try {
    for await (const rawLine of rl) {
      const line = rawLine

      if (!inCopy && line.startsWith('\\'))
        continue

      if (inCopy) {
        if (line === '\\.') {
          await endCopy()
        }
        else {
          const ok = copyStream!.write(`${line}\n`)
          if (!ok) {
            await once(copyStream!, 'drain')
          }
        }
        continue
      }

      const trimmed = line.trim()
      if (trimmed.startsWith('--'))
        continue

      buf += `${line}\n`

      const bufTrim = buf.trim()
      if (bufTrim.toUpperCase().includes('COPY') && bufTrim.toUpperCase().endsWith('FROM STDIN;')) {
        const mod: any = await import('pg-copy-streams')
        const copyFrom: any = mod.from
        copyStream = (client.query as any)(copyFrom(bufTrim))
        copyStream?.on('error', (err: Error) => fileStream.destroy(err))
        inCopy = true
        buf = ''
        continue
      }

      if (statementTerminated(buf)) {
        const sql = buf.trim()
        buf = ''
        if (sql.length === 0)
          continue
        await client.query(sql)
      }
    }

    if (inCopy)
      await endCopy()

    const tail = buf.trim()
    if (tail)
      await client.query(tail)
  }
  finally {
    rl.close()
    fileStream.destroy()
    client.release()
    await pool.end()
  }
}
