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
  /**
   * The stored token with its middle removed, for the settings placeholder.
   *
   * The page needs to show that a token is stored, and which one. It never needs
   * the token itself, so the main process keeps the value and sends this mask.
   */
  tokenPreview: string
}

/**
 * The reasons the main process refuses a settings update.
 *
 * Only the message of a thrown error crosses the IPC boundary, so the message
 * stands in for a code. The renderer shows its own text for each of these and
 * keeps the message as the fallback for anything else.
 */
export const homeAssistantConfigRejections = {
  addressChanged: 'The address changed. Enter the access token for the new address.',
  tokenRequired: 'Enter a Home Assistant access token.',
} as const

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
