export interface OpsPullModelsOptions {
  quant?: string
  argv?: string[]
}

export interface OpsRpc {
  pullModels: (options?: OpsPullModelsOptions) => Promise<void>
  doctor: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  prune: () => Promise<void>
}
