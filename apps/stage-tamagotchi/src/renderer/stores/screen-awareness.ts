import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/** 屏幕感知支持的观察周期选项 */
export const SCREEN_AWARENESS_INTERVAL_OPTIONS = [30_000, 60_000, 120_000, 300_000, 600_000] as const

/** 屏幕感知的持久化用户配置 */
export const useScreenAwarenessStore = defineStore('screen-awareness', () => {
  const enabled = useLocalStorageManualReset('settings/screen-awareness/enabled', false)
  const sourceId = useLocalStorageManualReset('settings/screen-awareness/source-id', '')
  const intervalMs = useLocalStorageManualReset<number>('settings/screen-awareness/interval-ms', 60_000)

  /**
   * 重置屏幕感知配置
   *
   * 返回值为 void
   */
  function resetState() {
    enabled.reset()
    sourceId.reset()
    intervalMs.reset()
  }

  return {
    enabled,
    sourceId,
    intervalMs,
    resetState,
  }
})
