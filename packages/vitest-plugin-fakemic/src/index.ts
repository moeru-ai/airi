import type { Browser, BrowserContext, ElectronApplication } from 'playwright'
import type { RunnerTestCase, TestAPI, TestContext } from 'vitest'
import type { UserWorkspaceConfig } from 'vitest/config'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { chromium, _electron as playwrightElectron } from 'playwright'
import { preview } from 'vite'
import { describe, inject, TestRunner } from 'vitest'

/** One audio payload captured from a tested runtime. */
export interface AudioCapture {
  data: Uint8Array
  format: AudioCaptureFormat
}

/** Supported encodings for captured audio. */
export type AudioCaptureFormat = 'pcm' | 'wav'

/** A runner-neutral audio test definition. */
export interface AudioTestCase<PreflightContext = never> {
  /** File-backed microphone input for the test. */
  input: URL
  /** @default [] */
  preflight?: readonly AudioTestPreflightCallback<PreflightContext>[]
}

/** One callback that runs after a runtime starts and before its test handler. */
export type AudioTestPreflightCallback<Context> = (context: Context) => Promise<void> | void

/** A session that owns one audio test runtime. */
export interface AudioTestSession {
  /** Releases the runtime and all resources that belong to the session. */
  close: () => Promise<void>
}

/** One runnable task derived from an audio test case. */
export interface AudioTestTask {
  input: URL
  name: string
}

/** Metadata that identifies an audio task in Vitest reports. */
export interface AudioVitestTaskMetadata {
  input: string
  runtime: string
}

/** Lifecycle operations for one audio test session. */
export interface RunAudioTestSessionOptions<Session extends AudioTestSession> {
  execute: (session: Session) => Promise<void>
  recordArtifacts?: (session: Session) => Promise<void>
  start: () => Promise<Session>
}

declare module 'vitest' {
  interface TaskMeta {
    audioTest?: AudioVitestTaskMetadata
  }
}

/**
 * A Vitest-like test function that accepts an audio definition.
 *
 * @param Definition - The definition supplied by each test.
 * @param Context - Fields exposed to the test callback.
 */
export interface AudioTestAPI<Definition, Context extends object> {
  (name: string, definition: Definition, handler: AudioTestHandler<Context>): void
  fails: AudioTestAPI<Definition, Context>
  only: AudioTestAPI<Definition, Context>
  skip: AudioTestAPI<Definition, Context>
  todo: AudioTestAPI<Definition, Context>
}

/**
 * Callback for an audio task.
 *
 * @param Context - Fields added by the concrete audio framework.
 */
export type AudioTestHandler<Context extends object> = (
  context: AudioVitestTaskContext<Context>,
) => Promise<void> | void

/**
 * One concrete audio task that the custom runner can execute.
 *
 * @param Definition - The concrete definition stored for this task.
 */
export interface AudioVitestPlan<Definition> {
  definition: Definition
  metadata: AudioVitestTaskMetadata
  name: string
}

/**
 * Test context exposed to an audio test callback.
 *
 * @param Context - Fields added by the concrete audio framework.
 */
export type AudioVitestTaskContext<Context extends object> = Context & TestContext

/**
 * Configuration for a package-owned audio test interface.
 *
 * @param Definition - The definition supplied by each test.
 * @param Plan - One concrete task produced from that definition.
 */
export interface CreateAudioTestAPIOptions<Definition, Plan, PreflightContext> {
  createPlans: (name: string, definition: Definition) => Array<AudioVitestPlan<Plan>>
  execute: (options: {
    invokeHandler: () => Promise<void>
    plan: AudioVitestPlan<Plan>
    runPreflight: (context: PreflightContext) => Promise<void>
    task: RunnerTestCase
  }) => Promise<void>
  preflight?: (definition: Definition) => readonly AudioTestPreflightCallback<PreflightContext>[] | undefined
}

/** Context supplied to an Electron prepare module. */
export interface FakemicElectronPrepareContext {
  app: ElectronApplication
  close: () => Promise<void>
  runtime: FakemicElectronRuntime
}

/** Serializable Electron runtime configuration. */
export interface FakemicElectronRuntime {
  args?: string[]
  cwd?: string
  entry: string
  env?: Record<string, string>
  kind: 'electron'
  name: string
  prepare: string
  temporaryUserData?: {
    env: string
    prefix?: string
  }
}

/** Configuration for one Fakemic Vitest project. */
export interface FakemicPluginOptions {
  /** @default 120000 */
  hookTimeout?: number
  include: string[]
  name: string
  runtime: FakemicRuntime
  /** @default 180000 */
  testTimeout?: number
}

/** Module that adapts a launched runtime into the application session. */
export interface FakemicPrepareModule<Context, Session extends AudioTestSession> {
  default: (context: Context) => Promise<Session>
}

/** Runtime selected by one Fakemic Vitest project. */
export type FakemicRuntime = FakemicElectronRuntime | FakemicWebRuntime

/** Context supplied to a Web prepare module. */
export interface FakemicWebPrepareContext {
  browser: Browser
  close: () => Promise<void>
  context: BrowserContext
  runtime: FakemicWebRuntime
}

/** Serializable Web runtime configuration. */
export interface FakemicWebRuntime {
  context?: Parameters<Browser['newContext']>[0]
  kind: 'web'
  launch?: Parameters<typeof chromium.launch>[0]
  name: string
  prepare: string
  preview?: {
    configFile: string
    host?: string
    port?: number
    root: string
  }
  url: string
}

declare module 'vitest' {
  interface ProvidedContext {
    fakemicRuntime: FakemicRuntime
  }
}

interface FakemicTaskExecution {
  run: (task: RunnerTestCase, invokeHandler: () => Promise<void>) => Promise<void>
}

const registryKey = Symbol.for('airi.vitest-plugin-fakemic.executions')
const registryHost = globalThis as Record<typeof registryKey, undefined | WeakMap<RunnerTestCase, FakemicTaskExecution>> & typeof globalThis

// NOTICE:
// Vitest can load the runner and collected test modules through different module IDs.
// The global symbol gives both module instances access to the same task registry.
// Source: the Vitest ModuleRunner seam between the runner and collected test files.
// Remove this registry when Vitest provides a public task execution registry.
const fakemicTaskExecutions = registryHost[registryKey] ??= new WeakMap()

/** Creates package-owned `describe` and `it` functions for an audio framework. */
export function createAudioTestAPI<Definition, Plan, Context extends object, PreflightContext = never>(
  options: CreateAudioTestAPIOptions<Definition, Plan, PreflightContext>,
): {
  describe: typeof describe
  it: AudioTestAPI<Definition, Context>
} {
  const collector = TestRunner.createTaskCollector(function (
    this: object,
    name: string,
    definition: Definition,
    handler: AudioTestHandler<Context>,
  ) {
    const plans = options.createPlans(name, definition)
    const preflight = options.preflight?.(definition) ?? []

    for (const plan of plans) {
      const task = TestRunner.getCurrentSuite<Context>().task(plan.name, {
        ...this,
        handler: async (context) => {
          await handler(context as AudioVitestTaskContext<Context>)
        },
        meta: {
          audioTest: plan.metadata,
        },
      })

      fakemicTaskExecutions.set(task, {
        run: (runnerTask, invokeHandler) => options.execute({
          invokeHandler,
          plan,
          async runPreflight(context) {
            for (const callback of preflight)
              await callback(context)
          },
          task: runnerTask,
        }),
      })
    }
  })

  return {
    describe,
    it: collector as TestAPI as AudioTestAPI<Definition, Context>,
  }
}

/**
 * Creates one runnable task from an audio case.
 *
 * @example
 * createAudioTestTask('greets the user', { input })
 * // => { name: 'greets the user', input }
 */
export function createAudioTestTask<PreflightContext = never>(
  name: string,
  testCase: AudioTestCase<PreflightContext>,
): AudioTestTask {
  return {
    input: testCase.input,
    name,
  }
}

/** Creates Chromium arguments for a non-looping file-backed microphone. */
export function createChromiumFileMicrophoneArguments(microphoneInput: string): string[] {
  return [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${microphoneInput}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
  ]
}

/** Creates an Electron runtime descriptor for one Fakemic project. */
export function electron(options: Omit<FakemicElectronRuntime, 'kind'>): FakemicElectronRuntime {
  return { kind: 'electron', ...options }
}

/** Configures a serial Node Vitest project for package-owned audio tests. */
export default function fakemic(options: FakemicPluginOptions): UserWorkspaceConfig {
  return {
    test: {
      environment: 'node',
      fileParallelism: false,
      hookTimeout: options.hookTimeout ?? 120_000,
      include: options.include,
      maxWorkers: 1,
      name: options.name,
      provide: {
        fakemicRuntime: options.runtime,
      },
      runner: fileURLToPath(new URL('./runner.ts', import.meta.url)),
      testTimeout: options.testTimeout ?? 180_000,
    },
  }
}

/** Runs one audio session and preserves execution and cleanup failures. */
export async function runAudioTestSession<Session extends AudioTestSession>(
  options: RunAudioTestSessionOptions<Session>,
): Promise<void> {
  const session = await options.start()
  const errors: unknown[] = []

  try {
    await options.execute(session)
  }
  catch (error) {
    errors.push(error)
  }

  try {
    await options.recordArtifacts?.(session)
  }
  catch (error) {
    errors.push(error)
  }

  try {
    await session.close()
  }
  catch (error) {
    errors.push(error)
  }

  if (errors.length === 1)
    throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'The audio test and its cleanup produced multiple errors')
}

/** Launches the runtime selected by the current Vitest project. */
export async function startFakemicRuntime<Session extends AudioTestSession>(microphoneInput: string): Promise<Session> {
  const runtime = inject('fakemicRuntime')
  if (runtime.kind === 'electron')
    return startElectronFakemicRuntime<Session>(runtime, microphoneInput)
  return startWebFakemicRuntime<Session>(runtime, microphoneInput)
}

/** Creates a Web runtime descriptor for one Fakemic project. */
export function web(options: Omit<FakemicWebRuntime, 'kind'>): FakemicWebRuntime {
  return { kind: 'web', ...options }
}

async function startElectronFakemicRuntime<Session extends AudioTestSession>(runtime: FakemicElectronRuntime, microphoneInput: string): Promise<Session> {
  const temporaryUserData = runtime.temporaryUserData
  const userDataPath = temporaryUserData
    ? await mkdtemp(join(tmpdir(), temporaryUserData.prefix ?? 'fakemic-electron-'))
    : undefined
  let app: ElectronApplication | undefined
  const close = async () => {
    await app?.close()
    if (userDataPath)
      await rm(userDataPath, { force: true, recursive: true })
  }

  try {
    const launchEnvironment = Object.fromEntries(
      Object.entries({ ...env, ...runtime.env })
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    )
    if (temporaryUserData && userDataPath)
      launchEnvironment[temporaryUserData.env] = userDataPath

    app = await playwrightElectron.launch({
      args: [runtime.entry, ...(runtime.args ?? []), ...createChromiumFileMicrophoneArguments(microphoneInput)],
      cwd: runtime.cwd,
      env: launchEnvironment,
    })
    const launchedApp = app
    const module = await import(runtime.prepare) as FakemicPrepareModule<FakemicElectronPrepareContext, Session>
    return await module.default({ app: launchedApp, close, runtime })
  }
  catch (error) {
    await close()
    throw error
  }
}

async function startWebFakemicRuntime<Session extends AudioTestSession>(runtime: FakemicWebRuntime, microphoneInput: string): Promise<Session> {
  const server = runtime.preview
    ? await preview({
        configFile: runtime.preview.configFile,
        preview: {
          host: runtime.preview.host ?? '127.0.0.1',
          port: runtime.preview.port ?? 4173,
          strictPort: true,
        },
        root: runtime.preview.root,
      })
    : undefined
  let browser: Browser | undefined
  const close = async () => {
    await browser?.close()
    await server?.close()
  }

  try {
    browser = await chromium.launch({
      ...runtime.launch,
      args: [...(runtime.launch?.args ?? []), ...createChromiumFileMicrophoneArguments(microphoneInput)],
    })
    const context = await browser.newContext(runtime.context)
    const module = await import(runtime.prepare) as FakemicPrepareModule<FakemicWebPrepareContext, Session>
    return await module.default({ browser, close, context, runtime })
  }
  catch (error) {
    await close()
    throw error
  }
}
