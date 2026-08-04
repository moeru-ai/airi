export const REDUCE_MOTION_STORAGE_KEY = 'docs:settings/reduce-motion'

/**
 * 首次访问且设备为触摸设备（移动端）时，默认开启 "Reduce motion"。
 * 必须在站点各组件读取该 localStorage 键之前（客户端 app 初始化时）调用；
 * 用户手动切换过开关后，尊重已存的值，不再覆盖。
 */
export function applyReduceMotionDefaults(): void {
  if (typeof window === 'undefined')
    return
  if (window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) !== null)
    return
  if (window.matchMedia('(pointer: coarse)').matches)
    window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, 'true')
}
