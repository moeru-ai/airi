import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { describe, expect, it, vi } from 'vitest'

import { kwsModel } from '../../../voice/kws-model-info'
import { validateSherpawModelAssetBundle } from './model-assets'

const { modelIds } = vi.hoisted(() => ({
  modelIds: {
    kws: 'sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20',
    speaker: 'sherpaw-campplus-zh-en-advanced',
  },
}))

vi.mock('@proj-airi/vite-plugin-sherpaw/assets', () => ({
  assets: {
    [modelIds.kws]: { data: '/kws.data', metadata: '/kws.metadata', source: 'remote' },
    [modelIds.speaker]: { data: '/speaker.data', metadata: '/speaker.metadata', source: 'remote' },
  },
}))

const modelFiles = [
  { id: kwsModel.id, revision: kwsModel.revision, filename: '/decoder.onnx' },
  { id: speakerModel.id, revision: speakerModel.revision, filename: '/speaker-embedding.onnx' },
]

function createBundleFiles(filename: string): Record<string, Uint8Array> {
  const data = Uint8Array.from([1, 2, 3, 4])
  const metadata = new TextEncoder().encode(JSON.stringify({
    files: [{ filename, start: 0, end: data.byteLength }],
    remote_package_size: data.byteLength,
  }))

  return { data, metadata }
}

describe('sherpaw model asset bundle validation', () => {
  // https://github.com/moeru-ai/airi/pull/3059
  // ROOT CAUSE:
  //
  // When a model filename starts with `/`, bundle validation rejects it.
  // The schema accepts only `^[\w.-]+$`.
  //
  // Before: the expression rejects `/decoder.onnx`.
  // After: one leading slash is valid. Path segments remain invalid.
  //
  // Bundle imports and runtime metadata parsing use this schema.
  it.each(modelFiles)('accepts upstream filename $filename for $id (Issue #3059)', ({ id, revision, filename }) => {
    expect(() => validateSherpawModelAssetBundle(id, revision, createBundleFiles(filename))).not.toThrow()
  })

  it.each(['decoder.onnx', '/decoder.onnx'])('accepts a root-level metadata filename %s', (filename) => {
    expect(() => validateSherpawModelAssetBundle(kwsModel.id, kwsModel.revision, createBundleFiles(filename))).not.toThrow()
  })

  it.each(['../decoder.onnx', '//decoder.onnx', '/../decoder.onnx', '/models/decoder.onnx', '.', '..', '/'])('rejects an unsafe metadata filename %s', (filename) => {
    expect(() => validateSherpawModelAssetBundle(kwsModel.id, kwsModel.revision, createBundleFiles(filename))).toThrow()
  })
})
