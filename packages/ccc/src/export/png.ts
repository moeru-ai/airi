import type { Card } from '../define'

import { addMetadata, addMetadataFromBase64DataURI } from 'meta-png'

import { exportToJSON } from './json'

/**
 * Encodes card data as metadata in a PNG image
 */
function encodeCardData(data: Card): string {
  const jsonData = exportToJSON(data)
  const jsonString = JSON.stringify(jsonData)
  const encodedData = new TextEncoder().encode(jsonString)
  return btoa(String.fromCharCode(...encodedData))
}

/**
 * Exports card data by embedding it as metadata in a PNG image
 */
export function exportToPNG(data: Card, png: Uint8Array): Uint8Array {
  const encodedData = encodeCardData(data)
  return addMetadata(png, 'ccv3', encodedData)
}

/**
 * Exports card data by embedding it as metadata in a base64-encoded PNG image
 */
export function exportToPNGBase64(data: Card, png: string): string {
  const encodedData = encodeCardData(data)
  return addMetadataFromBase64DataURI(png, 'ccv3', encodedData)
}
