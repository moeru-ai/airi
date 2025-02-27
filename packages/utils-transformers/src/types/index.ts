import type { AutoModel, pipeline } from '@huggingface/transformers'

export type DType = Record<string, Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['dtype']>, string>[string]>
export type Device = Extract<Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['device']>, Record<string, any>>, 'webgpu' | 'wasm'>
export type PretrainedConfig = NonNullable<Parameters<typeof AutoModel.from_pretrained>[1]>['config']
export type PretrainedConfigFrom<T> = T extends { from_pretrained: (...args: any) => any } ? NonNullable<Parameters<T['from_pretrained']>[1]>['config'] : never
export type PipelineOptionsFrom<T> = T extends (...args: any) => any ? NonNullable<Parameters<T>[2]> : never
