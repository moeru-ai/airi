/** 屏幕感知运行阶段 */
export type ScreenAwarenessPhase = 'idle' | 'waiting' | 'observing' | 'responding' | 'error'

/** 设置窗口与主舞台之间传递的屏幕感知运行快照 */
export interface ScreenAwarenessSnapshot {
  /** 当前运行阶段 */
  phase: ScreenAwarenessPhase
  /** 最近一次可见角色回应，仅保存在内存中 */
  lastResponse: string
  /** 最近一次成功完成观察的时间 */
  lastObservedAt: number | null
  /** 仅供屏幕感知设置页展示的局部错误 */
  error: string | null
}

/** 屏幕感知跨窗口消息 */
export type ScreenAwarenessChannelEvent
  = | { type: 'observe-now' }
    | { type: 'request-state' }
    | { type: 'state', snapshot: ScreenAwarenessSnapshot }

/** 屏幕感知跨窗口频道名称 */
export const screenAwarenessChannelName = 'airi-screen-awareness'
