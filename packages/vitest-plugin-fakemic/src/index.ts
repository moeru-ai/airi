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

/** Supported encodings for captured audio. */
export type AudioCaptureFormat = 'pcm' | 'wav'

/** One audio payload captured from a tested runtime. */
export interface AudioCapture {
  format: AudioCaptureFormat
  data: Uint8Array
}

/** A session that owns one audio test runtime. */
export interface AudioTestSession {
  /** Releases the runtime and all resources that belong to the session. */
  close: () => Promise<void>
}

/** One callback that runs after a runtime starts and before its test handler. */
export type AudioTestPreflightCallback<Context> = (context: Context) => void | Promise<void>

/** A runner-neutral audio test definition. */
export interface AudioTestCase<PreflightContext = never> {
  /** File-backed microphone input for the test. */
  input: URL
  /** @default [] */
  preflight?: readonly AudioTestPreflightCallback<PreflightContext>[]
}

/** One runnable task derived from an audio test case. */
export interface AudioTestTask {
  name: string
  input: URL
}

/** Lifecycle operations for one audio test session. */
export interface RunAudioTestSessionOptions<Session extends AudioTestSession> {
  start: () => Promise<Session>
  execute: (session: Session) => Promise<void>
  recordArtifacts?: (session: Session) => Promise<void>
}

/** Metadata that identifies an audio task in Vitest reports. */
export interface AudioVitestTaskMetadata {
  input: string
  runtime: string
}

declare module 'vitest' {
  interface TaskMeta {
    audioTest?: AudioVitestTaskMetadata
  }
}

/**
 * One concrete audio task that the custom runner can execute.
 *
 * @param Definition - The concrete definition stored for this task.
 */
export interface AudioVitestPlan<Definition> {
  name: string
  definition: Definition
  metadata: AudioVitestTaskMetadata
}

/**
 * Test context exposed to an audio test callback.
 *
 * @param Context - Fields added by the concrete audio framework.
 */
export type AudioVitestTaskContext<Context extends object> = TestContext & Context

/**
 * Callback for an audio task.
 *
 * @param Context - Fields added by the concrete audio framework.
 */
export type AudioTestHandler<Context extends object> = (
  context: AudioVitestTaskContext<Context>,
) => void | Promise<void>

/**
 * A Vitest-like test function that accepts an audio definition.
 *
 * @param Definition - The definition supplied by each test.
 * @param Context - Fields exposed to the test callback.
 */
export interface AudioTestAPI<Definition, Context extends object> {
  (name: string, definition: Definition, handler: AudioTestHandler<Context>): void
  only: AudioTestAPI<Definition, Context>
  skip: AudioTestAPI<Definition, Context>
  todo: AudioTestAPI<Definition, Context>
  fails: AudioTestAPI<Definition, Context>
}

/**
 * Configuration for a package-owned audio test interface.
 *
 * @param Definition - The definition supplied by each test.
 * @param Plan - One concrete task produced from that definition.
 */
export interface CreateAudioTestAPIOptions<Definition, Plan, PreflightContext> {
  createPlans: (name: string, definition: Definition) => Array<AudioVitestPlan<Plan>>
  execute: (options: {
    plan: AudioVitestPlan<Plan>
    task: RunnerTestCase
    invokeHandler: () => Promise<void>
    runPreflight: (context: PreflightContext) => Promise<void>
  }) => Promise<void>
  preflight?: (definition: Definition) => readonly AudioTestPreflightCallback<PreflightContext>[] | undefined
}

/** Serializable Web runtime configuration. */
export interface FakemicWebRuntime {
  kind: 'web'
  name: string
  prepare: string
  url: string
  launch?: Parameters<typeof chromium.launch>[0]
  context?: Parameters<Browser['newContext']>[0]
  preview?: {
    configFile: string
    root: string
    host?: string
    port?: number
  }
}

/** Serializable Electron runtime configuration. */
export interface FakemicElectronRuntime {
  kind: 'electron'
  name: string
  prepare: string
  entry: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  temporaryUserData?: {
    env: string
    prefix?: string
  }
}

/** Runtime selected by one Fakemic Vitest project. */
export type FakemicRuntime = FakemicElectronRuntime | FakemicWebRuntime

/** Context supplied to a Web prepare module. */
export interface FakemicWebPrepareContext {
  browser: Browser
  context: BrowserContext
  close: () => Promise<void>
  runtime: FakemicWebRuntime
}

/** Context supplied to an Electron prepare module. */
export interface FakemicElectronPrepareContext {
  app: ElectronApplication
  close: () => Promise<void>
  runtime: FakemicElectronRuntime
}

/** Module that adapts a launched runtime into the application session. */
export interface FakemicPrepareModule<Context, Session extends AudioTestSession> {
  default: (context: Context) => Promise<Session>
}

/** Configuration for one Fakemic Vitest project. */
export interface FakemicPluginOptions {
  include: string[]
  name: string
  runtime: FakemicRuntime
  /** @default 180000 */
  testTimeout?: number
  /** @default 120000 */
  hookTimeout?: number
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
const registryHost = globalThis as typeof globalThis & Record<typeof registryKey, WeakMap<RunnerTestCase, FakemicTaskExecution> | undefined>

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
        meta: {
          audioTest: plan.metadata,
        },
        handler: async (context) => {
          await handler(context as AudioVitestTaskContext<Context>)
        },
      })

      fakemicTaskExecutions.set(task, {
        run: (runnerTask, invokeHandler) => options.execute({
          plan,
          task: runnerTask,
          invokeHandler,
          async runPreflight(context) {
            for (const callback of preflight)
              await callback(context)
          },
        }),
      })
    }
  })

  return {
    describe,
    it: collector as TestAPI as AudioTestAPI<Definition, Context>,
  }
}

/** Creates a Web runtime descriptor for one Fakemic project. */
export function web(options: Omit<FakemicWebRuntime, 'kind'>): FakemicWebRuntime {
  return { kind: 'web', ...options }
}

/** Creates an Electron runtime descriptor for one Fakemic project. */
export function electron(options: Omit<FakemicElectronRuntime, 'kind'>): FakemicElectronRuntime {
  return { kind: 'electron', ...options }
}

/** Configures a serial Node Vitest project for package-owned audio tests. */
export default function fakemic(options: FakemicPluginOptions): UserWorkspaceConfig {
  return {
    test: {
      name: options.name,
      include: options.include,
      environment: 'node',
      runner: fileURLToPath(new URL('./runner.ts', import.meta.url)),
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: options.testTimeout ?? 180_000,
      hookTimeout: options.hookTimeout ?? 120_000,
      provide: {
        fakemicRuntime: options.runtime,
      },
    },
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
    name,
    input: testCase.input,
  }
}

/** Launches the runtime selected by the current Vitest project. */
export async function startFakemicRuntime<Session extends AudioTestSession>(microphoneInput: string): Promise<Session> {
  const runtime = inject('fakemicRuntime')
  if (runtime.kind === 'electron')
    return startElectronFakemicRuntime<Session>(runtime, microphoneInput)
  return startWebFakemicRuntime<Session>(runtime, microphoneInput)
}

async function startWebFakemicRuntime<Session extends AudioTestSession>(runtime: FakemicWebRuntime, microphoneInput: string): Promise<Session> {
  const server = runtime.preview
    ? await preview({
        configFile: runtime.preview.configFile,
        root: runtime.preview.root,
        preview: {
          host: runtime.preview.host ?? '127.0.0.1',
          port: runtime.preview.port ?? 4173,
          strictPort: true,
        },
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
    return await module.default({ browser, context, close, runtime })
  }
  catch (error) {
    await close()
    throw error
  }
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
      await rm(userDataPath, { recursive: true, force: true })
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
