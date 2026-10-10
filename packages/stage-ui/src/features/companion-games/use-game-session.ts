import type { MaybeRefOrGetter } from 'vue'

import type { GameKind, GameOptions, PauseReason } from './host'
import type { MotionPort } from './motion-adapter'

import { useDocumentVisibility, useEventListener, useResizeObserver } from '@vueuse/core'
import { onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { CompanionGameHost, hasTimeline } from './host'
import { GameMotionAdapter } from './motion-adapter'

/** Owns the renderer clock and releases it on every interruption or unmount. */
export function useGameSession(
  playfield: MaybeRefOrGetter<HTMLElement | null>,
  modelId: MaybeRefOrGetter<string | undefined>,
  motionPort?: MaybeRefOrGetter<MotionPort | undefined>,
) {
  const host = new CompanionGameHost()
  let motion = new GameMotionAdapter(toValue(motionPort))
  const state = shallowRef(host.snapshot)
  const visibility = useDocumentVisibility()
  let frame: number | undefined

  function publish() {
    state.value = host.snapshot
  }

  function stopClock() {
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
  }

  function pause(reason: PauseReason = 'user') {
    host.pause(reason)
    publish()
  }

  function stop() {
    host.stop()
    publish()
  }

  function start(kind: GameKind, options: GameOptions) {
    const bounds = toValue(playfield)?.getBoundingClientRect()
    host.resize(bounds?.width ?? 0, bounds?.height ?? 0)
    host.start(kind, options)
    publish()
  }

  function act(action: (game: CompanionGameHost) => void) {
    action(host)
    publish()
  }

  watch([() => state.value.status, () => state.value.token, () => state.value.options.reducedMotion, () => hasTimeline(state.value.data)], () => {
    stopClock()
    motion.cancel()
    motion.setSession(state.value.status === 'playing' ? state.value.sessionId : null)
    if (state.value.status !== 'playing' || state.value.options.reducedMotion || !hasTimeline(state.value.data))
      return
    const token = state.value.token
    let previous: number | undefined
    const tick = (timestamp: number) => {
      if (state.value.token !== token || state.value.status !== 'playing')
        return
      if (previous !== undefined)
        host.advance(timestamp - previous, token)
      previous = timestamp
      publish()
      if (state.value.token === token && state.value.status === 'playing' && hasTimeline(state.value.data))
        frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }, { flush: 'sync' })

  watch(() => state.value.motion?.revision, () => {
    if (state.value.status === 'playing' && state.value.motion && !state.value.options.reducedMotion)
      motion.submit(state.value.motion)
    else
      motion.cancel()
  }, { flush: 'sync' })

  useResizeObserver(playfield, () => {
    const bounds = toValue(playfield)?.getBoundingClientRect()
    if (bounds) {
      host.resize(bounds.width, bounds.height)
      publish()
    }
  })
  useEventListener('blur', () => pause('focus'))
  watch(visibility, value => value !== 'visible' && pause('focus'))
  watch(() => toValue(modelId), stop)
  watch(() => toValue(motionPort), (port) => {
    motion.dispose()
    motion = new GameMotionAdapter(port)
    pause('ownership')
  })
  onScopeDispose(() => {
    stopClock()
    motion.dispose()
    host.dispose()
  })

  return { state, start, pause, stop, act }
}
