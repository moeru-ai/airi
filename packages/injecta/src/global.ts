import type { DependencyMap, InvokeOption, Logger, ProvideOption } from '.'

import { createContainer, provide as indexProvide, start as indexStart, stop as indexStop } from '.'

const globalContainer = createContainer()

export function setLogger(logger: Logger) {
  globalContainer.logger = logger
}

export function provide<D extends DependencyMap | undefined, T = any>(
  name: string,
  option: ProvideOption<T, D>,
): void {
  indexProvide(globalContainer, name, option)
}

export function invoke<D extends DependencyMap>(option: InvokeOption<D>): void {
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
