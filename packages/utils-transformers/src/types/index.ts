import type { AutoModel } from '@huggingface/transformers'

export * from './core'
export * from './devices'
export * from './dtypes'
export * from './hub'

export type PretrainedConfig = NonNullable<Parameters<typeof AutoModel.from_pretrained>[1]>['config']
export type PretrainedConfigFrom<T> = T extends { from_pretrained: (...args: any) => any } ? NonNullable<Parameters<T['from_pretrained']>[1]>['config'] : never
export type PipelineOptionsFrom<T> = T extends (...args: any) => any ? NonNullable<Parameters<T>[2]> : never
