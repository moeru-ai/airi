import { authedFetch } from '../libs/auth-fetch'

/** Uses the Cloud origin and shared token refresh. Only same-origin paths can receive credentials. */
export function useCloudFetch() {
  const baseUrl = new URL(import.meta.env.VITE_CLOUD_URL || 'https://cloud.airi.build')

  return (path: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(path, baseUrl)
    if (url.origin !== baseUrl.origin || url.username || url.password)
      throw new Error('Cloud requests must use the configured Cloud origin')

    return authedFetch(url, init)
  }
}
