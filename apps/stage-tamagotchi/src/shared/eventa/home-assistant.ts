import { defineInvokeEventa } from '@moeru/eventa'

/**
 * The Home Assistant settings the renderer may read back.
 *
 * The access token never travels to the renderer. The settings page needs only
 * to know whether one is stored.
 */
export interface HomeAssistantPublicConfig {
  /** Base URL of the Home Assistant instance, without a trailing slash. Empty when unset. */
  baseUrl: string
  hasToken: boolean
}

/** The settings the renderer writes. An absent token keeps the stored one. */
export interface HomeAssistantConfigUpdate {
  baseUrl: string
  /** Omit to keep the stored token. Send an empty string to clear it. */
  token?: string
}

/**
 * One Home Assistant request the main process performs for the renderer.
 *
 * The renderer builds this path from a service or an entity id. The main process
 * owns the base URL and the token, and rejects any path outside `/api/`.
 */
export interface HomeAssistantRequestInput {
  /** Path under `/api/`, for example `/api/states/light.kitchen`. */
  path: string
  method: 'GET' | 'POST'
  /** JSON body for a POST request. */
  body?: unknown
}

export const homeAssistantGetConfig = defineInvokeEventa<HomeAssistantPublicConfig>('eventa:invoke:home-assistant:get-config')
export const homeAssistantSetConfig = defineInvokeEventa<HomeAssistantPublicConfig, HomeAssistantConfigUpdate>('eventa:invoke:home-assistant:set-config')
export const homeAssistantRequest = defineInvokeEventa<unknown, HomeAssistantRequestInput>('eventa:invoke:home-assistant:request')
