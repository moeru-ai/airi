import type { DependencyMap, InvokeOption, InvokeOptionWithKeys, Logger, ProvideOption, ProvideOptionWithKeys, ResolveDependencyDeclaration } from '.'
import type { ProvidedKey } from './scoped'

import { createContainer, provide as indexProvide, start as indexStart, stop as indexStop } from '.'

let globalContainer = createContainer()

export function setLogger(logger: Logger) {
  globalContainer.logger = logger
}

export function resetContainer() {
  globalContainer = createContainer()
}

export function provide<T, Key extends string, Deps extends Record<string, string | ProvidedKey<any, any, any>>>(name: Key, option: ProvideOptionWithKeys<T, Deps>): ProvidedKey<Key, T, ResolveDependencyDeclaration<Deps>>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(name: Key, option: ProvideOption<T, D>): ProvidedKey<Key, T, D>
export function provide<T, Key extends string, Deps extends Record<string, string | ProvidedKey<any, any, any>>>(option: ProvideOptionWithKeys<T, Deps>): ProvidedKey<Key, T, ResolveDependencyDeclaration<Deps>>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(option: ProvideOption<T, D>): ProvidedKey<Key, T, D>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(nameOrOption: Key | ProvideOption<T, D> | ProvideOptionWithKeys<T, any>, option?: ProvideOption<T, D> | ProvideOptionWithKeys<T, any>): ProvidedKey<Key, T, D> {
  if (option != null && typeof option === 'function') {
    return indexProvide(globalContainer, nameOrOption as any, { build: option, autoNameStackIndex: 2 } as any)
  }

  return indexProvide(globalContainer, nameOrOption as any, { ...option, autoNameStackIndex: 2 } as any)
}

export function invoke<Deps extends Record<string, string | ProvidedKey<any, any, any>>>(option: InvokeOptionWithKeys<Deps>): void
export function invoke<D extends DependencyMap>(option: InvokeOption<D>): void
export function invoke<D extends DependencyMap>(option: InvokeOption<D> | InvokeOptionWithKeys<any>): void {
  if (typeof option === 'function') {
    globalContainer.invocations.push({ callback: option } as any)
  }
  else {
    globalContainer.invocations.push(option as any)
  }
}

export function start(): Promise<void> {
  return indexStart(globalContainer)
}

export function stop(): Promise<void> {
  return indexStop(globalContainer)
}
