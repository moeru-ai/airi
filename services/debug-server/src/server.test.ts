import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'

import { closeHttpServer } from './server'

describe('closeHttpServer', () => {
  it('waits for active requests before resolving', async () => {
    let finishRequest = () => {}
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const server = createServer((_request, response) => {
      finishRequest = () => response.end('ok')
      markStarted()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new Error('Expected an internet socket address')

    const request = fetch(`http://127.0.0.1:${address.port}`)
    await started
    let closed = false
    const closing = closeHttpServer(server).then(() => {
      closed = true
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(closed).toBe(false)
    finishRequest()
    await expect(request.then(response => response.text())).resolves.toBe('ok')
    await closing
    expect(closed).toBe(true)
  })
})
