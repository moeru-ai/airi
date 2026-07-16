import type { ScreenAwarenessPhase } from './screen-awareness-channel'

import { errorMessageFrom } from '@moeru/std'

export type ScreenAwarenessTrigger = 'scheduled' | 'manual'

/** 屏幕感知调度器对外发布的状态 */
export interface ScreenAwarenessRuntimeStatus {
  /** 当前运行阶段 */
  phase: ScreenAwarenessPhase
  /** 当前任务由周期调度或手动操作触发 */
  trigger?: ScreenAwarenessTrigger
  /** 局部错误信息，不应进入普通聊天 */
  error?: string
}

/** 屏幕感知调度器依赖的外部边界 */
export interface ScreenAwarenessRuntimeDependencies {
  /** 返回普通聊天、角色回复或语音是否正忙 */
  isBusy: () => boolean
  /** 捕获并解释一次屏幕，返回隐私安全的文本描述 */
  observe: () => Promise<string>
  /** 根据屏幕描述生成角色回应，返回含内部标记的原始文本 */
  respond: (description: string) => Promise<string>
  /** 接收成功生成的原始角色回应 */
  onResponse: (response: string) => void
  /** 接收调度状态变化 */
  onStatus: (status: ScreenAwarenessRuntimeStatus) => void
  /** 等待指定毫秒数，测试可替换此边界 */
  wait?: (delayMs: number) => Promise<void>
}

/** 屏幕感知调度器可调整的运行策略 */
export interface ScreenAwarenessRuntimeOptions {
  /** 返回当前观察周期，单位为毫秒 */
  getIntervalMs: () => number
  /**
   * 忙碌时再次尝试的延迟，单位为毫秒
   * @default 15000
   */
  busyRetryDelayMs?: number
  /**
   * Vision 空结果或瞬时错误的最大尝试次数
   * @default 3
   */
  visionMaxAttempts?: number
  /**
   * 角色空回应的最大尝试次数
   * @default 2
   */
  responseMaxAttempts?: number
  /**
   * Vision 重试的基础等待时间，单位为毫秒
   * @default 1500
   */
  visionRetryBaseDelayMs?: number
}

/** 屏幕感知单飞调度器，负责启停、避让、有限重试和停止代次隔离 */
export class ScreenAwarenessRuntime {
  private readonly busyRetryDelayMs: number
  private readonly visionMaxAttempts: number
  private readonly responseMaxAttempts: number
  private readonly visionRetryBaseDelayMs: number
  private readonly wait: (delayMs: number) => Promise<void>
  private timer: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | undefined
  private generation = 0
  private running = false

  /**
   * 创建屏幕感知调度器
   *
   * @param dependencies 捕获、角色回复、忙碌判断和状态通知等外部边界
   * @param options 观察周期和有限重试策略
   */
  constructor(
    private readonly dependencies: ScreenAwarenessRuntimeDependencies,
    private readonly options: ScreenAwarenessRuntimeOptions,
  ) {
    this.busyRetryDelayMs = options.busyRetryDelayMs ?? 15_000
    this.visionMaxAttempts = options.visionMaxAttempts ?? 3
    this.responseMaxAttempts = options.responseMaxAttempts ?? 2
    this.visionRetryBaseDelayMs = options.visionRetryBaseDelayMs ?? 1_500
    this.wait = dependencies.wait ?? (delayMs => new Promise(resolve => setTimeout(resolve, delayMs)))
  }

  /**
   * 启动周期观察且不重复创建定时器
   *
   * 返回值为 void
   */
  start() {
    if (this.running)
      return

    this.running = true
    this.generation += 1
    this.dependencies.onStatus({ phase: 'idle' })
    this.schedule(this.options.getIntervalMs(), this.generation)
  }

  /**
   * 停止周期观察并使旧任务结果失效
   *
   * 返回值为 void
   */
  stop() {
    this.running = false
    this.generation += 1
    this.clearTimer()
    this.dependencies.onStatus({ phase: 'idle' })
  }

  /**
   * 立即请求一次观察并复用当前在途任务
   *
   * @returns 本次观察任务完成时解决的 Promise
   */
  requestNow() {
    return this.run('manual')
  }

  /**
   * 判断调度器是否已启动
   *
   * @returns 已启动时返回 true
   */
  isRunning() {
    return this.running
  }

  /**
   * 安排下一次周期观察并替换旧定时器
   *
   * @param delayMs 距离下一次观察的毫秒数
   * @param generation 安排任务时的生命周期代次
   * 返回值为 void
   */
  private schedule(delayMs: number, generation: number) {
    this.clearTimer()
    if (!this.running || generation !== this.generation)
      return

    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.run('scheduled')
    }, Math.max(0, delayMs))
  }

  /**
   * 清理当前周期定时器
   *
   * 返回值为 void
   */
  private clearTimer() {
    if (this.timer)
      clearTimeout(this.timer)
    this.timer = undefined
  }

  /**
   * 执行单次观察并在相同生命周期内安排后续任务
   *
   * @param trigger 本次任务的触发来源
   * @returns 本次观察任务完成时解决的 Promise
   */
  private run(trigger: ScreenAwarenessTrigger) {
    if (this.inFlight)
      return this.inFlight

    const generation = this.generation
    let nextDelayMs = this.options.getIntervalMs()

    this.inFlight = this.execute(trigger, generation)
      .then((deferred) => {
        if (deferred) {
          nextDelayMs = this.busyRetryDelayMs
          if (!this.running && generation === this.generation)
            this.dependencies.onStatus({ phase: 'idle', trigger })
        }
      })
      .catch((error) => {
        if (generation !== this.generation)
          return
        this.dependencies.onStatus({
          phase: 'error',
          trigger,
          error: errorMessageFrom(error) ?? 'Unknown screen-awareness error',
        })
      })
      .finally(() => {
        this.inFlight = undefined
        if (this.running && generation === this.generation)
          this.schedule(nextDelayMs, generation)
        else if (this.running && !this.timer)
          this.schedule(this.options.getIntervalMs(), this.generation)
      })

    return this.inFlight
  }

  /**
   * 执行忙碌避让、Vision 重试和角色空回应重试策略
   *
   * @param trigger 本次任务的触发来源
   * @param generation 任务开始时的生命周期代次
   * @returns 因忙碌而延后时返回 true
   */
  private async execute(trigger: ScreenAwarenessTrigger, generation: number) {
    if (this.dependencies.isBusy()) {
      this.dependencies.onStatus({ phase: 'waiting', trigger })
      return true
    }

    this.dependencies.onStatus({ phase: 'observing', trigger })
    const description = await this.observeWithRetry(generation)
    if (generation !== this.generation)
      return false

    if (this.dependencies.isBusy()) {
      this.dependencies.onStatus({ phase: 'waiting', trigger })
      return true
    }

    this.dependencies.onStatus({ phase: 'responding', trigger })
    const response = await this.respondWithRetry(description, generation)
    if (generation !== this.generation)
      return false

    this.dependencies.onResponse(response)
    this.dependencies.onStatus({ phase: 'idle', trigger })
    return false
  }

  /**
   * 在有限次数内获得非空 Vision 描述
   *
   * @param generation 任务开始时的生命周期代次
   * @returns 去除首尾空白后的屏幕描述
   */
  private async observeWithRetry(generation: number) {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.visionMaxAttempts; attempt += 1) {
      try {
        const description = (await this.dependencies.observe()).trim()
        if (description)
          return description
        lastError = new Error('Vision returned an empty screen description')
      }
      catch (error) {
        lastError = error
      }

      if (generation !== this.generation)
        break
      if (attempt < this.visionMaxAttempts)
        await this.wait(this.visionRetryBaseDelayMs * attempt)
    }

    throw lastError ?? new Error('Vision failed to describe the screen')
  }

  /**
   * 在有限次数内获得非空角色回应
   *
   * @param description 隐私安全的屏幕描述
   * @param generation 任务开始时的生命周期代次
   * @returns 去除首尾空白后的原始角色回应
   */
  private async respondWithRetry(description: string, generation: number) {
    for (let attempt = 1; attempt <= this.responseMaxAttempts; attempt += 1) {
      const response = (await this.dependencies.respond(description)).trim()
      if (response)
        return response
      if (generation !== this.generation)
        break
    }

    throw new Error('Character returned an empty screen-awareness response')
  }
}
