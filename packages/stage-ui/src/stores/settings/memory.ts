// 1. 移除 vue 的 ref，引入 vueuse 的 useLocalStorage
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useSettingsMemory = defineStore('settings-memory', () => {
  // 2. 用 useLocalStorage 替换 ref。
  // 第一个参数是存在浏览器里的“钥匙名”(必须全局唯一)，第二个参数是默认值。
  const shortTermEnabled = useLocalStorage('airi-settings-memory-shortTermEnabled', false)
  const shortTermSize = useLocalStorage('airi-settings-memory-shortTermSize', 10)
  const longTermEnabled = useLocalStorage('airi-settings-memory-longTermEnabled', false)

  function resetState() {
    shortTermEnabled.value = false
    shortTermSize.value = 10
    longTermEnabled.value = false
  }

  return {
    shortTermEnabled,
    shortTermSize,
    longTermEnabled,
    resetState,
  }
})
