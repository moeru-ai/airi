import type { pipeline } from '@huggingface/transformers'

export type Device = Extract<Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['device']>, Record<string, any>>, 'webgpu' | 'wasm'>
