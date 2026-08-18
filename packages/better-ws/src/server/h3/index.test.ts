import type { Hooks } from 'crossws'

import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', () => ({
  defineWebSocketHandler: vi.fn(hooks => ({ kind: 'h3-handler', hooks })),
}))

vi.mock('crossws/server', () => ({
  plugin: vi.fn(options => ({ kind: 'crossws-plugin', options })),
}))

describe('better-ws H3 adapter', () => {
  it('converts a better-ws server to an H3 websocket handler', async () => {
    const { createServer } = await import('..')
    const { toH3Handler } = await import('.')

    const server = createServer<string>()
    const handler = toH3Handler(server)

    expect(handler).toMatchObject({
      kind: 'h3-handler',
      hooks: {
        open: expect.any(Function),
        message: expect.any(Function),
      },
    })
  })

  it('creates the CrossWS plugin resolver used by H3 serve', async () => {
    const { createH3CrossWsPlugin } = await import('.')
    const app = {
      fetch: vi.fn(async () => Object.assign(new Response(null), {
        crossws: { open: vi.fn() },
      })),
    }

    const plugin = createH3CrossWsPlugin(app)
    // NOTICE:
    // `createH3CrossWsPlugin` deliberately returns the public Srvx plugin
    // type, while this mock exposes its resolver for assertion. The cast stays
    // inside the test so production code does not depend on mock-only shape.
    // Remove this if Srvx/CrossWS exposes an inspectable plugin test helper.
    const mockedPlugin = plugin as unknown as {
      options: {
        resolve: (request: Request) => Promise<Partial<Hooks> | undefined>
      }
    }
    const resolved = await mockedPlugin.options.resolve(new Request('http://localhost/ws'))

    expect(plugin).toMatchObject({ kind: 'crossws-plugin' })
    expect(app.fetch).toHaveBeenCalledOnce()
    expect(resolved).toEqual({ open: expect.any(Function) })
  })
})
