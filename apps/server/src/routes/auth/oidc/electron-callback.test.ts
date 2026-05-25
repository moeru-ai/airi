import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/server-auth-ui', () => ({
  renderServerAuthUiHtml: vi.fn(context => JSON.stringify(context)),
}))

const { renderServerAuthUiHtml } = await import('../../../utils/server-auth-ui')
const { createElectronCallbackRelay } = await import('./electron-callback')

describe('createElectronCallbackRelay', () => {
  it('renders auth UI relay context from OIDC callback query params', async () => {
    const app = createElectronCallbackRelay()

    const res = await app.request('http://localhost:3000/?code=code-1&state=5678%3Astate-1&error=access_denied&error_description=Nope')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      apiServerUrl: 'http://localhost:3000',
      currentUrl: 'http://localhost:3000/?code=code-1&state=5678%3Astate-1&error=access_denied&error_description=Nope',
      oidcCallback: {
        code: 'code-1',
        error: 'access_denied',
        errorDescription: 'Nope',
        state: '5678:state-1',
      },
    })
    expect(renderServerAuthUiHtml).toHaveBeenCalledTimes(1)
  })

  it('uses empty strings for omitted optional callback params', async () => {
    const app = createElectronCallbackRelay()

    const res = await app.request('http://localhost:3000/')
    const body = await res.json()

    expect(body.oidcCallback).toEqual({
      code: '',
      error: '',
      errorDescription: '',
      state: '',
    })
  })
})
