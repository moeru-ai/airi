import type { Lifecycle, LifecycleTriggerable } from './builtin'
import type { Logger, LoggerOptions } from './logger'

import ErrorStackParser from 'error-stack-parser'

import { nanoid } from 'nanoid'

import { createDefaultLogger, createNoopLogger } from './logger'

export type DependencyMap = Record<string, any>

export interface Container {
  providers: Map<string, ProvideOptionObject<any, any>>
  instances: Map<string, any>
  lifecycleHooks: Map<string, LifecycleTriggerable>
  dependencyGraph: Map<string, string[]>
  invocations: InvokeOptionObject<any>[]
  logger: Logger
}

export type BuildContext<D extends DependencyMap | undefined = undefined> = {
  container: Container
  name: string
} & (D extends undefined ? { dependsOn?: unknown } : { dependsOn: D })

export type ResolveDependencyDeclaration<Deps extends Record<string, string | ProvidedKey<any, any, any>>> = {
  [K in keyof Deps]: Deps[K] extends ProvidedKey<any, infer T, any> ? T : any
}

export type ProvideOptionObject<T, D extends DependencyMap | undefined = undefined> = { build: (context: BuildContext<D>) => T | Promise<T> } & (D extends undefined ? { dependsOn?: Record<string, never> } : { dependsOn: { [K in keyof D]: string } })
export type ProvideOptionFunc<T, D extends DependencyMap | undefined = undefined> = (context: BuildContext<D>) => T | Promise<T>
export type ProvideOption<T, D extends DependencyMap | undefined = undefined> = ProvideOptionObject<T, D> | ProvideOptionFunc<T, D>

export interface ProvideOptionObjectWithKeys<T, Deps extends Record<string, string | ProvidedKey<any, any, any>>> {
  build: (context: BuildContext<ResolveDependencyDeclaration<Deps>>) => T | Promise<T>
  dependsOn: Deps
}
export type ProvideOptionWithKeys<T, Deps extends Record<string, string | ProvidedKey<any, any, any>>> = ProvideOptionObjectWithKeys<T, Deps>

export type InvokeOptionObject<D extends DependencyMap | undefined = undefined> = { callback: (dependencies: D) => void | Promise<void> } & (D extends undefined ? { dependsOn?: Record<string, never> } : { dependsOn: { [K in keyof D]: string } })
export type InvokeOptionFunc<D extends DependencyMap | undefined = undefined> = (dependencies: D) => void | Promise<void>
export type InvokeOption<D extends DependencyMap | undefined = undefined> = InvokeOptionObject<D> | InvokeOptionFunc<D>

export interface InvokeOptionObjectWithKeys<Deps extends Record<string, string | ProvidedKey<any, any, any>>> {
  callback: (dependencies: ResolveDependencyDeclaration<Deps>) => void | Promise<void>
  dependsOn: Deps
}
export type InvokeOptionWithKeys<Deps extends Record<string, string | ProvidedKey<any, any, any>>> = InvokeOptionObjectWithKeys<Deps>

export const lifecycle: ProvidedKey<'lifecycle', Lifecycle, undefined> = { key: 'lifecycle' }

export function createContainer(options?: LoggerOptions): Container {
  const logger = options?.enabled === false
    ? createNoopLogger()
    : (options?.logger ?? createDefaultLogger())

  return {
    providers: new Map(),
    instances: new Map(),
    lifecycleHooks: new Map(),
    dependencyGraph: new Map(),
    invocations: [],
    logger,
  }
}

// eslint-disable-next-line unused-imports/no-unused-vars
export interface ProvidedKey<Key, T, D extends DependencyMap | undefined> {
  key: Key
}

export function normalizeName(nameOrProvidedKey: string | ProvidedKey<any, any, any>): string {
  if (typeof nameOrProvidedKey === 'object' && nameOrProvidedKey !== null && 'key' in nameOrProvidedKey) {
    return (nameOrProvidedKey as ProvidedKey<any, any, any>).key as string
  }

  return nameOrProvidedKey as string
}

export function normalizeProvideOption<D extends DependencyMap | undefined, T = any, Key extends string = string>(nameOrOption: Key | ProvidedKey<Key, T, D> | ProvideOption<T, D> | ProvideOptionWithKeys<T, any>, option?: (ProvideOption<T, D> | ProvideOptionWithKeys<T, any>) & { autoNameStackIndex?: number }): ProvideOptionObject<T, D> {
  if (typeof nameOrOption === 'string') {
    if (option == null || (!('build' in option) && typeof option !== 'function')) {
      throw new Error('When using provide(...) as named callback, the second argument must be either a valid ProvideOptionObject<T, D> or a ProvideOptionFunc<T, D>.')
    }
    if (typeof option === 'function') {
      return { build: option } as ProvideOptionObject<T, D>
    }

    return option as ProvideOptionObject<T, D>
  }
  if (typeof nameOrOption === 'object' && 'key' in nameOrOption) {
    if (option == null || (!('build' in option) && typeof option !== 'function')) {
      throw new Error('When using provide(...) as typed ProvideOptionWithKeys<T, D, Key> callback, the second argument must be either a valid ProvideOptionObject<T, D> or a ProvideOptionFunc<T, D>.')
    }
    if (typeof option === 'function') {
      return { build: option } as ProvideOptionObject<T, D>
    }

    return option as ProvideOptionObject<T, D>
  }

  if (typeof nameOrOption === 'function') {
    return { build: nameOrOption } as ProvideOptionObject<T, D>
  }

  return nameOrOption as ProvideOptionObject<T, D>
}

export function provide<T, Key extends string, Deps extends Record<string, string | ProvidedKey<any, any, any>>>(container: Container, name: Key, option: ProvideOptionWithKeys<T, Deps>): ProvidedKey<Key, T, ResolveDependencyDeclaration<Deps>>
export function provide<T, Key extends string, Deps extends Record<string, string | ProvidedKey<any, any, any>>>(container: Container, option: ProvideOptionWithKeys<T, Deps> & { autoNameStackIndex?: number }): ProvidedKey<Key, T, ResolveDependencyDeclaration<Deps>>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(container: Container, name: Key, option: ProvideOption<T, D>): ProvidedKey<Key, T, D>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(container: Container, option: ProvideOption<T, D> & { autoNameStackIndex?: number }): ProvidedKey<Key, T, D>
export function provide<D extends DependencyMap | undefined, T = any, Key extends string = string>(container: Container, nameOrOption: Key | ProvideOption<T, D> | ProvideOptionWithKeys<T, any>, option?: (ProvideOption<T, D> | ProvideOptionWithKeys<T, any>) & { autoNameStackIndex?: number }): ProvidedKey<Key, T, D> {
  const parentFile = ErrorStackParser.parse(new Error('providing'))[option?.autoNameStackIndex ?? 1]
  const name = typeof nameOrOption === 'string'
    ? nameOrOption
    : `${parentFile.fileName ?? `unknown-${nanoid()}`}:${parentFile.lineNumber ?? 0}:${parentFile.columnNumber ?? 0}`

  const providerObject = normalizeProvideOption<D, T, Key>(nameOrOption, option) as unknown as ProvideOptionObject<any, any>
  if (providerObject.dependsOn) {
    const resolvedDependsOn: Record<string, string> = {}
    for (const [key, value] of Object.entries(providerObject.dependsOn)) {
      resolvedDependsOn[key] = normalizeName(value)
    }

    providerObject.dependsOn = resolvedDependsOn
  }

  container.providers.set(name, providerObject)

  const dependencies = providerObject.dependsOn ? Object.values(providerObject.dependsOn) : []
  container.logger.provide(name, dependencies)
  container.dependencyGraph.set(name, dependencies)

  return { key: name } as ProvidedKey<Key, T, D>
}

export function invoke<Deps extends Record<string, string | ProvidedKey<any, any, any>>>(container: Container, option: InvokeOptionWithKeys<Deps>): void
export function invoke<D extends DependencyMap>(container: Container, option: InvokeOption<D>): void
export function invoke<D extends DependencyMap>(container: Container, option: InvokeOption<D> | InvokeOptionWithKeys<any>): void {
  const invocationObject = typeof option === 'function'
    ? { callback: option } as InvokeOptionObject<any>
    : option as InvokeOptionObject<any>

  if (invocationObject.dependsOn) {
    const resolvedDependsOn: Record<string, string> = {}
    for (const [key, value] of Object.entries(invocationObject.dependsOn)) {
      resolvedDependsOn[key] = normalizeName(value)
    }

    invocationObject.dependsOn = resolvedDependsOn
  }

  const dependencies = invocationObject.dependsOn ? Object.values(invocationObject.dependsOn) : []

  container.logger.invoke(dependencies)
  container.invocations.push(invocationObject)
}

async function resolveInstance<T>(container: Container, name: string): Promise<T> {
  if (container.instances.has(name)) {
    return container.instances.get(name) as T
  }

  const provider = container.providers.get(name)
  if (!provider) {
    throw new Error(`No provider found for '${name}'`)
  }

  const resolvedDependencies: Record<string, any> = {}
  let serviceLifecycle: any = null

  if (provider.dependsOn) {
    for (const [key, depName] of Object.entries(provider.dependsOn)) {
      if (depName === 'lifecycle') {
        // Create individual lifecycle instance for this service
        const { buildLifecycle } = await import('./builtin')
        serviceLifecycle = buildLifecycle()
        resolvedDependencies[key] = serviceLifecycle

        // Track this service's lifecycle
        container.lifecycleHooks.set(name, serviceLifecycle)
      }
      else {
        resolvedDependencies[key] = await resolveInstance(container, depName)
      }
    }
  }

  const context: BuildContext<typeof provider.dependsOn> = {
    container,
    dependsOn: resolvedDependencies,
    name,
  }

  container.logger.beforeRun(name)

  const startTime = performance.now()
  const instance = await provider.build(context)
  const duration = performance.now() - startTime

  container.logger.run(name, duration)

  container.instances.set(name, instance)

  return instance as T
}

function topologicalSort(dependencyGraph: Map<string, string[]>): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const result: string[] = []

  function visit(node: string) {
    if (visiting.has(node)) {
      throw new Error(`Circular dependency detected involving '${node}'`)
    }
    if (visited.has(node)) {
      return
    }

    visiting.add(node)
    const dependencies = dependencyGraph.get(node) || []
    for (const dep of dependencies) {
      visit(dep)
    }
    visiting.delete(node)
    visited.add(node)
    result.push(node)
  }

  for (const node of dependencyGraph.keys()) {
    if (!visited.has(node)) {
      visit(node)
    }
  }

  return result
}

export async function startLifecycleHooks(container: Container): Promise<void> {
  const sortedServices = topologicalSort(container.dependencyGraph)

  for (const serviceName of sortedServices) {
    const lifecycle = container.lifecycleHooks.get(serviceName)
    if (lifecycle?.emitOnStart) {
      container.logger.hookOnStart(serviceName)

      const startTime = performance.now()
      await lifecycle.emitOnStart()
      const duration = performance.now() - startTime

      container.logger.hookOnStartComplete(serviceName, duration)
    }
  }
}

export async function stopLifecycleHooks(container: Container): Promise<void> {
  const sortedServices = topologicalSort(container.dependencyGraph)

  // Shutdown in reverse order
  for (const serviceName of sortedServices.reverse()) {
    const lifecycle = container.lifecycleHooks.get(serviceName)
    if (lifecycle?.emitOnStop) {
      container.logger.hookOnStop(serviceName)

      const startTime = performance.now()
      await lifecycle.emitOnStop()
      const duration = performance.now() - startTime

      container.logger.hookOnStopComplete(serviceName, duration)
    }
  }
}

export async function start(container: Container): Promise<void> {
  await startLifecycleHooks(container)

  for (const invocation of container.invocations) {
    const resolvedDependencies: Record<string, any> = {}

    if (invocation.dependsOn) {
      for (const [key, depName] of Object.entries(invocation.dependsOn)) {
        resolvedDependencies[key] = await resolveInstance(container, normalizeName(depName))
      }
    }

    await invocation.callback(resolvedDependencies)
  }

  container.logger.running()
}

export async function stop(container: Container): Promise<void> {
  await stopLifecycleHooks(container)
}
