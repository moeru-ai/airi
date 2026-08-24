import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

import { ResizeFilterType, Transformer } from '@napi-rs/image'

type ImageInput = ArrayBuffer | Buffer | Uint8Array

function toUint8Array(input: ImageInput): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

export async function toPngBase64(input: ImageInput) {
  const transformer = new Transformer(toUint8Array(input))
  transformer.resize(512, 512, ResizeFilterType.Lanczos3)
  const pngBuffer = await transformer.png()
  return Buffer.from(pngBuffer).toString('base64')
}

export async function toPngBase64FromFile(filePath: string) {
  const buffer = await readFile(filePath)
  return toPngBase64(buffer)
}
