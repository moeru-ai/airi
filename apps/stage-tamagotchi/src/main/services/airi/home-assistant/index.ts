import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { HomeAssistantStoredConfig } from './request'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { object, string } from 'valibot'

import { homeAssistantGetConfig, homeAssistantRequest, homeAssistantSetConfig } from '../../../../shared/eventa/home-assistant'
import { createConfig } from '../../../libs/electron/persistence'
import { readBody, requestTimeoutMs, resolveConfigUpdate, resolveRequestUrl, toRequestError, toTokenPreview } from './request'

const configSchema = object({
  baseUrl: string(),
  token: string(),
})

const defaultConfig: HomeAssistantStoredConfig = {
  baseUrl: '',
  token: '',
}

/**
 * Registers the Home Assistant service.
 *
 * Use when:
 * - Electron main must own the Home Assistant address and token
 * - Renderer tools need a transport that reaches the local network without the
 *   browser cross-origin rules
 *
 * Expects:
 * - `context` is the Electron main IPC context
 *
 * Returns:
 * - Nothing. The handlers stay registered for the lifetime of the application.
 */
export function setupHomeAssistant(context: ReturnType<typeof createContext>['context']) {
  const config = createConfig('home-assistant', 'v1.json', configSchema, {
    default: defaultConfig,
    autoHeal: true,
  })
  config.setup()

  function read() {
    return config.get() ?? defaultConfig
  }

  function toPublic(current: HomeAssistantStoredConfig) {
    return {
      baseUrl: current.baseUrl,
      hasToken: Boolean(current.token),
      tokenPreview: toTokenPreview(current.token),
    }
  }

  defineInvokeHandler(context, homeAssistantGetConfig, () => toPublic(read()))

  defineInvokeHandler(context, homeAssistantSetConfig, (update) => {
    // `resolveConfigUpdate` decides what a stored token may survive. It refuses
    // to move the address while the secret stays, which is the one path by which
    // a renderer could send the token to a server it controls.
    const next = resolveConfigUpdate(read(), update)
    config.update(next)

    return toPublic(next)
  })

  defineInvokeHandler(context, homeAssistantRequest, async (input) => {
    const current = read()
    if (!current.baseUrl)
      throw new Error('Home Assistant is not configured yet. Ask the user to set the address and token in settings.')
    if (!current.token)
      throw new Error('Home Assistant has no access token yet. Ask the user to add one in settings.')

    // The renderer picks the path, so this call is the boundary that decides
    // what leaves the application.
    const target = resolveRequestUrl(current.baseUrl, input.method, input.path)
    const hasBody = input.method === 'POST' && input.body !== undefined

    let response: Response
    try {
      response = await fetch(target, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${current.token}`,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: hasBody ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
    }
    catch (error) {
      throw new Error(`Could not reach Home Assistant at ${current.baseUrl}: ${errorMessageFrom(error) ?? 'unknown network error'}`)
    }

    if (!response.ok)
      throw await toRequestError(response)

    return await readBody(response)
  })
}
