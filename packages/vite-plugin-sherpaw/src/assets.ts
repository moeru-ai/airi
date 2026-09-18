/** URLs for the data and metadata consumed together by a Sherpaw recognizer. */
export interface ModelAssets {
  data: string
  metadata: string
}

/**
 * The Sherpaw Vite plugin replaces this module with the selected models' asset imports.
 * Hosts without the plugin expose no models, so shared UI can hide the Provider.
 */
export const assets: Readonly<Record<string, ModelAssets | undefined>> = Object.freeze({})
