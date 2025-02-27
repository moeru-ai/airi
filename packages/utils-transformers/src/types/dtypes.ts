import type { pipeline } from '@huggingface/transformers'

export type DType = Record<string, Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['dtype']>, string>[string]>
