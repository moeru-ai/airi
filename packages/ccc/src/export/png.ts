import type { Card } from '../define'

import { addMetadata, addMetadataFromBase64DataURI } from 'meta-png'

import { exportToJSON } from './json'

export function exportToPNG(data: Card, png: Uint8Array) {
  return addMetadata(png, 'ccv3', btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(exportToJSON(data))))))
}

export function exportToPNGBase64(data: Card, png: string) {
  return addMetadataFromBase64DataURI(png, 'ccv3', btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(exportToJSON(data))))))
}
