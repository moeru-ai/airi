import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

const scriptUrl = new URL('../../../../scripts/wait-for-lesson-backend.sh', import.meta.url)
const activeServers = new Set<ReturnType<typeof createServer>>()

async function startServer(
  handler: Parameters<typeof createServer>[0],
) {
  const server = createServer(handler)
  activeServers.add(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address.')
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

async function runWaitScript(
  baseUrl: string,
  envOverrides: Record<string, string> = {},
) {
  return await new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    const child = spawn('bash', [scriptUrl.pathname, '--url', baseUrl, '--timeout', '3'], {
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

describe('wait-for-lesson-backend.sh', () => {
  afterEach(async () => {
    await Promise.all([...activeServers].map(async (server) => {
      activeServers.delete(server)
      server.close()
      await once(server, 'close')
    }))
  })

  it('passes the configured bearer token to the readiness probe', async () => {
    const { baseUrl } = await startServer((request, response) => {
      if (
        request.url === '/lesson/catalog'
        && request.headers.authorization === 'Bearer lesson-jwt'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end('{}')
        return
      }

      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    })

    const result = await runWaitScript(baseUrl, {
      VITE_PEPTUTOR_LESSON_BEARER_TOKEN: 'lesson-jwt',
      VITE_PEPTUTOR_LESSON_API_KEY: 'lesson-api-key',
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Lesson backend ready')
  })

  it('passes the configured api key to the readiness probe', async () => {
    const { baseUrl } = await startServer((request, response) => {
      if (
        request.url === '/lesson/catalog'
        && request.headers['x-api-key'] === 'lesson-api-key'
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end('{}')
        return
      }

      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    })

    const result = await runWaitScript(baseUrl, {
      VITE_PEPTUTOR_LESSON_API_KEY: 'lesson-api-key',
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Lesson backend ready')
  })

  it('falls back to basic auth when only username and password are configured', async () => {
    const { baseUrl } = await startServer((request, response) => {
      if (
        request.url === '/lesson/catalog'
        && request.headers.authorization === `Basic ${Buffer.from('teacher:secret').toString('base64')}`
      ) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end('{}')
        return
      }

      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    })

    const result = await runWaitScript(baseUrl, {
      VITE_PEPTUTOR_LESSON_AUTH_USERNAME: 'teacher',
      VITE_PEPTUTOR_LESSON_AUTH_PASSWORD: 'secret',
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Lesson backend ready')
  })
})
